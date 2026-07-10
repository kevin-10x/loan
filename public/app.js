const RATES = { 1: 0.05, 3: 0.10, 6: 0.15, 12: 0.25 };
const STATUS_LABELS = {
  pending_review: { label: 'Pending review', color: '#8A6D1E', bg: '#FCF2D9' },
  auto_declined: { label: 'Declined', color: '#B5442A', bg: '#FBE9E4' },
  declined: { label: 'Declined', color: '#B5442A', bg: '#FBE9E4' },
  disbursed_pending_confirmation: { label: 'Approved — sending funds', color: '#1E5FA8', bg: '#E5EFFA' },
  disbursed: { label: 'Disbursed', color: '#1E8A5B', bg: '#E4F4EB' },
  disbursement_failed: { label: 'Disbursement failed', color: '#B5442A', bg: '#FBE9E4' },
  repaid: { label: 'Fully Repaid', color: '#1E8A5B', bg: '#E4F4EB' }
};

const TOKEN_KEY = 'haraka_auth_token';
const USER_KEY = 'haraka_user';
let authToken = localStorage.getItem(TOKEN_KEY);
let currentUser = JSON.parse(localStorage.getItem(USER_KEY) || 'null');

function saveAuth(token, user) {
  authToken = token;
  currentUser = user;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user || {}));
}

function clearAuth() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (authToken) h['x-auth-token'] = authToken;
  return h;
}

async function api(path, options = {}) {
  const res = await fetch('/api' + path, { headers: headers(), ...options });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showMessage(el, text, type) {
  el.hidden = false;
  el.textContent = text;
  el.className = 'form-message ' + type;
}

function showToast(text, type) {
  const t = document.getElementById('notifToast');
  t.textContent = text;
  t.className = 'notif-toast ' + (type || 'info');
  t.hidden = false;
  setTimeout(() => t.hidden = true, 4000);
}

function showSection(id) {
  document.querySelectorAll('.section, #heroSection, #apply').forEach(s => s.hidden = true);
  const el = document.getElementById(id);
  if (el) el.hidden = false;
}

function updateNav() {
  document.getElementById('loginLink').hidden = !!currentUser;
  document.getElementById('registerLink').hidden = !!currentUser;
  document.getElementById('logoutBtn').hidden = !currentUser;
  document.getElementById('dashboardLink').hidden = !currentUser;
}

// --- Loan breakdown preview ---
document.querySelector('[name="amount"]')?.addEventListener('input', updateBreakdown);
document.querySelector('[name="termMonths"]')?.addEventListener('change', updateBreakdown);

function updateBreakdown() {
  const amount = parseFloat(document.querySelector('[name="amount"]')?.value) || 0;
  const term = parseInt(document.querySelector('[name="termMonths"]')?.value) || 1;
  const rate = RATES[term] || 0.10;
  const interest = Math.round(amount * rate);
  const total = amount + interest;
  const inst = Math.round(total / term);

  if (amount > 0) {
    document.getElementById('loanBreakdown').hidden = false;
    document.getElementById('bdPrincipal').textContent = amount.toLocaleString();
    document.getElementById('bdInterest').textContent = interest.toLocaleString();
    document.getElementById('bdTotal').textContent = total.toLocaleString();
    document.getElementById('bdTerms').textContent = term;
    document.getElementById('bdInstallment').textContent = inst.toLocaleString();
  } else {
    document.getElementById('loanBreakdown').hidden = true;
  }
}

// --- Application form ---
document.getElementById('applicationForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const payload = Object.fromEntries(formData.entries());
  const msg = document.getElementById('formMessage');

  try {
    const res = await fetch('/api/applications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) {
      showMessage(msg, data.error || 'Something went wrong.', 'error');
      return;
    }

    showMessage(msg,
      `Application received. Reference ID: ${data.id}. Total repayable: KES ${data.totalRepayable.toLocaleString()} in ${data.termMonths} installments of KES ${data.installmentAmount.toLocaleString()}.`,
      data.status === 'auto_declined' ? 'error' : 'success'
    );
    e.target.reset();
    document.getElementById('loanBreakdown').hidden = true;
  } catch (err) {
    showMessage(msg, 'Could not reach the server.', 'error');
  }
});

// --- Status check ---
document.getElementById('statusForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = e.target.querySelector('[name="applicationId"]').value.trim();
  const result = document.getElementById('statusResult');

  try {
    const res = await fetch(`/api/applications/${encodeURIComponent(id)}`);
    const data = await res.json();
    result.hidden = false;

    if (!res.ok) {
      result.innerHTML = `<strong>Not found.</strong> Double-check the reference ID.`;
      return;
    }

    const meta = STATUS_LABELS[data.status] || { label: data.status, color: '#4B5A52', bg: '#EDEAE0' };
    let scheduleHtml = '';
    if (data.repaymentSchedule && data.repaymentSchedule.length > 0) {
      scheduleHtml = '<div style="margin-top:12px;"><strong>Repayment Schedule:</strong></div>';
      data.repaymentSchedule.forEach(s => {
        const due = new Date(s.dueDate).toLocaleDateString();
        const status = s.status === 'paid' ? 'Paid' : (s.status === 'late' ? 'Late' : 'Pending');
        const color = s.status === 'paid' ? '#1E8A5B' : (s.status === 'late' ? '#B5442A' : '#8A6D1E');
        scheduleHtml += `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.85rem;border-bottom:1px solid #E4E0D6;">
          <span>Installment ${s.installmentNumber} — due ${due}</span>
          <span>KES ${s.amount.toLocaleString()} ${s.penaltyAmount > 0 ? `(+ KES ${s.penaltyAmount} penalty)` : ''}</span>
          <span style="color:${color};font-weight:600;">${status}</span>
        </div>`;
      });
    }

    result.innerHTML = `
      <div><strong>${data.fullName}</strong> — KES ${Number(data.amount).toLocaleString()} over ${data.termMonths} month(s)</div>
      <div style="margin-top:8px;">
        <span class="status-pill" style="color:${meta.color}; background:${meta.bg};">${meta.label}</span>
      </div>
      ${data.interestRate ? `<div style="margin-top:8px;color:#4B5A52;">Interest: ${(data.interestRate * 100)}% | Total repayable: KES ${data.totalRepayable?.toLocaleString()} | Installment: KES ${data.installmentAmount?.toLocaleString()}/mo</div>` : ''}
      ${data.declineReason ? `<div style="margin-top:8px;">Reason: ${data.declineReason}</div>` : ''}
      ${scheduleHtml}
      <div style="margin-top:8px; color:#4B5A52;font-size:0.85rem;">Funds, when approved, are sent only to the M-Pesa number you applied with.</div>
    `;
  } catch (err) {
    result.hidden = false;
    result.innerHTML = 'Could not reach the server.';
  }
});

// --- Auth ---
function switchAuth(target) {
  document.getElementById('loginSection').hidden = true;
  document.getElementById('registerSection').hidden = true;
  document.getElementById(target + 'Section').hidden = false;
  showSection(target + 'Section');
}

document.querySelectorAll('.switch-auth').forEach(a => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    const target = e.target.getAttribute('href').replace('#', '');
    switchAuth(target);
  });
});

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const payload = Object.fromEntries(formData.entries());
  const msg = document.getElementById('loginMessage');

  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify(payload) });
    saveAuth(data.token, data.user);
    updateNav();
    showToast('Logged in as ' + data.user.fullName, 'success');
    showDashboard();
  } catch (err) {
    showMessage(msg, err.message, 'error');
  }
});

document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const payload = Object.fromEntries(formData.entries());
  const msg = document.getElementById('registerMessage');

  try {
    const data = await api('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
    saveAuth(data.token, data.user);
    updateNav();
    showToast('Account created! Welcome ' + data.user.fullName, 'success');
    showDashboard();
  } catch (err) {
    showMessage(msg, err.message, 'error');
  }
});

document.getElementById('logoutBtn')?.addEventListener('click', () => {
  clearAuth();
  updateNav();
  showSection('heroSection');
  document.getElementById('apply').hidden = false;
  showToast('Logged out', 'info');
});

document.getElementById('loginLink')?.addEventListener('click', (e) => {
  e.preventDefault();
  switchAuth('login');
});

document.getElementById('registerLink')?.addEventListener('click', (e) => {
  e.preventDefault();
  switchAuth('register');
});

document.getElementById('dashboardLink')?.addEventListener('click', (e) => {
  e.preventDefault();
  showDashboard();
});

// --- Dashboard ---
async function showDashboard() {
  if (!currentUser) { switchAuth('login'); return; }
  showSection('dashboardSection');
  document.getElementById('apply').hidden = true;

  try {
    const apps = await api('/my/applications');
    const repayments = await api('/my/repayments');
    const notifs = await api('/notifications');

    renderDashboard(apps, repayments, notifs);
  } catch (err) {
    document.getElementById('dashContent').innerHTML = `<p style="color:#B5442A;">Failed to load dashboard: ${err.message}</p>`;
  }
}

function renderDashboard(apps, repayments, notifs) {
  const activeApps = apps.filter(a => a.status === 'disbursed' || a.status === 'disbursed_pending_confirmation');
  const pendingApps = apps.filter(a => a.status === 'pending_review');
  const repaidApps = apps.filter(a => a.status === 'repaid');
  const declinedApps = apps.filter(a => a.status === 'declined' || a.status === 'auto_declined');

  const totalBorrowed = apps.reduce((s, a) => s + (a.status === 'disbursed' || a.status === 'repaid' ? a.amount : 0), 0);
  const totalRepaid = repayments.filter(r => r.status === 'paid').reduce((s, r) => s + r.amount + r.penaltyAmount, 0);
  const pendingRepayments = repayments.filter(r => r.status !== 'paid');
  const totalDue = pendingRepayments.reduce((s, r) => s + r.amount + r.penaltyAmount - r.paidAmount, 0);

  const unreadNotifs = notifs.filter(n => !n.read).length;

  document.getElementById('dashHeader').innerHTML = `
    <div class="dash-header-inner">
      <div>
        <h2>Welcome, ${currentUser.fullName}</h2>
        <p class="muted">Credit Score: <strong id="creditScoreDisplay">${currentUser.creditScore || 500}</strong>/900
          <span class="badge" style="margin-left:8px;background:#1E8A5B;color:white;border:none;">${unreadNotifs > 0 ? unreadNotifs + ' new notification(s)' : 'No new notifications'}</span>
        </p>
      </div>
      <div class="dash-stats">
        <div class="stat-card"><span class="stat-label">Total Borrowed</span><span class="stat-value">KES ${totalBorrowed.toLocaleString()}</span></div>
        <div class="stat-card"><span class="stat-label">Total Repaid</span><span class="stat-value">KES ${totalRepaid.toLocaleString()}</span></div>
        <div class="stat-card"><span class="stat-label">Outstanding</span><span class="stat-value" style="color:${totalDue > 0 ? '#B5442A' : '#1E8A5B'};">KES ${totalDue.toLocaleString()}</span></div>
      </div>
    </div>
  `;

  let html = '';

  // Active loans
  if (activeApps.length > 0) {
    html += '<div class="panel dash-panel"><h3>Active Loans</h3>';
    for (const app of activeApps) {
      html += `
        <div class="loan-card">
          <div class="loan-card-header">
            <strong>KES ${app.amount.toLocaleString()}</strong>
            <span class="status-pill" style="color:${app.status === 'disbursed' ? '#1E8A5B' : '#1E5FA8'};background:${app.status === 'disbursed' ? '#E4F4EB' : '#E5EFFA'};">${app.status === 'disbursed' ? 'Active' : 'Processing'}</span>
          </div>
          <div>Repayable: KES ${app.totalRepayable?.toLocaleString()} | Installment: KES ${app.installmentAmount?.toLocaleString()}/mo</div>
          <div>Term: ${app.termMonths} months | Interest: ${(app.interestRate * 100)}%</div>
          <div class="repayment-schedule" id="schedule-${app.id}"></div>
          <button class="submit-btn secondary small-btn" onclick="showRepaymentSchedule('${app.id}')">View Schedule</button>
          <button class="submit-btn small-btn" onclick="makePayment('${app.id}')">Make Payment</button>
        </div>`;
    }
    html += '</div>';
  }

  // Pending applications
  if (pendingApps.length > 0) {
    html += '<div class="panel dash-panel"><h3>Pending Applications</h3>';
    for (const app of pendingApps) {
      html += `
        <div class="loan-card">
          <div><strong>KES ${app.amount.toLocaleString()}</strong> — ${app.termMonths} months</div>
          <div>Interest: ${(app.interestRate * 100)}% | Total repayable: KES ${app.totalRepayable?.toLocaleString()}</div>
          <div>Status: <span class="status-pill" style="color:#8A6D1E;background:#FCF2D9;">Pending Review</span></div>
        </div>`;
    }
    html += '</div>';
  }

  // Notifications
  if (notifs.length > 0) {
    html += '<div class="panel dash-panel"><h3>Notifications</h3>';
    for (const n of notifs.slice(0, 10)) {
      const icon = n.type === 'sms' ? '📱' : '📧';
      html += `
        <div class="notif-item ${n.read ? '' : 'notif-unread'}" onclick="${n.read ? '' : `markRead('${n.id}')`}">
          <span>${icon} ${n.message}</span>
          <span class="muted" style="font-size:0.75rem;">${new Date(n.sentAt).toLocaleString()}</span>
        </div>`;
    }
    html += '</div>';
  }

  // Repayment history
  if (repayments.length > 0) {
    html += '<div class="panel dash-panel"><h3>Repayment History</h3>';
    html += '<div style="overflow-x:auto;"><table class="repay-table"><thead><tr><th>Loan</th><th>Installment</th><th>Due</th><th>Amount</th><th>Penalty</th><th>Paid</th><th>Status</th></tr></thead><tbody>';
    for (const r of repayments.slice().reverse().slice(0, 20)) {
      const due = new Date(r.dueDate).toLocaleDateString();
      const statusColor = r.status === 'paid' ? '#1E8A5B' : (r.status === 'late' ? '#B5442A' : '#8A6D1E');
      html += `<tr>
        <td>${r.applicationId.slice(0, 8)}...</td>
        <td>${r.installmentNumber}</td>
        <td>${due}</td>
        <td>KES ${r.amount.toLocaleString()}</td>
        <td>${r.penaltyAmount > 0 ? 'KES ' + r.penaltyAmount.toLocaleString() : '-'}</td>
        <td>${r.paidAt ? new Date(r.paidAt).toLocaleDateString() : '-'}</td>
        <td style="color:${statusColor};font-weight:600;">${r.status}</td>
      </tr>`;
    }
    html += '</tbody></table></div></div>';
  }

  if (!html) {
    html = '<div class="panel"><p class="muted">No loan activity yet. <a href="#apply" onclick="showSection(\'heroSection\');document.getElementById(\'apply\').hidden=false;">Apply for a loan</a></p></div>';
  }

  document.getElementById('dashContent').innerHTML = html;
}

async function showRepaymentSchedule(applicationId) {
  try {
    const app = await api('/applications/' + applicationId);
    const container = document.getElementById('schedule-' + applicationId);
    if (!app.repaymentSchedule || app.repaymentSchedule.length === 0) {
      container.innerHTML = '<div class="muted">No schedule available yet.</div>';
      return;
    }
    let html = '<div style="margin-top:8px;font-size:0.85rem;"><strong>Schedule:</strong>';
    for (const s of app.repaymentSchedule) {
      const due = new Date(s.dueDate).toLocaleDateString();
      const status = s.status === 'paid' ? 'Paid' : (s.status === 'late' ? 'Late' : 'Pending');
      const color = s.status === 'paid' ? '#1E8A5B' : (s.status === 'late' ? '#B5442A' : '#8A6D1E');
      html += `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #E4E0D6;">
        <span>#${s.installmentNumber} (due ${due})</span>
        <span>KES ${s.amount.toLocaleString()}${s.penaltyAmount > 0 ? ' + KES ' + s.penaltyAmount + ' penalty' : ''}</span>
        <span style="color:${color};font-weight:600;">${status}</span>
      </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
  } catch (err) {
    showToast('Failed to load schedule', 'error');
  }
}

async function makePayment(applicationId) {
  const amount = prompt('Enter payment amount (KES):');
  if (!amount || isNaN(amount) || amount <= 0) return;

  try {
    const result = await api('/my/applications/' + applicationId + '/pay', {
      method: 'POST', body: JSON.stringify({ amount: parseFloat(amount) })
    });
    if (result.success) {
      showToast('Payment of KES ' + amount + ' recorded! Remaining: KES ' + (result.remaining || 0), 'success');
      showDashboard();
      // Refresh credit score
      try {
        const me = await api('/auth/me');
        currentUser.creditScore = me.creditScore;
        localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
      } catch (_) {}
    } else {
      showToast(result.error || 'Payment failed', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function markRead(id) {
  try {
    await api('/notifications/' + id + '/read', { method: 'POST' });
    showDashboard();
  } catch (_) {}
}

// --- Init ---
updateNav();
if (currentUser) {
  showSection('dashboardSection');
  document.getElementById('apply').hidden = true;
  showDashboard();
}
