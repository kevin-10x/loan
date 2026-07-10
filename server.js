require('dotenv').config();
const express = require('express');
const path = require('path');

const applicationsRouter = require('./routes/applications');
const mpesaRouter = require('./routes/mpesa');
const authRouter = require('./routes/auth');
const notificationsRouter = require('./routes/notifications');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', applicationsRouter);
app.use('/api', mpesaRouter);
app.use('/api', authRouter);
app.use('/api', notificationsRouter);

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Loan app running on http://localhost:${PORT}`);
});
