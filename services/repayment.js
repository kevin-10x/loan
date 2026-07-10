const db = require('./db');
const { calculateLoan, calculateLatePenalty } = require('./interest');
const { sendNotification } = require('./notifications');
const { updateCreditScore } = require('./scoring');

function generateSchedule(application) {
  const { totalRepayable, installmentAmount } = calculateLoan(application.amount, application.termMonths);
  const schedule = [];
  const now = new Date();
  for (let i = 1; i <= application.termMonths; i++) {
    const due = new Date(now);
    due.setMonth(due.getMonth() + i);
    schedule.push({
      id: `${application.id}-installment-${i}`,
      applicationId: application.id,
      installmentNumber: i,
      dueDate: due.toISOString(),
      amount: installmentAmount,
      paidAmount: 0,
      status: 'pending',
      penaltyAmount: 0,
      paidAt: null,
      paymentRef: null
    });
  }
  return schedule;
}

function getRepayments(applicationId) {
  return db.getRepayments(applicationId);
}

function processLatePayments(applicationId) {
  const schedule = db.getRepayments(applicationId);
  if (!schedule || schedule.length === 0) return [];

  const now = new Date();
  const updated = [];

  for (const inst of schedule) {
    if (inst.status === 'paid') continue;

    const dueDate = new Date(inst.dueDate);
    if (now > dueDate) {
      const daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
      const penalty = calculateLatePenalty(inst.amount, daysOverdue);
      if (penalty > inst.penaltyAmount) {
        inst.penaltyAmount = penalty;
        inst.status = 'late';
        db.updateRepayment(inst.applicationId, inst.installmentNumber, { penaltyAmount: penalty, status: 'late' });
        updated.push(inst);

        const app = db.getById(applicationId);
        if (app) {
          const user = db.getUsers().find(u => u.nationalId === app.nationalId);
          if (user) {
            sendNotification(user.id, 'sms', `Late payment alert: KES ${inst.amount + penalty} due for loan ${applicationId}. Penalty of KES ${penalty} applied.`);
          }
        }
      }
    }
  }
  return updated;
}

function recordPayment(applicationId, amount, paymentRef) {
  const schedule = db.getRepayments(applicationId);
  if (!schedule || schedule.length === 0) return { error: 'No repayment schedule found' };

  let remaining = amount;

  for (const inst of schedule) {
    if (inst.status === 'paid') continue;

    const due = inst.amount + inst.penaltyAmount;
    const outstanding = due - inst.paidAmount;

    if (remaining <= 0) break;

    if (remaining >= outstanding) {
      inst.paidAmount = inst.amount + inst.penaltyAmount;
      inst.status = 'paid';
      inst.paidAt = new Date().toISOString();
      inst.paymentRef = paymentRef;
      remaining -= outstanding;
    } else {
      inst.paidAmount += remaining;
      inst.status = 'partially_paid';
      remaining = 0;
    }

    db.updateRepayment(applicationId, inst.installmentNumber, {
      paidAmount: inst.paidAmount,
      status: inst.status,
      paidAt: inst.paidAt,
      paymentRef: inst.paymentRef
    });
  }

  const allPaid = schedule.every(i => i.status === 'paid');
  if (allPaid) {
    db.update(applicationId, { status: 'repaid' });
    const app = db.getById(applicationId);
    if (app) {
      const user = db.getUsers().find(u => u.nationalId === app.nationalId);
      if (user) {
        updateCreditScore(user.id, true);
        sendNotification(user.id, 'email', `Congratulations! Your loan ${applicationId} has been fully repaid. Your credit score has improved.`);
      }
    }
  } else {
    const app = db.getById(applicationId);
    if (app) {
      const user = db.getUsers().find(u => u.nationalId === app.nationalId);
      if (user) {
        sendNotification(user.id, 'sms', `Payment of KES ${amount} received for loan ${applicationId}. Remaining balance: KES ${schedule.reduce((s, i) => s + (i.status === 'paid' ? 0 : i.amount + i.penaltyAmount - i.paidAmount), 0)}`);
      }
    }
  }

  return { success: true, remaining };
}

module.exports = { generateSchedule, getRepayments, processLatePayments, recordPayment };
