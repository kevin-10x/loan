const rows = document.getElementById('rows');
const loadBtn = document.getElementById('loadBtn');
const adminKeyInput = document.getElementById('adminKeyInput');
const dashboardContent = document.getElementById('dashboardContent');
const statsRow = document.getElementById('statsRow');
const searchInput = document.getElementById('searchInput');

let allApps = [];
let currentTab = 'all';
let currentSearch = '';

function getKey() {
  return adminKeyInput.value.trim();
}

async function loadApplications() {
  const res = await fetch('/api/admin/applications', {
    headers: { 'x-admin-key': getKey() }
  });
  if (!res.ok) {
    dashboardContent.hidden = true;
    rows.innerHTML = `<tr><td colspan="9">Unauthorized or error loading applications. Check your admin key.</td></tr>`;
    return;
  }
  allApps = await res.json();
  dashboardContent.hidden = false;
  render();
}

function render() {
  const filtered = allApps.filter(a => {
    const q = currentSearch.toLowerCase();
    if (q && !a.fullName.toLowerCase().includes(q) && !a.phoneNumber.includes(q) && !a.nationalId.includes(q) && !String(a.amount).includes(q)) {
      return false;
    }
    if (currentTab === 'pending') return a.status === 'pending_review';
    if (currentTab === 'active') return a.status === 'disbursed' || a.status === 'disbursed_pending_confirmation';
    if (currentTab === 'repaid') return a.status === 'repaid';
    if (currentTab === 'overdue') {
      if (a.status !== 'disbursed') return false;
      const schedule = a.repaymentSchedule || [];
      return schedule.some(s => s.status === 'late' || (s.status === 'pending' && new Date(s.dueDate) < new Date()));
    }
    return true;
  });

  renderStats(filtered, allApps);
  renderTable(filtered);
}

function renderStats(filtered, all) {
  const totalLoans = all.filter(a => a.status === 'disbursed' || a.status === 'repaid').length;
  const totalDisbursed = all.filter(a => a.status === 'disbursed' || a.status === 'repaid').reduce((s, a) => s + a.amount, 0);
  const totalRepaid = all.filter(a => a.status === 'repaid').reduce((s, a) => s + a.amount, 0);
  const pendingReview = all.filter(a => a.status === 'pending_review').length;
  const overdue = all.filter(a => {
    if (a.status !== 'disbursed') return false;
    const schedule = a.repaymentSchedule || [];
    return schedule.some(s => s.status === 'late' || (s.status === 'pending' && new Date(s.dueDate) < new Date()));
  }).length;

  statsRow.innerHTML = `
    <div class="stat-card"><div class="stat-label2">Total Loans</div><div class="stat-value2">${totalLoans}</div></div>
    <div class="stat-card"><div class="stat-label2">Total Disbursed</div><div class="stat-value2">KES ${totalDisbursed.toLocaleString()}</div></div>
    <div class="stat-card"><div class="stat-label2">Total Repaid</div><div class="stat-value2">KES ${totalRepaid.toLocaleString()}</div></div>
    <div class="stat-card"><div class="stat-label2">Pending Review</div><div class="stat-value2">${pendingReview}</div></div>
    <div class="stat-card"><div class="stat-label2">Overdue</div><div class="stat-value2" style="color:${overdue > 0 ? '#B5442A' : '#1E8A5B'};">${overdue}</div></div>
    <div class="stat-card"><div class="stat-label2">Total Applicants</div><div class="stat-value2">${all.length}</div></div>
  `;
}

function renderTable(apps) {
  if (!apps.length) {
    rows.innerHTML = `<tr><td colspan="9">No applications match your filters.</td></tr>`;
    return;
  }

  rows.innerHTML = apps.map(a => {
    const schedule = a.repaymentSchedule || [];
    const lateCount = schedule.filter(s => s.status === 'late').length;
    const paidCount = schedule.filter(s => s.status === 'paid').length;
    const totalInst = a.termMonths;

    const scheduleHtml = schedule.map(s => {
      const due = new Date(s.dueDate).toLocaleDateString();
      const statusColor = s.status === 'paid' ? '#1E8A5B' : (s.status === 'late' ? '#B5442A' : '#8A6D1E');
      return `<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid #E4E0D6;">
        <span>#${s.installmentNumber} — ${due}</span>
        <span>KES ${s.amount.toLocaleString()}${s.penaltyAmount > 0 ? ' + pen. KES ' + s.penaltyAmount : ''}</span>
        <span style="color:${statusColor};">${s.status}</span>
      </div>`;
    }).join('');

    return `
      <tr>
        <td><strong>${a.fullName}</strong><br><span style="font-size:0.75rem;color:#4B5A52;">ID: ${a.nationalId}</span></td>
        <td>${a.phoneNumber}</td>
        <td>KES ${Number(a.amount).toLocaleString()}</td>
        <td>${a.interestRate ? (a.interestRate * 100) + '%' : '-'}</td>
        <td>${a.totalRepayable ? 'KES ' + a.totalRepayable.toLocaleString() : '-'}<br><span style="font-size:0.75rem;color:#4B5A52;">${a.installmentAmount ? 'KES ' + a.installmentAmount.toLocaleString() + '/mo' : ''}</span></td>
        <td>
          <span style="display:inline-block;padding:2px 8px;border-radius:999px;font-weight:600;font-size:0.72rem;
            ${statusStyle(a.status)}">
            ${statusLabel(a.status)}
          </span>
          ${lateCount > 0 ? `<br><span style="color:#B5442A;font-size:0.75rem;">${lateCount} late</span>` : ''}
          ${paidCount > 0 && totalInst ? `<br><span style="color:#1E8A5B;font-size:0.75rem;">${paidCount}/${totalInst} paid</span>` : ''}
        </td>
        <td style="font-size:0.8rem;font-weight:600;">${a.creditScore || '-'}</td>
        <td>
          <span class="schedule-toggle" onclick="toggleSchedule('sched-${a.id}')">${schedule.length > 0 ? 'View (' + schedule.length + ')' : '-'}</span>
          <div class="schedule-detail" id="sched-${a.id}">${scheduleHtml || 'No schedule'}</div>
        </td>
        <td style="white-space:nowrap;">
          ${a.status === 'pending_review' ? `
            <button class="small approve-btn" data-id="${a.id}" data-action="approve">Approve</button>
            <button class="small decline-btn" data-id="${a.id}" data-action="decline">Decline</button>
          ` : ''}
          ${a.status === 'disbursed' ? `
            <button class="small penalty-btn" data-id="${a.id}" data-action="check-late">Check late fees</button>
            <button class="small info-btn" data-id="${a.id}" data-action="request-stk">Request STK</button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

function statusStyle(status) {
  const map = {
    pending_review: 'color:#8A6D1E;background:#FCF2D9',
    auto_declined: 'color:#B5442A;background:#FBE9E4',
    declined: 'color:#B5442A;background:#FBE9E4',
    disbursed_pending_confirmation: 'color:#1E5FA8;background:#E5EFFA',
    disbursed: 'color:#1E8A5B;background:#E4F4EB',
    disbursement_failed: 'color:#B5442A;background:#FBE9E4',
    repaid: 'color:#1E8A5B;background:#E4F4EB'
  };
  return map[status] || 'color:#4B5A52;background:#EDEAE0';
}

function statusLabel(status) {
  const map = {
    pending_review: 'Pending Review',
    auto_declined: 'Declined',
    declined: 'Declined',
    disbursed_pending_confirmation: 'Sending Funds',
    disbursed: 'Active',
    disbursement_failed: 'Failed',
    repaid: 'Repaid'
  };
  return map[status] || status;
}

function toggleSchedule(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('open');
}

// --- Tab switching ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.tab;
    render();
  });
});

// --- Search ---
searchInput.addEventListener('input', () => {
  currentSearch = searchInput.value;
  render();
});

// --- Actions ---
rows.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const { id, action } = btn.dataset;

  if (action === 'approve') {
    if (!confirm('Approve and disburse KES ' + allApps.find(a => a.id === id)?.amount?.toLocaleString() + '?')) return;
    const res = await fetch(`/api/admin/applications/${id}/approve`, {
      method: 'POST', headers: { 'x-admin-key': getKey(), 'Content-Type': 'application/json' }, body: '{}'
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Action failed'); return; }
    alert('Approved! Disbursement initiated.');
    loadApplications();
  }

  if (action === 'decline') {
    const reason = prompt('Decline reason:');
    if (reason === null) return;
    await fetch(`/api/admin/applications/${id}/decline`, {
      method: 'POST', headers: { 'x-admin-key': getKey(), 'Content-Type': 'application/json' }, body: JSON.stringify({ reason })
    });
    loadApplications();
  }

  if (action === 'check-late') {
    const res = await fetch(`/api/repayments/${id}/check-late`, {
      headers: { 'x-admin-key': getKey() }
    });
    const data = await res.json();
    alert('Late installments: ' + (data.lateInstallments?.length || 0));
    loadApplications();
  }

  if (action === 'request-stk') {
    const amount = prompt('STK push amount (KES):');
    if (!amount) return;
    const res = await fetch(`/api/repayments/${id}/request`, {
      method: 'POST', headers: { 'x-admin-key': getKey(), 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: parseFloat(amount) })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'STK push failed'); return; }
    alert('STK push sent! Response: ' + (data.ResponseDescription || 'OK'));
  }
});

loadBtn.addEventListener('click', loadApplications);

// Auto-load if key is in URL or localStorage
const savedKey = localStorage.getItem('haraka_admin_key');
if (savedKey) {
  adminKeyInput.value = savedKey;
  loadApplications();
}

adminKeyInput.addEventListener('change', () => {
  localStorage.setItem('haraka_admin_key', adminKeyInput.value);
});
