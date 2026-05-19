// ═══════════════════════════════════════════════════════════════════════════
// ANJUNKU Digital Command Center — script.js
// Build: 20260519-v42
// ═══════════════════════════════════════════════════════════════════════════

// ── 0. CONFIG & SUPABASE ────────────────────────────────────────────────
const SUPA_URL = 'https://elnmwdeckfgwfqigchjx.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsbm13ZGVja2Znd2ZxaWdjaGp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzUyMjAsImV4cCI6MjA5MjYxMTIyMH0.l0fKST9VhCcc5tdbXJLOkfXrSwRupYjbs-DCRSA2L-0';
const db       = supabase.createClient(SUPA_URL, SUPA_KEY);

// ── 1. GLOBAL STATE ──────────────────────────────────────────────────────
let CU = null, CP = null;
let allNews = [], allProds = [], allTrx = [];
let _sponsors = [], _sponsorTimer = null;
let _allMembers = [];
let _adminWA = '';
let _finChart = null;
let _finChartFull = null;
let _finTimeframe = '3B';
let _roleChannel = null;
let _logsChannel = null;
let _profileRepairInProgress = false; // anti-race guard for _repairProfileIfNeeded
let _tickerHash = ''; // hash of last rendered ticker — prevents animation restart on no-change
let _deferredInstallPrompt = null;

// Safe column selectors — no SELECT *
const PROF_COLS = 'id,email,full_name,username,role,avatar_url,bio,phone,location,division,title,show_whatsapp';
const NEWS_COLS = 'id,title,category,content,image_url,status,user_id,created_at';
const PROD_COLS = 'id,name,category,description,price,image_url,whatsapp_link,status,user_id,created_at';
const TRX_COLS  = 'id,type,date,description,category,amount,notes,bukti_url,user_id,created_at';
const GAL_COLS  = 'id,image_url,caption,status,user_id,created_at';
const TICK_COLS = 'id,content,created_at';
const SPON_COLS = 'id,name,logo_url,website_url,is_active,priority,whatsapp_number';
const AI_COLS   = 'id,welcome_title,slogan,description,date,vision,mission,admin_wa';

// ── 2. UTILITIES ───────────────────────────────────────────────────────────
const g    = id => document.getElementById(id);
const show = (id, v) => { const el = g(id); if (el) el.style.display = v ? '' : 'none'; };
const sv   = (id, v) => { const el = g(id); if (el) el.value = v; };
const sv2  = (id, v) => { const el = g(id); if (el) el.textContent = v; };
const gv   = id => { const el = g(id); return el ? el.value : ''; };
const esc  = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const dbQ  = (q, ms = 9000) => Promise.race([q, new Promise((_,rej) => setTimeout(() => rej(new Error('Server tidak merespons. Coba refresh halaman.')), ms))]);
function safeErr(err) {
  if (!err) return 'Terjadi kesalahan.';
  const c = String(err.code || '');
  if (c === '42501') return 'Anda tidak memiliki akses untuk tindakan ini.';
  if (c === '23505') return 'Data sudah ada. Gunakan nilai yang unik.';
  if (c === '23503') return 'Data referensi tidak valid.';
  if (c === 'PGRST116') return 'Data tidak ditemukan.';
  if (err.status === 401 || err.status === 403) return 'Sesi tidak valid. Silakan login ulang.';
  return 'Terjadi kesalahan. Coba lagi.';
}
// Blok payload XSS — null = berbahaya, string = aman
const _DANGER = /<script|<iframe|<object|<embed|javascript\s*:|vbscript\s*:|onerror\s*=|onclick\s*=|onload\s*=|onmouseover\s*=|eval\s*\(|data\s*:\s*text\/html/i;
const sanitizeInput = s => { const v = String(s ?? '').trim(); return _DANGER.test(v) ? null : v; };
// Blok URL berbahaya sebelum render di href/src
const safeUrl = u => { if (!u) return ''; const s = String(u).trim().toLowerCase().replace(/\s/g,''); return (s.startsWith('javascript:') || s.startsWith('vbscript:') || s.startsWith('data:text')) ? '' : String(u).trim(); };

const fmtRp = n => new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', minimumFractionDigits:0 }).format(parseFloat(n) || 0);
const fmtRpHead = n => {
  const v = parseFloat(n || 0);
  return v === 0 ? 'RP —' : 'RP ' + v.toLocaleString('id-ID');
};
const parseDate    = s => { if (!s) return null; return (s.includes('T') || s.includes(' ')) ? new Date(s) : new Date(s + 'T00:00:00'); };
const fmtDate      = s => { const d = parseDate(s); if (!d || isNaN(d)) return '–'; return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }); };
const fmtDateShort = s => { const d = parseDate(s); if (!d || isNaN(d)) return '–'; return d.toLocaleDateString('id-ID', { month:'long', year:'numeric' }); };
// Local-timezone YYYY-MM-DD — never uses toISOString() to avoid UTC shift
function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
const avFallback   = n => `https://ui-avatars.com/api/?name=${encodeURIComponent(n)}&background=0a1409&color=4ade80&size=128&bold=true`;
const emptyState   = (msg, icon) => `<div class="empty-state"><i class="${icon} fa-3x"></i><p>${msg}</p></div>`;
const errState     = () => `<div class="empty-state"><i class="fas fa-exclamation-triangle fa-2x" style="color:var(--red);"></i><p>Gagal memuat data. Coba lagi.</p></div>`;

// Centralized content status resolver — single source of truth for insert status
// owner | ketua | admin → 'approved'; bendahara | anggota | guest → 'pending'
function resolveContentStatus(module) {
  if (!loggedIn()) return 'pending';
  return isMod() ? 'approved' : 'pending';
}

// ── 3. ROLE HELPERS ─────────────────────────────────────────────────────────
const role = () => CP ? (CP.role || 'anggota') : null;
const isOwner  = () => role() === 'owner';
const isKetua  = () => role() === 'ketua';
const isBend   = () => role() === 'bendahara';
const isAdmin  = () => role() === 'admin';
const isTrio    = () => isOwner() || isKetua() || isBend();
const isMod     = () => isOwner() || isKetua() || isAdmin();
const isOK      = () => isOwner() || isKetua();
const isFinance = () => isOwner() || isBend();
const loggedIn  = () => !!CU;

function authGuard(cb, targetSec) {
  if (!loggedIn()) { if (targetSec) _saveRedirect(targetSec); showAuthModal('register'); return; }
  cb();
}
function authNavTo(sec) {
  if (!loggedIn()) { _saveRedirect(sec); showAuthModal('register'); return; }
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
  if (file.type.startsWith('image/')) {
    uploadFile = await processImage(file);
  } else {
    const mb = file.size / (1024 * 1024);
    if (mb > MAX_MB) throw new Error(`File terlalu besar (${mb.toFixed(1)} MB). Maksimum ${MAX_MB} MB.`);
  }
  const path = `${Date.now()}_${uploadFile.name}`;
  const opts = uploadFile.type === 'image/webp' ? { contentType:'image/webp' } : {};
  const { data, error } = await db.storage.from(bucket).upload(path, uploadFile, opts);
  if (error) throw new Error('Upload gagal. ' + safeErr(error));
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
db.auth.onAuthStateChange(async (event, session) => {
  if (session?.user) {
    CU = session.user;
    if (!CP) CP = { id:CU.id, email:CU.email, role:'anggota', full_name:CU.user_metadata?.full_name || CU.email };
    syncUI();
    // Token refresh / user metadata update: update CU ref only, no reload
    if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return;
    // Password recovery: show reset modal immediately, skip full profile load
    if (event === 'PASSWORD_RECOVERY') { closeModal('auth-modal'); openModal('reset-pw-modal'); return; }
    try {
      const { data: prof } = await dbQ(db.from('profiles').select(PROF_COLS).eq('id', CU.id).single(), 5000);
      if (prof) {
        CP = prof; syncUI(); showPersonalGreeting(); _subscribeRoleRefresh();
        _repairProfileIfNeeded(); // patch any NULL fields without overwriting valid data
        if (isOK()) { loadLogTerminal(); _subscribeLogTerminal(); }
      } else {
        const meta = CU.user_metadata || {};
        const fallback = { id:CU.id, email:CU.email, full_name:meta.full_name||meta.name||'', username:meta.username||CU.email.split('@')[0], role:'anggota' };
        const { error: repErr } = await db.from('profiles').upsert(fallback, { onConflict:'id' });
        if (!repErr) { CP = fallback; syncUI(); }
        else showToast('Profil tidak ditemukan. Hubungi admin.', 'warn');
      }
    } catch (_) {}
    navigateTo(_consumeRedirect() || _restoreNav());
    _startIdleManager();
  } else {
    if (_roleChannel) { db.removeChannel(_roleChannel); _roleChannel = null; }
    if (_logsChannel) { db.removeChannel(_logsChannel); _logsChannel = null; }
    CU = null; CP = null;
    syncUI();
    navigateTo('dashboard'); // guest always starts at dashboard; also saves 'dashboard' to persistence
    _stopIdleManager();
  }
});

// ── 7b. REALTIME ROLE REFRESH ──────────────────────────────────────────────────
function _subscribeRoleRefresh() {
  if (_roleChannel) { db.removeChannel(_roleChannel); _roleChannel = null; }
  if (!CU) return;
  _roleChannel = db.channel('role-' + CU.id)
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'profiles', filter:`id=eq.${CU.id}` },
      async () => {
        const { data: prof } = await dbQ(db.from('profiles').select(PROF_COLS).eq('id', CU.id).single(), 5000);
        if (prof) { CP = prof; syncUI(); }
      })
    .subscribe();
}

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
  show('sponsor-ctrl', isOK());
  show('box-log-terminal', isOK());
  show('btn-add-news',    lg);
  show('btn-add-gallery', lg);
  show('btn-add-trx',     isFinance());
  show('btn-add-product', lg);
  show('btn-submit-product', false);
  show('th-aksi', isFinance());
  show('user-mgmt-section', isOK());

  const finBadge = g('fin-access-badge');
  if (finBadge) {
    if (isFinance()) {
      finBadge.innerHTML = '<i class="fas fa-unlock"></i> FULL ACCESS';
      finBadge.className = 'readonly-pill full-access-pill';
    } else {
      finBadge.innerHTML = '<i class="fas fa-lock"></i> AKSES TERBATAS';
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
  try { localStorage.removeItem(_FIN_OV_KEY); } catch (_) {}
  await db.auth.signOut();
  if (overlay) { overlay.style.display = 'none'; document.body.style.pointerEvents = ''; }
  navigateTo('dashboard');
  // onAuthStateChange SIGNED_OUT handles CU/CP clear, syncUI, and guest loadDashboard
}

// ── 10b. IDLE AUTO-LOGOUT ─────────────────────────────────────────────────────────────
const _IDLE_MS        = 60 * 60 * 1000;   // 60 minutes
const _IDLE_THROTTLE  = 30 * 1000;        // max one timer reset per 30 s (prevents battery drain)
const _LOGOUT_BC_KEY  = 'anjunku_logout_v1'; // cross-tab broadcast key

let _idleTimer     = null;
let _idleActive    = false;
let _idleLastReset = 0;

function _resetIdleTimer() {
  const now = Date.now();
  if (now - _idleLastReset < _IDLE_THROTTLE) return; // throttle
  _idleLastReset = now;
  clearTimeout(_idleTimer);
  if (!loggedIn()) return;
  _idleTimer = setTimeout(_idleLogout, _IDLE_MS);
}

async function _idleLogout() {
  if (!loggedIn()) return;
  // Clear sensitive caches before sign-out
  try { localStorage.removeItem(_FIN_OV_KEY); } catch (_) {}
  try { sessionStorage.removeItem(_REDIR_KEY); } catch (_) {}
  // Broadcast logout to other open tabs via storage event (fires only in OTHER tabs)
  try { localStorage.setItem(_LOGOUT_BC_KEY, '1'); localStorage.removeItem(_LOGOUT_BC_KEY); } catch (_) {}
  await db.auth.signOut();
  showToast('Sesi berakhir karena tidak ada aktivitas.', 'warn', 5000);
  navigateTo('dashboard');
}

function _onIdleVisChange() {
  if (!document.hidden) _resetIdleTimer(); // tab regains focus → reset timer
}

function _onStorageLogout(e) {
  if (e.key !== _LOGOUT_BC_KEY || !loggedIn()) return;
  // Another tab triggered idle logout — silently sign out this tab too
  try { localStorage.removeItem(_FIN_OV_KEY); } catch (_) {}
  db.auth.signOut().catch(() => {});
}

function _startIdleManager() {
  if (_idleActive) { _resetIdleTimer(); return; } // already started — just reset timer
  _idleActive = true;
  ['click', 'touchstart', 'mousemove', 'keydown', 'scroll'].forEach(ev =>
    window.addEventListener(ev, _resetIdleTimer, { passive: true, capture: true })
  );
  document.addEventListener('visibilitychange', _onIdleVisChange);
  window.addEventListener('storage', _onStorageLogout);
  _resetIdleTimer();
}

function _stopIdleManager() {
  clearTimeout(_idleTimer);
  _idleTimer     = null;
  _idleLastReset = 0;
  // Leave _idleActive = true so listener functions become no-ops (loggedIn() returns false)
  // rather than risk a re-add on next login skipping the _idleActive guard
}

// ── 11. NAVIGATION ─────────────────────────────────────────────────────────────────
const SECS    = ['dashboard', 'news', 'products', 'finance', 'anggota', 'gallery'];
const LOADERS = { dashboard:loadDashboard, news:loadNews, products:loadProducts, finance:loadFinance, anggota:loadAnggota, gallery:loadGallery };

// ── Navigation persistence — saves last visited section to localStorage ──────
const _NAV_KEY    = 'anjunku_nav_v1';
const _saveNav    = s => { try { localStorage.setItem(_NAV_KEY, s); } catch (_) {} };
const _restoreNav = () => { try { const s = localStorage.getItem(_NAV_KEY); return (s && SECS.includes(s)) ? s : 'dashboard'; } catch (_) { return 'dashboard'; } };

// ── Redirect-after-login (sessionStorage — temporary, cleared after use) ──────
const _REDIR_KEY       = 'anjunku_redir_v1';
const _saveRedirect    = sec => {
  if (!sec || !SECS.includes(sec) || sec === 'dashboard') return;
  try { sessionStorage.setItem(_REDIR_KEY, sec); } catch (_) {}
};
const _consumeRedirect = () => {
  try {
    const sec = sessionStorage.getItem(_REDIR_KEY);
    sessionStorage.removeItem(_REDIR_KEY);
    return (sec && SECS.includes(sec)) ? sec : null;
  } catch (_) { return null; }
};

function navigateTo(sec) {
  _saveNav(sec);
  SECS.forEach(s => {
    const el = g(s + '-section');
    if (!el) return;
    el.style.display = s === sec ? '' : 'none';
    el.classList.toggle('active', s === sec);
  });
  document.querySelectorAll('.nav-pill[data-sec]').forEach(b =>
    b.classList.toggle('active', b.dataset.sec === sec)
  );
  document.querySelectorAll('.bn-item[data-sec]').forEach(b =>
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
function openModal(id) {
  const m = g(id);
  if (!m) return;
  m.classList.remove('modal-in');
  m.style.display = 'flex';
  requestAnimationFrame(() => requestAnimationFrame(() => m.classList.add('modal-in')));
  if (id === 'ticker-modal') loadTickerList();
  if (id === 'sponsor-modal') loadSponsorList();
}
function closeModal(id) {
  const m = g(id);
  if (!m) return;
  m.classList.remove('modal-in');
  setTimeout(() => { if (!m.classList.contains('modal-in')) m.style.display = 'none'; }, 220);
}
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
    const { data } = await dbQ(db.from('app_info').select(AI_COLS).eq('id', 1).single());
    if (!data) return;
    _adminWA = data.admin_wa || '';
    if (data.welcome_title) sv2('hero-welcome-txt', data.welcome_title);
    if (data.slogan)        sv2('hero-badge-txt', data.slogan);
    if (data.description) sv2('hero-desc', data.description);
    if (data.date)        sv2('stat-ttl', data.date);
    if (data.vision)      sv2('vision-text', data.vision);
    if (data.mission) {
      const mEl = g('mission-text');
      if (mEl) mEl.innerHTML = data.mission.split('\n').filter(l => l.trim())
        .map(l => `<li><i class="fas fa-check-circle"></i> ${esc(l.trim())}</li>`).join('');
    }
    sv('ai-welcome', data.welcome_title || '');
    sv('ai-admin-wa', data.admin_wa || '');
    sv('ai-slogan', data.slogan || '');
    sv('ai-desc', data.description || '');
    sv('ai-ttl', data.date || '');
    sv('ai-vision', data.vision || '');
    sv('ai-mission', data.mission || '');
    // Hero CTA: render WA button or website link based on admin_wa content
    const heroCta = g('hero-cta');
    if (heroCta) {
      const contact = parseAdminContact(_adminWA);
      if (contact) {
        const isWA = contact.type === 'wa';
        heroCta.innerHTML = `<a href="${contact.href}" target="_blank" rel="noopener noreferrer" class="${isWA ? 'btn-wa' : 'hero-cta-link'}"><i class="${isWA ? 'fab fa-whatsapp' : 'fas fa-external-link-alt'}"></i> ${isWA ? 'Hubungi Admin' : 'Kunjungi Website'}</a>`;
        heroCta.style.display = '';
      } else {
        heroCta.innerHTML = '';
        heroCta.style.display = 'none';
      }
    }
  } catch (_) {}
}

async function loadStats() {
  try {
    const [{ count:mc }, { count:pc }] = await dbQ(Promise.all([
      db.from('profiles').select('id', { count:'exact', head:true }),
      db.from('products').select('id', { count:'exact', head:true }),
    ]));
    sv2('stat-members',  mc ?? '–');
    sv2('stat-products', pc ?? '–');
  } catch (_) {}
}

async function loadNewsPreview() {
  const el = g('news-preview-list');
  el.innerHTML = '<div class="skel skel-row"></div><div class="skel skel-row"></div><div class="skel skel-row"></div>';
  let data;
  try { ({ data } = await dbQ(db.from('news').select(NEWS_COLS).eq('status','approved').order('created_at',{ascending:false}).limit(4))); } catch (_) { return; }
  if (!data?.length) { el.innerHTML = '<div class="empty-mini"><i class="fas fa-inbox"></i>&nbsp; Belum ada berita.</div>'; return; }
  el.innerHTML = data.map(n => `
    <div class="npi" onclick="authGuard(() => navigateTo('news'), 'news')">
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
  try { ({ data } = await dbQ(db.from('products').select(PROD_COLS).eq('status','approved').order('created_at',{ascending:false}).limit(4))); } catch (_) { return; }
  if (!data?.length) { el.innerHTML = '<div class="empty-mini"><i class="fas fa-box-open"></i>&nbsp; Belum ada produk.</div>'; return; }
  el.innerHTML = data.map(p => `
    <div class="ppc" onclick="authGuard(() => navigateTo('products'), 'products')">
      <div class="ppc-img">${p.image_url?`<img src="${p.image_url}" alt="${esc(p.name)}" loading="lazy">`:'<div class="ppc-noimg"><i class="fas fa-box-open fa-2x"></i></div>'}</div>
      <div class="ppc-info"><strong>${esc(p.name)}</strong><div class="ppc-price">${fmtRp(p.price)}</div></div>
    </div>`).join('');
}

const _FIN_OV_KEY = 'anjunku_fin_ov_v1';
const _FIN_OV_TTL = 2 * 60 * 60 * 1000;

function _cacheFinOv(payload) {
  try { localStorage.setItem(_FIN_OV_KEY, JSON.stringify({ ...payload, ts: Date.now() })); } catch (_) {}
}

function _loadFinOvCache() {
  try {
    const raw = localStorage.getItem(_FIN_OV_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return (Date.now() - obj.ts < _FIN_OV_TTL) ? obj : null;
  } catch (_) { return null; }
}

async function loadFinanceOverview() {
  if (!isFinance()) return;

  let viewData = null, recentTrx = null, fromCache = false;

  try {
    const [vRes, tRes] = await Promise.all([
      dbQ(db.from('finance_monthly_summary').select('month,income_total,expense_total,trx_count').order('month',{ascending:true})),
      dbQ(db.from('transactions').select('type,amount,date,description').order('date',{ascending:false}).limit(6))
    ]);
    viewData  = vRes.data  || [];
    recentTrx = tRes.data  || [];
    if (viewData.length) _cacheFinOv({ viewData, recentTrx });
  } catch (e) {
    if (e?.code === '42501') return;
    const c = _loadFinOvCache();
    if (c) { viewData = c.viewData; recentTrx = c.recentTrx; fromCache = true; }
  }

  if (!viewData) return;

  let m = 0, k = 0;
  viewData.forEach(r => { m += parseFloat(r.income_total||0); k += parseFloat(r.expense_total||0); });
  sv2('ov-saldo',  fmtRpHead(m - k));
  sv2('ov-masuk',  fmtRpHead(m));
  sv2('ov-keluar', fmtRpHead(k));

  const latest = recentTrx?.[0]?.date;
  sv2('ov-updated', latest
    ? (fromCache ? 'Data Cache: ' : 'Diperbarui: ') + fmtDateShort(latest)
    : 'Diperbarui: –');

  const sortedMonths = viewData.map(r => r.month).sort();
  const periodeEl = g('ov-periode');
  if (periodeEl) periodeEl.innerHTML = sortedMonths.length
    ? `<i class="fas fa-calendar-alt"></i> Periode: ${fmtDateShort(sortedMonths[0]+'-02')} — ${fmtDateShort(sortedMonths[sortedMonths.length-1]+'-02')}`
    : 'Periode: –';

  const al = g('fin-activity-list');
  if (!(recentTrx?.length)) {
    al.innerHTML = '<div class="empty-mini" style="color:#333;"><i class="fas fa-inbox"></i>&nbsp; Belum ada transaksi.</div>';
    renderDashboardChart([]);
    return;
  }
  al.innerHTML = recentTrx.map(t => `
    <div class="act-item">
      <div class="act-dot ${t.type}"></div>
      <div class="act-info">
        <span class="act-desc">${esc(t.description||'–')}</span>
        <span class="act-date">${fmtDateShort(t.date)}</span>
      </div>
      <span class="act-amt ${t.type}">${t.type==='masuk'?'+':'-'}${fmtRp(t.amount)}</span>
    </div>`).join('');

  const last4Start = getLast4Months()[0];
  renderDashboardChart(viewData.filter(r => r.month >= last4Start));
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

function createChart(ctx, labels, masukData, keluarData, isEmpty, chartHeight) {
  const h = chartHeight || 220;
  const gradMasuk  = ctx.createLinearGradient(0, 0, 0, h);
  gradMasuk.addColorStop(0, 'rgba(74,222,128,0.22)');
  gradMasuk.addColorStop(1, 'rgba(74,222,128,0)');
  const gradKeluar = ctx.createLinearGradient(0, 0, 0, h);
  gradKeluar.addColorStop(0, 'rgba(239,68,68,0.18)');
  gradKeluar.addColorStop(1, 'rgba(239,68,68,0)');
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: isEmpty ? 'No Activity' : 'Pemasukan',   data: masukData,  borderColor:'#4ade80', backgroundColor:gradMasuk,  tension:.4, fill:true, borderWidth:2, pointRadius:4, pointHoverRadius:6, pointBackgroundColor:'#4ade80' },
        { label: isEmpty ? 'No Activity' : 'Pengeluaran', data: keluarData, borderColor:'#ef4444', backgroundColor:gradKeluar, tension:.4, fill:true, borderWidth:2, pointRadius:4, pointHoverRadius:6, pointBackgroundColor:'#ef4444' },
      ],
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      animation:{ duration:400, easing:'easeInOutQuart' },
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

function renderDashboardChart(viewRows) {
  const placeholder = g('fin-chart-placeholder');
  if (!placeholder || typeof Chart === 'undefined') return;
  const months = getLast4Months();
  const rowMap = {};
  (viewRows||[]).forEach(r => { rowMap[r.month] = r; });
  const masukData  = months.map(m => parseFloat(rowMap[m]?.income_total  || 0));
  const keluarData = months.map(m => parseFloat(rowMap[m]?.expense_total || 0));
  const isEmpty    = masukData.every(v=>v===0) && keluarData.every(v=>v===0);
  const labels = months.map(m => new Date(m+'-02').toLocaleDateString('id-ID',{ month:'short', year:'2-digit' }));
  if (_finChart) { _finChart.destroy(); _finChart = null; }
  placeholder.innerHTML = '<canvas id="dash-chart-canvas" style="height:160px;"></canvas>';
  _finChart = createChart(g('dash-chart-canvas').getContext('2d'), labels, masukData, keluarData, isEmpty, 160);
}

function renderFinanceChart(viewRows) {
  const placeholder = g('fin-chart-placeholder-full');
  if (!placeholder || typeof Chart === 'undefined') return;
  const rows = viewRows || [];
  if (!rows.length) {
    if (_finChartFull) { _finChartFull.destroy(); _finChartFull = null; }
    placeholder.innerHTML = '<div class="empty-mini" style="padding:2rem;text-align:center;color:#444;"><i class="fas fa-chart-line"></i>&nbsp; Belum ada data periode ini.</div>';
    return;
  }
  const labels     = rows.map(r => new Date(r.month+'-02').toLocaleDateString('id-ID',{ month:'short', year:'2-digit' }));
  const masukData  = rows.map(r => parseFloat(r.income_total  || 0));
  const keluarData = rows.map(r => parseFloat(r.expense_total || 0));
  const isEmpty    = masukData.every(v=>v===0) && keluarData.every(v=>v===0);
  if (_finChartFull) { _finChartFull.destroy(); _finChartFull = null; }
  placeholder.innerHTML = '<canvas id="fin-chart-canvas" style="height:220px;"></canvas>';
  _finChartFull = createChart(g('fin-chart-canvas').getContext('2d'), labels, masukData, keluarData, isEmpty, 220);
}

function _getTimeframeStart(tf) {
  if (tf === 'Semua') return null;
  const back = { '1B':0, '3B':2, '6B':5, '1Thn':11 };
  const d = new Date(); d.setDate(1);
  d.setMonth(d.getMonth() - (back[tf] ?? 2));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function _getTfLabel(tf) {
  return { '1B':'1 BULAN', '3B':'3 BULAN', '6B':'6 BULAN', '1Thn':'1 TAHUN', 'Semua':'SEMUA' }[tf] || '3 BULAN';
}

function calcFinSummaryFromView(rows) {
  let m = 0, k = 0, cnt = 0;
  (rows||[]).forEach(r => {
    m   += parseFloat(r.income_total  || 0);
    k   += parseFloat(r.expense_total || 0);
    cnt += parseInt(r.trx_count       || 0);
  });
  sv2('fs-saldo',  fmtRp(m - k));
  sv2('fs-masuk',  fmtRp(m));
  sv2('fs-keluar', fmtRp(k));
  sv2('fs-count',  cnt);
}

async function refreshFinChart() {
  const tf = _finTimeframe; // snapshot — detect stale result if user switches during fetch
  const ph = g('fin-chart-placeholder-full');
  if (ph) {
    if (_finChartFull) { _finChartFull.destroy(); _finChartFull = null; }
    ph.innerHTML = '<div class="chart-loading"><i class="fas fa-spinner fa-spin"></i>&nbsp; Memuat grafik...</div>';
  }
  const start = _getTimeframeStart(tf);
  let q = db.from('finance_monthly_summary').select('month,income_total,expense_total,trx_count').order('month',{ascending:true});
  if (start) q = q.gte('month', start);
  try {
    const { data } = await dbQ(q);
    if (_finTimeframe !== tf) return; // user switched — discard stale result
    renderFinanceChart(data || []);
  } catch (err) {
    if (_finTimeframe !== tf) return;
    const msg = err?.code === '42501' ? 'Anda tidak memiliki akses untuk tindakan ini.' : 'Gagal memuat data. Coba lagi.';
    if (ph) ph.innerHTML = `<div class="chart-loading"><i class="fas fa-exclamation-triangle"></i>&nbsp; ${msg}</div>`;
  }
}

function setFinTimeframe(tf) {
  _finTimeframe = tf;
  const lbl = g('fin-tf-label');
  if (lbl) lbl.textContent = _getTfLabel(tf);
  document.querySelectorAll('.btn-tf').forEach(b =>
    b.classList.toggle('active', b.dataset.tf === tf)
  );
  refreshFinChart();
}

// ── 15. NEWS MODULE ───────────────────────────────────────────────────────────────
async function loadNews() {
  const el = g('news-grid');
  el.innerHTML = '<div class="skel skel-card-tall"></div><div class="skel skel-card-tall"></div><div class="skel skel-card-tall"></div>';
  try {
    const { data, error } = await dbQ(db.from('news').select(NEWS_COLS).order('created_at',{ascending:false}));
    if (error) throw error;
    allNews = data || [];
    renderNews(allNews);
  } catch (_) { el.innerHTML = errState(); }
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
          <button class="btn-wa" onclick="shareNewsToWA('${n.id}')" title="Bagikan ke WhatsApp"><i class="fab fa-whatsapp"></i> Bagikan</button>
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
  const { data } = await db.from('news').select(NEWS_COLS).eq('id',id).single();
  if (data) openNewsModal(data);
}

async function handleSaveNews(e) {
  e.preventDefault();
  const btn = g('news-save-btn'); btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>';
  try {
    const editId = gv('news-edit-id'), imgFile = g('news-img-file').files[0];
    const title = sanitizeInput(gv('news-title'));
    const content = sanitizeInput(gv('news-content'));
    if (title === null || content === null) { showToast('Input mengandung karakter tidak diizinkan.', 'error'); return; }
    let image_url = null;
    if (imgFile) image_url = await uploadMedia(imgFile, 'news');
    const status = resolveContentStatus('news');
    const pl = { title, category:gv('news-cat'), content, user_id:CU.id, status, ...(image_url && {image_url}) };
    const { error } = editId ? await db.from('news').update(pl).eq('id',editId) : await db.from('news').insert(pl);
    if (error) throw error;
    createLog(editId ? 'NEWS_UPDATE' : 'NEWS_CREATE',
      `${editId ? 'Mengubah' : 'Membuat'} berita: ${String(title).slice(0,60)}`);
    const newsMsg = editId ? 'Berita diperbarui!' : (status === 'approved' ? 'Berita berhasil ditambahkan!' : 'Berita ditambahkan! Menunggu persetujuan moderator.');
    showToast(newsMsg, 'success');
    closeModal('news-modal'); loadNews(); loadNewsPreview();
  } catch (err) { showToast(safeErr(err), 'error'); }
  finally { btn.disabled=false; btn.innerHTML='<i class="fas fa-save"></i> Simpan'; }
}

async function deleteNews(id, imgUrl) {
  showConfirm('Hapus Berita', 'Yakin ingin menghapus berita ini secara permanen?', async () => {
    if (imgUrl) { const p = imgUrl.split('/news/')[1]; if(p) await db.storage.from('news').remove([p]); }
    const { error } = await db.from('news').delete().eq('id',id);
    if (error) { showToast(safeErr(error), 'error'); return; }
    const newsTitle = allNews.find(n => n.id === id)?.title || id;
    createLog('NEWS_DELETE', `Menghapus berita: ${String(newsTitle).slice(0,60)}`);
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
    const { data, error } = await dbQ(db.from('products').select(PROD_COLS).order('created_at',{ascending:false}));
    if (error) throw error;
    allProds = data || [];
    renderProducts(allProds);
  } catch (_) { el.innerHTML = errState(); }
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
      <div class="pc-img" onclick="${p.image_url?`openLB('${p.image_url}','${esc(p.name)}')`:''}">
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
            ${waLink?`<a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn-wa"><i class="fab fa-whatsapp"></i> Beli</a>`:''}
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
  const { data } = await db.from('products').select(PROD_COLS).eq('id',id).single();
  if (data) openProductModal(data);
}

async function handleSaveProduct(e) {
  e.preventDefault();
  const btn = g('prod-save-btn'); btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>';
  try {
    const editId = gv('prod-edit-id'), imgFile = g('prod-img-file').files[0];
    let image_url = null;
    if (imgFile) image_url = await uploadMedia(imgFile, 'products');
    const name = sanitizeInput(gv('prod-name'));
    const desc = sanitizeInput(gv('prod-desc'));
    const wa   = sanitizeInput(gv('prod-wa'));
    if (name === null || desc === null) { showToast('Input mengandung karakter tidak diizinkan.', 'error'); return; }
    const pl = { name, category:gv('prod-cat'), description:desc, price:parseFloat(gv('prod-price'))||0, whatsapp_link:wa||'', user_id:CU.id, status:resolveContentStatus('products'), ...(image_url&&{image_url}) };
    const { error } = editId ? await db.from('products').update(pl).eq('id',editId) : await db.from('products').insert(pl);
    if (error) throw error;
    showToast('Produk berhasil disimpan!', 'success');
    closeModal('product-modal'); loadProducts(); loadProductsPreview();
  } catch (err) { showToast(safeErr(err), 'error'); }
  finally { btn.disabled=false; btn.innerHTML='<i class="fas fa-save"></i> Simpan'; }
}

async function deleteProduct(id, imgUrl) {
  showConfirm('Hapus Produk', 'Yakin ingin menghapus produk ini?', async () => {
    if (imgUrl) { const p = imgUrl.split('/products/')[1]; if(p) await db.storage.from('products').remove([p]); }
    const { error } = await db.from('products').delete().eq('id',id);
    if (error) { showToast(safeErr(error), 'error'); return; }
    showToast('Produk dihapus.', 'info'); loadProducts(); loadProductsPreview();
  });
}

// ── 17. FINANCE MODULE ─────────────────────────────────────────────────────────────
async function loadFinance() {
  if (!loggedIn()) {
    _saveRedirect('finance');
    showAuthModal('login');
    navigateTo('dashboard');
    return;
  }

  const tbody = g('finance-table-body');

  if (!isFinance()) {
    tbody.innerHTML = `<tr><td colspan="8" class="loading-cell"><i class="fas fa-lock" style="color:var(--red)"></i> Anda tidak memiliki akses ke modul keuangan.</td></tr>`;
    return;
  }

  tbody.innerHTML = '<tr><td colspan="8" class="loading-cell"><i class="fas fa-spinner fa-spin"></i> Memuat data...</td></tr>';
  try {
    const [trxRes, viewRes] = await Promise.all([
      dbQ(db.from('transactions').select(TRX_COLS).order('date',{ascending:false})),
      dbQ(db.from('finance_monthly_summary').select('month,income_total,expense_total,trx_count').order('month',{ascending:true}))
    ]);
    if (trxRes.error) throw trxRes.error;
    allTrx = trxRes.data || [];
    renderTrx(allTrx);
    calcFinSummaryFromView(viewRes.data || []);
    await refreshFinChart();
  } catch (err) {
    const msg = safeErr(err);
    tbody.innerHTML = `<tr><td colspan="8" class="loading-cell"><i class="fas fa-exclamation-triangle" style="color:var(--red)"></i> ${msg}</td></tr>`;
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

function renderTrx(data, emptyMsg) {
  const showAksi = isFinance();
  const thAksi = g('th-aksi');
  if (thAksi) thAksi.style.display = showAksi ? '' : 'none';

  const tbody = g('finance-table-body');
  const cols = showAksi ? 8 : 7;
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="${cols}" class="loading-cell"><i class="fas fa-inbox"></i>&nbsp; ${emptyMsg || 'Belum ada transaksi.'}</td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(t => `
    <tr>
      <td>${fmtDate(t.date)}</td>
      <td><span class="type-badge ${t.type}">${t.type==='masuk'?'<i class="fas fa-arrow-up"></i>':'<i class="fas fa-arrow-down"></i>'} ${t.type}</span></td>
      <td>${esc(t.description||'–')}</td>
      <td><span class="cat-tag">${t.category||'–'}</span></td>
      <td class="${t.type==='masuk'?'text-green':'text-red'} mono">${fmtRp(t.amount)}</td>
      <td class="text-muted">${esc(t.notes||'–')}</td>
      <td>${t.bukti_url?`<a href="${safeUrl(t.bukti_url)}" target="_blank" rel="noopener noreferrer" class="btn-proof"><i class="fas fa-paperclip"></i> Lihat</a>`:'–'}</td>
      ${showAksi ? `<td style="white-space:nowrap;">
        <button class="btn-wa btn-wa-xs" onclick="shareTrxToWA('${t.id}')" title="Bagikan ke WhatsApp"><i class="fab fa-whatsapp"></i></button>
        <button class="btn-edit-xs" onclick="editTrx('${t.id}')" title="Edit"><i class="fas fa-edit"></i></button>
        <button class="btn-del-xs" onclick="deleteTrx('${t.id}','${t.bukti_url||''}')" title="Hapus"><i class="fas fa-trash"></i></button>
      </td>` : ''}
    </tr>`).join('');
}

function filterTransactions() {
  const s = gv('fin-search').toLowerCase(), tp = gv('fin-type-filter'), dt = gv('fin-date-filter');
  const f = allTrx.filter(t =>
    (!s  || (t.description + t.category).toLowerCase().includes(s)) &&
    (!tp || t.type === tp) &&
    (!dt || (t.date || '') === dt)
  );
  const emptyMsg = dt
    ? `Belum ada transaksi pada tanggal ${fmtDate(dt)}.`
    : 'Belum ada transaksi.';
  calcFinSummary(f);
  renderTrx(f, emptyMsg);
}

function openTransactionModal(data = null) {
  if (!isFinance()) { showToast('Akses ditolak. Hanya Owner/Bendahara.', 'error'); return; }
  g('trx-modal-title').innerHTML = data ? '<i class="fas fa-edit"></i> EDIT TRANSAKSI' : '<i class="fas fa-plus-circle"></i> TAMBAH TRANSAKSI';
  g('transaction-form').reset(); sv('trx-edit-id',''); g('trx-prev-wrap').style.display='none';
  sv('trx-date', formatLocalDate(new Date()));
  if (data) {
    sv('trx-edit-id',data.id); sv('trx-type',data.type||'masuk'); sv('trx-date',data.date||'');
    sv('trx-desc',data.description||''); sv('trx-cat',data.category||'iuran');
    sv('trx-amount',data.amount||''); sv('trx-notes',data.notes||'');
  }
  openModal('transaction-modal');
}

async function editTrx(id) {
  if (!isFinance()) return;
  const { data } = await db.from('transactions').select(TRX_COLS).eq('id',id).single();
  if (data) openTransactionModal(data);
}

async function handleSaveTransaction(e) {
  e.preventDefault();
  if (!isFinance()) { showToast('Akses ditolak.', 'error'); return; }
  const editId = gv('trx-edit-id');
  const type   = gv('trx-type');
  const amount = parseFloat(gv('trx-amount')) || 0;
  const desc   = sanitizeInput(gv('trx-desc'));
  const notes  = sanitizeInput(gv('trx-notes'));
  if (desc === null || notes === null) { showToast('Input mengandung karakter tidak diizinkan.', 'error'); return; }
  const cat    = gv('trx-cat');
  const date   = gv('trx-date');
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
        if (error) throw error;
        createLog(editId ? 'FINANCE_UPDATE' : 'FINANCE_CREATE',
          `${editId ? 'Mengubah' : 'Menambah'} ${label} ${fmtRp(amount)} — ${cat}`);
        showToast('Transaksi berhasil disimpan!', 'success');
        closeModal('transaction-modal'); loadFinance(); loadFinanceOverview();
      } catch (err) { showToast(safeErr(err), 'error'); }
      finally { g('trx-save-btn').disabled=false; g('trx-save-btn').innerHTML='<i class="fas fa-save"></i> Simpan'; }
    }
  );
}

async function deleteTrx(id, buktiUrl) {
  if (!isFinance()) return;
  showConfirm('Hapus Transaksi', 'Yakin ingin menghapus transaksi ini? Aksi tidak bisa dibatalkan.', async () => {
    if (buktiUrl) { const p = buktiUrl.split('/transactions/')[1]; if(p) await db.storage.from('transactions').remove([p]); }
    const t = allTrx.find(x => x.id === id);
    const { error } = await db.from('transactions').delete().eq('id',id);
    if (error) { showToast(safeErr(error), 'error'); return; }
    const tLabel = t ? `${t.type === 'masuk' ? 'pemasukan' : 'pengeluaran'} ${fmtRp(t.amount)} (${t.category||'–'})` : id;
    createLog('FINANCE_DELETE', `Menghapus transaksi ${tLabel}`);
    showToast('Transaksi dihapus.', 'info'); loadFinance(); loadFinanceOverview();
  });
}

// ── 18. GALLERY MODULE ─────────────────────────────────────────────────────────────
async function loadGallery() {
  const el = g('gallery-grid');
  el.innerHTML = '<div class="skel skel-gal"></div><div class="skel skel-gal"></div><div class="skel skel-gal"></div><div class="skel skel-gal"></div>';
  let data;
  try { ({ data } = await dbQ(db.from('gallery').select(GAL_COLS).order('created_at',{ascending:false}))); }
  catch (_) { el.innerHTML = errState(); return; }
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
    const galTitle = sanitizeInput(gv('gal-title'));
    if (galTitle === null) { showToast('Input mengandung karakter tidak diizinkan.', 'error'); return; }
    const imgUrl = await uploadMedia(imgFile, 'gallery');
    const { error } = await db.from('gallery').insert({ title: galTitle || '', image_url:imgUrl, user_id:CU.id, status:resolveContentStatus('gallery') });
    if (error) throw error;
    showToast('Foto berhasil diupload!', 'success');
    closeModal('gallery-modal'); loadGallery();
  } catch (err) { showToast(safeErr(err), 'error'); }
  finally { btn.disabled=false; btn.innerHTML='<i class="fas fa-upload"></i> Upload'; }
}

async function deleteGallery(id, imgUrl) {
  showConfirm('Hapus Foto', 'Yakin ingin menghapus foto ini?', async () => {
    if (imgUrl) { const p = imgUrl.split('/gallery/')[1]; if(p) await db.storage.from('gallery').remove([p]); }
    const { error } = await db.from('gallery').delete().eq('id',id);
    if (error) { showToast(safeErr(error), 'error'); return; }
    showToast('Foto dihapus.', 'info'); loadGallery();
  });
}

// ── 19. APPROVE / REJECT ──────────────────────────────────────────────────────────
async function approveItem(table, id) {
  if (!isMod()) { showToast('Anda tidak memiliki akses untuk tindakan ini.', 'error'); return; }
  const { error } = await db.from(table).update({ status:'approved' }).eq('id',id);
  if (error) { showToast(safeErr(error), 'error'); return; }
  showToast('Item disetujui!', 'success');
  if (table==='news') loadNews(); else if (table==='products') loadProducts(); else loadGallery();
}

async function rejectItem(table, id, imgUrl) {
  if (!isMod()) { showToast('Anda tidak memiliki akses untuk tindakan ini.', 'error'); return; }
  showConfirm('Tolak Item', 'Tolak & hapus item ini secara permanen?', async () => {
    if (imgUrl) { const p = imgUrl.split('/'+table+'/')[1]; if(p) await db.storage.from(table).remove([p]); }
    const { error } = await db.from(table).delete().eq('id',id);
    if (error) { showToast(safeErr(error), 'error'); return; }
    showToast('Item ditolak & dihapus.', 'info');
    if (table==='news') loadNews(); else if (table==='products') loadProducts(); else loadGallery();
  });
}

// ── 20. ANGGOTA MODULE ─────────────────────────────────────────────────────────────
async function loadAnggota() {
  const el = g('members-grid');
  el.innerHTML = '<div class="skel skel-member"></div><div class="skel skel-member"></div><div class="skel skel-member"></div><div class="skel skel-member"></div>';

  let data = [];

  try {
    // get_members_safe(): SECURITY DEFINER — DB masks email/phone based on caller role
    // Owner: full email+phone | Self: own data full | Others/guest: masked fields
    const { data: rows, error } = await dbQ(db.rpc('get_members_safe'), 8000);
    if (!error && rows?.length) data = rows;
  } catch (_) {}

  // Fallback: show only own profile if RPC fails — CP is always self, no masking needed
  if (!data.length && CP) data = [{ ...CP }];

  _allMembers = data; // cache in memory — NOT embedded in DOM
  renderOrgHierarchy(data);
  populateDivisionFilter(data); // populate reactive filter from data

  if (!data.length) {
    el.innerHTML = emptyState('Belum ada anggota.','fas fa-user-slash');
    const tb = g('user-mgmt-body'); if(tb) tb.innerHTML='<tr><td colspan="6" class="loading-cell">Belum ada data.</td></tr>';
    return;
  }

  renderMemberCards(data); // extracted helper — also used by filter

  // Management table — owner/ketua only; DB already returns full data for owner, masked for others
  if (isOK()) {
    const tbody = g('user-mgmt-body');
    if (tbody) tbody.innerHTML = data.map(m => {
      const r = m.role || 'anggota';
      const self = CU?.id === m.id;
      return `<tr>
        <td><div class="tbl-user"><img src="${safeUrl(m.avatar_url)||avFallback(m.full_name||'A')}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;" loading="lazy"> ${esc(m.full_name||'–')}</div></td>
        <td class="text-muted">${esc(m.email||'–')}</td>
        <td>@${esc(m.username||'–')}</td>
        <td><span class="role-badge role-${r}">${r.toUpperCase()}</span></td>
        <td>${esc(m.phone||'–')}</td>
        <td>
          ${self?'<span class="text-muted" style="font-size:.72rem">Kamu</span>':''}
          ${!self&&isOwner()?`<select class="role-select-sm" onchange="setRole('${m.id}',this.value);this.value=''"><option value="">Ubah Role</option><option value="owner"${r==='owner'?' disabled':''}>Owner</option><option value="ketua">Ketua</option><option value="admin">Admin</option><option value="bendahara">Bendahara</option><option value="anggota">Anggota</option></select>`:''}
          ${!self&&isKetua()&&!['owner','ketua'].includes(r)?`<select class="role-select-sm" onchange="setRole('${m.id}',this.value);this.value=''"><option value="">Ubah Role</option><option value="admin">Admin</option><option value="bendahara">Bendahara</option><option value="anggota">Anggota</option></select>`:''}
        </td>
      </tr>`;
    }).join('');
  }
}

// Local fallback masking (mirror of DB logic, used only when RPC fails)
const mask_email_local = e => { if (!e || !e.includes('@')) return '–'; return e.slice(0,3)+'*****'+e.slice(e.indexOf('@')); };
const mask_phone_local = p => { if (!p) return '–'; const d=p.replace(/\D/g,''); return d.length<6?'–':d.slice(0,4)+'****'+d.slice(-2); };

// ── Org Hierarchy — renders STRUKTUR ORGANISASI above members-grid ────────────
// Reuses _allMembers data from loadAnggota() — no additional fetch
function renderOrgHierarchy(members) {
  const el = g('org-hierarchy');
  if (!el) return;

  const execs    = members.filter(m => ['owner','ketua'].includes(m.role));
  const officers = members.filter(m => ['admin','bendahara'].includes(m.role));
  // Division leads: members with division OR title, not already in exec/officer tiers
  const divLeads = members.filter(m =>
    !['owner','ketua','admin','bendahara'].includes(m.role) && (m.division || m.title)
  );

  if (!execs.length && !officers.length && !divLeads.length) { el.innerHTML = ''; return; }

  // Division badge config — mudah diubah di sini
  const divBadges = m => [
    m.division ? `<span class="div-badge">${esc(m.division.toUpperCase())}</span>` : '',
    m.title    ? `<span class="div-badge div-badge-title">${esc(m.title)}</span>` : '',
  ].join('');

  const execCard = m => `
    <div class="hier-card exec-card" onclick="openMemberModal('${m.id}')">
      <div class="hier-av-wrap">
        <img src="${safeUrl(m.avatar_url)||avFallback(m.full_name||'A')}" class="hier-av" loading="lazy">
        <div class="mc-rdot role-${m.role}"></div>
      </div>
      <div class="hier-name">${esc(m.full_name||m.username||'–')}</div>
      <span class="mc-role role-${m.role}">${m.role.toUpperCase()}</span>
      ${divBadges(m)}
    </div>`;

  const officerCard = m => `
    <div class="hier-card officer-card" onclick="openMemberModal('${m.id}')">
      <div class="hier-av-wrap">
        <img src="${safeUrl(m.avatar_url)||avFallback(m.full_name||'A')}" class="hier-av hier-av-sm" loading="lazy">
        <div class="mc-rdot role-${m.role}"></div>
      </div>
      <div class="hier-name">${esc(m.full_name||m.username||'–')}</div>
      <span class="mc-role role-${m.role}">${m.role.toUpperCase()}</span>
      ${divBadges(m)}
    </div>`;

  const divLeadCard = m => `
    <div class="hier-card div-lead-card" onclick="openMemberModal('${m.id}')">
      <div class="hier-av-wrap">
        <img src="${safeUrl(m.avatar_url)||avFallback(m.full_name||'A')}" class="hier-av hier-av-sm" loading="lazy">
      </div>
      <div class="hier-name">${esc(m.full_name||m.username||'–')}</div>
      ${divBadges(m)}
    </div>`;

  const connector = () =>
    '<div class="hier-connector" aria-hidden="true"><div class="hier-line"></div></div>';

  let html = `<div class="org-hierarchy">
    <div class="box-dna">
      <div class="bc tl"></div><div class="bc tr"></div><div class="bc bl"></div><div class="bc br"></div>
      <div class="box-tag"><i class="fas fa-sitemap fa-xs"></i>&nbsp;STRUKTUR ORGANISASI</div>
      <div class="hier-body">`;

  if (execs.length) {
    html += `<div class="hier-level-label">EKSEKUTIF</div>
      <div class="hier-level exec-level">${execs.map(execCard).join('')}</div>`;
  }
  if (officers.length) {
    if (execs.length) html += connector();
    html += `<div class="hier-level-label">PEJABAT</div>
      <div class="hier-level officer-level">${officers.map(officerCard).join('')}</div>`;
  }
  if (divLeads.length) {
    if (execs.length || officers.length) html += connector();
    html += `<div class="hier-level-label">DIVISI</div>
      <div class="hier-level div-level">${divLeads.map(divLeadCard).join('')}</div>`;
  }

  html += `</div></div></div>`;
  el.innerHTML = html;
}

// Open member modal by ID lookup from cached _allMembers — no sensitive data in DOM
function openMemberModal(id) {
  const m = _allMembers.find(x => x.id === id);
  if (m) showMemberModal(m);
}

// ── Member card helper — reused by loadAnggota() and filterMembersByDivision() ─
function renderMemberCards(list) {
  const el = g('members-grid');
  if (!el) return;
  if (!list.length) { el.innerHTML = emptyState('Belum ada anggota pada divisi ini.','fas fa-user-slash'); return; }
  el.innerHTML = list.map(m => {
    const r = m.role || 'anggota';
    return `<div class="member-card" onclick="openMemberModal('${m.id}')">
      <div class="mc-av-wrap"><img src="${safeUrl(m.avatar_url)||avFallback(m.full_name||'A')}" class="mc-av" loading="lazy"><div class="mc-rdot role-${r}"></div></div>
      <div class="mc-name">${esc(m.full_name||m.username||'Anggota')}</div>
      <span class="mc-role role-${r}">${r.toUpperCase()}</span>
      <div class="mc-bio">${esc((m.bio||'Warga Anjun').slice(0,60))}</div>
    </div>`;
  }).join('');
}

// Populate division dropdown from cached data — no API call
function populateDivisionFilter(members) {
  const sel = g('div-filter-select');
  if (!sel) return;
  const divs = [...new Set(members.map(m => (m.division||'').trim()).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">Semua Divisi</option>' +
    divs.map(d => `<option value="${d}">${esc(d.toUpperCase())}</option>`).join('');
}

// Reactive filter — reads _allMembers in memory, zero API call
function filterMembersByDivision() {
  const val = (g('div-filter-select')?.value || '').trim().toLowerCase();
  const filtered = val
    ? _allMembers.filter(m => (m.division||'').trim().toLowerCase() === val)
    : _allMembers;
  renderMemberCards(filtered);
}

async function setRole(uid, newRole) {
  if (!isOK()) return;
  showConfirm('Ubah Role', `Ubah role anggota ini menjadi <strong>"${newRole}"</strong>?`, async () => {
    const { error } = await db.rpc('update_member_role', { target_uid: uid, new_role: newRole });
    if (error) { showToast(safeErr(error), 'error'); return; }
    const target = _allMembers.find(m => m.id === uid);
    const targetName = target?.full_name || target?.username || uid.slice(0,6);
    createLog('ROLE_UPDATE', `Role ${targetName} diubah menjadi ${newRole}`);
    showToast('Role berhasil diubah!', 'success'); loadAnggota();
  });
}

function showMemberModal(m) {
  const r = m.role || 'anggota';
  g('mm-av').src   = safeUrl(m.avatar_url) || avFallback(m.full_name||'A');
  sv2('mm-name',  m.full_name||m.username||'Anggota');
  sv2('mm-uname', '@'+(m.username||'–'));
  sv2('mm-bio',   m.bio||'Warga Anjun Generation.');
  g('mm-role').textContent = r.toUpperCase();
  g('mm-role').className   = `mm-role-pill role-${r}`;
  g('mm-meta').innerHTML   = `<i class="fas fa-map-marker-alt"></i> ${esc(m.location||'Desa Anjun')}`;
  // WA contact: show only if member opted in (show_whatsapp=true) AND phone exists
  // DB already enforces: phone=NULL if show_whatsapp=false or caller is guest
  const waEl = g('mm-wa');
  if (waEl) {
    if (m.show_whatsapp && m.phone) {
      const clean = m.phone.replace(/\D/g,'');
      const safeHref = safeUrl(`https://wa.me/${clean}`);
      waEl.innerHTML = `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="btn-wa"><i class="fab fa-whatsapp"></i> Hubungi via WhatsApp</a>`;
      show('mm-wa', true);
    } else {
      waEl.innerHTML = '';
      show('mm-wa', false);
    }
  }
  const qrEl = g('mm-qr');
  if (qrEl) {
    const url = `${location.origin}${location.pathname}?member=${m.id}`;
    // 512px = HD download quality; black-on-white = max scanner compatibility; margin=4 quiet zone
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&color=000000&bgcolor=ffffff&margin=4&ecc=M&data=${encodeURIComponent(url)}`;
    qrEl.dataset.qrSrc = qrSrc;
    qrEl.innerHTML = `<img src="${qrSrc}" alt="QR Code anggota">`;
  }
  openModal('member-modal');
}

async function downloadMemberQR() {
  const btn = document.querySelector('.btn-dl-qr');
  if (btn?.disabled) return;
  const qrEl = g('mm-qr');
  const src = qrEl?.dataset.qrSrc || qrEl?.querySelector('img')?.src;
  if (!src) { showToast('QR Code belum tersedia.', 'error'); return; }
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengunduh...'; }
  try {
    const resp = await fetch(src);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const objUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objUrl;
    link.download = `qr-${(g('mm-name').textContent||'member').replace(/\s+/g,'-').toLowerCase()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
    showToast('QR Code berhasil diunduh!', 'success');
  } catch (_) {
    showToast('Gagal unduh QR Code.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-download"></i> Unduh QR'; }
  }
}

// ── 21. LOG SYSTEM ──────────────────────────────────────────────────────────────────

// Identity fallback: full_name → username → email → short uid (never NULL)
function logIdentity() {
  if (!CU) return 'Unknown';
  return CP?.full_name || CP?.username || CU.email || ('user_' + CU.id.slice(0, 6).toLowerCase());
}

// Lightweight auto-repair — patches only NULL fields, never overwrites valid data.
// Anti-race: _profileRepairInProgress flag blocks duplicate concurrent calls.
// No recursion risk: pure client-side DB update, no DB trigger involved.
function _repairProfileIfNeeded() {
  if (!CU || !CP) return;
  if (_profileRepairInProgress) return; // in-flight guard — prevents duplicate UPDATE race
  const meta   = CU.user_metadata || {};
  const uid6   = CU.id.slice(0, 6).toLowerCase();
  const repair = {};
  // username fallback: user_{6-char uid} — lowercase, URL-safe, no obvious duplicates
  if (!CP.username)  repair.username  = meta.username || `user_${uid6}`;
  if (!CP.email)     repair.email     = CU.email || '';
  if (!CP.full_name) repair.full_name = meta.full_name || meta.name || repair.username || `user_${uid6}`;
  if (!CP.role)      repair.role      = 'anggota'; // safe default, never overwrites existing role
  if (!Object.keys(repair).length) return; // all fields present — nothing to do
  _profileRepairInProgress = true;
  db.from('profiles').update(repair).eq('id', CU.id)
    .then(() => { if (CP) Object.assign(CP, repair); })
    .catch(() => {})
    .finally(() => { _profileRepairInProgress = false; });
}

// Non-blocking log insert — never throws, never blocks UI
function createLog(actionType, description, metadata) {
  if (!CU || !actionType || !description) return;
  _repairProfileIfNeeded();
  const payload = { user_name: logIdentity(), action_type: actionType, description };
  if (metadata) payload.metadata = metadata;
  db.from('logs').insert(payload).then(() => {}).catch(() => {});
}

// Dot color by action type
function _logDotClass(actionType) {
  if (/CREATE/.test(actionType)) return 'log-dot-green';
  if (/UPDATE/.test(actionType)) return 'log-dot-yellow';
  if (/DELETE/.test(actionType)) return 'log-dot-red';
  return 'log-dot-green';
}

// Format one log row as terminal line
function _logEntryHTML(row) {
  const t = new Date(row.created_at);
  const time = isNaN(t) ? '--:--:--' : t.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
  const dot  = _logDotClass(row.action_type || '');
  return `<div class="log-entry">
    <span class="log-dot ${dot}"></span>
    <span class="log-time">[${time}]</span>
    <span class="log-user"> [${esc(row.user_name||'?')}]</span>
    <span class="log-arrow"> -&gt; </span>
    <span class="log-action">[${esc(row.action_type||'?')}]</span>
    <span class="log-colon">: </span>
    <span class="log-desc">${esc(row.description||'')}</span>
  </div>`;
}

// Fetch and render 50 latest logs — Owner/Ketua only
async function loadLogTerminal() {
  const el = g('log-terminal');
  if (!el || !isOK()) return;
  el.innerHTML = '<div class="log-loading"><i class="fas fa-spinner fa-spin fa-xs"></i> Memuat log...</div>';
  try {
    const { data, error } = await dbQ(
      db.from('logs').select('created_at,user_name,action_type,description')
        .order('created_at', { ascending: false }).limit(50),
      6000
    );
    if (error) {
      if (error.code === '42501') { el.innerHTML = '<div class="log-empty">Anda tidak memiliki akses untuk tindakan ini.</div>'; return; }
      throw error;
    }
    if (!data?.length) { el.innerHTML = '<div class="log-empty">Belum ada aktivitas tercatat.</div>'; return; }
    el.innerHTML = data.map(_logEntryHTML).join('');
  } catch (_) {
    el.innerHTML = '<div class="log-empty">Gagal memuat log.</div>';
  }
}

// Realtime subscription — dedup safe, prepend new entries
function _subscribeLogTerminal() {
  if (!isOK()) return;
  if (_logsChannel) { db.removeChannel(_logsChannel); _logsChannel = null; }
  _logsChannel = db.channel('logs-terminal')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs' },
      payload => {
        if (!isOK()) return; // defensive: role may have been revoked while subscribed
        const el = g('log-terminal');
        if (!el) return;
        const emptyEl = el.querySelector('.log-empty,.log-loading');
        if (emptyEl) emptyEl.remove();
        el.insertAdjacentHTML('afterbegin', _logEntryHTML(payload.new));
        // Keep max 50 entries visible
        const entries = el.querySelectorAll('.log-entry');
        if (entries.length > 50) entries[entries.length - 1].remove();
      })
    .subscribe();
}

// ── 22. TICKER MODULE ───────────────────────────────────────────────────────────────
async function loadTicker() {
  const track = g('tickerTrack');
  if (!track) return;

  const items = []; // { type, text, id }

  // Tier 1: admin-entered custom tickers
  const { data: custom } = await db.from('tickers').select('id,content').order('created_at',{ascending:false});
  if (custom?.length) custom.forEach(t => items.push({ type:'custom', text:t.content, id:t.id }));

  // Tier 2: approved news headlines (fallback)
  if (!items.length) {
    const { data: news } = await db.from('news').select('id,title').eq('status','approved').order('created_at',{ascending:false}).limit(5);
    if (news?.length) news.forEach(n => items.push({ type:'news', text:'📰 '+n.title, id:n.id }));
  }

  // Tier 3: approved products (fallback)
  if (!items.length) {
    const { data: prods } = await db.from('products').select('id,name').eq('status','approved').order('created_at',{ascending:false}).limit(4);
    if (prods?.length) prods.forEach(p => items.push({ type:'products', text:'🛍️ '+p.name, id:p.id }));
  }

  // Tier 4: approved gallery items (fallback)
  if (!items.length) {
    const { data: gals } = await db.from('gallery').select('id,caption').eq('status','approved').order('created_at',{ascending:false}).limit(4);
    if (gals?.length) gals.forEach(gl => items.push({ type:'gallery', text:'📷 '+(gl.caption||'Foto Terbaru'), id:gl.id }));
  }

  // Tier 5: app info text (fallback)
  if (!items.length) {
    const { data: ai } = await db.from('app_info').select('description,vision').eq('id',1).single();
    if (ai?.description) items.push({ type:'appinfo', text:'ℹ️ '+ai.description });
    if (ai?.vision) items.push({ type:'appinfo', text:'👁️ Visi: '+ai.vision });
  }

  // Tier 6: static fallback
  if (!items.length) items.push({ type:'static', text:'🌿 Selamat datang di ANJUNKU — Portal Digital Komunitas Desa Anjun' });

  // Skip re-render if content unchanged (prevents animation restart)
  const hash = items.map(it => it.type+'|'+String(it.id||'')+'|'+String(it.text||'').slice(0,30)).join('::');
  if (hash === _tickerHash) return;
  _tickerHash = hash;

  const mkItem = ({ type, text, id }) => {
    const st = String(type||'').replace(/[^a-z]/gi,'');       // only alphachars
    const si = String(id||'').replace(/[^a-z0-9\-]/gi,'');   // UUID-safe
    return `<span class="ticker-item" role="button" tabindex="0" aria-label="${esc(text)}" data-tick-type="${st}" data-tick-id="${si}"><i class="fas fa-diamond" aria-hidden="true"></i> ${esc(text)}</span>`;
  };

  const html = items.map(mkItem).join('');
  track.innerHTML = html + html; // doubled for seamless loop
}

async function loadTickerList() {
  const { data } = await db.from('tickers').select(TICK_COLS).order('created_at',{ascending:false});
  const el = g('ticker-list-wrap');
  if (!data?.length) { el.innerHTML='<div class="empty-mini">Belum ada ticker kustom.</div>'; return; }
  el.innerHTML = data.map(t => `<div class="ticker-list-item"><span>${esc(t.content)}</span><button class="btn-del-xs" onclick="deleteTicker('${t.id}')"><i class="fas fa-trash"></i></button></div>`).join('');
}

async function addTicker() {
  if (!isMod()) { showToast('Akses ditolak.', 'error'); return; }
  const val = sanitizeInput(gv('new-ticker-txt'));
  if (!val) { showToast('Input tidak valid atau kosong.', 'warn'); return; }
  const { error } = await db.from('tickers').insert({ content:val, user_id:CU?.id });
  if (error) { showToast(safeErr(error), 'error'); return; }
  sv('new-ticker-txt',''); loadTickerList(); loadTicker();
}

async function deleteTicker(id) {
  if (!isMod()) { showToast('Anda tidak memiliki akses untuk tindakan ini.', 'error'); return; }
  const { error } = await db.from('tickers').delete().eq('id',id);
  if (error) { showToast(safeErr(error), 'error'); return; }
  loadTickerList(); loadTicker();
}

// ── Ticker click router — driven by data-tick-type on each item ──────────────────
function handleTickerClick(type, id) {
  switch (type) {
    case 'news':     authNavTo('news');     break;
    case 'products': authNavTo('products'); break;
    case 'gallery':  authNavTo('gallery');  break;
    case 'appinfo': {
      const contact = parseAdminContact(_adminWA);
      if (contact?.href) {
        window.open(safeUrl(contact.href), '_blank', 'noopener,noreferrer');
      } else {
        authNavTo('dashboard');
      }
      break;
    }
    default: // 'custom', 'static' — general announcements → news section
      authNavTo('news');
  }
}

// ── 22. SPONSOR MODULE ─────────────────────────────────────────────────────────────
// Smart contact parser — returns {type:'wa'|'url', href} or null
// Accepts: https://..., 08xxx, 628xxx, 08xxx | Custom message, 08xxx # Custom message
function parseAdminContact(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Defense-in-depth block (input already through sanitizeInput in forms)
  if (/javascript:|vbscript:|data:text|<script|eval\s*\(|onerror\s*=/i.test(s)) return null;
  // HTTP/HTTPS URL → validate via safeUrl
  if (/^https?:\/\/.+/i.test(s)) {
    const href = safeUrl(s);
    return href ? { type: 'url', href } : null;
  }
  // Phone + custom message (separator | or #)
  const withMsg = s.match(/^([\d\s\-\+]{6,20})[|#](.+)$/);
  if (withMsg) {
    let num = withMsg[1].replace(/\D/g, '');
    if (!num) return null;
    if (num.startsWith('0')) num = '62' + num.slice(1);
    else if (!num.startsWith('62')) num = '62' + num;
    if (num.length < 9 || num.length > 17) return null;
    return { type: 'wa', href: `https://wa.me/${num}?text=${encodeURIComponent(withMsg[2].trim())}` };
  }
  // Phone-only (normalize digits, allow spaces/dashes/parens in input)
  const digits = s.replace(/\D/g, '');
  if (digits.length >= 9 && digits.length <= 15) {
    let num = digits;
    if (num.startsWith('0')) num = '62' + num.slice(1);
    else if (!num.startsWith('62')) num = '62' + num;
    return { type: 'wa', href: `https://wa.me/${num}` };
  }
  return null;
}

function buildAdminWALink() {
  const parsed = parseAdminContact(_adminWA);
  if (!parsed) return null;
  // URL type: return directly
  if (parsed.type === 'url') return parsed.href;
  // WA with explicit custom message: return as-is
  if (_adminWA.includes('|') || _adminWA.includes('#')) return parsed.href;
  // WA phone-only: append default support template
  let num = _adminWA.replace(/\D/g, '');
  if (num.startsWith('0')) num = '62' + num.slice(1);
  else if (!num.startsWith('62')) num = '62' + num;
  const msg = encodeURIComponent(
    'Halo Admin ANJUN GENERATION,\n\n' +
    'Saya ingin mendapatkan informasi lebih lanjut mengenai:\n' +
    '- Sponsorship / Partnership\n' +
    '- Informasi komunitas\n' +
    '- Dukungan aplikasi\n\n' +
    'Terima kasih.'
  );
  return `https://wa.me/${num}?text=${msg}`;
}

function buildPartnerWALink() {
  if (!_adminWA) return null;
  let num = _adminWA.replace(/\D/g, '');
  if (!num) return null;
  if (num.startsWith('0')) num = '62' + num.slice(1);
  else if (!num.startsWith('62')) num = '62' + num;
  const msg = encodeURIComponent(
    'Halo Admin ANJUN GENERATION,\n\n' +
    'Saya tertarik menjadi partner/sponsor.\n' +
    'Mohon informasi lebih lanjut.\n\n' +
    'Terima kasih.'
  );
  return `https://wa.me/${num}?text=${msg}`;
}

function _editWABtn() {
  return isOK() ? `<button onclick="openModal('appinfo-modal')" class="btn-set-wa" title="Atur nomor WA Admin"><i class="fas fa-pencil-alt"></i></button>` : '';
}

function shareNewsToWA(id) {
  const n = allNews.find(x => x.id === id);
  if (!n) return;
  const title   = n.title || '–';
  const excerpt = (n.content || '').slice(0, 120).replace(/[\r\n]+/g, ' ');
  const date    = fmtDate(n.created_at);
  const appLink = location.origin + '/anjunku/';
  const msg =
    '🔔 INFO TERBARU ANJUNKU\n\n' +
    '"' + title + '"\n\n' +
    '📝 Ringkasan:\n' + excerpt + ((n.content||'').length > 120 ? '...' : '') + '\n\n' +
    '📅 Dipublikasikan:\n' + date + '\n\n' +
    '🔗 Baca detail:\n' + appLink;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank', 'noopener,noreferrer');
}

function shareTrxToWA(id) {
  const t = allTrx.find(x => x.id === id);
  if (!t) return;
  const type   = t.type === 'masuk' ? 'Pemasukan' : 'Pengeluaran';
  const cat    = t.category || '–';
  const desc   = t.description || '–';
  const amount = fmtRp(t.amount);
  const date   = fmtDate(t.date);
  const appLink = location.origin + '/anjunku/';
  const msg =
    '📢 LAPORAN KEUANGAN ANJUN GENERATION\n\n' +
    '💰 Jenis:\n' + type + '\n\n' +
    '📂 Kategori:\n' + cat + '\n\n' +
    '📝 Keterangan:\n' + desc + '\n\n' +
    '💵 Nominal:\n' + amount + '\n\n' +
    '📅 Tanggal:\n' + date + '\n\n' +
    '🔗 Cek detail:\n' + appLink;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank', 'noopener,noreferrer');
}

function _weightedPick(sponsors) {
  if (!sponsors.length) return null;
  const total = sponsors.reduce((s,sp) => s+(sp.priority||1), 0);
  let r = Math.random() * total;
  for (const sp of sponsors) { r -= (sp.priority||1); if (r<=0) return sp; }
  return sponsors[0];
}

async function loadSponsors() {
  try {
    const { data } = await dbQ(db.from('sponsors').select(SPON_COLS).eq('is_active',true).order('priority',{ascending:false}));
    _sponsors = data || [];
  } catch (_) { _sponsors = []; }
  renderSponsorBanner();
  renderSponsorDash();
  if (_sponsors.length > 1) {
    if (_sponsorTimer) clearInterval(_sponsorTimer);
    _sponsorTimer = setInterval(() => { renderSponsorBanner(); }, 8000);
  }
}

function renderSponsorBanner() {
  const el = g('sponsor-banner');
  if (!el) return;
  if (!_sponsors.length) {
    const contact = parseAdminContact(_adminWA);
    const hubungi = contact
      ? `<a href="${contact.href}" target="_blank" rel="noopener noreferrer" class="cta-admin-link${contact.type==='wa'?' cta-wa':''}"><i class="${contact.type==='wa'?'fab fa-whatsapp':'fas fa-external-link-alt'}"></i> Hubungi Admin</a>`
      : `<span style="color:var(--green-muted);">Hubungi Admin</span>`;
    el.innerHTML = `<div class="sponsor-placeholder"><i class="fas fa-ad"></i> Space Iklan Tersedia &mdash; ${hubungi}${_editWABtn()}</div>`;
    return;
  }
  const sp = _weightedPick(_sponsors);
  el.innerHTML = `<a href="${safeUrl(sp.website_url)||'#'}" target="_blank" rel="noopener noreferrer" onclick="trackSponsorClick('${sp.id}')" class="sponsor-item">
    ${sp.logo_url?`<img src="${safeUrl(sp.logo_url)}" alt="${esc(sp.name)}" class="sponsor-logo" loading="lazy">`:''}
    <span class="sponsor-name">${esc(sp.name)}</span>
  </a>`;
}


async function trackSponsorClick(id) {
  try { await db.from('sponsors').rpc('increment_click', { sponsor_id:id }); } catch (_) {}
}

function renderSponsorDash() {
  const el = g('sponsor-dash');
  if (!el) return;
  if (!_sponsors.length) {
    const waLink = buildPartnerWALink();
    const ctaBtn = waLink
      ? `<a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn-wa"><i class="fab fa-whatsapp"></i> Hubungi Admin</a>`
      : '';
    const manageBtn = isOK()
      ? `<button onclick="openSponsorModal()" class="btn-sponsor-manage"><i class="fas fa-plus"></i> Tambah Sponsor</button>`
      : '';
    el.innerHTML = `<div class="sp-cta-card">
      <i class="fas fa-handshake sp-cta-icon"></i>
      <div class="sp-cta-title">Slot Partnership Tersedia</div>
      <div class="sp-cta-sub">Jadilah mitra ANJUN GENERATION dan tingkatkan visibilitas brand Anda.</div>
      <div class="sp-cta-btns">${ctaBtn}${manageBtn}</div>
    </div>`;
    return;
  }
  const manageBtn = isOK() ? `<div class="sponsor-dash-toolbar"><button onclick="openSponsorModal()" class="btn-sponsor-manage"><i class="fas fa-cog"></i> Kelola Sponsor</button></div>` : '';
  const grid = `<div class="sponsor-grid">${_sponsors.map(sp => `
    <a href="${safeUrl(sp.website_url)||'#'}" target="_blank" rel="noopener noreferrer" onclick="trackSponsorClick('${sp.id}')" class="sponsor-card">
      ${sp.logo_url
        ? `<div class="spc-logo-wrap"><img src="${safeUrl(sp.logo_url)}" alt="${esc(sp.name)}" class="spc-logo" loading="lazy" onerror="this.style.display='none'"></div>`
        : `<div class="spc-logo-wrap spc-no-logo"><i class="fas fa-building"></i></div>`}
      <div class="spc-name">${esc(sp.name)}</div>
    </a>`).join('')}</div>`;
  el.innerHTML = manageBtn + grid;
}

function openSponsorModal() {
  if (!isOK()) { showToast('Akses ditolak. Hanya Owner/Ketua.', 'error'); return; }
  openModal('sponsor-modal');
}

async function loadSponsorList() {
  const el = g('sponsor-list-wrap');
  if (!el) return;
  el.innerHTML = '<div class="loading-cell" style="padding:.5rem;font-size:.78rem;"><i class="fas fa-spinner fa-spin"></i> Memuat...</div>';
  try {
    const { data, error } = await db.from('sponsors').select(SPON_COLS).order('priority',{ascending:false});
    if (error) throw error;
    if (!data?.length) { el.innerHTML = '<div class="empty-mini">Belum ada sponsor. Tambah sponsor di atas.</div>'; return; }
    el.innerHTML = data.map(sp => `
      <div class="ticker-list-item" style="gap:.6rem;align-items:center;">
        ${sp.logo_url ? `<img src="${sp.logo_url}" style="height:30px;max-width:70px;border-radius:4px;object-fit:contain;flex-shrink:0;">` : `<div style="width:30px;height:30px;border-radius:4px;background:#111;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas fa-building" style="color:#555;font-size:.8rem;"></i></div>`}
        <div style="flex:1;min-width:0;overflow:hidden;">
          <div style="font-weight:600;font-size:.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(sp.name)}</div>
          <div style="font-size:.65rem;color:#555;">P:${sp.priority||1} &bull; ${sp.is_active?'<span style="color:var(--green);">Aktif</span>':'<span style="color:var(--red);">Nonaktif</span>'}</div>
        </div>
        <button class="btn-del-xs" onclick="deleteSponsor('${sp.id}','${sp.logo_url||''}')"><i class="fas fa-trash"></i></button>
      </div>`).join('');
  } catch (_) { el.innerHTML = `<div class="empty-mini" style="color:var(--red);">Gagal memuat data. Coba lagi.</div>`; }
}

async function handleAddSponsor() {
  if (!isMod()) return;
  const name = gv('sp-name').trim();
  const website = gv('sp-website').trim();
  const priority = parseInt(gv('sp-priority')) || 1;
  if (!name) { showToast('Nama sponsor wajib diisi.', 'error'); return; }
  const btn = g('sp-add-btn');
  if (btn) { btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Menyimpan...'; }
  try {
    const logoFile = g('sp-logo-file')?.files[0];
    const { data:sp, error:ie } = await db.from('sponsors')
      .insert({ name, website_url:website||null, priority, is_active:true })
      .select().single();
    if (ie) throw ie;
    if (logoFile) await uploadSponsorLogo(logoFile, sp.id);
    showToast('Sponsor berhasil ditambahkan!', 'success');
    sv('sp-name',''); sv('sp-website',''); sv('sp-priority','1');
    clearFile('sp-logo-file','sp-logo-prev-wrap');
    loadSponsorList(); loadSponsors();
  } catch (err) { showToast(safeErr(err), 'error'); }
  finally { if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-plus"></i> Tambah Sponsor'; } }
}

async function deleteSponsor(id, logoUrl) {
  showConfirm('Hapus Sponsor', 'Yakin ingin menghapus sponsor ini secara permanen?', async () => {
    if (logoUrl) { const p = logoUrl.split('/sponsors/')[1]; if(p) await db.storage.from('sponsors').remove([p]); }
    const { error } = await db.from('sponsors').delete().eq('id',id);
    if (error) { showToast(safeErr(error), 'error'); return; }
    showToast('Sponsor dihapus.', 'info'); loadSponsorList(); loadSponsors();
  });
}

async function uploadSponsorLogo(file, sponsorId) {
  if (!isMod()) throw new Error('Akses ditolak.');
  const path = `${sponsorId}_${Date.now()}.webp`;
  const processed = await processImage(file);
  const { data, error } = await db.storage.from('sponsors').upload(path, processed, { contentType:'image/webp', upsert:true });
  if (error) throw error;
  const publicUrl = db.storage.from('sponsors').getPublicUrl(data.path).data.publicUrl;
  const { error:ue } = await db.from('sponsors').update({ logo_url:publicUrl }).eq('id',sponsorId);
  if (ue) throw ue;
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
  if (CP.avatar_url) { g('prof-av-prev-wrap').style.display=''; g('prof-av-prev').src=safeUrl(CP.avatar_url)||''; }
  openModal('profile-modal');
}

async function handleSaveProfile(e) {
  e.preventDefault();
  const btn = g('prof-save-btn'); btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>';
  try {
    let avatar_url = CP.avatar_url || null;
    const avatarFile = g('prof-avatar-file').files[0];
    if (avatarFile) avatar_url = await uploadMedia(avatarFile, 'avatars');
    const full_name = sanitizeInput(gv('prof-name'));
    const username  = sanitizeInput(gv('prof-uname'));
    const bio       = sanitizeInput(gv('prof-bio'));
    const phone     = sanitizeInput(gv('prof-phone'));
    const location  = sanitizeInput(gv('prof-loc'));
    if (full_name === null || username === null || bio === null) { showToast('Input mengandung karakter tidak diizinkan.', 'error'); return; }
    const upd = { full_name:full_name||'', username:username||'', bio:bio||'', phone:phone||'', location:location||'', avatar_url };
    const { error } = await db.from('profiles').update(upd).eq('id',CU.id);
    if (error) throw error;
    CP = { ...CP, ...upd }; syncUI();
    closeModal('profile-modal'); showToast('Profil berhasil diperbarui!', 'success');
  } catch (err) { showToast(safeErr(err), 'error'); }
  finally { btn.disabled=false; btn.innerHTML='<i class="fas fa-save"></i> Simpan'; }
}

// ── 24. APP INFO MODULE ────────────────────────────────────────────────────────────
async function handleSaveAppInfo(e) {
  e.preventDefault();
  if (!isOK()) { showToast('Anda tidak memiliki akses untuk tindakan ini.', 'error'); return; }
  try {
    const wt  = sanitizeInput(gv('ai-welcome'));
    const wa  = sanitizeInput(gv('ai-admin-wa'));
    const sl  = sanitizeInput(gv('ai-slogan'));
    const dsc = sanitizeInput(gv('ai-desc'));
    const vis = sanitizeInput(gv('ai-vision'));
    const mis = sanitizeInput(gv('ai-mission'));
    if ([wt, wa, sl, dsc, vis, mis].includes(null)) { showToast('Input mengandung karakter tidak diizinkan.', 'error'); return; }
    if (wa !== null && wa !== '') {
      if (!parseAdminContact(wa)) {
        showToast('Format tidak valid. Gunakan: URL (https://...), nomor WA (08xxx / 628xxx), atau nomor+pesan (08xxx | Pesan).', 'error');
        return;
      }
    }
    const { error } = await db.from('app_info').upsert({ id:1, welcome_title:wt, admin_wa:wa, slogan:sl, description:dsc, date:gv('ai-ttl'), vision:vis, mission:mis });
    if (error) throw error;
    closeModal('appinfo-modal'); await loadAppInfo(); showToast('Info aplikasi diperbarui!', 'success');
  } catch (err) { showToast(safeErr(err), 'error'); }
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
    if (error) {
      const m = String(error.message || '').toLowerCase();
      const safe = (m.includes('invalid') || m.includes('credentials'))
        ? 'Email atau password salah.'
        : m.includes('not confirmed')
        ? 'Email belum dikonfirmasi. Hubungi admin.'
        : 'Terjadi kesalahan. Coba lagi.';
      showToast('Login gagal: ' + safe, 'error');
      return;
    }
    if (data.user) closeModal('auth-modal');
    // onAuthStateChange SIGNED_IN handles profile fetch, syncUI, loadDashboard, greeting
  } catch (err) { showToast('Login gagal: ' + (err.message || 'Terjadi kesalahan. Coba lagi.'), 'error'); }
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
      throw error;
    }
    if (!data.session) {
      closeModal('auth-modal');
      showToast('Pendaftaran berhasil! Cek email untuk konfirmasi.', 'success', 5000); return;
    }
    if (data.user) {
      closeModal('auth-modal');
      showToast('Pendaftaran berhasil! Selamat bergabung, '+nm+'!', 'success');
    }
    // onAuthStateChange SIGNED_IN handles CU/CP/syncUI/loadDashboard
  } catch (err) { showToast('Gagal daftar: ' + safeErr(err), 'error'); }
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

// ── 27. PASSWORD MANAGEMENT (1F) ─────────────────────────────────────────────────────────
function safeAuthErr(err) {
  if (!err) return 'Terjadi kesalahan. Coba lagi.';
  const msg = String(err.message || '').toLowerCase();
  if (msg.includes('rate limit')) return 'Terlalu banyak percobaan. Tunggu beberapa menit.';
  if (msg.includes('invalid') && msg.includes('password')) return 'Password baru tidak memenuhi syarat (minimal 8 karakter).';
  if (msg.includes('same password')) return 'Password baru tidak boleh sama dengan password lama.';
  if (msg.includes('user not found') || msg.includes('unable to validate')) return 'Email tidak terdaftar.';
  if (msg.includes('token') || msg.includes('expired')) return 'Link reset sudah kadaluarsa. Minta link baru.';
  return safeErr(err);
}

function showForgotForm() {
  show('auth-tabs-wrap', false);
  show('login-form', false);
  show('register-form', false);
  show('forgot-pw-form', true);
}

function hideForgotForm() {
  show('forgot-pw-form', false);
  show('auth-tabs-wrap', true);
  show('login-form', true);
}

async function handleForgotPassword(e) {
  e.preventDefault();
  const emailRaw = sanitizeInput(g('forgot-email')?.value || '');
  if (!emailRaw) { showToast('Email tidak valid.', 'warn'); return; }
  const btn = g('forgot-pw-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengirim...';
  try {
    const { error } = await db.auth.resetPasswordForEmail(emailRaw, {
      redirectTo: window.location.origin + window.location.pathname
    });
    if (error) { showToast(safeAuthErr(error), 'error'); return; }
    showToast('Link reset password telah dikirim ke email kamu.', 'success');
    hideForgotForm();
    g('forgot-email').value = '';
  } catch (err) {
    showToast(safeAuthErr(err), 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Kirim Link Reset';
  }
}

async function handleResetPassword(e) {
  e.preventDefault();
  const newPass = sanitizeInput(g('reset-new-pass')?.value || '');
  const confPass = sanitizeInput(g('reset-conf-pass')?.value || '');
  if (!newPass || newPass.length < 8) { showToast('Password minimal 8 karakter.', 'warn'); return; }
  if (newPass !== confPass) { showToast('Konfirmasi password tidak cocok.', 'warn'); return; }
  const btn = g('reset-pw-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
  try {
    const { error } = await db.auth.updateUser({ password: newPass });
    if (error) { showToast(safeAuthErr(error), 'error'); return; }
    showToast('Password berhasil diperbarui. Silakan login ulang.', 'success');
    closeModal('reset-pw-modal');
    g('reset-new-pass').value = '';
    g('reset-conf-pass').value = '';
    await db.auth.signOut();
  } catch (err) {
    showToast(safeAuthErr(err), 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-key"></i> Simpan Password Baru';
  }
}

function openChangePasswordModal() {
  if (!CU) { showToast('Silakan login terlebih dahulu.', 'warn'); return; }
  closeModal('profile-modal');
  g('chpw-new-pass').value = '';
  g('chpw-conf-pass').value = '';
  openModal('change-pw-modal');
}

async function handleChangePassword(e) {
  e.preventDefault();
  const newPass = sanitizeInput(g('chpw-new-pass')?.value || '');
  const confPass = sanitizeInput(g('chpw-conf-pass')?.value || '');
  if (!newPass || newPass.length < 8) { showToast('Password minimal 8 karakter.', 'warn'); return; }
  if (newPass !== confPass) { showToast('Konfirmasi password tidak cocok.', 'warn'); return; }
  const btn = g('chpw-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
  try {
    const { error } = await db.auth.updateUser({ password: newPass });
    if (error) { showToast(safeAuthErr(error), 'error'); return; }
    showToast('Password berhasil diubah.', 'success');
    closeModal('change-pw-modal');
    g('chpw-new-pass').value = '';
    g('chpw-conf-pass').value = '';
  } catch (err) {
    showToast(safeAuthErr(err), 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-key"></i> Simpan Password Baru';
  }
}

// ── 28. INIT ──────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Block portrait-secondary (upside-down) on mobile standalone PWA only
  (function initOrientationLock() {
    if (!screen.orientation || typeof screen.orientation.lock !== 'function') return;
    const onMobile = window.innerWidth <= 1024 || 'ontouchstart' in window;
    const inPWA    = window.matchMedia('(display-mode: standalone)').matches
                     || window.navigator.standalone === true;
    if (!onMobile || !inPWA) return;
    const snap = async () => {
      if (screen.orientation.type !== 'portrait-secondary') return;
      try {
        await screen.orientation.lock('portrait-primary');
        screen.orientation.unlock();
      } catch (_) {}
    };
    screen.orientation.addEventListener('change', snap);
    snap();
  })();

  // Ticker click + keyboard delegation — attached once, survives innerHTML replacements
  const _tb = g('ticker-bar');
  if (_tb) {
    const _doTickerClick = e => {
      const it = e.target.closest('.ticker-item');
      if (!it) return;
      handleTickerClick(it.dataset.tickType || '', it.dataset.tickId || '');
    };
    _tb.addEventListener('click', _doTickerClick);
    _tb.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      _doTickerClick(e);
    });
  }

  // loadDashboard is called by onAuthStateChange (INITIAL_SESSION/SIGNED_IN/SIGNED_OUT)
  await loadTicker();
  loadSponsors();
  setInterval(loadTicker,   5  * 60 * 1000);
  setInterval(loadSponsors, 30 * 60 * 1000);
});
