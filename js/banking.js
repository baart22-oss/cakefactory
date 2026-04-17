/* ============================================================
   banking.js — Banking Details Form
   ============================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  await loadBankingPage();
});

async function loadBankingPage() {
  const token = getToken();
  try {
    const [profileData, bankData] = await Promise.all([
      apiCall('/api/user/profile', 'GET', null, token),
      apiCall('/api/user/banking', 'GET', null, token)
    ]);

    document.getElementById('navUsername').textContent = '👤 ' + profileData.user.username;
    document.getElementById('navWallet').textContent = formatCurrency(profileData.user.wallet);

    const banking = bankData.banking;
    if (banking) {
      document.getElementById('accountHolder').value = banking.account_holder || '';
      document.getElementById('bankName').value = banking.bank_name || '';
      document.getElementById('accountNumber').value = banking.account_number || '';
      document.getElementById('branchCode').value = banking.branch_code || '';
      document.getElementById('accountType').value = banking.account_type || '';
    }
  } catch (err) {
    if (err.message.includes('nauthorized')) { clearAuth(); window.location.href = 'login.html'; }
    else showToast('Failed to load banking details: ' + err.message, 'error');
  }
}

// Auto-fill branch code based on bank selection
document.addEventListener('DOMContentLoaded', () => {
  const bankSelect = document.getElementById('bankName');
  if (!bankSelect) return;
  const branchCodes = {
    'FNB': '250655',
    'ABSA': '632005',
    'Standard Bank': '051001',
    'Nedbank': '198765',
    'Capitec': '470010',
    'TymeBank': '678910',
    'African Bank': '430000',
  };
  bankSelect.addEventListener('change', () => {
    const code = branchCodes[bankSelect.value];
    if (code) {
      document.getElementById('branchCode').value = code;
    }
  });
});

async function saveBanking(e) {
  e.preventDefault();

  const errorEl = document.getElementById('bankError');
  const successEl = document.getElementById('bankSuccess');
  errorEl.classList.add('hidden');
  successEl.classList.add('hidden');

  const accountHolder = document.getElementById('accountHolder').value.trim();
  const bankName = document.getElementById('bankName').value;
  const accountNumber = document.getElementById('accountNumber').value.trim();
  const branchCode = document.getElementById('branchCode').value.trim();
  const accountType = document.getElementById('accountType').value;

  if (!accountHolder || !bankName || !accountNumber || !branchCode || !accountType) {
    errorEl.textContent = 'All fields are required.';
    errorEl.classList.remove('hidden');
    return;
  }

  if (!/^\d+$/.test(accountNumber)) {
    errorEl.textContent = 'Account number must contain numbers only.';
    errorEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('saveBtn');
  setLoading(btn, true);

  try {
    const token = getToken();
    await apiCall('/api/user/banking', 'POST', {
      accountHolder, bankName, accountNumber, branchCode, accountType
    }, token);

    successEl.innerHTML = '✅ Banking details saved successfully! <a href="withdrawal.html">Go to Withdraw</a>';
    successEl.classList.remove('hidden');
    successEl.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  } finally {
    setLoading(btn, false);
  }
}
