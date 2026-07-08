# Haraka Loans — sample loan application app

A loan application flow with **legitimate** Safaricom Daraja integration:

- Applicants fill out a form — no payment is ever requested.
- Staff review applications in `/admin.html`.
- On approval, the app **disburses the loan to the applicant's own M-Pesa number**
  using the Daraja **B2C** API (business → customer).
- Later, repayments are collected on schedule via **STK Push** — a request the
  borrower approves on their own phone, never a condition of approval.

This intentionally does **not** implement "pay us to get approved" — that pattern
is advance-fee loan fraud and is illegal to run. If you were pointed here after asking
for that, see the note at the bottom.

## Project structure

```
loan-app/
  server.js                  entry point
  routes/applications.js     applicant + admin endpoints
  routes/mpesa.js             B2C result/timeout + STK repayment callbacks
  services/mpesaService.js   Daraja API calls (auth, B2C, STK push)
  services/db.js             tiny JSON file "database"
  public/                    frontend (index.html = apply, admin.html = staff review)
  .env.example               copy to .env and fill in YOUR OWN credentials
```

## Setup

1. Install dependencies:
   ```
   npm install
   ```
2. Create a free developer account at https://developer.safaricom.co.ke and create
   an app to get your own sandbox `Consumer Key` / `Consumer Secret`.
3. From the Daraja portal, get the sandbox **B2C test credentials**
   (initiator name, security credential, B2C shortcode) and the **Lipa na M-Pesa
   Online** passkey/shortcode for STK push.
4. Copy `.env.example` to `.env` and fill in your own values. Never commit `.env`.
5. Expose your local server with a tunnel so Safaricom's sandbox can reach your
   callback URLs, e.g.:
   ```
   npx ngrok http 4000
   ```
   Put the resulting `https://xxxx.ngrok-free.app` URL in `BASE_URL` in `.env`.
6. Set an `ADMIN_KEY` in `.env` (any strong random string) — this protects the
   staff review endpoints. Replace with real staff authentication before going
   to production.
7. Run it:
   ```
   npm start
   ```
8. Open `http://localhost:4000` to apply, and `http://localhost:4000/admin.html`
   to review and approve applications as staff.

## How disbursement works (`services/mpesaService.js`)

- `PartyA` is **your** registered business shortcode.
- `PartyB` is the **applicant's own phone number**, taken from their application —
  never a hardcoded personal number.
- Money only ever flows business → borrower here. The borrower pays nothing to
  reach this point.

## How repayment works

- After disbursement, call `POST /api/repayments/:applicationId/request` with an
  `amount` on your repayment schedule (e.g. via a monthly cron job).
- This sends an **STK push** prompt to the borrower's phone, which they choose to
  approve or decline — a normal, transparent repayment, not an approval gate.

## Sandbox test numbers

Safaricom's sandbox accepts specific test MSISDNs for B2C/STK simulated flows —
check the current list on the Daraja portal under your app's simulator docs, since
these values can change. Use those, not real production numbers, until you've gone
through Safaricom's go-live process.

## About the original request

If you came here wanting applicants to "send money for approval" to a fixed number
before receiving a loan: that's advance-fee fraud, a real and common scam pattern in
Kenya (fraudsters posing as lenders, collecting "processing" or "activation" fees
and never disbursing anything). This app deliberately does not implement that flow.
