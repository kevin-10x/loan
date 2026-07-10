const db = require('./db');

function calculateScore(userId) {
  const user = db.getUsers().find(u => u.id === userId);
  if (!user) return 300;

  const apps = db.getAll().filter(a => {
    const u = db.getUsers().find(x => x.nationalId === a.nationalId);
    return u && u.id === userId;
  });

  let score = 500;

  if (apps.length > 0) {
    const repaid = apps.filter(a => a.status === 'repaid').length;
    const total = apps.filter(a => a.status !== 'auto_declined' && a.status !== 'declined').length;
    const onTime = apps.filter(a => {
      if (a.status !== 'repaid' && a.status !== 'disbursed') return false;
      const schedule = db.getRepayments(a.id);
      if (!schedule || schedule.length === 0) return true;
      return schedule.every(i => i.status === 'paid' || !i.paidAt);
    }).length;

    if (total > 0) {
      score += Math.round((repaid / total) * 200);
      score += Math.round((onTime / (total || 1)) * 100);
    }
  }

  const totalBorrowed = apps.reduce((s, a) => s + a.amount, 0);
  if (totalBorrowed > 0) {
    score += Math.min(50, Math.round(totalBorrowed / 10000));
  }

  return Math.min(900, Math.max(300, score));
}

function updateCreditScore(userId, positive) {
  const score = calculateScore(userId);
  db.updateUser(userId, {
    creditScore: positive ? Math.min(900, score + 10) : Math.max(300, score - 30)
  });
}

module.exports = { calculateScore, updateCreditScore };
