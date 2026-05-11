// ═══════════════════════════════════════════════════════════════════════════
// ANJUNKU Digital Command Center — script.js
// Build: 20260511-v17
// ═══════════════════════════════════════════════════════════════════════════

// ── 0. CONFIG & SUPABASE ────────────────────────────────────────────────
const SUPA_URL    = 'https://elnmwdeckfgwfqigchjx.supabase.co';
const SUPA_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsbm13ZGVja2Znd2ZxaWdjaGp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzUyMjAsImV4cCI6MjA5MjYxMTIyMH0.l0fKST9VhCcc5tdbXJLOkfXrSwRupYjbs-DCRSA2L-0';
const OWNER_EMAIL = 'anjungeneration@gmail.com';
const db          = supabase.createClient(SUPA_URL, SUPA_KEY);

// ── 1. GLOBAL STATE ──────────────────────────────────────────────────────
let CU = null, CP = null;           // currentUser, currentProfile
let allNews = [], allProds = [], allTrx = [];
let _sponsors = [], _sponsorTimer = null;
let _finChart = null;
let _deferredInstallPrompt = null;

// ── 2. UTILITIES ───────────────────────────────────────────────────────────
const g    = id => document.getElementById(id);
const show = (id, v) => { const el = g(id); if (el) el.style.display = v ? '' : 'none'; };
const sv   = (id, v) => { const el = g(id); if (el) el.value = v; };
const sv2  = (id, v) => { const el = g(id); if (el) el.textContent = v; };
const gv   = id => { const el = g(id); return el ? el.value : ''; };
const esc  = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const dbQ  = (q, ms = 9000) => Promise.race([q, new Promise((_,rej) => setTimeout(() => rej(new Error('Server tidak merespons. Coba refresh halaman.')), ms))]);

const fmtRp = n => new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', minimumFractionDigits:0 }).format(parseFloat(n) || 0);
const fmtRpHead = n => {
  const v = parseFloat(n || 0);
  return v === 0 ? 'RP —' : 'RP ' + v.toLocaleString('id-ID');
};
const parseDate    = s => { if (!s) return null; return (s.includes('T') || s.includes(' ')) ? new Date(s) : new Date(s + 'T00:00:00'); };
const fmtDate      = s => { const d = parseDate(s); if (!d || isNaN(d)) return '–'; return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }); };
const fmtDateShort = s => { const d = parseDate(s); if (!d || isNaN(d)) return '–'; return d.toLocaleDateString('id-ID', { month:'long', year:'numeric' }); };
const avFallback   = n => `https://ui-avatars.com/api/?name=${encodeURIComponent(n)}&background=0a1409&color=4ade80&size=128&bold=true`;
const emptyState   = (msg, icon) => `<div class="empty-state"><i class="${icon} fa-3x"></i><p>${msg}</p></div>`;
const errState     = msg => `<div class="empty-state"><i class="fas fa-exclamation-triangle fa-2x" style="color:var(--red);"></i><p>Error: ${msg}</p></div>`;

// ── 3. ROLE HELPERS ─────────────────────────────────────────────────────────
const role    = () => {
  if (!CP) return null;
  const email = CP.email || CU?.email || '';
  return email === OWNER_EMAIL ? 'owner' : (CP.role || 'anggota');
};
const isOwner  = () => role() === 'owner';
const isKetua  = () => role() === 'ketua';
const isBend   = () => role() === 'bendahara';
const isAdmin  = () => role() === 'admin';
const isTrio   = () => isOwner() || isKetua() || isBend();
const isMod    = () => isOwner() || isKetua() || isAdmin();
const isOK     = () => isOwner() || isKetua();
const loggedIn = () => !!CU;

function authGuard(cb) {
  if (!loggedIn()) { showAuthModal('register'); return; }
  cb();
}
function authNavTo(sec) {
  if (!loggedIn()) { showAuthModal('register'); return; }
  navigateTo(sec);
}

// ── 4. MEDIA PROCESSOR (Canvas API → WebP) ──────────────────────────────────
const MAX_MB      = 10;
const WEBP_QUALITY = 0.7;
const MAX_PX      = 1080;

async function processImage(file) {
  if (!file.type.startsWith('image/'))
    throw new Error('File harus berupa gambar (JPG/PNG/WEBP/dll).');
  const mb = file.size / (1024 * 1024);
  if (mb > MAX_MB)
    throw new Error(`File terlalu besar (${mb.toFixed(1)} MB). Maksimum ${MAX_MB} MB.`);

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_PX / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error('Gagal konversi gambar ke WebP.'));
        const fname = file.name.replace(/\.[^.]+$/, '.webp');
        resolve(new File([blob], fname, { type:'image/webp' }));
      }, 'image/webp', WEBP_QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('File gambar tidak valid atau rusak.')); };
    img.src = url;
  });
}

async function uploadMedia(file, bucket) {
  let uploadFile = file;
  // Only compress images; pass PDFs/etc. through directly
  if (file.type.startsWith('image/')) {
    uploadFile = await processImage(file);
  } else {
    const mb = file.size / (1024 * 1024);
    if (mb > MAX_MB) throw new Error(`File terlalu besar (${mb.toFixed(1)} MB). Maksimum ${MAX_MB} MB.`);
  }
  const path = `${Date.now()}_${uploadFile.name}`;
  const opts = uploadFile.type === 'image/webp' ? { contentType:'image/webp' } : {};
  const { data, error } = await db.storage.from(bucket).upload(path, uploadFile, opts);
  if (error) throw new Error('Upload gagal: ' + error.message);
  return db.storage.from(bucket).getPublicUrl(data.path).data.publicUrl;
}

// ── 5. TOAST ────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info', duration = 3500) {
  let wrap = g('toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toast-wrap';
    wrap.style.cssText = 'position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:.5rem;pointer-events:none;width:max-content;max-width:90vw;';
    document.body.appendChild(wrap);
  }
  const colors = { success:'#4ade80', error:'#ef4444', info:'#38bdf8', warn:'#f59e0b' };
  const toast = document.createElement('div');
  toast.style.cssText = `background:#111;border:1px solid ${colors[type]||colors.info};color:#fff;padding:.6rem 1.25rem;border-radius:999px;font-size:.8rem;font-family:var(--font-body);box-shadow:0 4px 24px rgba(0,0,0,.6);transition:opacity .35s ease;text-align:center;`;
  toast.textContent = msg;
  wrap.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 350); }, duration);
}

// ── 6. CONFIRMATION MODAL ─────────────────────────────────────────────────────
function showConfirm(title, message, onConfirm) {
  const modal = g('confirm-modal');
  if (!modal) { if (confirm(message.replace(/<[^>]+>/g, ''))) onConfirm(); return; }
  sv2('confirm-title', title);
  const msgEl = g('confirm-message');
  if (msgEl) msgEl.innerHTML = message;
  const okBtn = g('confirm-ok-btn');
  if (okBtn) okBtn.onclick = () => { closeModal('confirm-modal'); onConfirm(); };
  openModal('confirm-modal');
}

// ── 7. AUTH STATE ──────────────────────────────────────────────────────────────
db.auth.onAuthStateChange(async (_, session) => {
  if (session?.user) {
    CU = session.user;
    if (!CP) CP = { id:CU.id, email:CU.email, role:'anggota', full_name:CU.user_metadata?.full_name || CU.email };
    syncUI();
    try {
      const { data: prof } = await dbQ(db.from('profiles').select('*').eq('id', CU.id).single(), 5000);
      if (prof) { CP = prof; syncUI(); showPersonalGreeting(); }
    } catch (_) {}
    loadDashboard();
  } else {
    CU = null; CP = null;
    syncUI();
  }
});

// ── 8. SYNC UI ───────────────────────────────────────────────────────────────────
function syncUI() {
  const lg = loggedIn(), r = role();
  show('btn-bergabung', !lg);
  show('user-menu', lg);
  show('online-status', lg);

  if (lg && CP) {
    const av = CP.avatar_url || avFallback(CP.full_name || 'U');
    const navAv = g('nav-avatar'); if (navAv) navAv.src = av;
    sv2('nav-fullname', CP.full_name || CP.username || CP.email);
    sv2('nav-username-short', (CP.full_name || '').split(' ')[0] || 'User');
    const badge = g('nav-role-badge');
    if (badge) { badge.textContent = r.toUpperCase(); badge.className = `role-badge role-${r}`; }
  }

  show('fab-edit-appinfo', isOK());
  show('ticker-ctrl', isMod());
  show('btn-add-news',    lg);
  show('btn-add-gallery', lg);
  show('btn-add-trx',     isTrio());
  show('btn-add-product', lg);
  show('btn-submit-product', false);
  show('th-aksi', isTrio());
  show('user-mgmt-section', isOK());

  const finBadge = g('fin-access-badge');
  if (finBadge) {
    if (isTrio()) {
      finBadge.innerHTML = '<i class="fas fa-unlock"></i> FULL ACCESS';
      finBadge.className = 'readonly-pill full-access-pill';
    } else {
      finBadge.innerHTML = '<i class="fas fa-eye"></i> PUBLIC READ-ONLY';
      finBadge.className = 'readonly-pill';
    }
  }
}

// ── 9. PERSONAL GREETING ────────────────────────────────────────────────────────
function showPersonalGreeting() {
  if (!CP) return;
  const h = new Date().getHours();
  const time = h < 12 ? 'pagi' : h < 15 ? 'siang' : h < 18 ? 'sore' : 'malam';
  const r = role();
  const name = (CP.full_name || '').split(' ')[0] || 'Kawan';
  let msg = `Selamat ${time}, `;
  if      (r === 'owner')    msg += `Chief ${name}! 👑 [OWNER MODE ACTIVE]`;
  else if (r === 'ketua')    msg += `${name}! [KETUA MODE]`;
  else if (r === 'bendahara') msg += `${name}! [BENDAHARA]`;
  else if (r === 'admin')    msg += `${name}! [ADMIN]`;
  else                        msg += `${name}!`;
  showToast(msg, 'success', 4500);
}

// ── 10. LOGOUT ────────────────────────────────────────────────────────────────────
async function handleLogout() {
  const overlay = g('logout-overlay');
  if (overlay) { overlay.style.display = 'flex'; document.body.style.pointerEvents = 'none'; }
  await new Promise(r => setTimeout(r, 800));
  await db.auth.signOut();
  if (overlay) { overlay.style.display = 'none'; document.body.style.pointerEvents = ''; }
  CU = null; CP = null;
  syncUI();
  navigateTo('dashboard');
}

// ── 11. NAVIGATION ─────────────────────────────────────────────────────────────────
const SECS    = ['dashboard', 'news', 'products', 'finance', 'anggota', 'gallery'];
const LOADERS = { dashboard:loadDashboard, news:loadNews, products:loadProducts, finance:loadFinance, anggota:loadAnggota, gallery:loadGallery };

function navigateTo(sec) {
  SECS.forEach(s => {
    const el = g(s + '-section');
    if (!el) return;
    el.style.display = s === sec ? '' : 'none';
    el.classList.toggle('active', s === sec);
  });
  document.querySelectorAll('.nav-pill[data-sec]').forEach(b =>
    b.classList.toggle('active', b.dataset.sec === sec)
  );
  closeMobile();
  window.scrollTo({ top:0, behavior:'smooth' });
  if (LOADERS[sec]) LOADERS[sec]();
}

function toggleMobile() { g('mobile-menu').classList.toggle('open'); }
function closeMobile()  { g('mobile-menu').classList.remove('open'); }
function toggleEye(id, btn) {
  const inp = g(id);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.innerHTML = inp.type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
}
function prevFile(input, wrapId, imgId) {
  const f = input.files[0];
  if (!f || !f.type.startsWith('image/')) return;
  const r = new FileReader();
  r.onload = e => { g(wrapId).style.display = ''; g(imgId).src = e.target.result; };
  r.readAsDataURL(f);
}
function clearFile(inputId, wrapId) {
  const inp = g(inputId); if (inp) inp.value = '';
  const wrap = g(wrapId); if (wrap) wrap.style.display = 'none';
}

// ── 12. MODAL HELPERS ─────────────────────────────────────────────────────────────
function openModal(id) { const m = g(id); if (m) m.style.display = 'flex'; if (id === 'ticker-modal') loadTickerList(); }
function closeModal(id) { const m = g(id); if (m) m.style.display = 'none'; }
function overlayClose(e, id) { if (e.target === g(id)) closeModal(id); }
function openLB(url, cap) { g('lb-img').src = url; g('lb-cap').textContent = cap || ''; openModal('lightbox-modal'); }

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
});

// ── 13. DASHBOARD ──────────────────────────────────────────────────────────────────
async function loadDashboard() {
  await Promise.all([loadAppInfo(), loadStats(), loadNewsPreview(), loadProductsPreview(), loadFinanceOverview()]);
}

async function loadAppInfo() {
  try {
    const { data } = await dbQ(db.from('app_info').select('*').eq('id', 1).single());
    if (!data) return;
    if (data.slogan)      sv2('hero-badge-txt', data.slogan);
    if (data.description) sv2('hero-desc', data.description);
    if (data.date)        sv2('stat-ttl', data.date);
    if (data.vision)      sv2('vision-text', data.vision);
    if (data.mission) {
      const mEl = g('mission-text');
      if (mEl) mEl.innerHTML = data.mission.split('\n').filter(l => l.trim())
        .map(l => `<li><i class="fas fa-check-circle"></i> ${esc(l.trim())}</li>`).join('');
    }
    sv('ai-slogan', data.slogan || '');
    sv('ai-desc', data.description || '');
    sv('ai-ttl', data.date || '');
    sv('ai-vision', data.vision || '');
    sv('ai-mission', data.mission || '');
  } catch (_) {}
}

async function loadStats() {
  try {
    const [{ count:mc }, { count:pc }] = await dbQ(Promise.all([
      db.from('profiles').select('*', { count:'exact', head:true }),
      db.from('products').select('*',  { count:'exact', head:true }),
    ]));
    sv2('stat-members',  mc ?? '–');
    sv2('stat-products', pc ?? '–');
  } catch (_) {}
}

async function loadNewsPreview() {
  const el = g('news-preview-list');
  el.innerHTML = '<div class="skel skel-row"></div><div class="skel skel-row"></div><div class="skel skel-row"></div>';
  let data;
  try { ({ data } = await dbQ(db.from('news').select('*').eq('status','approved').order('created_at',{ascending:false}).limit(4))); } catch (_) { return; }
  if (!data?.length) { el.innerHTML = '<div class="empty-mini"><i class="fas fa-inbox"></i>&nbsp; Belum ada berita.</div>'; return; }
  el.innerHTML = data.map(n => `
    <div class="npi" onclick="authGuard(() => navigateTo('news'))">
      <span class="npi-cat cat-${n.category||'info'}">${n.category||'info'}</span>
      <div class="npi-body">
        <strong>${esc(n.title)}</strong>
        <p>${esc((n.content||'').slice(0,80))}${(n.content?.length>80)?'...':''}</p>
        <div class="npi-date"><i class="fas fa-clock"></i> ${fmtDate(n.created_at)}</div>
      </div>
      ${n.image_url?`<img src="${n.image_url}" class="npi-thumb" alt="" loading="lazy">`:''}    </div>`).join('');
}

async function loadProductsPreview() {
  const el = g('products-preview-grid');
  el.innerHTML = '<div class="skel skel-card"></div><div class="skel skel-card"></div><div class="skel skel-card"></div><div class="skel skel-card"></div>';
  let data;
  try { ({ data } = await dbQ(db.from('products').select('*').eq('status','approved').order('created_at',{ascending:false}).limit(4))); } catch (_) { return; }
  if (!data?.length) { el.innerHTML = '<div class="empty-mini"><i class="fas fa-box-open"></i>&nbsp; Belum ada produk.</div>'; return; }
  el.innerHTML = data.map(p => `
    <div class="ppc" onclick="authGuard(() => navigateTo('products'))">
      <div class="ppc-img">${p.image_url?`<img src="${p.image_url}" alt="${esc(p.name)}" loading="lazy">`:'<div class="ppc-noimg"><i class="fas fa-box-open fa-2x"></i></div>'}</div>
      <div class="ppc-info"><strong>${esc(p.name)}</strong><div class="ppc-price">${fmtRp(p.price)}</div></div>
    </div>`).join('');
}

async function loadFinanceOverview() {
  let data;
  try { ({ data } = await dbQ(db.from('transactions').select('type,amount,date,description').order('date',{ascending:false}))); } catch (_) { return; }
  let m = 0, k = 0;
  (data||[]).forEach(t => { const a = parseFloat(t.amount)||0; t.type==='masuk' ? m+=a : k+=a; });
  sv2('ov-saldo',  fmtRpHead(m - k));
  sv2('ov-masuk',  fmtRpHead(m));
  sv2('ov-keluar', fmtRpHead(k));
  const latest = data?.[0]?.date;
  sv2('ov-updated', latest ? 'Diperbarui: ' + fmtDateShort(latest) : 'Diperbarui: –');
  const oldest = data?.[data.length-1]?.date;
  const periodeEl = g('ov-periode');
  if (periodeEl) periodeEl.innerHTML = oldest && latest
    ? `<i class="fas fa-calendar-alt"></i> Periode: ${fmtDateShort(oldest)} — ${fmtDateShort(latest)}`
    : 'Periode: –';
  const al = g('fin-activity-list');
  const recent = (data||[]).slice(0, 6);
  if (!recent.length) { al.innerHTML = '<div class="empty-mini" style="color:#333;"><i class="fas fa-inbox"></i>&nbsp; Belum ada transaksi.</div>'; return; }
  al.innerHTML = recent.map(t => `
    <div class="act-item">
      <div class="act-dot ${t.type}"></div>
      <div class="act-info">
        <span class="act-desc">${esc(t.description||'–')}</span>
        <span class="act-date">${fmtDateShort(t.date)}</span>
      </div>
      <span class="act-amt ${t.type}">${t.type==='masuk'?'+':'-'}${fmtRp(t.amount)}</span>
    </div>`).join('');
  renderDashboardChart(data||[]);
}

// ── 14. FINANCE CHART ─────────────────────────────────────────────────────────────
function getLast4Months() {
  const months = [], now = new Date();
  for (let i = 3; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  return months;
}

function buildChartDatasets(data, months) {
  const masukData  = months.map(m => data.filter(t => t.type==='masuk'  && (t.date||'').startsWith(m)).reduce((s,t) => s+(parseFloat(t.amount)||0), 0));
  const keluarData = months.map(m => data.filter(t => t.type==='keluar' && (t.date||'').startsWith(m)).reduce((s,t) => s+(parseFloat(t.amount)||0), 0));
  const isEmpty = masukData.every(v=>v===0) && keluarData.every(v=>v===0);
  return { masukData, keluarData, isEmpty };
}

function createChart(ctx, labels, masukData, keluarData, isEmpty) {
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: isEmpty ? 'No Activity' : 'Pemasukan',   data: masukData,  borderColor:'#4ade80', backgroundColor:'rgba(74,222,128,.1)',  tension:.4, fill:true, pointRadius:4, pointBackgroundColor:'#4ade80' },
        { label: isEmpty ? 'No Activity' : 'Pengeluaran', data: keluarData, borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,.08)', tension:.4, fill:true, pointRadius:4, pointBackgroundColor:'#ef4444' },
      ],
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: {
        legend: { labels:{ color:'#888', font:{ size:11, family:"'Plus Jakarta Sans',sans-serif" }, boxWidth:12 } },
        tooltip: { callbacks:{ label: ctx => ' ' + fmtRp(ctx.raw) } },
      },
      scales: {
        x: { ticks:{ color:'#666', font:{ size:10 } }, grid:{ color:'rgba(255,255,255,.04)' } },
        y: { ticks:{ color:'#666', font:{ size:10 }, callback: v => v>=1e6?(v/1e6).toFixed(1)+'jt':v>=1e3?(v/1e3).toFixed(0)+'rb':''+v }, grid:{ color:'rgba(255,255,255,.04)' } },
      },
    },
  });
}

function renderDashboardChart(data) {
  const placeholder = g('fin-chart-placeholder');
  if (!placeholder || typeof Chart === 'undefined') return;
  const months = getLast4Months();
  const { masukData, keluarData, isEmpty } = buildChartDatasets(data, months);
  const labels = months.map(m => new Date(m+'-02').toLocaleDateString('id-ID',{ month:'short', year:'2-digit' }));
  placeholder.innerHTML = '<canvas id="dash-chart-canvas" style="height:160px;"></canvas>';
  if (_finChart) { _finChart.destroy(); _finChart = null; }
  _finChart = createChart(g('dash-chart-canvas').getContext('2d'), labels, masukData, keluarData, isEmpty);
}

function renderFinanceChart(data) {
  const placeholder = g('fin-chart-placeholder-full');
  if (!placeholder || typeof Chart === 'undefined') return;
  const months = getLast4Months();
  const { masukData, keluarData, isEmpty } = buildChartDatasets(data, months);
  const labels = months.map(m => new Date(m+'-02').toLocaleDateString('id-ID',{ month:'short', year:'2-digit' }));
  placeholder.innerHTML = '<canvas id="fin-chart-canvas" style="height:220px;"></canvas>';
  if (window._finChartFull) { window._finChartFull.destroy(); }
  window._finChartFull = createChart(g('fin-chart-canvas').getContext('2d'), labels, masukData, keluarData, isEmpty);
}

// ── 15. NEWS MODULE ───────────────────────────────────────────────────────────────
async function loadNews() {
  const el = g('news-grid');
  el.innerHTML = '<div class="skel skel-card-tall"></div><div class="skel skel-card-tall"></div><div class="skel skel-card-tall"></div>';
  try {
    const { data, error } = await dbQ(db.from('news').select('*').order('created_at',{ascending:false}));
    if (error) throw new Error(error.message);
    allNews = data || [];
    renderNews(allNews);
  } catch (err) { el.innerHTML = errState(err.message); }
}

function renderNews(data) {
  const el = g('news-grid');
  const vis = data.filter(n => n.status==='approved' || isMod() || CU?.id===n.user_id);
  if (!vis.length) { el.innerHTML = emptyState('Belum ada berita.','fas fa-inbox'); return; }
  el.innerHTML = vis.map(n => {
    const ip = n.status==='pending';
    const canMgr = isMod() && CU?.id !== n.user_id;
    const canOwn = isOK() || CU?.id === n.user_id;
    return `<div class="news-card ${ip?'card-pending':''}">
      ${n.image_url?`<div class="nc-img" onclick="openLB('${n.image_url}','${esc(n.title)}')"><img src="${n.image_url}" alt="${esc(n.title)}" loading="lazy"></div>`:''}
      <div class="nc-body">
        <div class="nc-meta">
          <span class="cat-badge cat-${n.category||'info'}">${n.category||'info'}</span>
          ${ip?'<span class="pending-badge"><i class="fas fa-clock"></i> PENDING</span>':''}
          <span class="nc-date"><i class="fas fa-clock"></i> ${fmtDate(n.created_at)}</span>
        </div>
        <div class="nc-title">${esc(n.title)}</div>
        <div class="nc-excerpt">${esc((n.content||'').slice(0,180))}${(n.content||'').length>180?'...':''}</div>
        <div class="card-actions">
          ${canMgr&&ip?`<button class="btn-approve" onclick="approveItem('news','${n.id}')"><i class="fas fa-check"></i> Setujui</button><button class="btn-reject" onclick="rejectItem('news','${n.id}','${n.image_url||''}')"><i class="fas fa-times"></i> Tolak</button>`:''}
          ${canOwn?`<button class="btn-edit-xs" onclick="editNews('${n.id}')"><i class="fas fa-edit"></i></button><button class="btn-del-xs" onclick="deleteNews('${n.id}','${n.image_url||''}')"><i class="fas fa-trash"></i></button>`:''}
        </div>
      </div>
    </div>`;
  }).join('');
}

function filterNews() {
  const s = gv('news-search').toLowerCase(), c = gv('news-cat-filter');
  renderNews(allNews.filter(n => (!s||(n.title+n.content).toLowerCase().includes(s)) && (!c||n.category===c)));
}

function openNewsModal(data = null) {
  if (!loggedIn()) { showAuthModal(); return; }
  g('news-modal-title').innerHTML = data ? '<i class="fas fa-edit"></i> EDIT BERITA' : '<i class="fas fa-newspaper"></i> TAMBAH BERITA';
  g('news-form').reset(); sv('news-edit-id',''); g('news-img-prev-wrap').style.display='none';
  if (data) {
    sv('news-edit-id', data.id); sv('news-title', data.title||'');
    sv('news-cat', data.category||'pengumuman'); sv('news-content', data.content||'');
    if (data.image_url) { g('news-img-prev-wrap').style.display=''; g('news-img-prev').src=data.image_url; }
  }
  openModal('news-modal');
}

async function editNews(id) {
  const { data } = await db.from('news').select('*').eq('id',id).single();
  if (data) openNewsModal(data);
}

async function handleSaveNews(e) {
  e.preventDefault();
  const btn = g('news-save-btn'); btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>';
  try {
    const editId = gv('news-edit-id'), imgFile = g('news-img-file').files[0];
    let image_url = null;
    if (imgFile) image_url = await uploadMedia(imgFile, 'news');
    const pl = { title:gv('news-title'), category:gv('news-cat'), content:gv('news-content'), user_id:CU.id, status:isMod()?'approved':'pending', ...(image_url && {image_url}) };
    const { error } = editId ? await db.from('news').update(pl).eq('id',editId) : await db.from('news').insert(pl);
    if (error) throw new Error(error.message);
    showToast(editId ? 'Berita diperbarui!' : 'Berita ditambahkan! Menunggu review mod.', 'success');
    closeModal('news-modal'); loadNews(); loadNewsPreview();
  } catch (err) { showToast('Gagal simpan: ' + (err.message||'terjadi kesalahan'), 'error'); }
  finally { btn.disabled=false; btn.innerHTML='<i class="fas fa-save"></i> Simpan'; }
}

async function deleteNews(id, imgUrl) {
  showConfirm('Hapus Berita', 'Yakin ingin menghapus berita ini secara permanen?', async () => {
    if (imgUrl) { const p = imgUrl.split('/news/')[1]; if(p) await db.storage.from('news').remove([p]); }
    const { error } = await db.from('news').delete().eq('id',id);
    if (error) { showToast('Gagal hapus: '+error.message, 'error'); return; }
    showToast('Berita dihapus.', 'info'); loadNews(); loadNewsPreview();
  });
}

// ── 16. PRODUCTS MODULE ─────────────────────────────────────────────────────────────
function buildWALink(phone, productName) {
  const msg = encodeURIComponent(`Halo, saya tertarik dengan produk ${productName} yang saya lihat di Dashboard ANJUNKU`);
  return `https://wa.me/${phone.replace(/\D/g,'')}?text=${msg}`;
}

async function loadProducts() {
  const el = g('products-grid');
  el.innerHTML = '<div class="skel skel-card"></div><div class="skel skel-card"></div><div class="skel skel-card"></div><div class="skel skel-card"></div>';
  try {
    const { data, error } = await dbQ(db.from('products').select('*').order('created_at',{ascending:false}));
    if (error) throw new Error(error.message);
    allProds = data || [];
    renderProducts(allProds);
  } catch (err) { el.innerHTML = errState(err.message); }
}

function renderProducts(data) {
  const el = g('products-grid');
  const vis = data.filter(p => p.status==='approved' || isMod() || CU?.id===p.user_id);
  if (!vis.length) { el.innerHTML = emptyState('Belum ada produk.','fas fa-box-open'); return; }
  el.innerHTML = vis.map(p => {
    const ip = p.status==='pending';
    const canMgr = isMod() && CU?.id !== p.user_id;
    const canOwn = isOK() || CU?.id === p.user_id;
    const waLink = p.whatsapp_link ? buildWALink(p.whatsapp_link, p.name) : null;
    return `<div class="product-card ${ip?'card-pending':''}">
      <div class="pc-img" onclick="${p.image_url?`openLB('${p.image_url}','${esc(p.name)}')`:''} ">
        ${p.image_url?`<img src="${p.image_url}" alt="${esc(p.name)}" loading="lazy">`:'<div class="pc-noimg"><i class="fas fa-box-open fa-3x"></i></div>'}
        ${ip?'<div class="pending-ov"><i class="fas fa-clock"></i> PENDING</div>':''}
      </div>
      <div class="pc-body">
        <span class="cat-badge cat-${p.category||'lainnya'}">${p.category||'lainnya'}</span>
        <div class="pc-name">${esc(p.name)}</div>
        <div class="pc-desc">${esc((p.description||'').slice(0,90))}${(p.description||'').length>90?'...':''}</div>
        <div class="pc-footer">
          <span class="pc-price">${fmtRp(p.price)}</span>
          <div class="card-actions">
            ${waLink?`<a href="${waLink}" target="_blank" rel="noopener" class="btn-wa"><i class="fab fa-whatsapp"></i> Beli</a>`:''}
            ${canMgr&&ip?`<button class="btn-approve" onclick="approveItem('products','${p.id}')"><i class="fas fa-check"></i></button><button class="btn-reject" onclick="rejectItem('products','${p.id}','${p.image_url||''}')"><i class="fas fa-times"></i></button>`:''}
            ${canOwn?`<button class="btn-edit-xs" onclick="editProduct('${p.id}')"><i class="fas fa-edit"></i></button><button class="btn-del-xs" onclick="deleteProduct('${p.id}','${p.image_url||''}')"><i class="fas fa-trash"></i></button>`:''}
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function filterProducts() {
  const s = gv('prod-search').toLowerCase(), c = gv('prod-cat-filter');
  renderProducts(allProds.filter(p => (!s||(p.name+p.description).toLowerCase().includes(s)) && (!c||p.category===c)));
}

function openProductModal(data = null) {
  if (!loggedIn()) { showAuthModal(); return; }
  g('product-modal-title').innerHTML = data ? '<i class="fas fa-edit"></i> EDIT PRODUK' : '<i class="fas fa-box-open"></i> TAMBAH PRODUK';
  g('product-form').reset(); sv('prod-edit-id',''); g('prod-img-prev-wrap').style.display='none';
  if (data) {
    sv('prod-edit-id',data.id); sv('prod-name',data.name||''); sv('prod-cat',data.category||'lainnya');
    sv('prod-desc',data.description||''); sv('prod-price',data.price||''); sv('prod-wa',data.whatsapp_link||'');
    if (data.image_url) { g('prod-img-prev-wrap').style.display=''; g('prod-img-prev').src=data.image_url; }
  }
  openModal('product-modal');
}

async function editProduct(id) {
  const { data } = await db.from('products').select('*').eq('id',id).single();
  if (data) openProductModal(data);
}

async function handleSaveProduct(e) {
  e.preventDefault();
  const btn = g('prod-save-btn'); btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>';
  try {
    const editId = gv('prod-edit-id'), imgFile = g('prod-img-file').files[0];
    let image_url = null;
    if (imgFile) image_url = await uploadMedia(imgFile, 'products');
    const pl = { name:gv('prod-name'), category:gv('prod-cat'), description:gv('prod-desc'), price:parseFloat(gv('prod-price'))||0, whatsapp_link:gv('prod-wa'), user_id:CU.id, status:isMod()?'approved':'pending', ...(image_url&&{image_url}) };
    const { error } = editId ? await db.from('products').update(pl).eq('id',editId) : await db.from('products').insert(pl);
    if (error) throw new Error(error.message);
    showToast('Produk berhasil disimpan!', 'success');
    closeModal('product-modal'); loadProducts(); loadProductsPreview();
  } catch (err) { showToast('Gagal simpan: '+(err.message||'terjadi kesalahan'), 'error'); }
  finally { btn.disabled=false; btn.innerHTML='<i class="fas fa-save"></i> Simpan'; }
}

async function deleteProduct(id, imgUrl) {
  showConfirm('Hapus Produk', 'Yakin ingin menghapus produk ini?', async () => {
    if (imgUrl) { const p = imgUrl.split('/products/')[1]; if(p) await db.storage.from('products').remove([p]); }
    const { error } = await db.from('products').delete().eq('id',id);
    if (error) { showToast('Gagal hapus: '+error.message, 'error'); return; }
    showToast('Produk dihapus.', 'info'); loadProducts(); loadProductsPreview();
  });
}

// ── 17. FINANCE MODULE ─────────────────────────────────────────────────────────────
async function loadFinance() {
  const tbody = g('finance-table-body');
  tbody.innerHTML = '<tr><td colspan="8" class="loading-cell"><i class="fas fa-spinner fa-spin"></i> Memuat data...</td></tr>';
  try {
    const { data, error } = await dbQ(db.from('transactions').select('*').order('date',{ascending:false}));
    if (error) throw new Error(error.message);
    allTrx = data || [];
    calcFinSummary(allTrx);
    renderTrx(allTrx);
    renderFinanceChart(allTrx);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="loading-cell"><i class="fas fa-exclamation-triangle" style="color:var(--red)"></i> ${err.message}</td></tr>`;
  }
}

function calcFinSummary(data) {
  let m=0, k=0;
  (data||[]).forEach(t => { const a=parseFloat(t.amount)||0; t.type==='masuk'?m+=a:k+=a; });
  sv2('fs-saldo',  fmtRp(m-k));
  sv2('fs-masuk',  fmtRp(m));
  sv2('fs-keluar', fmtRp(k));
  sv2('fs-count',  (data||[]).length);
}

function renderTrx(data) {
  const showAksi = isTrio();
  const tbody = g('finance-table-body');
  if (!data.length) { tbody.innerHTML=`<tr><td colspan="${showAksi?8:7}" class="loading-cell">Belum ada transaksi.</td></tr>`; return; }
  tbody.innerHTML = data.map(t => `
    <tr>
      <td>${fmtDate(t.date)}</td>
      <td><span class="type-badge ${t.type}">${t.type==='masuk'?'<i class="fas fa-arrow-up"></i>':'<i class="fas fa-arrow-down"></i>'} ${t.type}</span></td>
      <td>${esc(t.description||'–')}</td>
      <td><span class="cat-tag">${t.category||'–'}</span></td>
      <td class="${t.type==='masuk'?'text-green':'text-red'} mono">${fmtRp(t.amount)}</td>
      <td class="text-muted">${esc(t.notes||'–')}</td>
      <td>${t.bukti_url?`<a href="${t.bukti_url}" target="_blank" class="btn-proof"><i class="fas fa-paperclip"></i> Lihat</a>`:`–`}</td>
      ${showAksi?`<td><button class="btn-edit-xs" onclick="editTrx('${t.id}')"><i class="fas fa-edit"></i></button> <button class="btn-del-xs" onclick="deleteTrx('${t.id}','${t.bukti_url||''}')"><i class="fas fa-trash"></i></button></td>`:''}
    </tr>`).join('');
}

function filterTransactions() {
  const s = gv('fin-search').toLowerCase(), tp = gv('fin-type-filter'), mo = gv('fin-month-filter');
  const f = allTrx.filter(t => (!s||(t.description+t.category).toLowerCase().includes(s)) && (!tp||t.type===tp) && (!mo||(t.date||'').startsWith(mo)));
  calcFinSummary(f); renderTrx(f);
}

function openTransactionModal(data = null) {
  if (!isTrio()) { showToast('Akses ditolak. Hanya Owner/Ketua/Bendahara.', 'error'); return; }
  g('trx-modal-title').innerHTML = data ? '<i class="fas fa-edit"></i> EDIT TRANSAKSI' : '<i class="fas fa-plus-circle"></i> TAMBAH TRANSAKSI';
  g('transaction-form').reset(); sv('trx-edit-id',''); g('trx-prev-wrap').style.display='none';
  sv('trx-date', new Date().toISOString().slice(0,10));
  if (data) {
    sv('trx-edit-id',data.id); sv('trx-type',data.type||'masuk'); sv('trx-date',data.date||'');
    sv('trx-desc',data.description||''); sv('trx-cat',data.category||'iuran');
    sv('trx-amount',data.amount||''); sv('trx-notes',data.notes||'');
  }
  openModal('transaction-modal');
}

async function editTrx(id) {
  const { data } = await db.from('transactions').select('*').eq('id',id).single();
  if (data) openTransactionModal(data);
}

async function handleSaveTransaction(e) {
  e.preventDefault();
  if (!isTrio()) { showToast('Akses ditolak.', 'error'); return; }
  // Capture values before showing confirm dialog
  const editId = gv('trx-edit-id');
  const type   = gv('trx-type');
  const amount = parseFloat(gv('trx-amount')) || 0;
  const desc   = gv('trx-desc').trim();
  const cat    = gv('trx-cat');
  const date   = gv('trx-date');
  const notes  = gv('trx-notes');
  const label  = type === 'masuk' ? 'pemasukan' : 'pengeluaran';

  showConfirm(
    'Konfirmasi Transaksi',
    `Apakah benar ${label} sebesar <strong>${fmtRp(amount)}</strong> untuk <strong>${esc(desc)}</strong> (${cat})?`,
    async () => {
      const btn = g('trx-save-btn'); btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>';
      try {
        const buktiFile = g('trx-bukti-file').files[0];
        let bukti_url = null;
        if (buktiFile) bukti_url = await uploadMedia(buktiFile, 'transactions');
        const pl = { type, date, description:desc, category:cat, amount, notes, user_id:CU.id, ...(bukti_url&&{bukti_url}) };
        const { error } = editId ? await db.from('transactions').update(pl).eq('id',editId) : await db.from('transactions').insert(pl);
        if (error) throw new Error(error.message);
        showToast('Transaksi berhasil disimpan!', 'success');
        closeModal('transaction-modal'); loadFinance(); loadFinanceOverview();
      } catch (err) { showToast('Gagal simpan: '+(err.message||'koneksi gagal'), 'error'); }
      finally { g('trx-save-btn').disabled=false; g('trx-save-btn').innerHTML='<i class="fas fa-save"></i> Simpan'; }
    }
  );
}

async function deleteTrx(id, buktiUrl) {
  showConfirm('Hapus Transaksi', 'Yakin ingin menghapus transaksi ini? Aksi tidak bisa dibatalkan.', async () => {
    if (buktiUrl) { const p = buktiUrl.split('/transactions/')[1]; if(p) await db.storage.from('transactions').remove([p]); }
    const { error } = await db.from('transactions').delete().eq('id',id);
    if (error) { showToast('Gagal hapus: '+error.message, 'error'); return; }
    showToast('Transaksi dihapus.', 'info'); loadFinance(); loadFinanceOverview();
  });
}

// ── 18. GALLERY MODULE ─────────────────────────────────────────────────────────────
async function loadGallery() {
  const el = g('gallery-grid');
  el.innerHTML = '<div class="skel skel-gal"></div><div class="skel skel-gal"></div><div class="skel skel-gal"></div><div class="skel skel-gal"></div>';
  let data;
  try { ({ data } = await dbQ(db.from('gallery').select('*').order('created_at',{ascending:false}))); }
  catch (err) { el.innerHTML = errState(err.message); return; }
  const vis = (data||[]).filter(gi => gi.status==='approved' || isMod() || CU?.id===gi.user_id);
  if (!vis.length) { el.innerHTML = emptyState('Belum ada foto galeri.','fas fa-images'); return; }
  el.innerHTML = vis.map(gi => {
    const ip = gi.status==='pending';
    const canMgr = isMod() && CU?.id !== gi.user_id;
    const canOwn = isOK() || CU?.id === gi.user_id;
    return `<div class="gal-item ${ip?'gal-pending':''}">
      <img src="${gi.image_url}" alt="${esc(gi.title||'')}" loading="lazy" onclick="openLB('${gi.image_url}','${esc(gi.title||'')}')">
      <div class="gal-overlay">${esc(gi.title||'Foto Kegiatan')} ${ip?'<span class="pending-badge">PENDING</span>':''}</div>
      <div class="gal-actions">
        ${canMgr&&ip?`<button class="btn-approve" onclick="approveItem('gallery','${gi.id}');event.stopPropagation()"><i class="fas fa-check"></i></button><button class="btn-reject" onclick="rejectItem('gallery','${gi.id}','${gi.image_url||''}');event.stopPropagation()"><i class="fas fa-times"></i></button>`:''}
        ${canOwn?`<button class="btn-del-xs" onclick="deleteGallery('${gi.id}','${gi.image_url||''}');event.stopPropagation()"><i class="fas fa-trash"></i></button>`:''}
      </div>
    </div>`;
  }).join('');
}

function openGalleryModal() {
  if (!loggedIn()) { showAuthModal(); return; }
  g('gallery-form').reset(); g('gal-prev-wrap').style.display='none';
  openModal('gallery-modal');
}

async function handleSaveGallery(e) {
  e.preventDefault();
  const btn = g('gal-save-btn'); btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>';
  try {
    const imgFile = g('gal-img-file').files[0];
    if (!imgFile) throw new Error('Pilih foto terlebih dahulu.');
    const imgUrl = await uploadMedia(imgFile, 'gallery');
    const { error } = await db.from('gallery').insert({ title:gv('gal-title'), image_url:imgUrl, user_id:CU.id, status:isMod()?'approved':'pending' });
    if (error) throw new Error(error.message);
    showToast('Foto berhasil diupload!', 'success');
    closeModal('gallery-modal'); loadGallery();
  } catch (err) { showToast('Gagal upload: '+(err.message||'terjadi kesalahan'), 'error'); }
  finally { btn.disabled=false; btn.innerHTML='<i class="fas fa-upload"></i> Upload'; }
}

async function deleteGallery(id, imgUrl) {
  showConfirm('Hapus Foto', 'Yakin ingin menghapus foto ini?', async () => {
    if (imgUrl) { const p = imgUrl.split('/gallery/')[1]; if(p) await db.storage.from('gallery').remove([p]); }
    const { error } = await db.from('gallery').delete().eq('id',id);
    if (error) { showToast('Gagal hapus: '+error.message, 'error'); return; }
    showToast('Foto dihapus.', 'info'); loadGallery();
  });
}

// ── 19. APPROVE / REJECT ──────────────────────────────────────────────────────────
async function approveItem(table, id) {
  const { error } = await db.from(table).update({ status:'approved' }).eq('id',id);
  if (error) { showToast('Gagal approve: '+error.message, 'error'); return; }
  showToast('Item disetujui!', 'success');
  if (table==='news') loadNews(); else if (table==='products') loadProducts(); else loadGallery();
}

async function rejectItem(table, id, imgUrl) {
  showConfirm('Tolak Item', 'Tolak & hapus item ini secara permanen?', async () => {
    if (imgUrl) { const p = imgUrl.split('/'+table+'/')[1]; if(p) await db.storage.from(table).remove([p]); }
    const { error } = await db.from(table).delete().eq('id',id);
    if (error) { showToast('Gagal reject: '+error.message, 'error'); return; }
    showToast('Item ditolak & dihapus.', 'info');
    if (table==='news') loadNews(); else if (table==='products') loadProducts(); else loadGallery();
  });
}

// ── 20. ANGGOTA MODULE ─────────────────────────────────────────────────────────────
async function loadAnggota() {
  const el = g('members-grid');
  el.innerHTML = '<div class="skel skel-member"></div><div class="skel skel-member"></div><div class="skel skel-member"></div><div class="skel skel-member"></div>';
  let data, error;
  try { ({ data, error } = await dbQ(db.from('profiles').select('*'))); }
  catch (err) { el.innerHTML = errState(err.message); return; }
  if (error) { el.innerHTML = errState(error.message); return; }
  if (!data?.length) {
    el.innerHTML = emptyState('Belum ada anggota.','fas fa-user-slash');
    const tb = g('user-mgmt-body'); if(tb) tb.innerHTML='<tr><td colspan="6" class="loading-cell">Belum ada data.</td></tr>';
    return;
  }
  el.innerHTML = data.map(m => {
    const r = m.email===OWNER_EMAIL ? 'owner' : (m.role||'anggota');
    return `<div class="member-card" onclick='showMemberModal(${JSON.stringify(m).replace(/'/g,"&#39;")})'>
      <div class="mc-av-wrap"><img src="${m.avatar_url||avFallback(m.full_name||'A')}" class="mc-av" loading="lazy"><div class="mc-rdot role-${r}"></div></div>
      <div class="mc-name">${esc(m.full_name||m.username||'Anggota')}</div>
      <span class="mc-role role-${r}">${r.toUpperCase()}</span>
      <div class="mc-bio">${esc((m.bio||'Warga Anjun').slice(0,60))}</div>
    </div>`;
  }).join('');

  if (isOK()) {
    const tbody = g('user-mgmt-body');
    if (tbody) tbody.innerHTML = data.map(m => {
      const r = m.email===OWNER_EMAIL ? 'owner' : (m.role||'anggota');
      const self = CU?.id === m.id;
      return `<tr>
        <td><div class="tbl-user"><img src="${m.avatar_url||avFallback(m.full_name||'A')}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;" loading="lazy"> ${esc(m.full_name||'–')}</div></td>
        <td class="text-muted">${esc(m.email||'–')}</td>
        <td>@${esc(m.username||'–')}</td>
        <td><span class="role-badge role-${r}">${r.toUpperCase()}</span></td>
        <td>${esc(m.phone||'–')}</td>
        <td>
          ${self?'<span class="text-muted" style="font-size:.72rem">Kamu</span>':''}
          ${!self&&isOwner()&&r!=='owner'?`<button class="btn-edit-xs" onclick="setRole('${m.id}','ketua')" title="Jadikan Ketua"><i class="fas fa-crown"></i></button> `:''}
          ${!self&&isOwner()&&r==='ketua'?`<button class="btn-del-xs" onclick="setRole('${m.id}','anggota')" title="Turunkan"><i class="fas fa-user-minus"></i></button> `:''}
          ${!self&&isKetua()&&!['owner','ketua'].includes(r)?`<select class="role-select-sm" onchange="setRole('${m.id}',this.value);this.value=''"><option value="">Ubah Role</option><option value="admin">Admin</option><option value="bendahara">Bendahara</option><option value="anggota">Anggota</option></select>`:''}
        </td>
      </tr>`;
    }).join('');
  }
  loadLeaderboard(data);
}

async function loadLeaderboard(profiles) {
  const el = g('leaderboard-list');
  if (!el) return;
  try {
    const [{ data:trxD }, { data:newsD }, { data:prodD }, { data:galD }] = await Promise.all([
      db.from('transactions').select('user_id'),
      db.from('news').select('user_id'),
      db.from('products').select('user_id'),
      db.from('gallery').select('user_id'),
    ]);
    const scores = {};
    (trxD||[]).forEach(r => { scores[r.user_id] = (scores[r.user_id]||0) + 3; });
    (newsD||[]).forEach(r => { scores[r.user_id] = (scores[r.user_id]||0) + 2; });
    (prodD||[]).forEach(r => { scores[r.user_id] = (scores[r.user_id]||0) + 2; });
    (galD||[]).forEach(r =>  { scores[r.user_id] = (scores[r.user_id]||0) + 1; });
    const ranked = [...profiles].map(p => ({ ...p, score:scores[p.id]||0 })).sort((a,b) => b.score-a.score).slice(0,10);
    const medals = ['🥇','🥈','🥉'];
    el.innerHTML = ranked.map((m,i) => {
      const r = m.email===OWNER_EMAIL ? 'owner' : (m.role||'anggota');
      return `<div class="lb-item">
        <span class="lb-rank">${medals[i]||i+1}</span>
        <img src="${m.avatar_url||avFallback(m.full_name||'A')}" class="lb-av" loading="lazy">
        <span class="lb-name">${esc(m.full_name||m.username||'Anggota')}</span>
        <span class="role-badge role-${r}" style="font-size:.58rem;">${r.toUpperCase()}</span>
        <span class="lb-score">${m.score} poin</span>
      </div>`;
    }).join('');
  } catch (_) { el.innerHTML = '<div class="empty-mini">Leaderboard tidak tersedia.</div>'; }
}

async function setRole(uid, newRole) {
  if (!isOK()) return;
  showConfirm('Ubah Role', `Ubah role anggota ini menjadi <strong>"${newRole}"</strong>?`, async () => {
    const { error } = await db.from('profiles').update({ role:newRole }).eq('id',uid);
    if (error) { showToast('Gagal ubah role: '+error.message, 'error'); return; }
    showToast('Role berhasil diubah!', 'success'); loadAnggota();
  });
}

function showMemberModal(m) {
  const r = m.email===OWNER_EMAIL ? 'owner' : (m.role||'anggota');
  g('mm-av').src   = m.avatar_url || avFallback(m.full_name||'A');
  sv2('mm-name',  m.full_name||m.username||'Anggota');
  sv2('mm-uname', '@'+(m.username||'–'));
  sv2('mm-bio',   m.bio||'Warga Anjun Generation.');
  g('mm-role').textContent = r.toUpperCase();
  g('mm-role').className   = `mm-role-pill role-${r}`;
  g('mm-meta').innerHTML   = `<i class="fas fa-map-marker-alt"></i> ${m.location||'Desa Anjun'}`;
  // QR Code
  const qrEl = g('mm-qr');
  if (qrEl) {
    const url = `${location.origin}${location.pathname}?member=${m.id}`;
    qrEl.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&color=4ade80&bgcolor=0a0f08&data=${encodeURIComponent(url)}" alt="QR" style="border-radius:8px;display:block;">`;
  }
  openModal('member-modal');
}

async function downloadMemberQR() {
  const qrImg = g('mm-qr')?.querySelector('img');
  if (!qrImg) return;
  try {
    const resp = await fetch(qrImg.src);
    const blob = await resp.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `qr-${(g('mm-name').textContent||'member').replace(/\s+/g,'-')}.png`;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (_) { showToast('Gagal unduh QR Code.', 'error'); }
}

// ── 21. TICKER MODULE ───────────────────────────────────────────────────────────────
async function loadTicker() {
  let items = [];
  const { data:tickers } = await db.from('tickers').select('content').order('created_at',{ascending:false});
  if (tickers?.length) items = tickers.map(t => t.content);
  if (!items.length) {
    const { data:n } = await db.from('news').select('title').eq('status','approved').order('created_at',{ascending:false}).limit(5);
    if (n?.length) items = n.map(x => '📰 '+x.title);
  }
  if (!items.length) {
    const { data:i } = await db.from('app_info').select('description,vision').eq('id',1).single();
    if (i) { if(i.description) items.push('ℹ️ '+i.description); if(i.vision) items.push('👁️ Visi: '+i.vision); }
  }
  if (!items.length) items = ['🌿 Selamat datang di ANJUNKU — Portal Digital Komunitas Desa Anjun'];
  const track = g('tickerTrack');
  const html = items.map(i => `<span class="ticker-item"><i class="fas fa-diamond"></i> ${esc(i)}</span>`).join('');
  track.innerHTML = html + html;
}

async function loadTickerList() {
  const { data } = await db.from('tickers').select('*').order('created_at',{ascending:false});
  const el = g('ticker-list-wrap');
  if (!data?.length) { el.innerHTML='<div class="empty-mini">Belum ada ticker kustom.</div>'; return; }
  el.innerHTML = data.map(t => `<div class="ticker-list-item"><span>${esc(t.content)}</span><button class="btn-del-xs" onclick="deleteTicker('${t.id}')"><i class="fas fa-trash"></i></button></div>`).join('');
}

async function addTicker() {
  const val = gv('new-ticker-txt').trim(); if (!val) return;
  const { error } = await db.from('tickers').insert({ content:val, user_id:CU?.id });
  if (error) { showToast('Gagal tambah ticker: '+error.message, 'error'); return; }
  sv('new-ticker-txt',''); loadTickerList(); loadTicker();
}

async function deleteTicker(id) {
  const { error } = await db.from('tickers').delete().eq('id',id);
  if (error) { showToast('Gagal hapus: '+error.message, 'error'); return; }
  loadTickerList(); loadTicker();
}

// ── 22. SPONSOR MODULE ─────────────────────────────────────────────────────────────
function _weightedPick(sponsors) {
  if (!sponsors.length) return null;
  const total = sponsors.reduce((s,sp) => s+(sp.priority||1), 0);
  let r = Math.random() * total;
  for (const sp of sponsors) { r -= (sp.priority||1); if (r<=0) return sp; }
  return sponsors[0];
}

async function loadSponsors() {
  try {
    const { data } = await dbQ(db.from('sponsors').select('*').eq('is_active',true).order('priority',{ascending:false}));
    _sponsors = data || [];
  } catch (_) { _sponsors = []; }
  renderSponsorBanner();
  renderSponsorTicker();
  if (_sponsors.length > 1) {
    if (_sponsorTimer) clearInterval(_sponsorTimer);
    _sponsorTimer = setInterval(renderSponsorBanner, 8000);
  }
}

function renderSponsorBanner() {
  const el = g('sponsor-banner');
  if (!el) return;
  if (!_sponsors.length) {
    el.innerHTML = `<div class="sponsor-placeholder"><i class="fas fa-ad"></i> Space Iklan Tersedia &mdash; <span style="color:var(--green-muted);cursor:pointer;" onclick="showAuthModal()">Hubungi Admin</span></div>`;
    return;
  }
  const sp = _weightedPick(_sponsors);
  el.innerHTML = `<a href="${sp.website_url||'#'}" target="_blank" rel="noopener noreferrer" onclick="trackSponsorClick('${sp.id}')" class="sponsor-item">
    ${sp.logo_url?`<img src="${sp.logo_url}" alt="${esc(sp.name)}" class="sponsor-logo" loading="lazy">`:''}
    <span class="sponsor-name">${esc(sp.name)}</span>
  </a>`;
}

function renderSponsorTicker() {
  const el = g('sponsor-ticker-track');
  if (!el) return;
  if (!_sponsors.length) { el.innerHTML='<span class="spt-item" style="color:#333;font-size:.72rem;">Belum ada sponsor aktif.</span>'; return; }
  const html = _sponsors.map(sp => `
    <a href="${sp.website_url||'#'}" target="_blank" rel="noopener noreferrer" onclick="trackSponsorClick('${sp.id}')" class="spt-item" title="${esc(sp.name)}">
      ${sp.logo_url?`<img src="${sp.logo_url}" alt="${esc(sp.name)}" class="spt-logo">`:`<span class="spt-name">${esc(sp.name)}</span>`}
    </a>`).join('');
  el.innerHTML = html + html;
}

async function trackSponsorClick(id) {
  try { await db.from('sponsors').rpc('increment_click', { sponsor_id:id }); } catch (_) {}
}

// Upload logo sponsor (mod only)
async function uploadSponsorLogo(file, sponsorId) {
  if (!isMod()) throw new Error('Akses ditolak.');
  const path = `${sponsorId}_${Date.now()}.webp`;
  const processed = await processImage(file);
  const { data, error } = await db.storage.from('sponsors').upload(path, processed, { contentType:'image/webp', upsert:true });
  if (error) throw new Error('Upload gagal: '+error.message);
  const publicUrl = db.storage.from('sponsors').getPublicUrl(data.path).data.publicUrl;
  const { error:ue } = await db.from('sponsors').update({ logo_url:publicUrl }).eq('id',sponsorId);
  if (ue) throw new Error('Gagal simpan URL: '+ue.message);
  return publicUrl;
}

// ── 23. PROFILE MODULE ─────────────────────────────────────────────────────────────
function openProfileModal() {
  if (!loggedIn()) return;
  sv('prof-name',  CP.full_name||'');
  sv('prof-uname', CP.username||'');
  sv('prof-bio',   CP.bio||'');
  sv('prof-phone', CP.phone||'');
  sv('prof-loc',   CP.location||'');
  clearFile('prof-avatar-file','prof-av-prev-wrap');
  if (CP.avatar_url) { g('prof-av-prev-wrap').style.display=''; g('prof-av-prev').src=CP.avatar_url; }
  openModal('profile-modal');
}

async function handleSaveProfile(e) {
  e.preventDefault();
  const btn = g('prof-save-btn'); btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>';
  try {
    let avatar_url = CP.avatar_url || null;
    const avatarFile = g('prof-avatar-file').files[0];
    if (avatarFile) avatar_url = await uploadMedia(avatarFile, 'avatars');
    const upd = { full_name:gv('prof-name').trim(), username:gv('prof-uname').trim(), bio:gv('prof-bio').trim(), phone:gv('prof-phone').trim(), location:gv('prof-loc').trim(), avatar_url };
    const { error } = await db.from('profiles').update(upd).eq('id',CU.id);
    if (error) throw new Error(error.message);
    CP = { ...CP, ...upd }; syncUI();
    closeModal('profile-modal'); showToast('Profil berhasil diperbarui!', 'success');
  } catch (err) { showToast('Gagal simpan: '+(err.message||'terjadi kesalahan'), 'error'); }
  finally { btn.disabled=false; btn.innerHTML='<i class="fas fa-save"></i> Simpan'; }
}

// ── 24. APP INFO MODULE ────────────────────────────────────────────────────────────
async function handleSaveAppInfo(e) {
  e.preventDefault();
  try {
    const { error } = await db.from('app_info').upsert({ id:1, slogan:gv('ai-slogan'), description:gv('ai-desc'), date:gv('ai-ttl'), vision:gv('ai-vision'), mission:gv('ai-mission') });
    if (error) throw new Error(error.message);
    closeModal('appinfo-modal'); await loadAppInfo(); showToast('Info aplikasi diperbarui!', 'success');
  } catch (err) { showToast('Gagal simpan: '+err.message, 'error'); }
}

// ── 25. AUTH HANDLERS ───────────────────────────────────────────────────────────────
function showAuthModal(tab = 'login') { openModal('auth-modal'); switchAuthTab(tab); }
function switchAuthTab(tab) {
  g('login-form').style.display    = tab==='login'    ? '' : 'none';
  g('register-form').style.display = tab==='register' ? '' : 'none';
  g('tab-login').classList.toggle('active',    tab==='login');
  g('tab-register').classList.toggle('active', tab==='register');
  sv2('auth-modal-title', tab==='login' ? 'LOGIN' : 'DAFTAR AKUN');
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = g('login-btn'); btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Masuk...';
  try {
    const em = gv('l-email'), pw = gv('l-pass');
    const tout = new Promise((_,rej) => setTimeout(() => rej(new Error('Koneksi timeout (15 detik). Periksa internet lalu coba lagi.')), 15000));
    const { data, error } = await Promise.race([db.auth.signInWithPassword({ email:em, password:pw }), tout]);
    if (error) throw new Error(
      error.message.toLowerCase().includes('invalid') || error.message.toLowerCase().includes('credentials')
        ? 'Email atau password salah.'
        : error.message.toLowerCase().includes('not confirmed')
        ? 'Email belum dikonfirmasi. Hubungi admin.'
        : error.message
    );
    if (data.user) {
      CU = data.user;
      const { data:prof } = await db.from('profiles').select('*').eq('id',CU.id).single();
      if (prof) { CP = prof; }
      else {
        const meta = CU.user_metadata||{};
        CP = { id:CU.id, email:CU.email, full_name:meta.full_name||CU.email, username:meta.username||CU.email.split('@')[0], role:'anggota' };
        await db.from('profiles').upsert({ ...CP }, { onConflict:'id' });
      }
      syncUI();
    }
    closeModal('auth-modal'); loadDashboard(); showPersonalGreeting();
  } catch (err) { showToast('Login gagal: '+(err.message||'terjadi kesalahan'), 'error'); }
  finally { btn.disabled=false; btn.innerHTML='<i class="fas fa-sign-in-alt"></i> MASUK'; }
}

async function handleRegister(e) {
  e.preventDefault();
  const btn = g('reg-btn'); btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Mendaftar...';
  const nm = gv('r-name').trim(), un = gv('r-uname').trim(), em = gv('r-email').trim(), pw = gv('r-pass');
  try {
    const { data, error } = await db.auth.signUp({ email:em, password:pw, options:{ data:{ full_name:nm, username:un } } });
    if (error) {
      if (error.message.toLowerCase().includes('already')) {
        showToast('Email sudah terdaftar. Silakan login.', 'warn');
        switchAuthTab('login'); sv('l-email', em); return;
      }
      throw new Error(error.message);
    }
    if (!data.session) {
      closeModal('auth-modal');
      showToast('Pendaftaran berhasil! Cek email untuk konfirmasi.', 'success', 5000); return;
    }
    if (data.user) {
      CU = data.user;
      CP = { id:CU.id, email:em, full_name:nm, username:un, role:'anggota' };
      await db.from('profiles').upsert({ ...CP }, { onConflict:'id' });
      syncUI();
    }
    closeModal('auth-modal'); showToast('Pendaftaran berhasil! Selamat bergabung, '+nm+'!', 'success');
    loadDashboard();
  } catch (err) { showToast('Gagal daftar: '+(err.message||'terjadi kesalahan'), 'error'); }
  finally { btn.disabled=false; btn.innerHTML='<i class="fas fa-user-plus"></i> DAFTAR & MASUK'; }
}

// ── 26. PWA MODULE ──────────────────────────────────────────────────────────────────
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  if (!sessionStorage.getItem('pwa-dismissed')) show('pwa-install-banner', true);
});

window.addEventListener('appinstalled', () => {
  _deferredInstallPrompt = null;
  show('pwa-install-banner', false);
});

async function installPWA() {
  if (!_deferredInstallPrompt) return;
  _deferredInstallPrompt.prompt();
  const { outcome } = await _deferredInstallPrompt.userChoice;
  _deferredInstallPrompt = null;
  if (outcome === 'accepted') show('pwa-install-banner', false);
}

function dismissInstallBanner() {
  show('pwa-install-banner', false);
  sessionStorage.setItem('pwa-dismissed', '1');
}

// ── 27. INIT ──────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  // Initial data load
  await loadDashboard();
  await loadTicker();
  loadSponsors();
  // Periodic refresh
  setInterval(loadTicker,   5  * 60 * 1000);
  setInterval(loadSponsors, 30 * 60 * 1000);
});
