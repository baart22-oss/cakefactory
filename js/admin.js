/* ============================================================
   admin.js — Admin Panel
   ============================================================ */

let adminToken = null;

function togglePassword(fieldId, icon) {
  const field = document.getElementById(fieldId);
  if (field.type === 'password') {
    field.type = 'text';
    icon.textContent = '🙈';
  } else {
    field.type = 'password';
    icon.textContent = '👁️';
  }
}

async function adminLogin(e) {
  e.preventDefault();
  const username = document.getElementById('adminUser').value.trim();
  const password = document.getElementById('adminPass').value;
  const errorEl = document.getElementById('loginError');
  const btn = document.getElementById('adminLoginBtn');

  errorEl.classList.add('hidden');
  setLoading(btn, true);

  try {
    const data = await apiCall('/api/admin/login', 'POST', { username, password });
    adminToken = data.token;
    localStorage.setItem('cf_admin_token', adminToken);

    document.getElementById('adminLogin').style.display = 'none';
    document.getElementById('adminApp').style.display = 'block';

    await loadStats();
    await loadDeposits();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  } finally {
    setLoading(btn, false);
  }
}

function adminLogout() {
  adminToken = null;
  localStorage.removeItem('cf_admin_token');
  document.getElementById('adminLogin').style.display = 'flex';
  document.getElementById('adminApp').style.display = 'none';
}

function showTab(tabName, btn) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.admin-nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tabName).classList.add('active');
  if (btn) btn.classList.add('active');

  // Lazy load
  if (tabName === 'stats') loadStats();
  else if (tabName === 'deposits') loadDeposits();
  else if (tabName === 'withdrawals') loadWithdrawals();
  else if (tabName === 'transactions') loadTransactions();
  else if (tabName === 'users') loadUsers();
}

async function loadStats() {
  try {
    const data = await apiCall('/api/admin/stats', 'GET', null, adminToken);
    document.getElementById('statsGrid').innerHTML = `
      <div class="stat-card">
        <span class="stat-icon">👥</span>
        <span class="stat-value">${data.totalUsers}</span>
        <span class="stat-label">Total Users</span>
      </div>
      <div class="stat-card">
        <span class="stat-icon">⏳</span>
        <span class="stat-value">${data.pendingDeposits}</span>
        <span class="stat-label">Pending Deposits</span>
      </div>
      <div class="stat-card">
        <span class="stat-icon">💸</span>
        <span class="stat-value">${data.pendingWithdrawals}</span>
        <span class="stat-label">Pending Withdrawals</span>
      </div>
      <div class="stat-card">
        <span class="stat-icon">💰</span>
        <span class="stat-value">${formatCurrency(data.totalDeposits)}</span>
        <span class="stat-label">Total Deposits</span>
      </div>
    `;
  } catch (err) {
    showToast('Failed to load stats: ' + err.message, 'error');
  }
}

async function loadDeposits() {
  const el = document.getElementById('depositsContent');
  el.innerHTML = '<div class="text-center p-3" style="color:var(--text-muted);">Loading...</div>';
  try {
    const data = await apiCall('/api/admin/transactions?limit=100', 'GET', null, adminToken);
    const pending = data.transactions.filter(t => t.status === 'pending' && t.type === 'deposit');

    if (pending.length === 0) {
      el.innerHTML = '<div class="text-center p-3" style="color:var(--text-muted);">No pending deposits 🎉</div>';
      return;
    }

    el.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>User</th><th>Tier</th><th>Amount</th><th>Proof</th><th>Date</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${pending.map(tx => `
              <tr id="tx-row-${tx.id}">
                <td>#${tx.id}</td>
                <td>
                  <div class="fw-bold">${tx.username}</div>
                  <div style="font-size:0.75rem;color:var(--text-muted);">${tx.email}</div>
                </td>
                <td>${tx.tier_name || tx.tier || '—'}</td>
                <td class="fw-bold">${formatCurrency(tx.amount)}</td>
                <td>
                  ${tx.proof_data
                    ? `<button class="proof-btn" onclick="viewProof('${tx.proof_data}','${tx.proof_type || ''}','${tx.proof_name || ''}')">View Proof</button>`
                    : '<span style="color:var(--text-muted);font-size:0.8rem;">No proof</span>'}
                </td>
                <td style="font-size:0.8rem;">${formatDateTime(tx.created_at)}</td>
                <td>
                  <div style="display:flex;gap:0.4rem;">
                    <button class="btn btn-success btn-sm" onclick="verifyTransaction(${tx.id},'approve')">✅ Approve</button>
                    <button class="btn btn-danger btn-sm" onclick="verifyTransaction(${tx.id},'reject')">❌ Reject</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">Failed to load: ${err.message}</div>`;
  }
}

async function loadWithdrawals() {
  const el = document.getElementById('withdrawalsContent');
  el.innerHTML = '<div class="text-center p-3" style="color:var(--text-muted);">Loading...</div>';
  try {
    const data = await apiCall('/api/admin/withdrawals?limit=100', 'GET', null, adminToken);
    const pending = data.withdrawals.filter(w => w.status === 'pending');

    if (pending.length === 0) {
      el.innerHTML = '<div class="text-center p-3" style="color:var(--text-muted);">No pending withdrawals 🎉</div>';
      return;
    }

    el.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>User</th><th>Amount</th><th>Bank Details</th><th>Date</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${pending.map(w => `
              <tr id="wd-row-${w.id}">
                <td>#${w.id}</td>
                <td>
                  <div class="fw-bold">${w.username}</div>
                  <div style="font-size:0.75rem;color:var(--text-muted);">${w.email}</div>
                </td>
                <td class="fw-bold">${formatCurrency(w.amount)}</td>
                <td style="font-size:0.8rem;">
                  <div>${w.bank_name || '—'}</div>
                  <div>${w.account_holder || '—'}</div>
                  <div style="color:var(--primary);">${w.account_number || '—'}</div>
                  <div style="color:var(--text-muted);">Branch: ${w.branch_code || '—'}</div>
                  <div style="color:var(--text-muted);">${w.account_type || '—'}</div>
                </td>
                <td style="font-size:0.8rem;">${formatDateTime(w.created_at)}</td>
                <td>
                  <div style="display:flex;gap:0.4rem;">
                    <button class="btn btn-success btn-sm" onclick="processWithdrawal(${w.id},'approve')">✅ Approve</button>
                    <button class="btn btn-danger btn-sm" onclick="processWithdrawal(${w.id},'reject')">❌ Reject</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">Failed to load: ${err.message}</div>`;
  }
}

async function loadTransactions() {
  const el = document.getElementById('transactionsContent');
  el.innerHTML = '<div class="text-center p-3" style="color:var(--text-muted);">Loading...</div>';
  try {
    const data = await apiCall('/api/admin/transactions?limit=100', 'GET', null, adminToken);
    if (data.transactions.length === 0) {
      el.innerHTML = '<div class="text-center p-3" style="color:var(--text-muted);">No transactions yet</div>';
      return;
    }
    el.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr><th>ID</th><th>User</th><th>Type</th><th>Tier</th><th>Amount</th><th>Status</th><th>Date</th></tr>
          </thead>
          <tbody>
            ${data.transactions.map(tx => `
              <tr>
                <td>#${tx.id}</td>
                <td>
                  <div class="fw-bold">${tx.username || '—'}</div>
                  <div style="font-size:0.75rem;color:var(--text-muted);">${tx.email || '—'}</div>
                </td>
                <td>${txTypeBadge(tx.type)}</td>
                <td>${tx.tier_name || tx.tier || '—'}</td>
                <td class="fw-bold">${formatCurrency(tx.amount)}</td>
                <td>${statusBadge(tx.status)}</td>
                <td style="font-size:0.8rem;">${formatDateTime(tx.created_at)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div style="padding:0.75rem 1rem;color:var(--text-muted);font-size:0.85rem;">Showing ${data.transactions.length} of ${data.total}</div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">Failed to load: ${err.message}</div>`;
  }
}

async function loadUsers() {
  const el = document.getElementById('usersContent');
  el.innerHTML = '<div class="text-center p-3" style="color:var(--text-muted);">Loading...</div>';
  try {
    const data = await apiCall('/api/admin/users', 'GET', null, adminToken);
    if (data.users.length === 0) {
      el.innerHTML = '<div class="text-center p-3" style="color:var(--text-muted);">No users yet</div>';
      return;
    }
    el.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr><th>ID</th><th>Username</th><th>Email</th><th>Wallet</th><th>Total Earned</th><th>Referral Earnings</th><th>First Deposit</th><th>Joined</th></tr>
          </thead>
          <tbody>
            ${data.users.map(u => `
              <tr>
                <td>#${u.id}</td>
                <td class="fw-bold">${u.username}${u.is_admin ? ' <span class="badge badge-danger">admin</span>' : ''}</td>
                <td style="font-size:0.85rem;">${u.email}</td>
                <td class="fw-bold text-primary">${formatCurrency(u.wallet)}</td>
                <td>${formatCurrency(u.total_earned)}</td>
                <td>${formatCurrency(u.referral_earnings)}</td>
                <td>${u.first_deposit_done ? '<span class="badge badge-success">Yes</span>' : '<span class="badge badge-warning">No</span>'}</td>
                <td style="font-size:0.8rem;">${formatDate(u.created_at)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">Failed to load: ${err.message}</div>`;
  }
}

async function verifyTransaction(txId, action) {
  if (!confirm(`Are you sure you want to ${action} transaction #${txId}?`)) return;
  try {
    await apiCall('/api/admin/verify-transaction', 'POST', { transactionId: txId, action }, adminToken);
    showToast(`Transaction #${txId} ${action}d successfully!`, 'success');
    const row = document.getElementById('tx-row-' + txId);
    if (row) row.remove();
    loadStats();
  } catch (err) {
    showToast('Failed: ' + err.message, 'error');
  }
}

async function processWithdrawal(wdId, action) {
  if (!confirm(`Are you sure you want to ${action} withdrawal #${wdId}?`)) return;
  try {
    await apiCall('/api/admin/process-withdrawal', 'POST', { withdrawalId: wdId, action }, adminToken);
    showToast(`Withdrawal #${wdId} ${action}d successfully!`, 'success');
    const row = document.getElementById('wd-row-' + wdId);
    if (row) row.remove();
    loadStats();
  } catch (err) {
    showToast('Failed: ' + err.message, 'error');
  }
}

function viewProof(dataUrl, type, name) {
  const imgEl = document.getElementById('proofImage');
  const pdfEl = document.getElementById('proofPdf');
  const pdfLink = document.getElementById('proofPdfLink');

  if (type && type.includes('pdf')) {
    imgEl.style.display = 'none';
    pdfEl.style.display = 'block';
    pdfLink.href = dataUrl;
    pdfLink.download = name || 'proof.pdf';
  } else {
    imgEl.src = dataUrl;
    imgEl.style.display = 'block';
    pdfEl.style.display = 'none';
  }
  openModal('proofModal');
}

// Auto-login from stored token
document.addEventListener('DOMContentLoaded', () => {
  const stored = localStorage.getItem('cf_admin_token');
  if (stored) {
    adminToken = stored;
    document.getElementById('adminLogin').style.display = 'none';
    document.getElementById('adminApp').style.display = 'block';
    loadStats();
    loadDeposits();
  }
});
