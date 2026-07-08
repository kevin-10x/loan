const applicationForm = document.getElementById('applicationForm');
const formMessage = document.getElementById('formMessage');
const statusForm = document.getElementById('statusForm');
const statusResult = document.getElementById('statusResult');

function showMessage(el, text, type) {
  el.hidden = false;
  el.textContent = text;
  el.className = 'form-message ' + type;
}

const STATUS_LABELS = {
  pending_review: { label: 'Pending review', color: '#8A6D1E', bg: '#FCF2D9' },
  auto_declined: { label: 'Declined', color: '#B5442A', bg: '#FBE9E4' },
  declined: { label: 'Declined', color: '#B5442A', bg: '#FBE9E4' },
  disbursed_pending_confirmation: { label: 'Approved — sending funds', color: '#1E5FA8', bg: '#E5EFFA' },
  disbursed: { label: 'Disbursed', color: '#1E8A5B', bg: '#E4F4EB' },
  disbursement_failed: { label: 'Disbursement failed', color: '#B5442A', bg: '#FBE9E4' }
};

applicationForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(applicationForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) {
      showMessage(formMessage, data.error || 'Something went wrong. Please try again.', 'error');
      return;
    }

    if (data.status === 'auto_declined') {
      showMessage(formMessage, `Application received, but not approved yet: ${data.declineReason}. Your reference ID is ${data.id}.`, 'error');
    } else {
      showMessage(
        formMessage,
        `Application received. Your reference ID is ${data.id} — save it to check your status. We never ask you to pay anything at this stage.`,
        'success'
      );
    }
    applicationForm.reset();
  } catch (err) {
    showMessage(formMessage, 'Could not reach the server. Please try again shortly.', 'error');
  }
});

statusForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(statusForm);
  const id = formData.get('applicationId').trim();

  try {
    const res = await fetch(`/api/applications/${encodeURIComponent(id)}`);
    const data = await res.json();
    statusResult.hidden = false;

    if (!res.ok) {
      statusResult.innerHTML = `<strong>Not found.</strong> Double-check the reference ID.`;
      return;
    }

    const meta = STATUS_LABELS[data.status] || { label: data.status, color: '#4B5A52', bg: '#EDEAE0' };
    statusResult.innerHTML = `
      <div><strong>${data.fullName}</strong> — KES ${Number(data.amount).toLocaleString()} over ${data.termMonths} month(s)</div>
      <div style="margin-top:8px;">
        <span class="status-pill" style="color:${meta.color}; background:${meta.bg};">${meta.label}</span>
      </div>
      ${data.declineReason ? `<div style="margin-top:8px;">Reason: ${data.declineReason}</div>` : ''}
      <div style="margin-top:8px; color:#4B5A52;">Funds, when approved, are sent only to the M-Pesa number you applied with — never the other way around.</div>
    `;
  } catch (err) {
    statusResult.hidden = false;
    statusResult.innerHTML = 'Could not reach the server. Please try again shortly.';
  }
});
