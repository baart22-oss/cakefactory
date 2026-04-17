/* ============================================================
   withdrawal.js — Withdrawal page
   ============================================================ */

let currentWallet = 0;
let hasBanking = false;

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  await loadWithdrawalPage();
});

async function loadWithdrawalPage() {
  const token = getToken();
  try {
    const [profileData, bankData] = await Promise.all([
      apiCall('/api/user/profile', 'GET', null, token),
      apiCall('/api/user/banking', 'GET', null, token)
    ]);

    const user = profileData.user;
    currentWallet = parseFloat(user.wallet);

    document.getElementById('navUsername').textContent = '👤 ' + user.username;
    document.getElementById('navWallet').textContent = formatCurrency(currentWallet);
    document.getElementById('walletBalance').textContent = formatCurrency(currentWallet);
    document.getElementById('wdHint').textContent = `Available: ${formatCurrency(currentWallet)}`;

    const banking = bankData.banking;
    const summaryEl = document.getElementById('bankingSummary');
    const noBankWarning = document.getElementById('noBankWarning');
    const wdBtn = document.getElementById('wdBtn');

    if (!banking) {
      hasBanking = false;
      summaryEl.innerHTML = `
        <div class="text-center" style="color:var(--text-muted);padding:1rem;">
          No banking details saved.
          <br/><br/>
          <a href="banking.html" class="btn btn-primary btn-sm">Add Banking Details</a>
        </div>
      `;
      noBankWarning.classList.remove('hidden');
      wdBtn.disabled = true;
    } else {
      hasBanking = true;
      noBankWarning.classList.add('hidden');
      summaryEl.innerHTML = `
        <div class="bank-info-box">
          <div class="bank-info-row">
            <span class="bank-info-label">Account Holder</span>
            <span class="bank-info-value">${banking.account_holder}</span>
          </div>
          <div class="bank-info-row">
            <span class="bank-info-label">Bank</span>
            <span class="bank-info-value">${banking.bank_name}</span>
          </div>
          <div class="bank-info-row">
            <span class="bank-info-label">Account Number</span>
            <span class="bank-info-value">${banking.account_number}</span>
          </div>
          <div class="bank-info-row">
            <span class="bank-info-label">Branch Code</span>
            <span class="bank-info-value">${banking.branch_code}</span>
          </div>
          <div class="bank-info-row">
            <span class="bank-info-label">Account Type</span>
            <span class="bank-info-value">${banking.account_type}</span>
          </div>
        </div>
      `;
      wdBtn.disabled = false;
    }
  } catch (err) {
    if (err.message.includes('nauthorized')) { clearAuth(); window.location.href = 'login.html'; }
    else showToast('Failed to load page: ' + err.message, 'error');
  }
}

async function submitWithdrawal(e) {
  e.preventDefault();

  const errorEl = document.getElementById('wdError');
  const successEl = document.getElementById('wdSuccess');
  errorEl.classList.add('hidden');
  successEl.classList.add('hidden');

  if (!hasBanking) {
    errorEl.textContent = 'Please save your banking details first.';
    errorEl.classList.remove('hidden');
    return;
  }

  const amount = parseFloat(document.getElementById('wdAmount').value);
  if (!amount || amount <= 0) {
    errorEl.textContent = 'Please enter a valid amount.';
    errorEl.classList.remove('hidden');
    return;
  }
  if (amount > currentWallet) {
    errorEl.textContent = `Insufficient balance. Available: ${formatCurrency(currentWallet)}`;
    errorEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('wdBtn');
  setLoading(btn, true);

  try {
    const token = getToken();
    await apiCall('/api/withdrawal/request', 'POST', { amount }, token);

    currentWallet -= amount;
    document.getElementById('walletBalance').textContent = formatCurrency(currentWallet);
    document.getElementById('navWallet').textContent = formatCurrency(currentWallet);
    document.getElementById('wdHint').textContent = `Available: ${formatCurrency(currentWallet)}`;

    successEl.innerHTML = `✅ Withdrawal of ${formatCurrency(amount)} submitted! Processing within 1-3 business days. <a href="dashboard.html">Dashboard</a>`;
    successEl.classList.remove('hidden');
    document.getElementById('withdrawalForm').reset();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  } finally {
    setLoading(btn, false);
  }
}
