/* ============================================================
   dashboard.js — User Dashboard
   ============================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  await loadDashboard();
});

async function loadDashboard() {
  const token = getToken();
  try {
    const [profileData, txData, refData] = await Promise.all([
      apiCall('/api/user/profile', 'GET', null, token),
      apiCall('/api/user/transactions', 'GET', null, token),
      apiCall('/api/user/referrals', 'GET', null, token)
    ]);

    const user = profileData.user;
    setUser(user);

    // Update nav
    document.getElementById('navUsername').textContent = '👤 ' + user.username;
    document.getElementById('navWallet').textContent = formatCurrency(user.wallet);
    document.getElementById('welcomeName').textContent = user.username;

    // Stats
    document.getElementById('statWallet').textContent = formatCurrency(user.wallet);
    document.getElementById('statEarned').textContent = formatCurrency(user.total_earned);
    document.getElementById('statRefEarnings').textContent = formatCurrency(user.referral_earnings);
    document.getElementById('statReferrals').textContent = refData.count;

    // Referral link
    const refLink = `${window.location.origin}${window.location.pathname.replace('dashboard.html', '')}login.html?ref=${user.referral_code}`;
    document.getElementById('refLinkDisplay').textContent = refLink;
    document.getElementById('refCount').textContent = refData.count;

    // Transactions
    renderTransactions(txData.transactions);
  } catch (err) {
    console.error(err);
    if (err.message === 'Unauthorized' || err.message === 'Invalid or expired token') {
      clearAuth();
      window.location.href = 'login.html';
    } else {
      showToast('Failed to load dashboard: ' + err.message, 'error');
    }
  }
}

function renderTransactions(txs) {
  const loading = document.getElementById('txLoading');
  const table = document.getElementById('txTable');
  const empty = document.getElementById('txEmpty');
  const body = document.getElementById('txBody');

  loading.style.display = 'none';

  if (!txs || txs.length === 0) {
    empty.style.display = 'block';
    return;
  }

  table.style.display = 'block';
  body.innerHTML = txs.map(tx => `
    <tr>
      <td>${txTypeBadge(tx.type)}</td>
      <td class="fw-bold ${tx.type === 'referral_bonus' || tx.type === 'game_earning' ? 'text-success' : ''}">${formatCurrency(tx.amount)}</td>
      <td>${tx.tier_name || tx.tier || '—'}</td>
      <td>${statusBadge(tx.status)}</td>
      <td style="font-size:0.8rem;color:var(--text-muted);">${formatDateTime(tx.created_at)}</td>
    </tr>
  `).join('');
}

function copyRefLink() {
  const link = document.getElementById('refLinkDisplay').textContent;
  navigator.clipboard.writeText(link)
    .then(() => showToast('Referral link copied! 📋', 'success'))
    .catch(() => {
      const ta = document.createElement('textarea');
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast('Referral link copied!', 'success');
    });
}
