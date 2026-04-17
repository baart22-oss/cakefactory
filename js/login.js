/* ============================================================
   login.js — Login / Register page logic
   ============================================================ */

function switchTab(tab) {
  document.getElementById('form-login').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
}

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

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError(id) {
  document.getElementById(id).classList.add('hidden');
}

async function handleLogin(e) {
  e.preventDefault();
  hideError('login-error');
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');

  setLoading(btn, true);
  try {
    const data = await apiCall('/api/auth/login', 'POST', { email, password });
    setToken(data.token);
    setUser(data.user);
    showToast('Welcome back, ' + data.user.username + '! 🎂', 'success');
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 800);
  } catch (err) {
    showError('login-error', err.message);
  } finally {
    setLoading(btn, false);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  hideError('register-error');

  const username = document.getElementById('regUsername').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const referralCode = document.getElementById('regReferral').value.trim();
  const btn = document.getElementById('registerBtn');

  if (!username || !email || !password) {
    return showError('register-error', 'All fields are required.');
  }
  if (password.length < 6) {
    return showError('register-error', 'Password must be at least 6 characters.');
  }

  setLoading(btn, true);
  try {
    const data = await apiCall('/api/auth/register', 'POST', {
      username, email, password,
      referralCode: referralCode || undefined
    });
    setToken(data.token);
    setUser(data.user);
    showToast('Account created! Welcome to CakeFactory! 🎂', 'success');
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 800);
  } catch (err) {
    showError('register-error', err.message);
  } finally {
    setLoading(btn, false);
  }
}

// Pre-fill referral code from URL ?ref=
document.addEventListener('DOMContentLoaded', () => {
  // Already logged in? Redirect
  if (getToken()) {
    window.location.href = 'dashboard.html';
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if (ref) {
    document.getElementById('regReferral').value = ref.toUpperCase();
    switchTab('register');
  }

  // Support #register hash
  if (window.location.hash === '#register') {
    switchTab('register');
  }
});
