const express = require('express');
const db = require('../services/db');
const { requestRepaymentSTK } = require('../services/mpesaService');

const router = express.Router();

// Safaricom calls this when the B2C disbursement has actually completed.
// This is what confirms money really landed in the borrower's wallet.
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
  }

  // Always acknowledge receipt to Safaricom
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

router.post('/mpesa/b2c/timeout', (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

// --- Repayment flow (used AFTER disbursement, on the loan's schedule) ---

// Trigger an STK push for a scheduled repayment installment
router.post('/repayments/:applicationId/request', async (req, res) => {
  const app = db.getById(req.params.applicationId);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  if (app.status !== 'disbursed') {
    return res.status(400).json({ error: 'Loan has not been disbursed yet' });
  }

  const { amount } = req.body;
  try {
    const result = await requestRepaymentSTK({
      phoneNumber: app.phoneNumber,
      amount,
      accountReference: app.id,
      description: `Repayment for loan ${app.id}`
    });
    res.json(result);
  } catch (err) {
    const message = err.response ? err.response.data : err.message;
    res.status(502).json({ error: 'STK push failed', details: message });
  }
});

// Safaricom calls this once the borrower completes (or cancels) the repayment STK prompt
router.post('/mpesa/stk/callback', (req, res) => {
  // Log/store repayment confirmation against the loan in a real implementation
  console.log('STK callback received:', JSON.stringify(req.body));
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

module.exports = router;
