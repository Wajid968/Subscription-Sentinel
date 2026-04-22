// ═══════════════════════════════════════════════════════
//  SUBSCRIPTION SENTINEL – MAIN APPLICATION LOGIC
// ═══════════════════════════════════════════════════════

/* ── State ───────────────────────────────────────────── */
let currentUser      = null;
let subscriptions    = [];
let editingId        = null;
let deleteTargetId   = null;
let chartInstance    = null;
let currentCurrency  = localStorage.getItem('sub_sentinel_currency') || '$';

function updateCurrency() {
  currentCurrency = document.getElementById('currency-select').value;
  localStorage.setItem('sub_sentinel_currency', currentCurrency);
  renderAll(); // Re render with new symbol
}

/* ── Category Color Map ──────────────────────────────── */
const CAT_COLORS = {
  Entertainment: '#EC489A',
  Software:      '#3B82F6',
  Fitness:       '#22C55E',
  Music:         '#F97316',
  News:          '#06B6D4',
  Cloud:         '#0EA5E9',
  Gaming:        '#A855F7',
  Education:     '#F59E0B',
  Finance:       '#10B981',
  Shopping:      '#EF4444',
  Other:         '#6B7280',
};

/* ── Billing Cycle Monthly Multipliers ───────────────── */
const CYCLE_TO_MONTHLY = {
  weekly:    52 / 12,
  monthly:   1,
  quarterly: 1 / 3,
  yearly:    1 / 12,
};

/* ══════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('currency-select').value = currentCurrency;

  // Wire toggle text
  document.getElementById('sub-active').addEventListener('change', (e) => {
    document.getElementById('toggle-text').textContent = e.target.checked ? 'Active' : 'Inactive';
  });

  // Check existing session
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    onLogin(session.user);
  } else {
    showScreen('auth');
  }

  // Listen for auth changes
  sb.auth.onAuthStateChange((_event, session) => {
    if (session) {
      onLogin(session.user);
    } else {
      onLogout();
    }
  });
});

/* ══════════════════════════════════════════════════════
   AUTH
══════════════════════════════════════════════════════ */
let authMode = 'signin';

function switchAuthTab(mode) {
  authMode = mode;
  document.getElementById('tab-signin').classList.toggle('active', mode === 'signin');
  document.getElementById('tab-signup').classList.toggle('active', mode === 'signup');
  document.getElementById('auth-btn-text').textContent    = mode === 'signin' ? 'Sign In' : 'Create Account';
  document.getElementById('auth-footer-text').textContent = mode === 'signin' ? "Don't have an account?" : 'Already have an account?';
  document.getElementById('auth-footer-link').textContent = mode === 'signin' ? 'Sign Up' : 'Sign In';
  document.getElementById('auth-footer-link').onclick     = () => switchAuthTab(mode === 'signin' ? 'signup' : 'signin');
  hideAuthMessages();
}

async function handleAuth(e) {
  e.preventDefault();
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  setAuthLoading(true);
  hideAuthMessages();

  try {
    let result;
    if (authMode === 'signin') {
      result = await sb.auth.signInWithPassword({ email, password });
    } else {
      result = await sb.auth.signUp({ email, password });
    }

    if (result.error) throw result.error;

    if (authMode === 'signup' && !result.data.session) {
      showAuthSuccess('Check your email to confirm your account!');
    }
    // onAuthStateChange handles redirect
  } catch (err) {
    showAuthError(err.message || 'Authentication failed. Please try again.');
  } finally {
    setAuthLoading(false);
  }
}

async function signOut() {
  await sb.auth.signOut();
}

function onLogin(user) {
  currentUser = user;
  document.getElementById('user-email-display').textContent = user.email;
  showScreen('app');
  loadSubscriptions();
}

function onLogout() {
  currentUser = null;
  subscriptions = [];
  showScreen('auth');
}

/* ── Auth helpers ──────────────────────────────────── */
function setAuthLoading(on) {
  document.getElementById('auth-spinner').classList.toggle('hidden', !on);
  document.getElementById('auth-btn-text').classList.toggle('hidden', on);
  document.getElementById('auth-submit-btn').disabled = on;
}
function showAuthError(msg)   { const el = document.getElementById('auth-error');   el.textContent = msg; el.classList.remove('hidden'); }
function showAuthSuccess(msg) { const el = document.getElementById('auth-success'); el.textContent = msg; el.classList.remove('hidden'); }
function hideAuthMessages()   { document.getElementById('auth-error').classList.add('hidden'); document.getElementById('auth-success').classList.add('hidden'); }

/* ══════════════════════════════════════════════════════
   SUBSCRIPTIONS – DATA
══════════════════════════════════════════════════════ */
async function loadSubscriptions() {
  showLoadingState();
  try {
    const { data, error } = await sb
      .from('subscriptions')
      .select('*')
      .order('next_billing_date', { ascending: true });

    if (error) throw error;
    subscriptions = data || [];
    renderAll();
  } catch (err) {
    console.error('Load error:', err);
    showToast('Failed to load subscriptions: ' + err.message, 'error');
    showEmptyState();
  }
}

async function saveSubscription(payload) {
  if (editingId) {
    const { error } = await sb
      .from('subscriptions')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', editingId);
    if (error) throw error;
  } else {
    const { error } = await sb
      .from('subscriptions')
      .insert([{ ...payload, user_id: currentUser.id }]);
    if (error) throw error;
  }
}

async function deleteSubscription(id) {
  const { error } = await sb.from('subscriptions').delete().eq('id', id);
  if (error) throw error;
}

/* ══════════════════════════════════════════════════════
   SUBSCRIPTIONS – RENDER
══════════════════════════════════════════════════════ */
function renderAll() {
  renderTotals();
  renderSubscriptions();
  renderChart();
  renderUpcoming();
  populateCategoryFilter();
}

function renderSubscriptions() {
  const filterCat    = document.getElementById('filter-category').value;
  const filterStatus = document.getElementById('filter-status').value;
  const filterSort   = document.getElementById('filter-sort') ? document.getElementById('filter-sort').value : 'date-desc';

  let filtered = subscriptions.filter(s => {
    const catMatch    = !filterCat || s.category === filterCat;
    const statusMatch = filterStatus === 'all'
      ? true
      : filterStatus === 'active'
        ? s.active
        : !s.active;
    return catMatch && statusMatch;
  });

  filtered.sort((a, b) => {
    if (filterSort === 'cost-asc') return toMonthly(a) - toMonthly(b);
    if (filterSort === 'cost-desc') return toMonthly(b) - toMonthly(a);
    if (filterSort === 'name-asc') return a.name.localeCompare(b.name);
    if (filterSort === 'due-asc') return new Date(a.next_billing_date) - new Date(b.next_billing_date);
    if (filterSort === 'date-asc') return new Date(a.created_at || 0) - new Date(b.created_at || 0);
    // date-desc default
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  const listEl = document.getElementById('subscription-list');
  const emptyEl = document.getElementById('empty-state');

  document.getElementById('loading-state').classList.add('hidden');

  if (filtered.length === 0) {
    listEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  listEl.classList.remove('hidden');
  listEl.innerHTML = filtered.map(s => buildSubItem(s)).join('');
}

function buildSubItem(s) {
  const daysUntil = getDaysUntil(s.next_billing_date);
  const isUrgent  = s.active && daysUntil >= 0 && daysUntil <= 7;
  const catColor  = CAT_COLORS[s.category] || CAT_COLORS.Other;
  const cycleLabel = { monthly: '/mo', yearly: '/yr', weekly: '/wk', quarterly: '/qtr' }[s.billing_cycle] || '';
  const dateStr   = formatDate(s.next_billing_date);

  let urgentBadge = '';
  if (!s.active) {
    urgentBadge = `<span class="sub-badge badge-inactive">Inactive</span>`;
  } else if (daysUntil === 0) {
    urgentBadge = `<span class="sub-badge badge-urgent">🔥 Due Today</span>`;
  } else if (daysUntil <= 7) {
    urgentBadge = `<span class="sub-badge badge-urgent">⚡ ${daysUntil}d left</span>`;
  }

  const paidBtnHtml = (s.active && daysUntil <= 7) ? `
        <button class="btn-icon btn-icon-paid" onclick="markAsPaid('${s.id}')" title="Mark as Paid">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </button>` : '';

  return `
    <div class="sub-item" id="sub-${s.id}">
      <div class="sub-cat-dot" style="background:${catColor}"></div>
      <div class="sub-info">
        <div class="sub-name">${escHtml(s.name)}</div>
        <div class="sub-meta">
          <span class="sub-badge badge-category">${escHtml(s.category)}</span>
          <span class="sub-badge badge-cycle">${capitalize(s.billing_cycle)}</span>
          ${urgentBadge}
        </div>
      </div>
      <div class="sub-amount-col">
        <div class="sub-amount">${currentCurrency}${parseFloat(s.amount).toFixed(2)}<span class="sub-cycle-label">${cycleLabel}</span></div>
        <div class="sub-date">Next: ${dateStr}</div>
      </div>
      <div class="sub-actions">
        ${paidBtnHtml}
        <button class="btn-icon btn-icon-edit" onclick="openEditModal('${s.id}')" title="Edit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn-icon btn-icon-delete" onclick="openDeleteModal('${s.id}', '${escHtml(s.name)}')" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

/* ── Totals ─────────────────────────────────────────── */
function renderTotals() {
  const active   = subscriptions.filter(s => s.active);
  const monthly  = active.reduce((sum, s) => sum + toMonthly(s), 0);
  const yearly   = monthly * 12;
  const upcoming = active.filter(s => {
    const d = getDaysUntil(s.next_billing_date);
    return d >= 0 && d <= 7;
  }).length;

  document.getElementById('monthly-total').textContent  = currentCurrency + monthly.toFixed(2);
  document.getElementById('yearly-total').textContent   = currentCurrency + yearly.toFixed(2);
  document.getElementById('active-count').textContent   = active.length;
  document.getElementById('upcoming-count').textContent = upcoming;
}

/* ── Category Chart ─────────────────────────────────── */
function renderChart() {
  const active = subscriptions.filter(s => s.active);
  const byCategory = {};
  active.forEach(s => {
    byCategory[s.category] = (byCategory[s.category] || 0) + toMonthly(s);
  });

  const labels  = Object.keys(byCategory);
  const data    = Object.values(byCategory);
  const colors  = labels.map(l => CAT_COLORS[l] || CAT_COLORS.Other);

  const ctx = document.getElementById('category-chart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  if (labels.length === 0) {
    document.getElementById('chart-legend').innerHTML = '<div class="empty-mini">No data to display</div>';
    return;
  }

  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.map(c => c + 'cc'),
        borderColor: colors,
        borderWidth: 2,
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#16161f',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#f1f1f8',
          bodyColor: '#9ca3af',
          padding: 10,
          callbacks: {
            label: ctx => ` ${currentCurrency}${ctx.parsed.toFixed(2)}/mo`,
          }
        }
      },
      animation: { animateRotate: true, duration: 600 }
    }
  });

  // Custom legend
  const total = data.reduce((a, b) => a + b, 0);
  document.getElementById('chart-legend').innerHTML = labels.map((l, i) => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${colors[i]}"></div>
      <span class="legend-name">${l}</span>
      <span class="legend-val">${currentCurrency}${data[i].toFixed(2)}</span>
    </div>
  `).join('');
}

/* ── Upcoming ───────────────────────────────────────── */
function renderUpcoming() {
  const active = subscriptions.filter(s => s.active);
  const upcoming = active.filter(s => {
    const d = getDaysUntil(s.next_billing_date);
    return d >= 0 && d <= 7;
  }).sort((a, b) => new Date(a.next_billing_date) - new Date(b.next_billing_date));

  const el = document.getElementById('upcoming-list');
  if (upcoming.length === 0) {
    el.innerHTML = '<div class="empty-mini">No renewals in the next 7 days 🎉</div>';
    return;
  }
  el.innerHTML = upcoming.map(s => {
    const days = getDaysUntil(s.next_billing_date);
    const catColor = CAT_COLORS[s.category] || CAT_COLORS.Other;
    const daysLabel = days === 0 ? 'Today!' : `In ${days} day${days === 1 ? '' : 's'}`;
    return `
      <div class="upcoming-item">
        <div class="upcoming-dot" style="background:${catColor}"></div>
        <div class="upcoming-name">${escHtml(s.name)}</div>
        <div class="upcoming-info">
          <div class="upcoming-amount">${currentCurrency}${parseFloat(s.amount).toFixed(2)}</div>
          <div class="upcoming-days ${days === 0 ? 'days-today' : ''}">${daysLabel}</div>
        </div>
      </div>
    `;
  }).join('');
}

/* ── Category filter options ────────────────────────── */
function populateCategoryFilter() {
  const cats = [...new Set(subscriptions.map(s => s.category))].sort();
  const sel  = document.getElementById('filter-category');
  const curr = sel.value;
  sel.innerHTML = '<option value="">All Categories</option>' +
    cats.map(c => `<option value="${c}" ${c === curr ? 'selected' : ''}>${c}</option>`).join('');
}

/* ══════════════════════════════════════════════════════
   MODAL – ADD / EDIT
══════════════════════════════════════════════════════ */
function openModal() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'Add Subscription';
  document.getElementById('form-btn-text').textContent = 'Save Subscription';
  resetForm();
  // Default date = today
  document.getElementById('sub-date').value = todayISO();
  showModal('modal-overlay');
}

function openEditModal(id) {
  const s = subscriptions.find(x => x.id === id);
  if (!s) return;
  editingId = id;
  document.getElementById('modal-title').textContent   = 'Edit Subscription';
  document.getElementById('form-btn-text').textContent = 'Update Subscription';
  document.getElementById('edit-id').value      = s.id;
  document.getElementById('sub-name').value     = s.name;
  document.getElementById('sub-amount').value   = s.amount;
  document.getElementById('sub-cycle').value    = s.billing_cycle;
  document.getElementById('sub-date').value     = s.next_billing_date;
  document.getElementById('sub-category').value = s.category;
  document.getElementById('sub-notes').value    = s.notes || '';
  document.getElementById('sub-active').checked  = s.active;
  document.getElementById('toggle-text').textContent = s.active ? 'Active' : 'Inactive';
  document.getElementById('form-error').classList.add('hidden');
  showModal('modal-overlay');
}

function closeModal()         { hideModal('modal-overlay'); editingId = null; }
function closeModalOnOverlay(e){ if (e.target === document.getElementById('modal-overlay')) closeModal(); }

async function handleFormSubmit(e) {
  e.preventDefault();
  const name     = document.getElementById('sub-name').value.trim();
  const amount   = parseFloat(document.getElementById('sub-amount').value);
  const cycle    = document.getElementById('sub-cycle').value;
  const date     = document.getElementById('sub-date').value;
  const category = document.getElementById('sub-category').value;
  const notes    = document.getElementById('sub-notes').value.trim();
  const active   = document.getElementById('sub-active').checked;

  // Validate
  const errEl = document.getElementById('form-error');
  if (!name || !amount || !cycle || !date || !category) {
    errEl.textContent = 'Please fill in all required fields.';
    errEl.classList.remove('hidden');
    return;
  }
  errEl.classList.add('hidden');

  setFormLoading(true);
  try {
    await saveSubscription({ name, amount, billing_cycle: cycle, next_billing_date: date, category, notes, active });
    closeModal();
    showToast(editingId ? 'Subscription updated!' : 'Subscription added!', 'success');
    await loadSubscriptions();
  } catch (err) {
    errEl.textContent = err.message || 'Failed to save. Please try again.';
    errEl.classList.remove('hidden');
  } finally {
    setFormLoading(false);
  }
}

function resetForm() {
  document.getElementById('subscription-form').reset();
  document.getElementById('sub-active').checked = true;
  document.getElementById('toggle-text').textContent = 'Active';
  document.getElementById('form-error').classList.add('hidden');
  document.getElementById('edit-id').value = '';
}

function setFormLoading(on) {
  document.getElementById('form-spinner').classList.toggle('hidden', !on);
  document.getElementById('form-btn-text').classList.toggle('hidden', on);
  document.getElementById('form-submit-btn').disabled = on;
}

/* ══════════════════════════════════════════════════════
   MODAL – DELETE
══════════════════════════════════════════════════════ */
function openDeleteModal(id, name) {
  deleteTargetId = id;
  document.getElementById('delete-name').textContent = name;
  showModal('delete-overlay');
}
function closeDeleteModal() { hideModal('delete-overlay'); deleteTargetId = null; }

async function confirmDelete() {
  if (!deleteTargetId) return;
  const btn = document.getElementById('confirm-delete-btn');
  btn.disabled = true;
  try {
    await deleteSubscription(deleteTargetId);
    closeDeleteModal();
    showToast('Subscription deleted.', 'success');
    await loadSubscriptions();
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

/* ══════════════════════════════════════════════════════
   MARK AS PAID
══════════════════════════════════════════════════════ */
async function markAsPaid(id) {
  const s = subscriptions.find(x => x.id === id);
  if (!s) return;

  const d = new Date(s.next_billing_date + 'T00:00:00');
  
  if (s.billing_cycle === 'monthly') {
    const expectedMonth = (d.getMonth() + 1) % 12;
    d.setMonth(d.getMonth() + 1);
    if (d.getMonth() !== expectedMonth) d.setDate(0);
  }
  else if (s.billing_cycle === 'yearly') {
    const expectedMonth = d.getMonth();
    d.setFullYear(d.getFullYear() + 1);
    if (d.getMonth() !== expectedMonth) d.setDate(0); // Leap year handling (Feb 29 -> Feb 28)
  }
  else if (s.billing_cycle === 'quarterly') {
    const expectedMonth = (d.getMonth() + 3) % 12;
    d.setMonth(d.getMonth() + 3);
    if (d.getMonth() !== expectedMonth) d.setDate(0);
  }
  else if (s.billing_cycle === 'weekly') {
    d.setDate(d.getDate() + 7);
  }

  const newDate = d.toISOString().split('T')[0];

  try {
    const { error } = await sb
      .from('subscriptions')
      .update({ next_billing_date: newDate, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    
    showToast('Marked as paid! Next billing: ' + formatDate(newDate), 'success');
    await loadSubscriptions();
  } catch (err) {
    showToast('Failed to mark as paid: ' + err.message, 'error');
  }
}


/* ══════════════════════════════════════════════════════
   UI HELPERS
══════════════════════════════════════════════════════ */
function showScreen(name) {
  document.getElementById('auth-screen').classList.toggle('hidden', name !== 'auth');
  document.getElementById('app-screen').classList.toggle('hidden', name !== 'app');
}

function showModal(id)  { document.getElementById(id).classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
function hideModal(id)  { document.getElementById(id).classList.add('hidden'); document.body.style.overflow = ''; }

function showLoadingState() {
  document.getElementById('loading-state').classList.remove('hidden');
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('subscription-list').classList.add('hidden');
}
function showEmptyState() {
  document.getElementById('loading-state').classList.add('hidden');
  document.getElementById('empty-state').classList.remove('hidden');
  document.getElementById('subscription-list').classList.add('hidden');
}

let toastTimer = null;
function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  document.getElementById('toast-message').textContent = msg;
  el.className = `toast toast--${type}`;
  el.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}

/* ══════════════════════════════════════════════════════
   UTILITY
══════════════════════════════════════════════════════ */
function toMonthly(s) {
  const amount = parseFloat(s.amount) || 0;
  return amount * (CYCLE_TO_MONTHLY[s.billing_cycle] || 1);
}

function getDaysUntil(dateStr) {
  const today  = new Date(); today.setHours(0,0,0,0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function capitalize(str) {
  return str ? str[0].toUpperCase() + str.slice(1) : '';
}

/* ══════════════════════════════════════════════════════
   PWA SERVICE WORKER
══════════════════════════════════════════════════════ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .catch(err => console.error('Service Worker registration failed:', err));
  });
}
