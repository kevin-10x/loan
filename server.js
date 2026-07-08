require('dotenv').config();
const express = require('express');
const path = require('path');

const applicationsRouter = require('./routes/applications');
const mpesaRouter = require('./routes/mpesa');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', applicationsRouter);
app.use('/api', mpesaRouter);

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Loan app running on http://localhost:${PORT}`);
});
