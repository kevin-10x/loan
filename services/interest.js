const RATES = {
  1: 0.05,
  3: 0.10,
  6: 0.15,
  12: 0.25
};

const PENALTY_RATE = 0.05;
const GRACE_PERIOD_DAYS = 3;

function getRate(termMonths) {
  return RATES[termMonths] || 0.10;
}

function calculateLoan(amount, termMonths) {
  const rate = getRate(termMonths);
  const interest = Math.round(amount * rate);
  const totalRepayable = amount + interest;
  const installmentAmount = Math.round(totalRepayable / termMonths);
  return { interest, rate, totalRepayable, installmentAmount };
}

function calculateLatePenalty(installmentAmount, daysOverdue) {
  if (daysOverdue <= GRACE_PERIOD_DAYS) return 0;
  const penalty = Math.round(installmentAmount * PENALTY_RATE * Math.ceil((daysOverdue - GRACE_PERIOD_DAYS) / 7));
  return penalty;
}

module.exports = { calculateLoan, calculateLatePenalty, RATES, PENALTY_RATE, GRACE_PERIOD_DAYS };
