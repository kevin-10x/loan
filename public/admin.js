const rows = document.getElementById('rows');
const loadBtn = document.getElementById('loadBtn');
const adminKeyInput = document.getElementById('adminKeyInput');

function getKey() {
  return adminKeyInput.value.trim();
}

async function loadApplications() {
  const res = await fetch('/api/admin/applications', {
    headers: { 'x-admin-key': getKey() }
  });
  if (!res.ok) {
    rows.innerHTML = `<tr><td colspan="5">Unauthorized or error loading applications.</td></tr>`;
    return;
  }
  const apps = await res.json();
  render(apps);
}

function render(apps) {
  if (!apps.length) {
    rows.innerHTML = `<tr><td colspan="5">No applications yet.</td></tr>`;
    return;
  }
  rows.innerHTML = apps.map(a => `
    <tr>
      <td>${a.fullName}</td>
      <td>${a.phoneNumber}</td>
      <td>KES ${Number(a.amount).toLocaleString()}</td>
      <td>${a.status}</td>
      <td>
        ${a.status === 'pending_review' ? `
          <button class="small approve-btn" data-id="${a.id}" data-action="approve">Approve & disburse</button>
          <button class="small decline-btn" data-id="${a.id}" data-action="decline">Decline</button>
        ` : ''}
      </td>
    </tr>
  `).join('');
}

rows.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const { id, action } = btn.dataset;

  const res = await fetch(`/api/admin/applications/${id}/${action}`, {
    method: 'POST',
    headers: { 'x-admin-key': getKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Action failed');
    return;
  }
  loadApplications();
});

loadBtn.addEventListener('click', loadApplications);
