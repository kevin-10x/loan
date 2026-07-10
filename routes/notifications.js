const express = require('express');
const auth = require('../services/auth');
const { getNotifications, markRead } = require('../services/notifications');

const router = express.Router();

router.get('/notifications', auth.requireAuth, (req, res) => {
  const notifications = getNotifications(req.user.id);
  res.json(notifications);
});

router.post('/notifications/:id/read', auth.requireAuth, (req, res) => {
  const result = markRead(req.params.id);
  if (!result) return res.status(404).json({ error: 'Notification not found' });
  res.json(result);
});

module.exports = router;
