const crypto = require('crypto');
const db = require('./db');

const TOKEN_EXPIRY = 24 * 60 * 60 * 1000;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === check;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function register({ email, password, fullName, nationalId, phoneNumber, monthlyIncome }) {
  const users = db.getUsers();
  if (users.find(u => u.email === email)) return { error: 'Email already registered' };
  if (users.find(u => u.nationalId === nationalId)) return { error: 'National ID already registered' };

  const user = {
    id: crypto.randomUUID(),
    email,
    password: hashPassword(password),
    fullName,
    nationalId,
    phoneNumber,
    monthlyIncome: Number(monthlyIncome) || 0,
    creditScore: 500,
    totalBorrowed: 0,
    totalRepaid: 0,
    createdAt: new Date().toISOString()
  };

  db.insertUser(user);
  const token = generateToken();
  db.saveUserToken(user.id, token);
  return { user: { id: user.id, email: user.email, fullName: user.fullName, creditScore: user.creditScore }, token };
}

function login({ email, password }) {
  const users = db.getUsers();
  const user = users.find(u => u.email === email);
  if (!user || !verifyPassword(password, user.password)) return { error: 'Invalid email or password' };

  const token = generateToken();
  db.saveUserToken(user.id, token);
  return { user: { id: user.id, email: user.email, fullName: user.fullName, creditScore: user.creditScore }, token };
}

function getUserFromToken(token) {
  if (!token) return null;
  const sessions = db.getSessions();
  const session = sessions.find(s => s.token === token && Date.now() - new Date(s.createdAt).getTime() < TOKEN_EXPIRY);
  if (!session) return null;
  const users = db.getUsers();
  return users.find(u => u.id === session.userId) || null;
}

function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'];
  const user = getUserFromToken(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized - please login' });
  req.user = user;
  next();
}

module.exports = { register, login, getUserFromToken, requireAuth, hashPassword, verifyPassword };
