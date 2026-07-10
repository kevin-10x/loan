const express = require('express');
const auth = require('../services/auth');

const router = express.Router();

function normalizePhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return '254' + digits.slice(1);
  return digits;
}

router.post('/auth/register', (req, res) => {
  const { email, password, fullName, nationalId, phoneNumber, monthlyIncome } = req.body;
  if (!email || !password || !fullName || !nationalId || !phoneNumber) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const result = auth.register({
    email, password, fullName, nationalId,
    phoneNumber: normalizePhone(phoneNumber),
    monthlyIncome
  });

  if (result.error) return res.status(409).json({ error: result.error });
  res.status(201).json(result);
});

router.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const result = auth.login({ email, password });
  if (result.error) return res.status(401).json({ error: result.error });
  res.json(result);
});

router.get('/auth/me', auth.requireAuth, (req, res) => {
  const { password, ...safe } = req.user;
  res.json(safe);
});

module.exports = router;
