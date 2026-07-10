const express = require('express');
const db = require('../services/db');
const { requestRepaymentSTK } = require('../services/mpesaService');
const { processLatePayments } = require('../services/repayment');

const router = express.Router();

router.post('/mpesa/b2c/result', (req, res) => {
  const result = req.body.Result || {};
  const originatorConversationId = result.OriginatorConversationID;

  const apps = db.getAll();
  const match = apps.find(a => a.disbursement && a.disbursement.originatorConversationId === originatorConversationId);

  if (match) {
    const success = result.ResultCode === 0;
    db.update(match.id, {
      status: success ? 'disbursed' : 'disbursement_failed',
      disbursement: {
        ...match.disbursement,
        resultCode: result.ResultCode,
        resultDesc: result.ResultDesc,
        completedAt: new Date().toISOString()
      }
    });

    const user = db.getUsers().find(u => u.nationalId === match.nationalId);
    if (user && success) {
      const { sendNotification } = require('../services/notifications');
      sendNotification(user.id, 'sms', `KES ${match.amount} has been sent to your M-Pesa! First repayment of KES ${match.installmentAmount} due in 30 days.`);
      sendNotification(user.id, 'email', `Funds Disbursed!\n\nKES ${match.amount} has been sent to your registered M-Pesa number.\n\nRepayment schedule:\n- ${match.termMonths} installments of KES ${match.installmentAmount} each\n- Total repayable: KES ${match.totalRepayable}\n\nPlease ensure timely payments to maintain a good credit score.`);
    }
  }

  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

router.post('/mpesa/b2c/timeout', (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

router.post('/repayments/:applicationId/request', async (req, res) => {
  const app = db.getById(req.params.applicationId);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  if (app.status !== 'disbursed' && app.status !== 'repaid') {
    return res.status(400).json({ error: 'Loan not active for repayments' });
  }

  processLatePayments(app.id);

  const pending = db.getRepayments(app.id).filter(r => r.status !== 'paid');
  if (pending.length === 0) return res.json({ message: 'All installments are paid' });

  const installment = pending[0];
  const amount = installment.amount + installment.penaltyAmount - installment.paidAmount;

  if (amount <= 0) {
    db.updateRepayment(app.id, installment.installmentNumber, { status: 'paid', paidAt: new Date().toISOString() });
    return res.json({ message: 'Installment fully paid' });
  }

  try {
    const result = await requestRepaymentSTK({
      phoneNumber: app.phoneNumber,
      amount,
      accountReference: app.id,
      description: `Repayment ${installment.installmentNumber}/${app.termMonths} for loan ${app.id}`
    });
    res.json({ ...result, installmentNumber: installment.installmentNumber, amount });
  } catch (err) {
    const message = err.response ? err.response.data : err.message;
    res.status(502).json({ error: 'STK push failed', details: message });
  }
});

router.post('/mpesa/stk/callback', (req, res) => {
  const body = req.body;
  console.log('STK callback received:', JSON.stringify(body));

  const stkCallback = body.Body && body.Body.stkCallback;
  if (stkCallback && stkCallback.ResultCode === 0) {
    const accountRef = stkCallback.AccountReference;
    const amount = stkCallback.CallbackMetadata && stkCallback.CallbackMetadata.Item
      ? stkCallback.CallbackMetadata.Item.find(i => i.Name === 'Amount')
      : null;
    const mpesaReceipt = stkCallback.CallbackMetadata && stkCallback.CallbackMetadata.Item
      ? stkCallback.CallbackMetadata.Item.find(i => i.Name === 'MpesaReceiptNumber')
      : null;

    const paidAmount = amount ? amount.Value : 0;
    const receipt = mpesaReceipt ? mpesaReceipt.Value : 'STK-' + Date.now();

    if (accountRef && paidAmount > 0) {
      const { recordPayment } = require('../services/repayment');
      recordPayment(accountRef, paidAmount, receipt);
    }
  }

  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

router.get('/repayments/:applicationId/check-late', (req, res) => {
  const app = db.getById(req.params.applicationId);
  if (!app) return res.status(404).json({ error: 'Application not found' });

  const latePayments = processLatePayments(app.id);
  res.json({ lateInstallments: latePayments });
});

module.exports = router;
