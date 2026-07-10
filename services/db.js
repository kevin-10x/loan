const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');

function getDefault() {
  return { applications: [], users: [], sessions: [], repayments: [], notifications: [] };
}

function ensureDir() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  if (!fs.existsSync(DB_FILE)) {
    ensureDir();
    save(getDefault());
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

function save(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Applications
function getAll() {
  return load().applications;
}

function getById(id) {
  return load().applications.find(a => a.id === id);
}

function insert(application) {
  const data = load();
  data.applications.push(application);
  save(data);
  return application;
}

function update(id, patch) {
  const data = load();
  const idx = data.applications.findIndex(a => a.id === id);
  if (idx === -1) return null;
  data.applications[idx] = { ...data.applications[idx], ...patch };
  save(data);
  return data.applications[idx];
}

// Users
function getUsers() {
  return load().users;
}

function insertUser(user) {
  const data = load();
  data.users.push(user);
  save(data);
  return user;
}

function updateUser(id, patch) {
  const data = load();
  const idx = data.users.findIndex(u => u.id === id);
  if (idx === -1) return null;
  data.users[idx] = { ...data.users[idx], ...patch };
  save(data);
  return data.users[idx];
}

function getUserByNationalId(nationalId) {
  return load().users.find(u => u.nationalId === nationalId);
}

// Sessions
function getSessions() {
  return load().sessions;
}

function saveUserToken(userId, token) {
  const data = load();
  data.sessions = data.sessions.filter(s => s.userId !== userId);
  data.sessions.push({ userId, token, createdAt: new Date().toISOString() });
  save(data);
}

// Repayments
function getRepayments(applicationId) {
  const data = load();
  return (data.repayments || []).filter(r => r.applicationId === applicationId) || [];
}

function insertRepayments(schedule) {
  const data = load();
  data.repayments = data.repayments || [];
  data.repayments.push(...schedule);
  save(data);
}

function updateRepayment(applicationId, installmentNumber, patch) {
  const data = load();
  const idx = (data.repayments || []).findIndex(r => r.applicationId === applicationId && r.installmentNumber === installmentNumber);
  if (idx === -1) return null;
  data.repayments[idx] = { ...data.repayments[idx], ...patch };
  save(data);
  return data.repayments[idx];
}

// Notifications
function getNotifications() {
  return load().notifications || [];
}

function insertNotification(notification) {
  const data = load();
  data.notifications = data.notifications || [];
  data.notifications.push(notification);
  save(data);
  return notification;
}

function updateNotification(id, patch) {
  const data = load();
  const idx = (data.notifications || []).findIndex(n => n.id === id);
  if (idx === -1) return null;
  data.notifications[idx] = { ...data.notifications[idx], ...patch };
  save(data);
  return data.notifications[idx];
}

module.exports = {
  getAll, getById, insert, update,
  getUsers, insertUser, updateUser, getUserByNationalId,
  getSessions, saveUserToken,
  getRepayments, insertRepayments, updateRepayment,
  getNotifications, insertNotification, updateNotification
};
