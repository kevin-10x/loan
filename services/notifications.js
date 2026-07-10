const db = require('./db');

function sendNotification(userId, type, message) {
  const notification = {
    id: require('crypto').randomUUID(),
    userId,
    type,
    message,
    sentAt: new Date().toISOString(),
    read: false
  };

  db.insertNotification(notification);

  if (type === 'sms') {
    console.log(`[SMS to user ${userId}]: ${message}`);
  } else if (type === 'email') {
    console.log(`[Email to user ${userId}]: ${message}`);
  }

  return notification;
}

function getNotifications(userId) {
  return db.getNotifications().filter(n => n.userId === userId).sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
}

function markRead(notificationId) {
  return db.updateNotification(notificationId, { read: true });
}

module.exports = { sendNotification, getNotifications, markRead };
