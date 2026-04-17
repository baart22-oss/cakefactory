/* ============================================================
   deposit.js — Deposit / Investment Plans page
   ============================================================ */

let selectedTier = null;
let proofBase64 = null;
let proofFileName = null;
let proofFileType = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  await loadNavProfile();
});

async function loadNavProfile() {
  const token = getToken();
  try {
    const data = await apiCall('/api/user/profile', 'GET', null, token);
    document.getElementById('navUsername').textContent = '👤 ' + data.user.username;
    document.getElementById('navWallet').textContent = formatCurrency(data.user.wallet);
  } catch (err) {
    if (err.message.includes('nauthorized')) { clearAuth(); window.location.href = 'login.html'; }
  }
}

function selectTier(el, id, name, min, max, roi) {
  // Remove selected from all
  document.querySelectorAll('.tier-card').forEach(c => c.style.outline = '');
  el.style.outline = '3px solid var(--primary)';
  el.style.outlineOffset = '2px';

  selectedTier = { id, name, min, max, roi };
  document.getElementById('selectedTierDisplay').value = `${name} (R${min.toLocaleString()} – R${max >= 999999 ? max.toLocaleString().replace('999,999', '∞') : max.toLocaleString()}, ${roi}% daily)`;

  const amountInput = document.getElementById('depositAmount');
  amountInput.min = min;
  if (max < 999999) amountInput.max = max;
  document.getElementById('amountHint').textContent = `Min: R${min.toLocaleString()}${max < 999999 ? ' | Max: R' + max.toLocaleString() : '+'}`;
}

function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;

  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    showToast('File too large. Maximum 5MB.', 'error');
    input.value = '';
    return;
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
  if (!allowedTypes.includes(file.type)) {
    showToast('Invalid file type. Use JPG, PNG, or PDF.', 'error');
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    proofBase64 = e.target.result;
    proofFileName = file.name;
    proofFileType = file.type;

    document.getElementById('filePreview').style.display = 'block';
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = (file.size / 1024).toFixed(1) + ' KB';
    document.getElementById('fileIcon').textContent = file.type === 'application/pdf' ? '📄' : '🖼️';
    document.getElementById('uploadArea').style.borderColor = 'var(--success)';
  };
  reader.readAsDataURL(file);
}

function clearFile() {
  proofBase64 = null;
  proofFileName = null;
  proofFileType = null;
  document.getElementById('proofFile').value = '';
  document.getElementById('filePreview').style.display = 'none';
  document.getElementById('uploadArea').style.borderColor = '';
}

async function submitDeposit(e) {
  e.preventDefault();

  const errorEl = document.getElementById('depositError');
  const successEl = document.getElementById('depositSuccess');
  errorEl.classList.add('hidden');
  successEl.classList.add('hidden');

  if (!selectedTier) {
    errorEl.textContent = 'Please select an investment tier.';
    errorEl.classList.remove('hidden');
    return;
  }

  const amount = parseFloat(document.getElementById('depositAmount').value);
  if (!amount || amount < selectedTier.min) {
    errorEl.textContent = `Minimum amount for ${selectedTier.name} is R${selectedTier.min.toLocaleString()}.`;
    errorEl.classList.remove('hidden');
    return;
  }
  if (selectedTier.max < 999999 && amount > selectedTier.max) {
    errorEl.textContent = `Maximum amount for ${selectedTier.name} is R${selectedTier.max.toLocaleString()}.`;
    errorEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('depositBtn');
  setLoading(btn, true);

  try {
    const token = getToken();
    await apiCall('/api/deposit/initiate', 'POST', {
      tier: selectedTier.id,
      tierName: selectedTier.name,
      amount,
      proofData: proofBase64 || null,
      proofName: proofFileName || null,
      proofType: proofFileType || null
    }, token);

    successEl.innerHTML = '✅ Deposit submitted successfully! Your payment will be verified within 24 hours. <a href="dashboard.html">Go to Dashboard</a>';
    successEl.classList.remove('hidden');

    document.getElementById('depositForm').reset();
    clearFile();
    selectedTier = null;
    document.querySelectorAll('.tier-card').forEach(c => c.style.outline = '');
    document.getElementById('selectedTierDisplay').value = '';
    document.getElementById('amountHint').textContent = 'Select a tier first';
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  } finally {
    setLoading(btn, false);
  }
}

// Drag and drop support for upload area
document.addEventListener('DOMContentLoaded', () => {
  const area = document.getElementById('uploadArea');
  if (!area) return;

  area.addEventListener('dragover', e => {
    e.preventDefault();
    area.classList.add('dragover');
  });
  area.addEventListener('dragleave', () => area.classList.remove('dragover'));
  area.addEventListener('drop', e => {
    e.preventDefault();
    area.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) {
      const input = document.getElementById('proofFile');
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      handleFileSelect(input);
    }
  });
});
