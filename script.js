/* ============================================================
   ANJUNKU — Digital Command Center  |  script.js
   Full implementation: Auth, RBAC, CRUD, Realtime, Finance
============================================================ */

'use strict';

/* ============================================================
   SUPABASE INIT
============================================================ */
const SUPA_URL = 'https://elnmwdeckfgwfqigchjx.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsbm13ZGVja2Znd2ZxaWdjaGp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzUyMjAsImV4cCI6MjA5MjYxMTIyMH0.l0fKST9VhCcc5tdbXJLOkfXrSwRupYjbs-DCRSA2L-0';
const supa = supabase.createClient(SUPA_URL, SUPA_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

/* ============================================================
   GLOBAL STATE
============================================================ */
let currentUser    = null;   // supabase auth user
let currentProfile = null;   // profiles row
let currentRole    = null;   // 'owner'|'ketua'|'bendahara'|'admin'|'anggota'|null
let allNews        = [];
let allProducts    = [];
let allGallery     = [];
let allTransactions = [];
let resendTimer    = null;
let confirmCallback = null;

/* ============================================================
   ROLE HELPERS
============================================================ */
const ROLES_FINANCE  = ['owner','ketua','bendahara'];
const ROLES_PENGURUS = ['owner','ketua','bendahara','admin'];
const ROLES_MODERASI = ['owner','ketua','admin'];

const can = (roles) => roles.includes(currentRole);
const isLoggedIn = () => !!currentUser;

/* ============================================================
   INIT
============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();

  // Auth state listener
  supa.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      currentUser = session.user;
      await loadProfile();
    } else {
      currentUser = null;
      currentProfile = null;
      currentRole = null;
    }
    updateAuthUI();
  });

  // Check existing session
  const { data: { session } } = await supa.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    await loadProfile();
    updateAuthUI();
  }

  // Load public data
  await Promise.all([
    loadAppInfo(),
    loadTicker(),
    loadStats(),
    loadNewsPreview(),
    loadKasSummary(),
  ]);

  // Setup OTP inputs
  setupOTPInputs();

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#user-menu')) {
      document.getElementById('user-dropdown')?.classList.add('hidden');
    }
  });

  lucide.createIcons();
});

/* ============================================================
   NAVIGATION
============================================================ */
function navigateTo(section) {
  // Hide all sections
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

  // Show target
  const target = document.getElementById(section);
  if (target) target.classList.add('active');

  // Update desktop nav
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.nav === section);
  });

  // Update bottom nav
  document.querySelectorAll('.bnav').forEach(a => {
    a.classList.toggle('active', a.dataset.nav === section);
  });

  // Load section data
  if (section === 'news')     loadNews();
  if (section === 'products') loadProducts();
  if (section === 'gallery')  loadGallery();
  if (section === 'finance')  loadFinance();

  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Close dropdowns
  document.getElementById('user-dropdown')?.classList.add('hidden');
}

/* ============================================================
   AUTH UI
============================================================ */
function updateAuthUI() {
  const btnAuth  = document.getElementById('btn-open-auth');
  const userMenu = document.getElementById('user-menu');
  const navUname = document.getElementById('nav-username');
  const navAvatar = document.getElementById('nav-avatar');
  const adminLink = document.getElementById('admin-panel-link');

  if (currentUser && currentProfile) {
    btnAuth?.classList.add('hidden');
    userMenu?.classList.remove('hidden');
    navUname.textContent = currentProfile.username || currentProfile.full_name || 'User';

    if (currentProfile.avatar_url) {
      navAvatar.src = currentProfile.avatar_url;
      navAvatar.onerror = () => { navAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(navUname.textContent)}&background=22c55e&color=000`; };
    } else {
      navAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(navUname.textContent)}&background=22c55e&color=000`;
    }

    // Show admin panel for pengurus
    if (can(ROLES_PENGURUS)) adminLink?.classList.remove('hidden');
    else adminLink?.classList.add('hidden');

    // Show add buttons per role
    if (can(ROLES_PENGURUS)) {
      document.getElementById('btn-add-news')?.classList.remove('hidden');
      document.getElementById('btn-add-product')?.classList.remove('hidden');
      document.getElementById('btn-add-gallery')?.classList.remove('hidden');
    }
    if (can(ROLES_FINANCE)) {
      document.getElementById('btn-add-transaction')?.classList.remove('hidden');
    }
    // Vision edit for owner/ketua
    if (can(['owner','ketua'])) {
      document.getElementById('btn-edit-vision')?.classList.remove('hidden');
    }
  } else {
    btnAuth?.classList.remove('hidden');
    userMenu?.classList.add('hidden');
  }

  lucide.createIcons();
}

function toggleUserDropdown() {
  document.getElementById('user-dropdown')?.classList.toggle('hidden');
}

/* ============================================================
   PROFILE LOAD
============================================================ */
async function loadProfile() {
  if (!currentUser) return;
  const { data, error } = await supa
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  if (error || !data) {
    // Create profile if not exists
    const newProfile = {
      id: currentUser.id,
      email: currentUser.email,
      full_name: '',
      username: currentUser.email.split('@')[0],
      role: 'anggota',
      updated_at: new Date().toISOString()
    };
    await supa.from('profiles').upsert(newProfile);
    currentProfile = newProfile;
    currentRole = 'anggota';
  } else {
    currentProfile = data;
    // ALWAYS read role from database — never hardcode
    currentRole = data.role || 'anggota';
  }
}

/* ============================================================
   APP INFO / HERO CONTENT
============================================================ */
async function loadAppInfo() {
  const { data } = await supa.from('app_info').select('*').eq('id', 1).single();
  if (!data) return;

  const badge = document.getElementById('hero-badge');
  const title = document.getElementById('hero-title');
  const desc  = document.getElementById('hero-desc');

  if (badge && data.welcome_title) badge.innerHTML = `<span>⚡</span> ${data.welcome_title}`;
  if (title && data.slogan) {
    // Keep ANJUNKU as main visual, show slogan as subtitle
    // hero-title stays "ANJUNKU", update hero-sub
    const sub = document.querySelector('.hero-sub');
    if (sub) sub.textContent = data.slogan || 'Digital Command Center';
  }
  if (desc && data.description) desc.textContent = data.description;

  // Visi & Misi — with fallback if columns don't exist
  const visionEl  = document.getElementById('vision-text');
  const missionEl = document.getElementById('mission-text');
  if (visionEl)  visionEl.textContent  = data.vision  || 'Menjadi komunitas pemuda desa yang mandiri, inovatif, dan berdaya saing di tingkat nasional.';
  if (missionEl) missionEl.textContent = data.mission || 'Mengembangkan potensi lokal, membangun solidaritas, dan mendorong kemajuan ekonomi warga Desa Anjun.';

  // Dynamic slogan + Est year in badge
  if (badge) {
    const estYear = data.established_year || 2021;
    const yearsOld = new Date().getFullYear() - estYear;
    badge.innerHTML = `<span>⚡</span> ${data.welcome_title || 'Komunitas Pemuda Desa Anjun'} &nbsp;|&nbsp; Est. ${estYear} · ${yearsOld} Tahun Mengabdi`;
  }
}

/* ============================================================
   TICKER
============================================================ */
async function loadTicker() {
  const tickerEl = document.getElementById('ticker-text');

  // Try latest approved news first
  const { data: newsData } = await supa
    .from('news')
    .select('title, created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(5);

  if (newsData && newsData.length > 0) {
    const track = document.getElementById('news-ticker');
    if (!track) return;

    // Build ticker content from news titles
    let html = '';
    newsData.forEach(n => {
      html += `<span class="ticker-badge">INFO</span> <span>${escHtml(n.title)}</span> &nbsp;◆&nbsp; `;
    });
    // Duplicate for seamless loop
    track.innerHTML = html + html;
  } else {
    // Fallback: slogan from app_info
    const { data: appData } = await supa.from('app_info').select('slogan').eq('id', 1).single();
    if (tickerEl && appData?.slogan) tickerEl.textContent = appData.slogan;
  }
}

/* ============================================================
   STATS
============================================================ */
async function loadStats() {
  const [membersRes, productsRes, appRes] = await Promise.all([
    supa.from('profiles').select('id', { count: 'exact', head: true }),
    supa.from('products').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supa.from('app_info').select('established_year').eq('id', 1).single()
  ]);

  const membersEl  = document.getElementById('stat-members');
  const productsEl = document.getElementById('stat-products');
  const yearsEl    = document.getElementById('stat-years');

  if (membersEl)  membersEl.textContent  = membersRes.count ?? '—';
  if (productsEl) productsEl.textContent = productsRes.count ?? '—';
  if (yearsEl && appRes.data?.established_year) {
    yearsEl.textContent = new Date().getFullYear() - appRes.data.established_year;
  } else if (yearsEl) {
    yearsEl.textContent = new Date().getFullYear() - 2021;
  }
}

/* ============================================================
   NEWS
============================================================ */
async function loadNewsPreview() {
  const { data } = await supa
    .from('news')
    .select('*, profiles(full_name)')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(3);

  renderNewsGrid('news-preview-grid', data || [], true);
}

async function loadNews() {
  const { data } = await supa
    .from('news')
    .select('*, profiles(full_name)')
    .order('created_at', { ascending: false });

  allNews = data || [];
  renderNewsGrid('news-grid', filterByStatus(allNews, currentNewsFilter));
}

let currentNewsFilter = 'all';

function filterNews(status, btn) {
  currentNewsFilter = status;
  document.querySelectorAll('#news .fbtn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderNewsGrid('news-grid', filterByStatus(allNews, status));
}

function filterByStatus(arr, status) {
  if (status === 'all') return arr;
  return arr.filter(i => i.status === status);
}

function renderNewsGrid(containerId, items, preview = false) {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (!items || items.length === 0) {
    el.innerHTML = emptyState('newspaper', 'Belum ada berita', 'Berita akan muncul di sini');
    return;
  }

  el.innerHTML = items.map(n => newsCard(n, preview)).join('');
  lucide.createIcons();
}

function newsCard(n, preview) {
  const canEdit = isLoggedIn() && (currentUser?.id === n.user_id || can(ROLES_MODERASI));
  const img = n.image_url
    ? `<img class="card-img" src="${escHtml(n.image_url)}" alt="${escHtml(n.title)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=card-img-ph><svg xmlns=http://www.w3.org/2000/svg viewBox=0 0 24 24 fill=none stroke=currentColor stroke-width=1.5><rect x=3 y=3 width=18 height=18 rx=2/><circle cx=8.5 cy=8.5 r=1.5/><path d=m21 15-5-5L5 21/></svg></div>'">`
    : `<div class="card-img-ph"><i data-lucide="image"></i></div>`;

  const adminBtns = (!preview && canEdit)
    ? `<div class="card-actions">
        <button class="cact edit" onclick="event.stopPropagation();openNewsForm('${n.id}')"><i data-lucide="pencil"></i> Edit</button>
        <button class="cact del" onclick="event.stopPropagation();deleteItem('news','${n.id}')"><i data-lucide="trash-2"></i></button>
       </div>`
    : '';

  return `<div class="content-card" onclick="openDetail('news','${n.id}')">
    ${img}
    <div class="card-body">
      <div class="card-meta">
        <span class="card-cat">${escHtml(n.category || 'umum')}</span>
        <span class="card-date">${formatDate(n.created_at)}</span>
      </div>
      <p class="card-title">${escHtml(n.title)}</p>
      <p class="card-excerpt">${escHtml((n.content||'').substring(0,120))}...</p>
      <div class="card-foot">
        <span class="card-more">Baca <i data-lucide="arrow-up-right"></i></span>
        <span class="card-author">${escHtml(n.profiles?.full_name || 'Anonim')}</span>
        ${!preview ? `<span class="badge badge-${n.status}">${statusLabel(n.status)}</span>` : ''}
      </div>
      ${adminBtns}
    </div>
  </div>`;
}

/* ============================================================
   PRODUCTS
============================================================ */
async function loadProducts() {
  const query = supa
    .from('products')
    .select('*, profiles(full_name)')
    .order('created_at', { ascending: false });

  const { data } = can(ROLES_PENGURUS)
    ? await query
    : await query.eq('status', 'active');

  allProducts = data || [];
  renderProductsGrid('products-grid', filterProductsByStatus(allProducts, currentProductFilter));
}

let currentProductFilter = 'all';

function filterProducts(status, btn) {
  currentProductFilter = status;
  document.querySelectorAll('#products .fbtn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderProductsGrid('products-grid', filterProductsByStatus(allProducts, status));
}

function filterProductsByStatus(arr, status) {
  if (status === 'all') return arr;
  return arr.filter(i => i.status === status);
}

function renderProductsGrid(containerId, items) {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (!items || items.length === 0) {
    el.innerHTML = emptyState('shopping-bag', 'Belum ada produk', 'Produk akan muncul di sini');
    return;
  }

  el.innerHTML = items.map(p => productCard(p)).join('');
  lucide.createIcons();
}

function productCard(p) {
  const canEdit = isLoggedIn() && (currentUser?.id === p.user_id || can(ROLES_MODERASI));
  const img = p.image_url
    ? `<img class="card-img" src="${escHtml(p.image_url)}" alt="${escHtml(p.name)}" loading="lazy">`
    : `<div class="card-img-ph"><i data-lucide="shopping-bag"></i></div>`;

  const adminBtns = canEdit
    ? `<div class="card-actions">
        <button class="cact edit" onclick="event.stopPropagation();openProductForm('${p.id}')"><i data-lucide="pencil"></i> Edit</button>
        <button class="cact del" onclick="event.stopPropagation();deleteItem('products','${p.id}')"><i data-lucide="trash-2"></i></button>
       </div>`
    : '';

  return `<div class="content-card" onclick="openDetail('products','${p.id}')">
    ${img}
    <div class="card-body">
      <div class="card-meta">
        <span class="card-cat">${escHtml(p.category || '')}</span>
        <span class="badge badge-${p.status}">${statusLabel(p.status)}</span>
      </div>
      <p class="card-title">${escHtml(p.name)}</p>
      <p class="card-price">${formatRp(p.price)}</p>
      <p class="card-stock">Stok: ${p.stock ?? 0}</p>
      <p class="card-excerpt">${escHtml((p.description||'').substring(0,80))}...</p>
      <div class="card-foot">
        <span class="card-more">Detail <i data-lucide="arrow-up-right"></i></span>
        <span class="card-author">${escHtml(p.profiles?.full_name || 'Penjual')}</span>
      </div>
      ${adminBtns}
    </div>
  </div>`;
}

/* ============================================================
   GALLERY
============================================================ */
async function loadGallery() {
  const query = supa
    .from('gallery')
    .select('*, profiles(full_name)')
    .order('created_at', { ascending: false });

  const { data } = can(ROLES_PENGURUS)
    ? await query
    : await query.eq('status', 'approved');

  allGallery = data || [];
  renderGalleryGrid(allGallery);
}

function renderGalleryGrid(items) {
  const el = document.getElementById('gallery-grid');
  if (!el) return;

  if (!items || items.length === 0) {
    el.innerHTML = emptyState('image', 'Belum ada foto', 'Foto kegiatan akan muncul di sini');
    return;
  }

  el.innerHTML = items.map(g => galleryItem(g)).join('');
  lucide.createIcons();
}

function galleryItem(g) {
  const canEdit = isLoggedIn() && (currentUser?.id === g.user_id || can(ROLES_MODERASI));
  const img = g.image_url
    ? `<img src="${escHtml(g.image_url)}" alt="${escHtml(g.title||'')}" loading="lazy">`
    : `<div style="width:100%;height:100%;background:var(--card2);display:flex;align-items:center;justify-content:center;color:var(--text3)"><i data-lucide="image"></i></div>`;

  const adminBtns = canEdit
    ? `<div class="gal-acts">
        <button class="cact edit" onclick="event.stopPropagation();openGalleryForm('${g.id}')" style="padding:5px 8px"><i data-lucide="pencil"></i></button>
        <button class="cact del" onclick="event.stopPropagation();deleteItem('gallery','${g.id}')" style="padding:5px 8px"><i data-lucide="trash-2"></i></button>
       </div>`
    : '';

  return `<div class="gal-item" onclick="openDetail('gallery','${g.id}')">
    ${img}
    <div class="gal-overlay">
      <p class="gal-title">${escHtml(g.title||'')}</p>
      <p class="gal-cap">${escHtml(g.caption||'')}</p>
    </div>
    ${adminBtns}
  </div>`;
}

/* ============================================================
   FINANCE
============================================================ */
async function loadKasSummary() {
  const { data } = await supa
    .from('transactions')
    .select('type, amount, description, date, created_at')
    .order('created_at', { ascending: false });

  if (!data) return;

  const totIn  = data.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
  const totOut = data.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  const saldo  = totIn - totOut;

  setInner('kas-saldo-home', formatRp(saldo));
  setInner('kas-in-home', formatRp(totIn));
  setInner('kas-out-home', formatRp(totOut));

  const latest = data[0];
  if (latest) {
    setInner('kas-updated-home', `Diperbarui: ${formatDate(latest.created_at)}`);
  }

  // Recent 5 transactions
  const listEl = document.getElementById('trx-list-home');
  if (listEl) {
    const recent = data.slice(0, 5);
    if (recent.length === 0) {
      listEl.innerHTML = '<li class="trx-empty">Belum ada transaksi</li>';
    } else {
      listEl.innerHTML = recent.map(t => trxItem(t)).join('');
    }
  }

  lucide.createIcons();
}

async function loadFinance() {
  const { data } = await supa
    .from('transactions')
    .select('*, profiles(full_name)')
    .order('date', { ascending: false });

  allTransactions = data || [];

  const totIn  = allTransactions.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
  const totOut = allTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  const saldo  = totIn - totOut;

  setInner('fin-saldo', formatRp(saldo));
  setInner('fin-income', formatRp(totIn));
  setInner('fin-expense', formatRp(totOut));

  // Full list
  const listEl = document.getElementById('trx-list-full');
  if (listEl) {
    if (allTransactions.length === 0) {
      listEl.innerHTML = '<li class="trx-empty">Belum ada transaksi</li>';
    } else {
      listEl.innerHTML = allTransactions.map(t => trxItemFull(t)).join('');
    }
  }

  renderBarChart(allTransactions);
  lucide.createIcons();
}

function trxItem(t) {
  return `<li class="trx-item">
    <span class="trx-dot ${t.type}"></span>
    <div class="trx-info">
      <p class="trx-desc">${escHtml(t.description || t.category || '—')}</p>
      <p class="trx-date">${formatDate(t.date || t.created_at)}</p>
    </div>
    <span class="trx-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${formatRp(t.amount)}</span>
  </li>`;
}

function trxItemFull(t) {
  const canEdit = isLoggedIn() && can(ROLES_FINANCE);
  const adminBtns = canEdit
    ? `<div style="display:flex;gap:6px;margin-top:4px">
        <button class="cact edit" onclick="openTransactionForm('${t.id}')"><i data-lucide="pencil"></i></button>
        <button class="cact del" onclick="deleteItem('transactions','${t.id}')"><i data-lucide="trash-2"></i></button>
       </div>`
    : '';

  return `<li class="trx-item" style="flex-wrap:wrap">
    <span class="trx-dot ${t.type}"></span>
    <div class="trx-info">
      <p class="trx-desc">${escHtml(t.description || '—')}</p>
      <p class="trx-date">${escHtml(t.category || '')} · ${formatDate(t.date || t.created_at)} · ${escHtml(t.profiles?.full_name || '')}</p>
      ${adminBtns}
    </div>
    <span class="trx-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${formatRp(t.amount)}</span>
  </li>`;
}

function renderBarChart(transactions) {
  const chartEl = document.getElementById('bar-chart');
  if (!chartEl) return;

  // Last 4 months
  const months = [];
  for (let i = 3; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push({ year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleDateString('id-ID', { month: 'short' }) });
  }

  const data = months.map(m => {
    const mTx = transactions.filter(t => {
      const d = new Date(t.date || t.created_at);
      return d.getFullYear() === m.year && d.getMonth() === m.month;
    });
    return {
      label: m.label,
      income:  mTx.filter(t => t.type === 'income').reduce((s,t) => s + (t.amount||0), 0),
      expense: mTx.filter(t => t.type === 'expense').reduce((s,t) => s + (t.amount||0), 0),
    };
  });

  const maxVal = Math.max(...data.map(d => Math.max(d.income, d.expense)), 1);

  chartEl.innerHTML = data.map(d => {
    const ih = Math.round((d.income / maxVal) * 88);
    const eh = Math.round((d.expense / maxVal) * 88);
    return `<div class="bar-grp">
      <div class="bar-pair">
        <div class="bar income" style="height:${ih}px" title="${formatRp(d.income)}"></div>
        <div class="bar expense" style="height:${eh}px" title="${formatRp(d.expense)}"></div>
      </div>
      <span class="bar-lbl">${d.label}</span>
    </div>`;
  }).join('');
}

/* ============================================================
   AUTH — EMAIL OTP
============================================================ */
function openAuthModal() {
  showModal('auth-modal');
  document.getElementById('auth-step-email').classList.remove('hidden');
  document.getElementById('auth-step-otp').classList.add('hidden');
  document.getElementById('auth-email').value = '';
  clearOTPInputs();
}

function closeAuthModal() { closeModal('auth-modal'); }

async function sendOTP() {
  const email = document.getElementById('auth-email').value.trim();
  if (!email || !/\S+@\S+\.\S+/.test(email)) { showToast('Masukkan email yang valid', 'error'); return; }

  const btn = document.getElementById('btn-send-otp');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;border-radius:50%;animation:spin .7s linear infinite;border:2px solid #0003;border-top-color:#000"></span> Mengirim...';

  const { error } = await supa.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });

  btn.disabled = false;
  btn.innerHTML = '<i data-lucide="send"></i> Kirim Kode OTP';
  lucide.createIcons();

  if (error) { showToast('Gagal kirim OTP: ' + error.message, 'error'); return; }

  document.getElementById('auth-email-show').textContent = email;
  document.getElementById('auth-step-email').classList.add('hidden');
  document.getElementById('auth-step-otp').classList.remove('hidden');

  setTimeout(() => document.querySelector('.otp-box')?.focus(), 100);
  startResendTimer();
  showToast('Kode OTP dikirim ke ' + email, 'success');
}

async function verifyOTP() {
  const email = document.getElementById('auth-email-show').textContent;
  const inputs = document.querySelectorAll('#otp-inputs .otp-box');
  const token = Array.from(inputs).map(i => i.value).join('').trim();

  if (token.length !== 6) { showToast('Masukkan 6 digit kode OTP', 'error'); return; }

  const btn = document.getElementById('btn-verify-otp') || document.querySelector('#auth-step-otp .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Memverifikasi...'; }

  const { data, error } = await supa.auth.verifyOtp({ email, token, type: 'email' });

  if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="check-circle"></i> Verifikasi & Masuk'; lucide.createIcons(); }

  if (error) { showToast('Kode salah atau kadaluarsa: ' + error.message, 'error'); return; }

  currentUser = data.user;
  await loadProfile();
  updateAuthUI();
  closeModal('auth-modal');
  stopResendTimer();
  showToast(`Selamat datang, ${currentProfile?.full_name || currentProfile?.username || 'Anggota'}!`, 'success');

  // Reload fresh data with role context
  await Promise.all([loadNewsPreview(), loadKasSummary()]);
}

async function resendOTP() {
  const email = document.getElementById('auth-email-show').textContent;
  const { error } = await supa.auth.signInWithOtp({ email });
  if (error) { showToast('Gagal kirim ulang: ' + error.message, 'error'); return; }
  showToast('Kode OTP dikirim ulang', 'info');
  startResendTimer();
}

function backToEmail() {
  document.getElementById('auth-step-otp').classList.add('hidden');
  document.getElementById('auth-step-email').classList.remove('hidden');
  stopResendTimer();
  clearOTPInputs();
}

function startResendTimer() {
  const btn = document.getElementById('btn-resend');
  const countdown = document.getElementById('resend-countdown');
  btn.disabled = true;
  let secs = 60;
  countdown.textContent = secs;
  stopResendTimer();
  resendTimer = setInterval(() => {
    secs--;
    countdown.textContent = secs;
    if (secs <= 0) {
      stopResendTimer();
      btn.disabled = false;
      btn.textContent = 'Kirim Ulang';
    }
  }, 1000);
}

function stopResendTimer() {
  if (resendTimer) { clearInterval(resendTimer); resendTimer = null; }
}

function setupOTPInputs() {
  const inputs = document.querySelectorAll('.otp-box');
  inputs.forEach((input, i) => {
    input.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val.slice(-1);
      if (val && i < inputs.length - 1) inputs[i + 1].focus();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && i > 0) inputs[i - 1].focus();
    });
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
      inputs.forEach((inp, idx) => { inp.value = paste[idx] || ''; });
      if (paste.length > 0) inputs[Math.min(paste.length, inputs.length - 1)].focus();
    });
  });
}

function clearOTPInputs() {
  document.querySelectorAll('.otp-box').forEach(i => i.value = '');
}

async function handleLogout() {
  await supa.auth.signOut();
  currentUser = null; currentProfile = null; currentRole = null;
  updateAuthUI();
  // Hide admin buttons
  ['btn-add-news','btn-add-product','btn-add-gallery','btn-add-transaction','btn-edit-vision'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });
  showToast('Berhasil keluar', 'info');
  navigateTo('home');
}

/* ============================================================
   PROFILE MODAL
============================================================ */
function openProfileModal() {
  if (!currentProfile) return;
  document.getElementById('user-dropdown')?.classList.add('hidden');

  const p = currentProfile;
  setVal('profile-full_name', p.full_name || '');
  setVal('profile-username', p.username || '');
  setVal('profile-bio', p.bio || '');
  setVal('profile-phone', maskPrivate(p.phone, true));
  setVal('profile-location', maskPrivate(p.location, true));

  const roleEl = document.getElementById('profile-role-display');
  if (roleEl) { roleEl.textContent = currentRole || 'anggota'; }

  const avaEl = document.getElementById('profile-avatar-img');
  if (avaEl) {
    avaEl.src = p.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.full_name||'U')}&background=22c55e&color=000`;
  }

  // Role management for owner/ketua
  const roleMgmt = document.getElementById('role-management');
  if (roleMgmt) {
    if (can(['owner','ketua'])) roleMgmt.classList.remove('hidden');
    else roleMgmt.classList.add('hidden');
  }

  showModal('profile-modal');
}

async function saveProfile() {
  if (!currentUser) return;
  const updates = {
    id: currentUser.id,
    full_name: getVal('profile-full_name'),
    username:  getVal('profile-username'),
    bio:       getVal('profile-bio'),
    phone:     getVal('profile-phone'),
    location:  getVal('profile-location'),
    updated_at: new Date().toISOString()
  };

  const { error } = await supa.from('profiles').upsert(updates);
  if (error) { showToast('Gagal simpan: ' + error.message, 'error'); return; }

  await loadProfile();
  updateAuthUI();
  closeModal('profile-modal');
  showToast('Profil berhasil disimpan', 'success');
}

function triggerAvatarUpload() {
  document.getElementById('avatar-file-input')?.click();
}

async function uploadAvatar(input) {
  const file = input.files[0];
  if (!file || !currentUser) return;

  const ext = file.name.split('.').pop();
  const path = `${currentUser.id}/avatar.${ext}`;

  const { error: upErr } = await supa.storage.from('avatars').upload(path, file, { upsert: true });
  if (upErr) { showToast('Gagal upload: ' + upErr.message, 'error'); return; }

  const { data: urlData } = supa.storage.from('avatars').getPublicUrl(path);
  const avatarUrl = urlData.publicUrl;

  await supa.from('profiles').update({ avatar_url: avatarUrl }).eq('id', currentUser.id);
  currentProfile.avatar_url = avatarUrl;

  const avaEl = document.getElementById('profile-avatar-img');
  if (avaEl) avaEl.src = avatarUrl;
  updateAuthUI();
  showToast('Foto profil diperbarui', 'success');
}

/* ============================================================
   ROLE MANAGEMENT
============================================================ */
async function searchUsersForRole() {
  const q = getVal('role-search-input').trim();
  const listEl = document.getElementById('role-search-results');
  if (!listEl) return;

  if (q.length < 2) { listEl.innerHTML = ''; return; }

  const { data } = await supa
    .from('profiles')
    .select('id, full_name, username, email, role')
    .or(`full_name.ilike.%${q}%,username.ilike.%${q}%`)
    .neq('id', currentUser.id)  // can't change own role
    .limit(10);

  if (!data || data.length === 0) {
    listEl.innerHTML = '<li style="font-size:.8rem;color:var(--text3);padding:8px 0">Tidak ditemukan</li>';
    return;
  }

  listEl.innerHTML = data.map(u => roleSearchItem(u)).join('');
  lucide.createIcons();
}

function roleSearchItem(u) {
  // What roles can current user assign?
  let allowedRoles = [];
  if (currentRole === 'owner') allowedRoles = ['ketua','admin','bendahara','anggota'];
  if (currentRole === 'ketua') allowedRoles = ['admin','bendahara','anggota'];

  const opts = allowedRoles.map(r =>
    `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r}</option>`
  ).join('');

  return `<li class="role-item">
    <div class="role-item-info">
      <p class="role-item-name">${escHtml(u.full_name || u.username || 'User')}</p>
      <p class="role-item-email">${escHtml(u.email || '')}</p>
    </div>
    <select class="role-sel" id="role-sel-${u.id}" onchange="assignRole('${u.id}',this.value)">${opts}</select>
  </li>`;
}

async function assignRole(userId, newRole) {
  if (!can(['owner','ketua'])) { showToast('Tidak punya akses', 'error'); return; }

  // Coup protection: can't assign 'owner' unless you ARE owner
  if (newRole === 'owner' && currentRole !== 'owner') {
    showToast('Hanya owner yang bisa menunjuk owner baru', 'error'); return;
  }

  const { error } = await supa.from('profiles').update({ role: newRole }).eq('id', userId);
  if (error) { showToast('Gagal ubah role: ' + error.message, 'error'); return; }
  showToast(`Role berhasil diubah ke ${newRole}`, 'success');
}

/* ============================================================
   VISION / MISSION EDITOR
============================================================ */
async function openVisionEditor() {
  const { data } = await supa.from('app_info').select('*').eq('id', 1).single();
  if (data) {
    setVal('vision-welcome-title', data.welcome_title || '');
    setVal('vision-slogan', data.slogan || '');
    setVal('vision-description', data.description || '');
    setVal('vision-vision', data.vision || '');
    setVal('vision-mission', data.mission || '');
  }
  showModal('vision-modal');
}

async function saveVisionMission() {
  if (!can(['owner','ketua'])) { showToast('Tidak punya akses', 'error'); return; }

  const updates = {
    id: 1,
    welcome_title: getVal('vision-welcome-title'),
    slogan:        getVal('vision-slogan'),
    description:   getVal('vision-description'),
    vision:        getVal('vision-vision'),
    mission:       getVal('vision-mission'),
  };

  const { error } = await supa.from('app_info').upsert(updates);
  if (error) { showToast('Gagal simpan: ' + error.message, 'error'); return; }

  await loadAppInfo();
  await loadTicker();
  closeModal('vision-modal');
  showToast('Visi & Misi berhasil disimpan', 'success');
}

/* ============================================================
   NEWS FORM
============================================================ */
function openNewsForm(id = null) {
  if (!isLoggedIn()) { openAuthModal(); return; }
  if (!can(ROLES_PENGURUS)) { showToast('Hanya pengurus yang bisa menambah berita', 'error'); return; }

  document.getElementById('news-edit-id').value = id || '';
  document.getElementById('news-modal-title').textContent = id ? 'Edit Berita' : 'Tambah Berita';
  document.getElementById('news-image-preview').classList.add('hidden');

  // Show status field for moderators
  if (can(ROLES_MODERASI)) document.getElementById('news-status-group')?.classList.remove('hidden');

  if (id) {
    const item = allNews.find(n => n.id === id);
    if (item) {
      setVal('news-title', item.title || '');
      setVal('news-category', item.category || 'umum');
      setVal('news-content', item.content || '');
      setVal('news-status', item.status || 'pending');
      if (item.image_url) {
        const prev = document.getElementById('news-image-preview');
        prev.src = item.image_url; prev.classList.remove('hidden');
      }
    }
  } else {
    setVal('news-title',''); setVal('news-category','umum');
    setVal('news-content',''); setVal('news-status','pending');
  }

  showModal('news-modal');
}

async function saveNews() {
  const id    = getVal('news-edit-id');
  const title = getVal('news-title').trim();
  if (!title) { showToast('Judul wajib diisi', 'error'); return; }

  showLoading();
  let imageUrl = null;
  const fileInput = document.getElementById('news-image-file');

  if (fileInput?.files[0]) {
    imageUrl = await uploadImage(fileInput.files[0], 'news');
    if (!imageUrl) { hideLoading(); return; }
  } else if (id) {
    const existing = allNews.find(n => n.id === id);
    imageUrl = existing?.image_url || null;
  }

  const payload = {
    user_id:    currentUser.id,
    title:      title,
    category:   getVal('news-category'),
    content:    getVal('news-content'),
    status:     can(ROLES_MODERASI) ? getVal('news-status') : (can(ROLES_PENGURUS) ? 'approved' : 'pending'),
    image_url:  imageUrl,
  };

  let error;
  if (id) {
    ({ error } = await supa.from('news').update(payload).eq('id', id));
  } else {
    ({ error } = await supa.from('news').insert(payload));
  }

  hideLoading();
  if (error) { showToast('Gagal simpan: ' + error.message, 'error'); return; }

  closeModal('news-modal');
  showToast(id ? 'Berita diperbarui' : 'Berita ditambahkan', 'success');
  await loadNews();
  await loadNewsPreview();
  await loadTicker();
}

/* ============================================================
   PRODUCT FORM
============================================================ */
function openProductForm(id = null) {
  if (!isLoggedIn()) { openAuthModal(); return; }
  if (!can(ROLES_PENGURUS)) { showToast('Hanya pengurus yang bisa menambah produk', 'error'); return; }

  document.getElementById('product-edit-id').value = id || '';
  document.getElementById('product-modal-title').textContent = id ? 'Edit Produk' : 'Tambah Produk';
  document.getElementById('product-image-preview').classList.add('hidden');

  if (can(ROLES_MODERASI)) document.getElementById('product-status-group')?.classList.remove('hidden');

  if (id) {
    const item = allProducts.find(p => p.id === id);
    if (item) {
      setVal('product-name', item.name || '');
      setVal('product-category', item.category || 'makanan');
      setVal('product-price', item.price || 0);
      setVal('product-stock', item.stock || 0);
      setVal('product-description', item.description || '');
      setVal('product-status', item.status || 'active');
      if (item.image_url) {
        const prev = document.getElementById('product-image-preview');
        prev.src = item.image_url; prev.classList.remove('hidden');
      }
    }
  } else {
    setVal('product-name',''); setVal('product-category','makanan');
    setVal('product-price',0); setVal('product-stock',0);
    setVal('product-description',''); setVal('product-status','active');
  }

  showModal('product-modal');
}

async function saveProduct() {
  const id   = getVal('product-edit-id');
  const name = getVal('product-name').trim();
  if (!name) { showToast('Nama produk wajib diisi', 'error'); return; }

  showLoading();
  let imageUrl = null;
  const fileInput = document.getElementById('product-image-file');

  if (fileInput?.files[0]) {
    imageUrl = await uploadImage(fileInput.files[0], 'products');
    if (!imageUrl) { hideLoading(); return; }
  } else if (id) {
    imageUrl = allProducts.find(p => p.id === id)?.image_url || null;
  }

  const payload = {
    user_id:     currentUser.id,
    name:        name,
    category:    getVal('product-category'),
    price:       parseFloat(getVal('product-price')) || 0,
    stock:       parseInt(getVal('product-stock')) || 0,
    description: getVal('product-description'),
    status:      can(ROLES_MODERASI) ? getVal('product-status') : 'active',
    image_url:   imageUrl,
  };

  let error;
  if (id) {
    ({ error } = await supa.from('products').update(payload).eq('id', id));
  } else {
    ({ error } = await supa.from('products').insert(payload));
  }

  hideLoading();
  if (error) { showToast('Gagal simpan: ' + error.message, 'error'); return; }

  closeModal('product-modal');
  showToast(id ? 'Produk diperbarui' : 'Produk ditambahkan', 'success');
  await loadProducts();
  loadStats();
}

/* ============================================================
   GALLERY FORM
============================================================ */
function openGalleryForm(id = null) {
  if (!isLoggedIn()) { openAuthModal(); return; }
  if (!can(ROLES_PENGURUS)) { showToast('Hanya pengurus yang bisa menambah foto', 'error'); return; }

  document.getElementById('gallery-edit-id').value = id || '';
  document.getElementById('gallery-modal-title').textContent = id ? 'Edit Foto' : 'Tambah Foto';
  document.getElementById('gallery-image-preview').classList.add('hidden');

  if (can(ROLES_MODERASI)) document.getElementById('gallery-status-group')?.classList.remove('hidden');

  if (id) {
    const item = allGallery.find(g => g.id === id);
    if (item) {
      setVal('gallery-title', item.title || '');
      setVal('gallery-caption', item.caption || '');
      setVal('gallery-status', item.status || 'approved');
      if (item.image_url) {
        const prev = document.getElementById('gallery-image-preview');
        prev.src = item.image_url; prev.classList.remove('hidden');
      }
    }
  } else {
    setVal('gallery-title',''); setVal('gallery-caption',''); setVal('gallery-status','approved');
  }

  showModal('gallery-modal');
}

async function saveGallery() {
  const id    = getVal('gallery-edit-id');
  const title = getVal('gallery-title').trim();
  if (!title) { showToast('Judul wajib diisi', 'error'); return; }

  showLoading();
  let imageUrl = null;
  const fileInput = document.getElementById('gallery-image-file');

  if (fileInput?.files[0]) {
    imageUrl = await uploadImage(fileInput.files[0], 'gallery');
    if (!imageUrl) { hideLoading(); return; }
  } else if (id) {
    imageUrl = allGallery.find(g => g.id === id)?.image_url || null;
  }

  const payload = {
    user_id:   currentUser.id,
    title:     title,
    caption:   getVal('gallery-caption'),
    status:    can(ROLES_MODERASI) ? getVal('gallery-status') : 'approved',
    image_url: imageUrl,
  };

  let error;
  if (id) {
    ({ error } = await supa.from('gallery').update(payload).eq('id', id));
  } else {
    ({ error } = await supa.from('gallery').insert(payload));
  }

  hideLoading();
  if (error) { showToast('Gagal simpan: ' + error.message, 'error'); return; }

  closeModal('gallery-modal');
  showToast(id ? 'Foto diperbarui' : 'Foto ditambahkan', 'success');
  await loadGallery();
}

/* ============================================================
   TRANSACTION FORM
============================================================ */
function openTransactionForm(id = null) {
  if (!isLoggedIn()) { openAuthModal(); return; }
  if (!can(ROLES_FINANCE)) { showToast('Hanya owner, ketua, atau bendahara yang bisa input transaksi', 'error'); return; }

  document.getElementById('transaction-edit-id').value = id || '';
  document.getElementById('transaction-modal-title').textContent = id ? 'Edit Transaksi' : 'Tambah Transaksi';

  if (id) {
    const item = allTransactions.find(t => t.id === id);
    if (item) {
      setVal('transaction-type', item.type || 'income');
      setVal('transaction-date', item.date || '');
      setVal('transaction-description', item.description || '');
      setVal('transaction-category', item.category || 'Iuran Anggota');
      setVal('transaction-amount', item.amount || 0);
      setVal('transaction-notes', item.notes || '');
    }
  } else {
    setVal('transaction-type','income');
    setVal('transaction-date', new Date().toISOString().split('T')[0]);
    setVal('transaction-description',''); setVal('transaction-category','Iuran Anggota');
    setVal('transaction-amount',0); setVal('transaction-notes','');
  }

  showModal('transaction-modal');
}

async function saveTransaction() {
  const id     = getVal('transaction-edit-id');
  const desc   = getVal('transaction-description').trim();
  const amount = parseFloat(getVal('transaction-amount')) || 0;
  if (!desc) { showToast('Deskripsi wajib diisi', 'error'); return; }
  if (amount <= 0) { showToast('Jumlah harus lebih dari 0', 'error'); return; }

  const payload = {
    user_id:     currentUser.id,
    type:        getVal('transaction-type'),
    date:        getVal('transaction-date'),
    description: desc,
    category:    getVal('transaction-category'),
    amount:      amount,
    notes:       getVal('transaction-notes'),
  };

  let error;
  if (id) {
    ({ error } = await supa.from('transactions').update(payload).eq('id', id));
  } else {
    ({ error } = await supa.from('transactions').insert(payload));
  }

  if (error) { showToast('Gagal simpan: ' + error.message, 'error'); return; }

  closeModal('transaction-modal');
  showToast(id ? 'Transaksi diperbarui' : 'Transaksi ditambahkan', 'success');
  await loadFinance();
  await loadKasSummary();
}

/* ============================================================
   DELETE ITEM
============================================================ */
function deleteItem(table, id) {
  // Permission check
  if (table === 'transactions' && !can(ROLES_FINANCE)) { showToast('Tidak punya akses', 'error'); return; }
  if (table !== 'transactions' && !can(ROLES_MODERASI)) {
    // Allow own content
    let item;
    if (table === 'news') item = allNews.find(n => n.id === id);
    if (table === 'products') item = allProducts.find(p => p.id === id);
    if (table === 'gallery') item = allGallery.find(g => g.id === id);
    if (!item || item.user_id !== currentUser?.id) { showToast('Tidak punya akses', 'error'); return; }
  }

  showConfirm('Hapus Item', 'Item yang dihapus tidak bisa dikembalikan. Lanjutkan?', async () => {
    const { error } = await supa.from(table).delete().eq('id', id);
    if (error) { showToast('Gagal hapus: ' + error.message, 'error'); return; }
    showToast('Item berhasil dihapus', 'success');
    if (table === 'news')         { await loadNews(); await loadNewsPreview(); }
    if (table === 'products')     { await loadProducts(); }
    if (table === 'gallery')      { await loadGallery(); }
    if (table === 'transactions') { await loadFinance(); await loadKasSummary(); }
  });
}

/* ============================================================
   DETAIL VIEWER
============================================================ */
function openDetail(type, id) {
  let item;
  if (type === 'news')     item = allNews.find(n => n.id === id);
  if (type === 'products') item = allProducts.find(p => p.id === id);
  if (type === 'gallery')  item = allGallery.find(g => g.id === id);
  if (!item) return;

  const imgEl     = document.getElementById('detail-image');
  const metaEl    = document.getElementById('detail-meta');
  const titleEl   = document.getElementById('detail-title');
  const bodyEl    = document.getElementById('detail-body');
  const actionsEl = document.getElementById('detail-actions');

  if (item.image_url) {
    imgEl.src = item.image_url; imgEl.classList.remove('hidden');
    imgEl.onerror = () => imgEl.classList.add('hidden');
  } else {
    imgEl.classList.add('hidden');
  }

  // Meta badges
  let metaHtml = '';
  if (type === 'news') {
    metaHtml = `<span class="badge badge-${item.status}">${statusLabel(item.status)}</span><span class="lbl">${formatDate(item.created_at)}</span><span class="card-cat">${escHtml(item.category||'')}</span>`;
    titleEl.textContent = item.title || '';
    bodyEl.textContent  = item.content || '';
  } else if (type === 'products') {
    metaHtml = `<span class="badge badge-${item.status}">${statusLabel(item.status)}</span><span class="card-cat">${escHtml(item.category||'')}</span>`;
    titleEl.textContent = item.name || '';
    bodyEl.innerHTML    = `<p style="font-size:1.3rem;font-weight:700;color:var(--green);margin-bottom:8px">${formatRp(item.price)}</p><p style="font-size:.85rem;color:var(--text3);margin-bottom:12px">Stok: ${item.stock ?? 0}</p><p>${escHtml(item.description||'')}</p>`;
  } else if (type === 'gallery') {
    metaHtml = `<span class="lbl">${formatDate(item.created_at)}</span>`;
    titleEl.textContent = item.title || '';
    bodyEl.textContent  = item.caption || '';
  }

  metaEl.innerHTML = metaHtml + `<span class="lbl">oleh ${escHtml(item.profiles?.full_name || 'Anonim')}</span>`;

  // Admin actions
  const canEdit = isLoggedIn() && (currentUser?.id === item.user_id || can(ROLES_MODERASI));
  const canFinEdit = type === 'transactions' && can(ROLES_FINANCE);

  if (canEdit || canFinEdit) {
    actionsEl.innerHTML = `
      <button class="btn-outline" onclick="closeModal('detail-modal');${type==='news'?`openNewsForm('${id}')`:type==='products'?`openProductForm('${id}')`:type==='gallery'?`openGalleryForm('${id}')`:''}">
        <i data-lucide="pencil"></i> Edit
      </button>
      <button class="btn-danger" onclick="closeModal('detail-modal');deleteItem('${type}','${id}')">
        <i data-lucide="trash-2"></i> Hapus
      </button>`;
  } else {
    actionsEl.innerHTML = '';
  }

  showModal('detail-modal');
  lucide.createIcons();
}

/* ============================================================
   ADMIN PANEL (placeholder — opens profile with role mgmt)
============================================================ */
function openAdminPanel() {
  openProfileModal();
}

/* ============================================================
   IMAGE UPLOAD
============================================================ */
async function uploadImage(file, bucket) {
  const ext  = file.name.split('.').pop();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supa.storage.from(bucket).upload(path, file, { upsert: false });
  if (error) { showToast('Gagal upload gambar: ' + error.message, 'error'); return null; }

  const { data } = supa.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/* ============================================================
   MODAL HELPERS
============================================================ */
function showModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('hidden'); document.body.style.overflow = ''; }
}

function showConfirm(title, msg, callback) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = msg;
  confirmCallback = callback;
  const btn = document.getElementById('confirm-ok-btn');
  btn.onclick = () => { closeModal('confirm-modal'); if (confirmCallback) confirmCallback(); };
  showModal('confirm-modal');
}

/* ============================================================
   TOAST
============================================================ */
function showToast(msg, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(30px)';
    toast.style.transition = 'all .3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ============================================================
   LOADING
============================================================ */
function showLoading() { document.getElementById('loading-overlay')?.classList.remove('hidden'); }
function hideLoading() { document.getElementById('loading-overlay')?.classList.add('hidden'); }

/* ============================================================
   UTILITIES
============================================================ */
function formatRp(num) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num || 0);
}

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

function statusLabel(s) {
  const map = { approved:'Disetujui', pending:'Menunggu', rejected:'Ditolak', active:'Aktif', inactive:'Nonaktif', sold_out:'Habis' };
  return map[s] || s || '—';
}

function maskPrivate(val, isOwner) {
  // Full for owner/ketua/bendahara, masked for others
  if (!val) return '';
  if (can(ROLES_FINANCE)) return val;
  return val.length > 4 ? val.slice(0,3) + '***' + val.slice(-2) : '***';
}

function emptyState(icon, title, sub) {
  return `<div class="empty-state" style="grid-column:1/-1">
    <i data-lucide="${icon}"></i>
    <h4>${title}</h4>
    <p>${sub}</p>
  </div>`;
}

function setInner(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') el.value = val;
  else if (el.tagName === 'SELECT') el.value = val;
}

function getVal(id) {
  const el = document.getElementById(id);
  if (!el) return '';
  return el.value || '';
}

// Preview image on file select
document.addEventListener('change', (e) => {
  if (e.target.type === 'file' && e.target.accept === 'image/*') {
    const file = e.target.files[0];
    if (!file) return;
    const id = e.target.id;
    const previewMap = {
      'news-image-file':    'news-image-preview',
      'product-image-file': 'product-image-preview',
      'gallery-image-file': 'gallery-image-preview',
    };
    const prevId = previewMap[id];
    if (prevId) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const prev = document.getElementById(prevId);
        if (prev) { prev.src = ev.target.result; prev.classList.remove('hidden'); }
      };
      reader.readAsDataURL(file);
    }
  }
});
