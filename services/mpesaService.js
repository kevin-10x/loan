const axios = require('axios');

const BASE = process.env.MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

/**
 * Get an OAuth access token from Daraja.
 */
async function getAccessToken() {
  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');

  const { data } = await axios.get(
    `${BASE}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` } }
  );
  return data.access_token;
}

/**
 * Disburse an APPROVED loan to the BORROWER'S OWN phone number.
 * This is the only direction money should move before repayment starts:
 * business shortcode -> borrower. The borrower never pays anything to get here.
 *
 * @param {Object} opts
 * @param {string} opts.phoneNumber - borrower's own MSISDN, e.g. 2547XXXXXXXX
 * @param {number} opts.amount - approved loan amount
 * @param {string} opts.originatorConversationId - unique id you generate (e.g. uuid)
 * @param {string} opts.remarks - short description
 */
async function disburseLoan({ phoneNumber, amount, originatorConversationId, remarks }) {
  const token = await getAccessToken();

  const payload = {
    OriginatorConversationID: originatorConversationId,
    InitiatorName: process.env.MPESA_INITIATOR_NAME,
    SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL,
    CommandID: process.env.MPESA_B2C_COMMAND_ID || 'BusinessPayment',
    Amount: amount,
    PartyA: process.env.MPESA_B2C_SHORTCODE,   // YOUR business shortcode
    PartyB: phoneNumber,                        // the BORROWER - never a fixed personal number
    Remarks: remarks || 'Loan disbursement',
    QueueTimeOutURL: `${process.env.BASE_URL}/api/mpesa/b2c/timeout`,
    ResultURL: `${process.env.BASE_URL}/api/mpesa/b2c/result`,
    Occasion: 'LoanDisbursement'
  };

  const { data } = await axios.post(
    `${BASE}/mpesa/b2c/v1/paymentrequest`,
    payload,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return data;
}

/**
 * Trigger an STK push asking the borrower to pay a REPAYMENT installment.
 * Only ever called AFTER disbursement, on the agreed repayment schedule -
 * never as a condition of approval.
 */
async function requestRepaymentSTK({ phoneNumber, amount, accountReference, description }) {
  const token = await getAccessToken();

  const shortcode = process.env.MPESA_PAYBILL_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

  const payload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: amount,
    PartyA: phoneNumber,
    PartyB: shortcode,
    PhoneNumber: phoneNumber,
    CallBackURL: `${process.env.BASE_URL}/api/mpesa/stk/callback`,
    AccountReference: accountReference || 'LoanRepayment',
    TransactionDesc: description || 'Loan repayment installment'
  };

  const { data } = await axios.post(
    `${BASE}/mpesa/stkpush/v1/processrequest`,
    payload,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return data;
}

module.exports = { getAccessToken, disburseLoan, requestRepaymentSTK };
