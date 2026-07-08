const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../services/db');
const { disburseLoan } = require('../services/mpesaService');

const router = express.Router();

// very naive affordability check - replace with real credit scoring in production
function assessRisk({ monthlyIncome, amount }) {
  if (!monthlyIncome || monthlyIncome <= 0) return { eligible: false, reason: 'No income provided' };
  const ratio = amount / monthlyIncome;
  if (ratio > 3) return { eligible: false, reason: 'Requested amount too high relative to income' };
  return { eligible: true };
}

function normalizePhone(phone) {
  // Accepts 07XXXXXXXX or 254XXXXXXXXX and returns 254XXXXXXXXX
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return '254' + digits.slice(1);
  return digits;
}

// Submit a new loan application - NO payment is ever requested here
router.post('/applications', (req, res) => {
  const { fullName, nationalId, phoneNumber, monthlyIncome, amount, termMonths, purpose } = req.body;

  if (!fullName || !nationalId || !phoneNumber || !amount || !termMonths) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const risk = assessRisk({ monthlyIncome: Number(monthlyIncome), amount: Number(amount) });

  const application = {
    id: uuidv4(),
    fullName,
    nationalId,
    phoneNumber: normalizePhone(phoneNumber),
    monthlyIncome: Number(monthlyIncome) || 0,
    amount: Number(amount),
    termMonths: Number(termMonths),
    purpose: purpose || '',
    status: risk.eligible ? 'pending_review' : 'auto_declined',
    declineReason: risk.eligible ? null : risk.reason,
    createdAt: new Date().toISOString(),
    disbursement: null
  };

  db.insert(application);
  res.status(201).json(application);
});

// Applicant checks their own status
router.get('/applications/:id', (req, res) => {
  const app = db.getById(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  res.json(app);
});

// --- Admin endpoints ---
// In production, protect these with real authentication (e.g. signed-in staff accounts),
// not just a shared secret header.
function requireAdmin(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  if (!process.env.ADMIN_KEY || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.get('/admin/applications', requireAdmin, (req, res) => {
  res.json(db.getAll());
});

// Approve an application -> disburses the loan straight to the BORROWER'S OWN number.
// The borrower is never asked to send money at any point in this flow.
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

    const updated = db.update(app.id, {
      status: 'disbursed_pending_confirmation',
      disbursement: {
        originatorConversationId,
        conversationId: result.ConversationID,
        responseDescription: result.ResponseDescription,
        requestedAt: new Date().toISOString()
      }
    });
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
  res.json(updated);
});

module.exports = router;
