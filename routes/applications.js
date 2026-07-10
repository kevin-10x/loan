const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../services/db');
const { disburseLoan } = require('../services/mpesaService');
const { calculateLoan } = require('../services/interest');
const { generateSchedule, processLatePayments } = require('../services/repayment');
const { sendNotification } = require('../services/notifications');
const { updateCreditScore } = require('../services/scoring');
const auth = require('../services/auth');

const router = express.Router();

function assessRisk({ monthlyIncome, amount }) {
  if (!monthlyIncome || monthlyIncome <= 0) return { eligible: false, reason: 'No income provided' };
  const ratio = amount / monthlyIncome;
  if (ratio > 3) return { eligible: false, reason: 'Requested amount too high relative to income' };
  return { eligible: true };
}

function getUser(phoneNumber) {
  return db.getUsers().find(u => u.phoneNumber === phoneNumber);
}

router.post('/applications', (req, res) => {
  const { fullName, nationalId, phoneNumber, monthlyIncome, amount, termMonths, purpose } = req.body;

  if (!fullName || !nationalId || !phoneNumber || !amount || !termMonths) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const risk = assessRisk({ monthlyIncome: Number(monthlyIncome), amount: Number(amount) });
  const { interest, rate, totalRepayable, installmentAmount } = calculateLoan(Number(amount), Number(termMonths));

  const application = {
    id: uuidv4(),
    fullName,
    nationalId,
    phoneNumber: String(phoneNumber).replace(/\D/g, ''),
    monthlyIncome: Number(monthlyIncome) || 0,
    amount: Number(amount),
    termMonths: Number(termMonths),
    purpose: purpose || '',
    status: risk.eligible ? 'pending_review' : 'auto_declined',
    declineReason: risk.eligible ? null : risk.reason,
    interestRate: rate,
    interestAmount: interest,
    totalRepayable,
    installmentAmount,
    createdAt: new Date().toISOString(),
    disbursement: null
  };

  db.insert(application);

  const user = getUser(application.phoneNumber) || db.getUsers().find(u => u.nationalId === nationalId);
  if (user) {
    sendNotification(user.id, 'sms',
      `Application received! Amount: KES ${amount}, Repayable: KES ${totalRepayable} in ${termMonths} month(s). Reference: ${application.id}`
    );
    sendNotification(user.id, 'email',
      `Dear ${fullName},\n\nYour loan application of KES ${amount} has been received. The total repayable amount is KES ${totalRepayable} over ${termMonths} months at ${(rate * 100)}% interest.\n\nReference ID: ${application.id}\n\nWe will notify you once reviewed.`
    );
  }

  res.status(201).json(application);
});

router.get('/applications/:id', (req, res) => {
  const app = db.getById(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });

  const result = { ...app };
  if (result.status === 'disbursed' || result.status === 'repaid') {
    const schedule = db.getRepayments(result.id);
    if (schedule) result.repaymentSchedule = schedule;
  }
  res.json(result);
});

function requireAdmin(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  if (!process.env.ADMIN_KEY || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.get('/admin/applications', requireAdmin, (req, res) => {
  const apps = db.getAll();
  const result = apps.map(a => {
    const schedule = db.getRepayments(a.id);
    return { ...a, repaymentSchedule: schedule || [] };
  });
  res.json(result);
});

router.post('/admin/applications/:id/approve', requireAdmin, async (req, res) => {
  const app = db.getById(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  if (app.status !== 'pending_review') {
    return res.status(400).json({ error: `Cannot approve application in status ${app.status}` });
  }

  const originatorConversationId = uuidv4();

  try {
    const result = await disburseLoan({
      phoneNumber: app.phoneNumber,
      amount: app.amount,
      originatorConversationId,
      remarks: `Loan disbursement for ${app.fullName}`
    });

    const schedule = generateSchedule(app);
    db.insertRepayments(schedule);

    const updated = db.update(app.id, {
      status: 'disbursed_pending_confirmation',
      disbursement: {
        originatorConversationId,
        conversationId: result.ConversationID,
        responseDescription: result.ResponseDescription,
        requestedAt: new Date().toISOString()
      }
    });

    const user = db.getUsers().find(u => u.nationalId === app.nationalId);
    if (user) {
      sendNotification(user.id, 'sms',
        `Congratulations ${app.fullName}! Your loan of KES ${app.amount} has been approved and is being sent to your M-Pesa. Total repayable: KES ${app.totalRepayable} in ${app.termMonths} installments of KES ${app.installmentAmount} each.`
      );
      sendNotification(user.id, 'email',
        `Loan Approved!\n\nDear ${app.fullName},\n\nYour loan application for KES ${app.amount} has been APPROVED.\n\nLoan Details:\n- Amount: KES ${app.amount}\n- Interest: ${(app.interestRate * 100)}%\n- Total Repayable: KES ${app.totalRepayable}\n- Installments: ${app.termMonths} payments of KES ${app.installmentAmount}\n\nFunds are being sent to your M-Pesa.`
      );
    }

    res.json(updated);
  } catch (err) {
    const message = err.response ? err.response.data : err.message;
    res.status(502).json({ error: 'Disbursement request failed', details: message });
  }
});

router.post('/admin/applications/:id/decline', requireAdmin, (req, res) => {
  const app = db.getById(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  const updated = db.update(app.id, { status: 'declined', declineReason: req.body.reason || 'Not specified' });

  const user = db.getUsers().find(u => u.nationalId === app.nationalId);
  if (user) {
    sendNotification(user.id, 'sms', `Your loan application of KES ${app.amount} has been declined. Reason: ${updated.declineReason}`);
  }

  res.json(updated);
});

router.get('/my/applications', auth.requireAuth, (req, res) => {
  const user = req.user;
  const apps = db.getAll().filter(a => a.nationalId === user.nationalId);
  res.json(apps);
});

router.get('/my/repayments', auth.requireAuth, (req, res) => {
  const user = req.user;
  const apps = db.getAll().filter(a => a.nationalId === user.nationalId);
  const allRepayments = [];
  for (const app of apps) {
    const schedule = db.getRepayments(app.id);
    if (schedule) allRepayments.push(...schedule.map(s => ({ ...s, application: { id: app.id, amount: app.amount } })));
  }
  res.json(allRepayments);
});

router.post('/my/applications/:id/pay', auth.requireAuth, async (req, res) => {
  const user = req.user;
  const app = db.getById(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  if (app.nationalId !== user.nationalId) return res.status(403).json({ error: 'Not your application' });
  if (app.status !== 'disbursed' && app.status !== 'repaid') return res.status(400).json({ error: 'Loan not active' });

  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

  const pending = db.getRepayments(app.id).filter(r => r.status !== 'paid');
  const totalDue = pending.reduce((s, r) => s + r.amount + r.penaltyAmount - r.paidAmount, 0);

  if (amount < pending[0]?.amount) {
    return res.status(400).json({ error: `Minimum payment is KES ${pending[0]?.amount} for installment ${pending[0]?.installmentNumber}` });
  }

  const { recordPayment } = require('../services/repayment');
  const result = recordPayment(app.id, amount, 'manual-payment-' + Date.now());
  res.json(result);
});

router.post('/my/applications/:id/repayments/check-late', auth.requireAuth, (req, res) => {
  const user = req.user;
  const app = db.getById(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  if (app.nationalId !== user.nationalId) return res.status(403).json({ error: 'Not your application' });

  const latePayments = processLatePayments(app.id);
  res.json({ lateInstallments: latePayments });
});

module.exports = router;
