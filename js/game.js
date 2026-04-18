/* ============================================================
   game.js — Cake Building Game Logic
   ============================================================ */

let allItems = [];
let currentCakeItems = []; // [{id, name, emoji, price, category, quantity}]
let walletBalance = 0;
let totalDeposits = 0;

const LAYER_COLORS = {
  layer: ['#f5deb3','#d4a0a0','#c97a4a','#5c3317','#ffe4b5','#ffa07a','#cd853f'],
  frosting: ['#ffd1dc','#b0e0e6','#e6e6fa','#f0fff0','#fff8dc'],
  topping: null,
  decoration: null,
  special: null,
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  await loadProfile();
  await loadItems();
});

async function loadProfile() {
  const token = getToken();
  try {
    const data = await apiCall('/api/user/profile', 'GET', null, token);
    walletBalance = parseFloat(data.user.wallet);
    totalDeposits = parseFloat(data.user.total_deposits || 0);
    document.getElementById('walletDisplay').textContent = formatCurrency(walletBalance);
    document.getElementById('navWallet').textContent = formatCurrency(walletBalance);
    document.getElementById('navUsername').textContent = '👤 ' + data.user.username;
  } catch (err) {
    if (err.message.includes('nauthorized') || err.message.includes('expired')) {
      clearAuth(); window.location.href = 'login.html';
    }
  }
}

async function loadItems() {
  const token = getToken();
  try {
    const data = await apiCall('/api/game/items', 'GET', null, token);
    allItems = data.items;
    renderShop();
  } catch (err) {
    document.getElementById('shopItems').innerHTML = `<div class="alert alert-danger">Failed to load items: ${err.message}</div>`;
  }
}

function renderShop() {
  const categories = ['layer', 'frosting', 'topping', 'decoration', 'special'];
  const catLabels = { layer: '🍰 Layers', frosting: '🤍 Frostings', topping: '🍓 Toppings', decoration: '✨ Decorations', special: '⭐ Special' };

  let html = '';
  for (const cat of categories) {
    const items = allItems.filter(i => i.category === cat);
    if (items.length === 0) continue;
    html += `<div class="item-category-title">${catLabels[cat]}</div>`;
    items.forEach(item => {
      html += `
        <button class="item-card" type="button" onclick="addItemToCake(${item.id})" title="${item.description}">
          <span class="item-emoji">${item.emoji}</span>
          <div class="item-info">
            <div class="item-name">${item.name}</div>
            <div class="item-price">${formatCurrency(item.price)}</div>
          </div>
        </button>
      `;
    });
  }
  document.getElementById('shopItems').innerHTML = html;
}

function addItemToCake(itemId) {
  const item = allItems.find(i => i.id === itemId);
  if (!item) return;

  // Allow duplicates for layers/frosting, limit others
  const existingIdx = currentCakeItems.findIndex(i => i.id === itemId);
  if (existingIdx >= 0) {
    currentCakeItems[existingIdx].quantity = (currentCakeItems[existingIdx].quantity || 1) + 1;
  } else {
    currentCakeItems.push({ ...item, quantity: 1 });
  }

  updateCakeDisplay();
  updateCakeSummary();
  showToast(`Added ${item.emoji} ${item.name}!`, 'success');
}

function removeItemFromCake(idx) {
  const item = currentCakeItems[idx];
  if (item.quantity > 1) {
    currentCakeItems[idx].quantity--;
  } else {
    currentCakeItems.splice(idx, 1);
  }
  updateCakeDisplay();
  updateCakeSummary();
}

function clearCake() {
  currentCakeItems = [];
  updateCakeDisplay();
  updateCakeSummary();
}

function updateCakeDisplay() {
  const layers = document.getElementById('cakeLayers');
  const toppings = document.getElementById('cakeToppings');
  const plate = document.getElementById('cakePlate');
  const stand = document.getElementById('cakeStand');
  const emptyHint = document.getElementById('cakeEmptyHint');

  if (currentCakeItems.length === 0) {
    layers.innerHTML = '';
    toppings.innerHTML = '';
    plate.style.display = 'none';
    stand.style.display = 'none';
    emptyHint.style.display = 'block';
    return;
  }

  emptyHint.style.display = 'none';
  plate.style.display = 'block';
  stand.style.display = 'block';

  const layerItems = currentCakeItems.filter(i => i.category === 'layer' || i.category === 'frosting');
  const topItems = currentCakeItems.filter(i => i.category === 'topping' || i.category === 'decoration' || i.category === 'special');

  // Render layers
  let layerHtml = '';
  const totalLayers = layerItems.reduce((s, i) => s + (i.quantity || 1), 0);
  const baseWidth = Math.min(200, Math.max(100, 120 + totalLayers * 10));

  let colorIdx = 0;
  const layerColorPalette = ['#f5deb3','#d4a0a0','#c97a4a','#5c3317','#ffe4b5','#c8a0c8','#aec6cf','#f4a460','#dda0dd'];

  layerItems.forEach(item => {
    for (let q = 0; q < (item.quantity || 1); q++) {
      const isLayer = item.category === 'layer';
      const h = isLayer ? 32 : 18;
      const w = baseWidth - colorIdx * 3;
      const color = layerColorPalette[colorIdx % layerColorPalette.length];
      layerHtml += `<div class="cake-layer" style="width:${w}px;height:${h}px;background:${color};">${item.emoji}</div>`;
      colorIdx++;
    }
  });
  layers.innerHTML = layerHtml;

  // Render toppings
  let topHtml = topItems.map(i => {
    const qty = i.quantity || 1;
    return Array(qty).fill(`<span class="cake-topping" title="${i.name}">${i.emoji}</span>`).join('');
  }).join('');
  toppings.innerHTML = topHtml;
}

function updateCakeSummary() {
  const container = document.getElementById('currentCakeItems');
  const totals = document.getElementById('cakeTotals');

  if (currentCakeItems.length === 0) {
    container.innerHTML = '<div class="text-center" style="color:var(--text-muted);padding:2rem;font-size:0.9rem;">No items added yet</div>';
    totals.style.display = 'none';
    return;
  }

  let totalCost = 0;

  const rows = currentCakeItems.map((item, idx) => {
    const qty = item.quantity || 1;
    const lineTotal = parseFloat(item.price) * qty;
    totalCost += lineTotal;
    return `
      <div class="cake-item-row">
        <span class="emoji">${item.emoji}</span>
        <span class="name">${item.name}${qty > 1 ? ` ×${qty}` : ''}</span>
        <span class="price">${formatCurrency(lineTotal)}</span>
        <button class="remove-btn" onclick="removeItemFromCake(${idx})">✕</button>
      </div>
    `;
  }).join('');

  container.innerHTML = rows;

  const dailyEarnings = totalDeposits * 0.05;

  document.getElementById('totalCostDisplay').textContent = formatCurrency(totalCost);
  document.getElementById('dailyReturnDisplay').textContent = formatCurrency(dailyEarnings);
  totals.style.display = 'block';

  // Warn if insufficient balance
  const btn = document.getElementById('completeCakeBtn');
  if (totalCost > walletBalance) {
    btn.disabled = true;
    btn.textContent = '⚠️ Insufficient Balance';
  } else {
    btn.disabled = false;
    btn.textContent = '✅ Complete Cake';
  }
}

async function completeCake() {
  if (currentCakeItems.length === 0) {
    showToast('Add some ingredients first!', 'warning');
    return;
  }

  const token = getToken();
  const btn = document.getElementById('completeCakeBtn');
  setLoading(btn, true);

  const itemsPayload = currentCakeItems.map(i => ({ id: i.id, quantity: i.quantity || 1 }));
  const cakeName = document.getElementById('cakeName').value.trim() || 'My Cake';

  try {
    const data = await apiCall('/api/game/complete-cake', 'POST', { items: itemsPayload, cakeName }, token);

    walletBalance = data.wallet;
    document.getElementById('walletDisplay').textContent = formatCurrency(walletBalance);
    document.getElementById('navWallet').textContent = formatCurrency(walletBalance);

    document.getElementById('modalCost').textContent = formatCurrency(data.totalCost);
    document.getElementById('modalEarnings').textContent = formatCurrency(data.earnings);
    document.getElementById('modalProfit').textContent = data.alreadyEarnedToday
      ? 'Daily earnings already credited today'
      : '+' + formatCurrency(data.profit) + ' profit';
    document.getElementById('modalWallet').textContent = formatCurrency(data.wallet);

    openModal('earningsModal');
    currentCakeItems = [];
    updateCakeDisplay();
    updateCakeSummary();
    document.getElementById('cakeName').value = '';
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setLoading(btn, false);
  }
}
