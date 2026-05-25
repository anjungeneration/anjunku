// ═══════════════════════════════════════════════════════════════════════════
// ANJUNKU Digital Command Center — script.js
// Build: 20260522-v101
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
let _allProducts = [];
let _newsMM = []; // multi-media state: [{file,objUrl,storedUrl,isExisting}]
let _prodMM = [];
let _galMM  = [];
let _notifs    = []; // notification center items
let _notifCh   = null;
let _galItems  = []; // [{id,url,cap,mediaList,user_id,created_at,status}]
let _lbItems   = []; // current lightbox item list
let _lbIdx     = 0;
let _lbTouchX  = null;
let _gdMediaList = []; // gallery detail current media list
let _gdIdx       = 0;
let _gdCurrentId = null;
let _ndMediaList = []; // news detail carousel media list
let _ndIdx       = 0;
let _divEditUid = null;
let _divEditCurrent = null;
let _adminWA = '';
let _finChart = null;
let _finChartFull = null;
let _finTimeframe = '3B';
let _finChartMode = 'semua'; // 'semua' | 'masuk' | 'keluar'
let _roleChannel = null;
let _logsChannel = null;
let _logFilter   = '';    // active filter key ('' = all)
let _logData     = [];    // full fetched dataset up to 200 rows
let _logExpanded = false; // false = show preview only
const _LOG_PREVIEW = 10;
let _profileRepairInProgress = false; // anti-race guard for _repairProfileIfNeeded
let _tickerHash = ''; // hash of last rendered ticker — prevents animation restart on no-change
let _deferredInstallPrompt = null;
let _dpmItems = [], _dpmIdx = 0, _dpmTouchX0 = null, _dpmType = '';
let _dpmNewsCache = {}, _dpmProdCache = {};
let _ndTouchX = null, _pdTouchX = null, _gdTouchX = null, _pdIdx = 0; // kept for compat
let _ndDragX = null, _ndDragDx = 0, _gdDragX = null, _gdDragDx = 0, _pdDragX = null, _pdDragDx = 0;
let _detailDragActive = false; // suppresses next img click when a real drag fired
let _imvItems = [], _imvIdx = 0, _imvTouchX = null, _imvDragX = 0, _imvGallery = false;

// Safe column selectors — no SELECT *
const PROF_COLS = 'id,email,full_name,username,role,avatar_url,bio,phone,location,division,title,show_whatsapp';
const NEWS_COLS = 'id,title,category,content,image_url,media_urls,status,user_id,created_at,revision_of';
const PROD_COLS = 'id,name,category,description,price,image_url,media_urls,whatsapp_link,status,user_id,created_at,revision_of';
const TRX_COLS  = 'id,type,date,description,category,amount,notes,bukti_url,user_id,created_at';
const GAL_COLS  = 'id,image_url,media_urls,title,status,user_id,created_at,revision_of';
const TICK_COLS = 'id,content,created_at';
const SPON_COLS = 'id,name,logo_url,website_url,is_active,priority';
const AI_COLS   = 'id,welcome_title,slogan,description,date,vision,mission,admin_wa';

// Division list — modular, edit here to add/remove options
const DIVISIONS = [
  'Humas','Logistik','Keuangan','Media','Keamanan',
  'Event','Komunitas','Operasional','Kemitraan','Relawan',
];

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
const isMod     = () => isOwner() || isKetua() || isAdmin();
const isOK      = () => isOwner() || isKetua();
const isFinance = () => isOwner() || isBend();
const loggedIn  = () => !!CU;

// Sections accessible without login — show approved-only content
const _PUBLIC_SECS = new Set(['news', 'products', 'gallery']);

function authGuard(cb, targetSec) {
  if (!loggedIn()) { if (targetSec) _saveRedirect(targetSec); showAuthModal('register'); return; }
  cb();
}
function authNavTo(sec) {
  if (!loggedIn() && !_PUBLIC_SECS.has(sec)) { _saveRedirect(sec); showAuthModal('login'); return; }
  navigateTo(sec);
}

// ── 4. MEDIA PROCESSOR (Canvas API → WebP) ──────────────────────────────────
const MAX_MB      = 10;
const WEBP_QUALITY = 0.7;
const MAX_PX      = 1080;

const ALLOWED_NON_IMAGE_MIME = new Set(['application/pdf']);

function extractStoragePath(url, bucket) {
  if (!url || typeof url !== 'string') return null;
  const seg = `/${bucket}/`;
  const idx = url.indexOf(seg);
  if (idx === -1) return null;
  return url.slice(idx + seg.length).split('?')[0] || null;
}

async function deleteStorageFile(url, bucket) {
  const path = extractStoragePath(url, bucket);
  if (!path) return null;
  const { error } = await db.storage.from(bucket).remove([path]);
  if (error) console.warn('[storage] delete failed:', bucket, path, error?.message);
  return error || null;
}

async function processImage(file) {
  if (!file.type.startsWith('image/'))
    throw new Error('File harus berupa gambar (JPG/PNG/WEBP/dll).');
  const mb = file.size / (1024 * 1024);
  if (mb > MAX_MB)
    throw new Error(`File terlalu besar (${mb.toFixed(1)} MB). Maksimum ${MAX_MB} MB.`);

  // HEIC/HEIF from iOS/Android cannot be decoded by browser Canvas — upload as-is
  const isHEIC = /\.(heic|heif)$/i.test(file.name) || /^image\/(heic|heif)/.test(file.type);
  if (isHEIC) return file;

  return new Promise(resolve => {
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
        if (!blob) return resolve(file); // conversion failed → upload original
        const fname = file.name.replace(/\.[^.]+$/, '.webp');
        resolve(new File([blob], fname, { type:'image/webp' }));
      }, 'image/webp', WEBP_QUALITY);
    };
    // Canvas can't decode this format — upload the original file as fallback
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
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
    if (!ALLOWED_NON_IMAGE_MIME.has(file.type)) throw new Error('Tipe file tidak diizinkan. Hanya gambar atau PDF yang diterima.');
  }
  const path = `${Date.now()}_${uploadFile.name}`;
  const { data, error } = await db.storage.from(bucket).upload(path, uploadFile, { contentType: uploadFile.type || 'application/octet-stream' });
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
    // Force-logout guard: _idleLogout() sets this flag before its async signOut.
    // If a SW_UPDATED reload fires while signOut is in-flight, the Supabase token
    // is still in localStorage and INITIAL_SESSION fires with a valid session.
    // Detect that here and immediately re-issue signOut — user lands as guest.
    try {
      if (localStorage.getItem(_FORCE_LOGOUT_KEY)) {
        localStorage.removeItem(_FORCE_LOGOUT_KEY);
        db.auth.signOut().catch(() => {});
        return;
      }
    } catch (_) {}
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
        CP = prof; syncUI();
        if (event === 'SIGNED_IN') showPersonalGreeting();
        _subscribeRoleRefresh();
        _repairProfileIfNeeded(); // patch any NULL fields without overwriting valid data
        if (isOK()) { loadLogTerminal(); _subscribeLogTerminal(); }
        _initNotifs();
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
    // Defensive cleanup: remove force-logout flag on any signed-out state
    try { localStorage.removeItem(_FORCE_LOGOUT_KEY); } catch (_) {}
    if (_roleChannel) { db.removeChannel(_roleChannel); _roleChannel = null; }
    if (_logsChannel) { db.removeChannel(_logsChannel); _logsChannel = null; }
    _clearNotifs();
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

  show('notif-wrap', lg);
  show('box-log-terminal', isOK());
  show('btn-add-news',    isMod());
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
const _IDLE_MS       = 60 * 60 * 1000;  // 60 min → auto-logout
const _WARN_MS       = 45 * 60 * 1000;  // 45 min → warning banner (15 min before logout)
const _IDLE_THROTTLE = 10 * 1000;       // reset timer at most once per 10 s
const _LOGOUT_BC_KEY    = 'anjunku_logout_v1';      // cross-tab logout broadcast
const _IDLE_TS_KEY      = 'anjunku_idle_ts_v1';    // cross-tab last-activity sync
const _FORCE_LOGOUT_KEY = 'anjunku_force_logout_v1'; // pre-signOut flag — survives page reload to block session restore

let _idleTimer   = null;
let _warnTimer   = null;
let _idleActive  = false;
let _idleLastAct = 0;   // timestamp of last confirmed user activity (only set when logged in)
let _criticalOp  = 0;   // >0 = upload/submit in flight — defer logout

// Called by upload/submit handlers to prevent mid-operation logout
function beginCriticalOp() { _criticalOp++; }
function endCriticalOp()   { if (_criticalOp > 0) _criticalOp--; }

function _resetIdleTimer() {
  // CRITICAL: check loggedIn() BEFORE updating _idleLastAct.
  // Pre-fix bug: login activity (typing password, clicking submit) stamped _idleLastAct,
  // then the throttle blocked the first real timer-set after login → timer never started.
  if (!loggedIn()) return;
  const now = Date.now();
  if (now - _idleLastAct < _IDLE_THROTTLE) return;
  _idleLastAct = now;
  try { localStorage.setItem(_IDLE_TS_KEY, String(now)); } catch (_) {}
  _hideIdleWarn();
  _scheduleTimers(now);
}

function _scheduleTimers(fromTs) {
  clearTimeout(_idleTimer);
  clearTimeout(_warnTimer);
  if (!loggedIn()) return;
  const now      = Date.now();
  const warnIn   = (fromTs + _WARN_MS)  - now;
  const logoutIn = (fromTs + _IDLE_MS)  - now;
  if (warnIn   > 0) _warnTimer = setTimeout(_showIdleWarn, warnIn);
  if (logoutIn > 0) _idleTimer = setTimeout(_idleLogout, logoutIn);
  else _idleLogout(); // already overdue (tab resumed from long sleep)
}

function _showIdleWarn() {
  if (!loggedIn()) return;
  let banner = g('idle-warn-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'idle-warn-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9998;background:#1a1200;border-bottom:2px solid #f59e0b;color:#fbbf24;display:flex;align-items:center;justify-content:center;gap:.75rem;padding:.55rem 1rem;font-size:.8rem;font-family:var(--font-body);text-align:center;flex-wrap:wrap;';
    document.body.prepend(banner);
  }
  banner.innerHTML = '<i class="fas fa-clock"></i><span>Sesi akan berakhir dalam <strong>15 menit</strong> karena tidak ada aktivitas.</span><button onclick="_resetIdleTimer()" style="background:#f59e0b;color:#000;border:none;border-radius:999px;padding:.28rem .8rem;font-weight:700;font-size:.76rem;cursor:pointer;flex-shrink:0;">Lanjutkan Sesi</button><button onclick="_hideIdleWarn()" style="background:none;border:none;color:#888;cursor:pointer;font-size:.85rem;padding:.2rem;flex-shrink:0;" aria-label="Tutup"><i class="fas fa-times"></i></button>';
  banner.style.display = 'flex';
}

function _hideIdleWarn() {
  const b = g('idle-warn-banner');
  if (b) b.style.display = 'none';
}

async function _idleLogout() {
  if (!loggedIn()) return;
  if (_criticalOp > 0) {
    // Upload/submit running — defer 2 minutes and retry
    _idleTimer = setTimeout(_idleLogout, 2 * 60 * 1000);
    return;
  }
  clearTimeout(_idleTimer); _idleTimer = null;
  clearTimeout(_warnTimer); _warnTimer = null;
  _idleLastAct = 0;
  _hideIdleWarn();
  // Set force-logout flag and lock nav to 'dashboard' BEFORE async signOut.
  // If a SW_UPDATED reload fires while signOut is in-flight, this flag blocks
  // Supabase from restoring the session on the next page load.
  try { localStorage.setItem(_FORCE_LOGOUT_KEY, '1'); } catch (_) {}
  _saveNav('dashboard');
  try { localStorage.removeItem(_FIN_OV_KEY); } catch (_) {}
  try { sessionStorage.removeItem(_REDIR_KEY); } catch (_) {}
  try { localStorage.removeItem(_IDLE_TS_KEY); } catch (_) {}
  // Broadcast to other tabs (storage event fires only in OTHER tabs)
  try { localStorage.setItem(_LOGOUT_BC_KEY, String(Date.now())); localStorage.removeItem(_LOGOUT_BC_KEY); } catch (_) {}
  await db.auth.signOut();
  try { localStorage.removeItem(_FORCE_LOGOUT_KEY); } catch (_) {}
  showToast('Sesi berakhir karena tidak ada aktivitas.', 'warn', 5000);
  navigateTo('dashboard');
}

function _onIdleVisChange() {
  if (document.hidden || !loggedIn()) return;
  // Mobile PWA: timers are suspended while backgrounded — compare wall-clock time on resume.
  // Also read localStorage to incorporate activity from other tabs while this one slept.
  let lastAct = _idleLastAct;
  try { const s = parseInt(localStorage.getItem(_IDLE_TS_KEY) || '0'); if (s > lastAct) lastAct = s; } catch (_) {}
  if (lastAct > 0) {
    _scheduleTimers(lastAct); // respects cross-tab activity
  } else {
    _scheduleTimers(Date.now()); // no activity recorded yet — treat as fresh login
  }
}

function _onStorageIdle(e) {
  // Another tab was active — sync timer so we don't log out unnecessarily
  if (e.key === _IDLE_TS_KEY && e.newValue && loggedIn()) {
    const ts = parseInt(e.newValue);
    if (ts > _idleLastAct) {
      _idleLastAct = ts;
      _hideIdleWarn();
      _scheduleTimers(ts);
    }
    return;
  }
  // Another tab triggered logout — follow suit
  if (e.key === _LOGOUT_BC_KEY && e.newValue && loggedIn()) {
    try { localStorage.removeItem(_FIN_OV_KEY); } catch (_) {}
    db.auth.signOut().catch(() => {});
  }
}

function _startIdleManager() {
  if (_idleActive) {
    // Re-login without page reload: reset stamp so throttle doesn't block first timer-set
    _idleLastAct = 0;
    _resetIdleTimer();
    return;
  }
  _idleActive = true;
  ['click', 'touchstart', 'mousemove', 'keydown', 'scroll', 'input'].forEach(ev =>
    window.addEventListener(ev, _resetIdleTimer, { passive: true, capture: true })
  );
  document.addEventListener('visibilitychange', _onIdleVisChange);
  window.addEventListener('storage', _onStorageIdle);
  _resetIdleTimer();
}

function _stopIdleManager() {
  clearTimeout(_idleTimer);
  clearTimeout(_warnTimer);
  _idleTimer   = null;
  _warnTimer   = null;
  _idleLastAct = 0;
  _criticalOp  = 0;
  _hideIdleWarn();
  try { localStorage.removeItem(_IDLE_TS_KEY); } catch (_) {}
  // _idleActive stays true — listeners stay attached for next login
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
  _resetIdleTimer();
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
  // Finance chart may have been skipped while section was hidden — rebuild now
  if (sec === 'dashboard' && typeof renderDashboardChart === 'function') {
    const { labels, data: bd } = buildChartSeries(allTrx || [], 'semua', 'Semua');
    renderDashboardChart(labels, bd);
  }
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

// ── Multi-media upload helpers ────────────────────────────────────────────
const MM_MAX = 3;
function _mmArr(prefix) { return prefix === 'news' ? _newsMM : prefix === 'gal' ? _galMM : _prodMM; }

function mmParseUrls(mediaUrls, fallback) {
  let arr = [];
  try { arr = JSON.parse(mediaUrls || '[]'); } catch { arr = []; }
  if (!Array.isArray(arr) || !arr.length) arr = fallback ? [fallback] : [];
  return arr.filter(Boolean);
}

function mmReset(prefix) {
  const arr = _mmArr(prefix);
  arr.forEach(it => { if (!it.isExisting && it.objUrl) URL.revokeObjectURL(it.objUrl); });
  arr.length = 0;
  mmRenderPreview(prefix);
}

function mmLoadExisting(prefix, mediaUrls, fallbackUrl) {
  mmReset(prefix);
  const arr = _mmArr(prefix);
  mmParseUrls(mediaUrls, fallbackUrl).slice(0, MM_MAX).forEach(u =>
    arr.push({ file: null, objUrl: u, storedUrl: u, isExisting: true })
  );
  mmRenderPreview(prefix);
}

function mmAddFiles(prefix) {
  const arr = _mmArr(prefix);
  const input = g(`${prefix}-mm-input`);
  const files = Array.from(input.files);
  input.value = '';
  let over = 0;
  for (const f of files) {
    if (arr.length >= MM_MAX) { over++; continue; }
    const mb = f.size / (1024 * 1024);
    if (mb > MAX_MB) { showToast(`"${f.name.slice(0,24)}" terlalu besar (${mb.toFixed(1)} MB). Maks ${MAX_MB} MB.`, 'error'); continue; }
    if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) { showToast(`Tipe tidak didukung: "${f.name.slice(0,24)}"`, 'error'); continue; }
    arr.push({ file: f, objUrl: URL.createObjectURL(f), storedUrl: null, isExisting: false });
  }
  if (over) showToast(`Maks ${MM_MAX} media per konten. ${over} file diabaikan.`, 'warn');
  mmRenderPreview(prefix);
}

function mmRemove(prefix, idx) {
  const arr = _mmArr(prefix);
  const it = arr[idx];
  if (it && !it.isExisting && it.objUrl) URL.revokeObjectURL(it.objUrl);
  arr.splice(idx, 1);
  mmRenderPreview(prefix);
}

function mmRenderPreview(prefix) {
  const arr = _mmArr(prefix);
  const el = g(`${prefix}-mm-preview`);
  const zone = g(`${prefix}-mm-zone`);
  if (!el) return;
  el.innerHTML = arr.map((it, i) => {
    const isVid = it.file ? it.file.type.startsWith('video/') : /\.(mp4|webm|ogg|mov)(\?|$)/i.test(it.objUrl);
    const thumb = isVid
      ? `<video src="${it.objUrl}" class="mm-thumb-media" muted playsinline></video>`
      : `<img src="${it.objUrl}" class="mm-thumb-media" loading="lazy" alt="">`;
    return `<div class="mm-thumb">${thumb}<button type="button" class="mm-remove" onclick="mmRemove('${prefix}',${i})" title="Hapus"><i class="fas fa-times"></i></button>${i===0?'<span class="mm-main-badge">Utama</span>':''}</div>`;
  }).join('');
  if (zone) zone.style.display = arr.length >= MM_MAX ? 'none' : '';
}

async function mmUploadAll(prefix, bucket) {
  const arr = _mmArr(prefix);
  const urls = [];
  beginCriticalOp();
  try {
    for (const it of arr) {
      if (it.isExisting && it.storedUrl) { urls.push(it.storedUrl); continue; }
      if (!it.file) continue;
      const url = await uploadMedia(it.file, bucket);
      it.storedUrl = url; it.isExisting = true; it.objUrl = url;
      urls.push(url);
    }
  } finally {
    endCriticalOp();
  }
  return urls;
}

// ── 12. MODAL HELPERS ─────────────────────────────────────────────────────────────
function openModal(id) {
  const m = g(id);
  if (!m) return;
  m.classList.remove('modal-in');
  m.style.display = 'flex';
  requestAnimationFrame(() => requestAnimationFrame(() => m.classList.add('modal-in')));
  if (id === 'lightbox-modal') { document.body.style.overflow = 'hidden'; document.documentElement.style.overflow = 'hidden'; }
  if (id === 'ticker-modal') loadTickerList();
  if (id === 'sponsor-modal') loadSponsorList();
}
function closeModal(id) {
  const m = g(id);
  if (!m) return;
  m.classList.remove('modal-in');
  setTimeout(() => { if (!m.classList.contains('modal-in')) m.style.display = 'none'; }, 220);
  if (id === 'lightbox-modal') { document.body.style.overflow = ''; document.documentElement.style.overflow = ''; }
}
function overlayClose(e, id) { if (e.target === g(id)) closeModal(id); }
function openLB(url, cap) { openLBItems([{url, cap: cap||''}], 0); }
function openLBItems(items, startIdx) {
  _lbItems = items;
  _lbIdx = Math.max(0, Math.min(startIdx||0, items.length-1));
  _renderLB();
  openModal('lightbox-modal');
}
function _renderLB() {
  const it = _lbItems[_lbIdx]; if (!it) return;
  const img = g('lb-img'); img.src = it.url; img.alt = it.cap||'';
  g('lb-cap').textContent = it.cap||'';
  const n = _lbItems.length;
  const ctr = g('lb-counter'); if (ctr) ctr.textContent = n>1 ? `${_lbIdx+1} / ${n}` : '';
  const prev=g('lb-prev'), next=g('lb-next');
  if (prev){prev.style.display=n>1?'':'none'; prev.disabled=_lbIdx===0;}
  if (next){next.style.display=n>1?'':'none'; next.disabled=_lbIdx===n-1;}
}
function lbPrev() { if (_lbIdx>0){_lbIdx--;_renderLB();} }
function lbNext() { if (_lbIdx<_lbItems.length-1){_lbIdx++;_renderLB();} }
function openGalLB(idx) {
  const it = _galItems[idx]; if (!it) return;
  if (it.id) { openGalleryDetail(it.id); return; }
  // Fallback: bare lightbox if id unavailable
  const items = it.mediaList && it.mediaList.length > 1
    ? it.mediaList.map(u => ({url: u, cap: it.cap}))
    : [{url: it.url, cap: it.cap}];
  openLBItems(items, 0);
}
// Image clicks on cards now open the full detail modal (not bare lightbox)
function openNewsMedia(id)    { openNewsDetail(id); }
function openProductMedia(id) { openProductDetail(id); }

function _lbTouchStart(e) { _lbTouchX = e.changedTouches[0].clientX; }
function _lbTouchEnd(e) {
  if (_lbTouchX === null) return;
  const dx = e.changedTouches[0].clientX - _lbTouchX;
  _lbTouchX = null;
  if (Math.abs(dx) < 40) return;
  if (dx < 0) lbNext(); else lbPrev();
}

// ── NEWS DETAIL ───────────────────────────────────────────────────────────────
async function openNewsDetail(id) {
  let n = allNews.find(x => String(x.id) === String(id));
  if (!n) {
    const { data } = await db.from('news').select(NEWS_COLS).eq('id', String(id)).single();
    if (!data) { showToast('Konten tidak ditemukan atau telah dihapus.', 'warn'); return; }
    n = data;
  }
  const mediaList = mmParseUrls(n.media_urls, n.image_url);
  const heroUrl = mediaList[0] || null;
  const heroWrap = g('nd-hero-wrap');
  const noHeroClose = g('nd-close-nohero');
  // Reset reader mode from previous open
  document.querySelector('.modal-article')?.classList.remove('reader-mode');
  if (heroUrl) {
    _ndMediaList = mediaList; _ndIdx = 0;
    const heroImg = g('nd-hero-img');
    if (heroImg) heroImg.src = heroUrl;
    if (heroWrap) heroWrap.style.display = '';
    const multi = mediaList.length > 1;
    const cnt = g('nd-hero-count');
    if (cnt) { cnt.textContent = multi ? `1 / ${mediaList.length}` : ''; cnt.style.display = multi ? '' : 'none'; }
    const np = g('nd-prev'), nn = g('nd-next');
    if (np) np.style.display = multi ? '' : 'none';
    if (nn) nn.style.display = multi ? '' : 'none';
    if (noHeroClose) noHeroClose.style.display = 'none';
  } else {
    if (heroWrap) heroWrap.style.display = 'none';
    if (noHeroClose) noHeroClose.style.display = '';
  }
  const catEl = g('nd-cat');
  if (catEl) { catEl.textContent = n.category || ''; catEl.className = `cat-badge cat-${n.category||'info'}`; }
  const dateEl = g('nd-date'); if (dateEl) dateEl.innerHTML = `<i class="fas fa-clock"></i> ${fmtDate(n.created_at)}`;
  sv2('nd-title', n.title || '');
  const contentEl = g('nd-content'); if (contentEl) contentEl.innerHTML = esc(n.content || '').replace(/\n/g, '<br>');
  // Author section (async, non-blocking)
  const authorEl = g('nd-author'); if (authorEl) authorEl.innerHTML = '';
  if (n.user_id && authorEl) {
    db.from('profiles').select('full_name,avatar_url,role').eq('id', n.user_id).single()
      .then(({ data: a }) => {
        if (a && authorEl) authorEl.innerHTML = `<img src="${a.avatar_url||avFallback(a.full_name)}" class="nd-author-av" onerror="this.src='${avFallback(a.full_name||'?')}'"><div class="nd-author-info"><span class="nd-author-name">${esc(a.full_name||'')}</span><span class="role-badge role-${a.role||'anggota'}">${(a.role||'anggota').toUpperCase()}</span></div>`;
      });
  }
  const footer = g('nd-footer-actions');
  if (footer) {
    const canMod = isMod();
    footer.innerHTML = (loggedIn() ? `<button class="btn-wa" onclick="shareNewsToWA('${n.id}')"><i class="fab fa-whatsapp"></i> Bagikan</button>` : '')
      + (canMod ? `<button class="btn-pd-edit" onclick="closeModal('news-detail-modal');editNews('${n.id}')"><i class="fas fa-edit"></i> Edit</button><button class="btn-del-xs" onclick="closeModal('news-detail-modal');deleteNews('${n.id}')"><i class="fas fa-trash"></i></button>` : '');
  }
  openModal('news-detail-modal');
}

function ndSetIdx(idx) {
  if (idx < 0 || idx >= _ndMediaList.length) return;
  _ndIdx = idx;
  _fadeSwap(g('nd-hero-img'), _ndMediaList[idx]);
  const ctr = g('nd-hero-count'); if (ctr) ctr.textContent = `${_ndIdx + 1} / ${_ndMediaList.length}`;
}
function ndPrev() { ndSetIdx(_ndIdx - 1); }
function ndNext() { ndSetIdx(_ndIdx + 1); }
function ndOpenFull() {
  if (!_ndMediaList.length) return;
  const title = g('nd-title')?.textContent || '';
  openLBItems(_ndMediaList.map(u => ({url: u, cap: title})), _ndIdx);
}

// ── PRODUCT DETAIL ────────────────────────────────────────────────────────────
let _pdCurrentId   = null;
let _pdCurrentData = null; // cache for products fetched from DB not in allProds
async function openProductDetail(id) {
  let p = allProds.find(x => String(x.id) === String(id));
  if (!p) {
    const { data } = await db.from('products').select(PROD_COLS).eq('id', String(id)).single();
    if (!data) { showToast('Produk tidak ditemukan atau telah dihapus.', 'warn'); return; }
    p = data;
  }
  _pdCurrentId   = String(id);
  _pdCurrentData = p;
  const mediaList = mmParseUrls(p.media_urls, p.image_url);
  pdSetMedia(0, id, mediaList);
  const catEl = g('pd-cat');
  if (catEl) { catEl.textContent = p.category || ''; catEl.className = `cat-badge cat-${p.category||'lainnya'}`; }
  sv2('pd-name', p.name || '');
  sv2('pd-price', fmtRp(p.price));
  const pdDescEl = g('pd-desc'); if (pdDescEl) pdDescEl.innerHTML = esc(p.description || '').replace(/\n/g, '<br>');
  const thumbsEl = g('pd-thumbs');
  if (thumbsEl) {
    if (mediaList.length > 1) {
      thumbsEl.style.display = '';
      thumbsEl.innerHTML = mediaList.map((u, i) =>
        `<img src="${u}" class="pd-thumb${i===0?' pd-thumb-active':''}" onclick="pdSetMedia(${i})" data-idx="${i}" alt="${esc(p.name)} ${i+1}" loading="lazy">`
      ).join('');
    } else {
      thumbsEl.style.display = 'none';
    }
  }
  // Author section (async, non-blocking)
  const pdAuthorEl = g('pd-author'); if (pdAuthorEl) pdAuthorEl.innerHTML = '';
  if (p.user_id && pdAuthorEl) {
    db.from('profiles').select('full_name,avatar_url,role').eq('id', p.user_id).single()
      .then(({ data: a }) => {
        if (a && pdAuthorEl) pdAuthorEl.innerHTML = `<img src="${a.avatar_url||avFallback(a.full_name)}" class="nd-author-av" onerror="this.src='${avFallback(a.full_name||'?')}'"><div class="nd-author-info"><span class="nd-author-name">${esc(a.full_name||'')}</span><span class="role-badge role-${a.role||'anggota'}">${(a.role||'anggota').toUpperCase()}</span></div>`;
      });
  }
  const cta = g('pd-cta');
  if (cta) {
    const waLink = p.whatsapp_link ? buildWALink(p.whatsapp_link, p.name) : null;
    const canEdit = isMod() || CU?.id === p.user_id;
    cta.innerHTML = (waLink && loggedIn() ? `<a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn-pd-wa"><i class="fab fa-whatsapp"></i> Hubungi Penjual</a>` : '')
      + (loggedIn() ? `<button class="btn-pd-share" onclick="shareProduct('${p.id}')"><i class="fas fa-share-alt"></i> Bagikan</button>` : '')
      + (canEdit ? `<button class="btn-pd-edit" onclick="closeModal('product-detail-modal');editProduct('${p.id}')"><i class="fas fa-edit"></i> Edit</button>` : '');
  }
  openModal('product-detail-modal');
}

function pdSetMedia(idx, _unused, _mediaList) {
  _pdIdx = idx;
  const id = _pdCurrentId; if (!id) return;
  const p = _pdCurrentData || allProds.find(x => String(x.id) === String(id)); if (!p) return;
  const mediaList = _mediaList || mmParseUrls(p.media_urls, p.image_url);
  const url = mediaList[idx] || null;
  const imgEl = g('pd-main-img'), noImg = g('pd-noimg');
  if (url) {
    if (imgEl) { _fadeSwap(imgEl, url); imgEl.style.display = ''; imgEl.style.cursor = 'zoom-in'; imgEl.onclick = () => { if (_detailDragActive) { _detailDragActive = false; return; } pdOpenImmersive(); }; }
    if (noImg) noImg.style.display = 'none';
  } else {
    if (imgEl) imgEl.style.display = 'none';
    if (noImg) noImg.style.display = '';
  }
  const thumbsEl = g('pd-thumbs');
  if (thumbsEl) thumbsEl.querySelectorAll('.pd-thumb').forEach((t, i) => t.classList.toggle('pd-thumb-active', i === idx));
}
function pdOpenFull() {
  const p = _pdCurrentData || allProds.find(x => String(x.id) === String(_pdCurrentId));
  if (!p) return;
  const ml = mmParseUrls(p.media_urls, p.image_url);
  const idx = parseInt(g('pd-thumbs')?.querySelector('.pd-thumb-active')?.dataset?.idx || '0') || 0;
  openLBItems(ml.map(u => ({url: u, cap: p.name || ''})), idx);
}

document.addEventListener('keydown', e => {
  const lbOpen  = g('lightbox-modal')?.style.display  !== 'none';
  const imvOpen = g('immersive-modal')?.style.display !== 'none';
  if (lbOpen) {
    if (e.key==='ArrowLeft') { e.preventDefault(); lbPrev();  return; }
    if (e.key==='ArrowRight'){ e.preventDefault(); lbNext();  return; }
  }
  if (imvOpen) {
    if (e.key==='ArrowLeft') { e.preventDefault(); imvPrev(); return; }
    if (e.key==='ArrowRight'){ e.preventDefault(); imvNext(); return; }
    if (e.key==='Escape')    { e.preventDefault(); closeImmersive(); return; }
  }
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
    document.body.style.overflow = ''; document.documentElement.style.overflow = '';
  }
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
  try {
    const _cut = new Date(); _cut.setDate(_cut.getDate() - 7);
    ({ data } = await dbQ(db.from('news').select(NEWS_COLS).eq('status','approved').gte('created_at',_cut.toISOString()).order('created_at',{ascending:false}).limit(3)));
  } catch (_) { return; }
  if (!data?.length) { el.innerHTML = '<div class="empty-mini"><i class="fas fa-inbox"></i>&nbsp; Belum ada berita.</div>'; return; }
  _dpmNewsCache = {};
  data.forEach(n => { _dpmNewsCache[n.id] = n; });
  el.innerHTML = data.map(n => `
    <div class="npi" onclick="dashGoDetail('news','${n.id}')">
      <div class="npi-body">
        <span class="npi-cat cat-badge cat-${n.category||'info'}">${n.category||'info'}</span>
        <strong>${esc(n.title)}</strong>
        <p>${esc((n.content||'').slice(0,100))}${(n.content?.length>100)?'...':''}</p>
        <div class="npi-date"><i class="fas fa-clock"></i> ${fmtDate(n.created_at)}</div>
      </div>
      ${n.image_url?`<div class="npi-media"><img src="${n.image_url}" class="npi-thumb" alt="" loading="lazy"></div>`:''}
    </div>`).join('');
}

async function loadProductsPreview() {
  const el = g('products-preview-grid');
  el.innerHTML = '<div class="skel skel-card"></div><div class="skel skel-card"></div><div class="skel skel-card"></div>';
  let data;
  try { ({ data } = await dbQ(db.from('products').select(PROD_COLS).eq('status','approved').order('created_at',{ascending:false}).limit(3))); } catch (_) { return; }
  if (!data?.length) { el.innerHTML = '<div class="empty-mini"><i class="fas fa-box-open"></i>&nbsp; Belum ada produk.</div>'; return; }
  _dpmProdCache = {};
  data.forEach(p => { _dpmProdCache[p.id] = p; });
  el.innerHTML = data.map(p => `
    <div class="ppc" onclick="dashGoDetail('product','${p.id}')">
      <div class="ppc-info">
        <span class="ppc-cat cat-badge cat-${p.category||'lainnya'}">${p.category||'lainnya'}</span>
        <strong>${esc(p.name)}</strong>
        <div class="ppc-price">${fmtRp(p.price)}</div>
      </div>
      <div class="ppc-img">${p.image_url?`<img src="${p.image_url}" alt="${esc(p.name)}" loading="lazy">`:'<div class="ppc-noimg"><i class="fas fa-box-open fa-2x"></i></div>'}</div>
    </div>`).join('');
}

// ── Dashboard: navigate to page + auto-open detail ───────────────────────────
function dashGoDetail(type, id) {
  navigateTo(type === 'news' ? 'news' : 'products');
  type === 'news' ? openNewsDetail(id) : openProductDetail(id);
}

// ── Dashboard Preview Modal (legacy — kept dormant) ───────────────────────────
function openDashPreviewById(type, id) {
  const item = (type === 'news' ? _dpmNewsCache : _dpmProdCache)[id];
  if (!item) return;
  _dpmType = type;
  _dpmItems = mmParseUrls(item.media_urls, item.image_url);
  _dpmIdx = 0;
  _dpmRender(item);
  openModal('dash-preview-modal');
}

function _dpmRender(item) {
  const wrap = g('dpm-media-wrap');
  const img  = g('dpm-img');
  const prev = g('dpm-prev');
  const next = g('dpm-next');
  if (_dpmItems.length > 0) {
    img.src = _dpmItems[_dpmIdx];
    wrap.style.display = '';
  } else {
    wrap.style.display = 'none';
  }
  prev.style.display = (_dpmItems.length > 1) ? '' : 'none';
  next.style.display = (_dpmItems.length > 1) ? '' : 'none';
  const cat = item.category || (_dpmType === 'news' ? 'info' : 'lainnya');
  const catEl = g('dpm-cat');
  catEl.className = `cat-badge dpm-cat cat-${cat}`;
  catEl.textContent = cat;
  g('dpm-title').textContent = item.title || item.name || '';
  const body = item.content || item.description || '';
  g('dpm-desc').textContent = body.slice(0, 200) + (body.length > 200 ? '...' : '');
  const itemId = item.id;
  g('dpm-full-btn').onclick = () => {
    closeModal('dash-preview-modal');
    _dpmType === 'news' ? openNewsDetail(itemId) : openProductDetail(itemId);
  };
}

function dpmPrev() {
  if (_dpmItems.length < 2) return;
  _dpmIdx = (_dpmIdx - 1 + _dpmItems.length) % _dpmItems.length;
  g('dpm-img').src = _dpmItems[_dpmIdx];
}

function dpmNext() {
  if (_dpmItems.length < 2) return;
  _dpmIdx = (_dpmIdx + 1) % _dpmItems.length;
  g('dpm-img').src = _dpmItems[_dpmIdx];
}

function _dpmTs(e) { _dpmTouchX0 = e.touches[0].clientX; }
function _dpmTe(e) {
  if (_dpmTouchX0 === null) return;
  const dx = e.changedTouches[0].clientX - _dpmTouchX0;
  _dpmTouchX0 = null;
  if (Math.abs(dx) < 40) return;
  dx < 0 ? dpmNext() : dpmPrev();
}

// ── Detail Modals: Unified pointer drag (mouse + touch, all three modules) ────
// setPointerCapture ensures pointermove/pointerup fire even if pointer leaves
// the element — critical for fast mouse drags on desktop.
// _detailDragActive suppresses the next img click after a real swipe so that
// mouse-drag doesn't accidentally trigger the immersive opener on release.

function _ndPd(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  _ndDragX = e.clientX; _ndDragDx = 0;
  g('nd-hero-wrap')?.setPointerCapture(e.pointerId);
}
function _ndPm(e) {
  if (_ndDragX === null) return;
  _ndDragDx = e.clientX - _ndDragX;
  if (Math.abs(_ndDragDx) > 8) _detailDragActive = true;
}
function _ndPu(e) {
  if (_ndDragX === null) return;
  const dx = _ndDragDx; _ndDragX = null; _ndDragDx = 0;
  if (Math.abs(dx) < 30 || _ndMediaList.length < 2) { _detailDragActive = false; return; }
  dx < 0 ? ndNext() : ndPrev();
}

function _gdPd(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  _gdDragX = e.clientX; _gdDragDx = 0;
  g('gd-viewer')?.setPointerCapture(e.pointerId);
}
function _gdPm(e) {
  if (_gdDragX === null) return;
  _gdDragDx = e.clientX - _gdDragX;
  if (Math.abs(_gdDragDx) > 8) _detailDragActive = true;
}
function _gdPu(e) {
  if (_gdDragX === null) return;
  const dx = _gdDragDx; _gdDragX = null; _gdDragDx = 0;
  if (Math.abs(dx) < 30 || _gdMediaList.length < 2) { _detailDragActive = false; return; }
  dx < 0 ? gdNext() : gdPrev();
}

function _pdPd(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const p = _pdCurrentData;
  if (!p || mmParseUrls(p.media_urls, p.image_url).length < 2) return;
  _pdDragX = e.clientX; _pdDragDx = 0;
  g('pd-img-wrap')?.setPointerCapture(e.pointerId);
}
function _pdPm(e) {
  if (_pdDragX === null) return;
  _pdDragDx = e.clientX - _pdDragX;
  if (Math.abs(_pdDragDx) > 8) _detailDragActive = true;
}
function _pdPu(e) {
  if (_pdDragX === null) return;
  const dx = _pdDragDx; _pdDragX = null; _pdDragDx = 0;
  if (Math.abs(dx) < 30) { _detailDragActive = false; return; }
  const p = _pdCurrentData; if (!p) return;
  const ml = mmParseUrls(p.media_urls, p.image_url); if (ml.length < 2) return;
  dx < 0 ? pdSetMedia(Math.min(_pdIdx + 1, ml.length - 1)) : pdSetMedia(Math.max(_pdIdx - 1, 0));
}

// ── Cross-fade helper — swaps img src with opacity transition (no flash) ───────
function _fadeSwap(imgEl, src) {
  if (!imgEl || !src) return;
  imgEl.classList.add('img-fade');
  setTimeout(() => {
    const done = () => imgEl.classList.remove('img-fade');
    imgEl.onload  = done;
    imgEl.onerror = done;
    imgEl.src = src;
    if (imgEl.complete) done(); // already cached — onload may fire synchronously
  }, 160);
}

// ── IMMERSIVE READER ──────────────────────────────────────────────────────────
// Single shared overlay used by news, product, and gallery detail modals.
// Clicking media in a detail modal (Step 2) triggers openImmersive().
// Always uses translate3d carousel so pointer-drag works on desktop + mobile.
function openImmersive(mediaList, startIdx, contentHtml, titleShort) {
  if (!mediaList || !mediaList.length) return;
  _imvItems = mediaList;
  _imvIdx   = Math.max(0, Math.min(startIdx || 0, mediaList.length - 1));
  _imvGallery = false; // always carousel — gallery CSS mode retired
  const box = g('immersive-modal')?.querySelector('.imv-box');
  if (box) box.classList.remove('imv-gallery');

  const track = g('imv-track');
  if (track) {
    track.innerHTML = mediaList.map(u =>
      `<div class="imv-slide"><img src="${esc(u)}" alt="" draggable="false" onload="this.classList.add('imv-img-rdy')" onerror="this.classList.add('imv-img-rdy')"></div>`
    ).join('');
    // Mark already-cached images immediately
    track.querySelectorAll('.imv-slide img').forEach(img => { if (img.complete) img.classList.add('imv-img-rdy'); });
    track.style.transition = 'none';
    track.style.transform  = `translate3d(-${_imvIdx * 100}%, 0, 0)`;
  }

  const multi = mediaList.length > 1;
  const ctr = g('imv-counter');
  if (ctr) { ctr.textContent = multi ? `${_imvIdx + 1} / ${mediaList.length}` : ''; ctr.style.display = multi ? '' : 'none'; }
  const ts = g('imv-title-sm');
  if (ts) ts.textContent = titleShort || '';
  const pp = g('imv-prev'), np = g('imv-next');
  if (pp) { pp.style.display = multi ? '' : 'none'; pp.disabled = _imvIdx === 0; }
  if (np) { np.style.display = multi ? '' : 'none'; np.disabled = _imvIdx === mediaList.length - 1; }
  const cnt = g('imv-content');
  if (cnt) cnt.innerHTML = contentHtml || '';
  openModal('immersive-modal');
}

function closeImmersive() { closeModal('immersive-modal'); }

function imvSetIdx(idx) {
  if (idx < 0 || idx >= _imvItems.length) return;
  _imvIdx = idx;
  const track = g('imv-track');
  if (track) {
    track.style.transition = 'transform .32s cubic-bezier(.25,.46,.45,.94)';
    track.style.transform  = `translate3d(-${idx * 100}%, 0, 0)`;
  }
  const pp = g('imv-prev'), np = g('imv-next');
  if (pp) pp.disabled = idx === 0;
  if (np) np.disabled = idx === _imvItems.length - 1;
  const ctr = g('imv-counter');
  if (ctr) ctr.textContent = `${idx + 1} / ${_imvItems.length}`;
}
function imvPrev() { imvSetIdx(_imvIdx - 1); }
function imvNext() { imvSetIdx(_imvIdx + 1); }

// Immersive carousel — pointer events (mouse + touch unified, desktop + mobile)
// _imvDragBase stores the frozen % offset when drag starts (mid-animation safe)
let _imvDragBase = 0;
function _imvPd(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (_imvItems.length < 2) return; // nothing to swipe
  const track = g('imv-track');
  if (track) {
    // Freeze at current rendered position so rapid swipes don't flicker
    const cs = window.getComputedStyle(track);
    const mat = new DOMMatrix(cs.transform);
    _imvDragBase = mat.m41; // current translateX in px
    track.style.transition = 'none';
    track.style.transform  = `translate3d(${_imvDragBase}px, 0, 0)`;
  }
  _imvTouchX = e.clientX; _imvDragX = 0;
  g('imv-media-area')?.setPointerCapture(e.pointerId);
}
function _imvPm(e) {
  if (_imvTouchX === null) return;
  _imvDragX = e.clientX - _imvTouchX;
  const track = g('imv-track');
  if (track) track.style.transform = `translate3d(${_imvDragBase + _imvDragX}px, 0, 0)`;
}
function _imvPu() {
  if (_imvTouchX === null) return;
  const dx = _imvDragX;
  _imvTouchX = null; _imvDragX = 0; _imvDragBase = 0;
  if (Math.abs(dx) < 30) {
    // Snap back to current logical index
    const track = g('imv-track');
    if (track) {
      track.style.transition = 'transform .32s cubic-bezier(.25,.46,.45,.94)';
      track.style.transform  = `translate3d(-${_imvIdx * 100}%, 0, 0)`;
    }
    return;
  }
  dx < 0 ? imvSetIdx(Math.min(_imvIdx + 1, _imvItems.length - 1))
          : imvSetIdx(Math.max(_imvIdx - 1, 0));
}

// ── Module-specific immersive openers ─────────────────────────────────────────
function ndOpenImmersive() {
  if (!_ndMediaList.length) return;
  const title      = g('nd-title')?.textContent || '';
  const catHtml    = g('nd-cat')?.outerHTML || '';
  const dateHtml   = g('nd-date')?.outerHTML || '';
  const authorHtml = g('nd-author')?.innerHTML || '';
  const bodyHtml   = g('nd-content')?.innerHTML || '';
  const actHtml    = g('nd-footer-actions')?.innerHTML || '';
  openImmersive(_ndMediaList, _ndIdx,
    `<div class="imv-content-title">${esc(title)}</div>
     <div class="imv-content-meta">${catHtml}${dateHtml}</div>
     ${authorHtml ? `<div class="nd-author" style="margin-bottom:.85rem;padding-bottom:.7rem;border-bottom:1px solid rgba(255,255,255,.06);">${authorHtml}</div>` : ''}
     <div class="imv-content-body">${bodyHtml}</div>
     ${actHtml ? `<div class="imv-content-actions">${actHtml}</div>` : ''}`,
    title);
}

function gdOpenImmersive() {
  if (!_gdMediaList.length) return;
  const title      = g('gd-title')?.textContent || '';
  const dateHtml   = g('gd-date')?.outerHTML || '';
  const cntHtml    = g('gd-media-count')?.outerHTML || '';
  const authorHtml = g('gd-author')?.innerHTML || '';
  const actHtml    = g('gd-actions')?.innerHTML || '';
  openImmersive(_gdMediaList, _gdIdx,
    `<div class="imv-content-title">${esc(title)}</div>
     <div class="imv-content-meta">${dateHtml}${cntHtml}</div>
     ${authorHtml ? `<div class="nd-author" style="margin-bottom:.85rem;padding-bottom:.7rem;border-bottom:1px solid rgba(255,255,255,.06);">${authorHtml}</div>` : ''}
     ${actHtml ? `<div class="imv-content-actions">${actHtml}</div>` : ''}`,
    title);
}

function pdOpenImmersive() {
  if (!_pdCurrentData) return;
  const ml = mmParseUrls(_pdCurrentData.media_urls, _pdCurrentData.image_url);
  if (!ml.length) return;
  const name     = g('pd-name')?.textContent || _pdCurrentData.name || '';
  const catHtml  = g('pd-cat')?.outerHTML || '';
  const price    = g('pd-price')?.textContent || '';
  const descHtml = g('pd-desc')?.innerHTML || '';
  const ctaHtml  = g('pd-cta')?.innerHTML || '';
  openImmersive(ml, _pdIdx,
    `<div class="imv-content-title">${esc(name)}</div>
     <div class="imv-content-meta">${catHtml}<span class="pd-price" style="font-size:1rem;">${esc(price)}</span></div>
     ${descHtml ? `<div class="imv-content-body">${descHtml}</div>` : ''}
     ${ctaHtml ? `<div class="imv-content-actions">${ctaHtml}</div>` : ''}`,
    name);
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
  // ── All transactions: public transparency (guest + member) ────────────────
  const al   = g('fin-activity-list');
  const phDash = g('fin-chart-placeholder');
  if (al)     al.innerHTML = '<div class="skel skel-act"></div>'.repeat(4);
  if (phDash) phDash.innerHTML = '<div class="skel skel-chart"></div>';

  let trxAll = [];
  try {
    const { data } = await dbQ(
      db.from('transactions')
        .select('type,amount,date,description')
        .order('date', { ascending: true })
    );
    trxAll = data || [];
  } catch (_) { trxAll = []; }

  // ── Activity list (6 most recent) ────────────────────────────────────────
  if (al) {
    const recent = [...trxAll].reverse().slice(0, 6);
    al.innerHTML = recent.length
      ? recent.map(t => `
          <div class="act-item">
            <div class="act-dot ${t.type}"></div>
            <div class="act-info">
              <span class="act-desc">${esc(t.description||'–')}</span>
              <span class="act-date">${fmtDateShort(t.date)}</span>
            </div>
            <span class="act-amt ${t.type}">${t.type==='masuk'?'+':'-'}${fmtRp(t.amount)}</span>
          </div>`).join('')
      : '<div class="empty-mini" style="color:#333;"><i class="fas fa-inbox"></i>&nbsp; Belum ada transaksi.</div>';
  }

  // ── Summary totals (ALL users — public transparency) ─────────────────────
  let m = 0, k = 0;
  trxAll.forEach(t => { const a = parseFloat(t.amount)||0; t.type==='masuk' ? (m+=a) : (k+=a); });
  sv2('ov-saldo',  fmtRpHead(m - k));
  sv2('ov-masuk',  fmtRpHead(m));
  sv2('ov-keluar', fmtRpHead(k));

  const dates = trxAll.map(t => t.date).filter(Boolean).sort();
  sv2('ov-updated', dates.length ? 'Diperbarui: ' + fmtDateShort(dates[dates.length-1]) : 'Diperbarui: –');
  const periodeEl = g('ov-periode');
  if (periodeEl) periodeEl.innerHTML = dates.length
    ? `<i class="fas fa-calendar-alt"></i> Periode: ${fmtDateShort(dates[0])} — ${fmtDateShort(dates[dates.length-1])}`
    : 'Periode: –';

  // ── Dashboard chart: absolute running balance, all transactions ─────────────
  const { labels, data: balData } = buildChartSeries(trxAll, 'semua', 'Semua');
  renderDashboardChart(labels, balData);
}

// ── 13b. NOTIFICATION CENTER ──────────────────────────────────────────────────────
const _NOTIF_READ_KEY = 'anjunku_notif_read_ts';

function _timeSince(dateStr) {
  const sec = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (sec < 60) return 'baru saja';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  return `${Math.floor(hr / 24)} hari lalu`;
}

async function _initNotifs() {
  if (!CU) return;
  _notifs = [];
  try {
    const [{ data: newsData }, { data: prodData }] = await Promise.all([
      dbQ(db.from('news').select('id,title,category,created_at').eq('status','approved').order('created_at',{ascending:false}).limit(15)),
      dbQ(db.from('products').select('id,name,category,created_at').eq('status','approved').order('created_at',{ascending:false}).limit(15)),
    ]);
    const newsFeed = (newsData||[]).map(n => ({id:'n'+n.id, type:'news', title:n.title, message:`Kategori: ${n.category||'info'}`, created_at:n.created_at, ref_id:n.id}));
    const prodFeed = (prodData||[]).map(p => ({id:'p'+p.id, type:'product', title:p.name, message:`Kategori: ${p.category||'lainnya'}`, created_at:p.created_at, ref_id:p.id}));
    let pending = [];
    if (isMod()) {
      const [{ data: pNews }, { data: pProds }] = await Promise.all([
        dbQ(db.from('news').select('id,title,created_at').eq('status','pending').order('created_at',{ascending:false}).limit(5)),
        dbQ(db.from('products').select('id,name,created_at').eq('status','pending').order('created_at',{ascending:false}).limit(5)),
      ]);
      pending = [
        ...(pNews||[]).map(n => ({id:'pn'+n.id, type:'news', title:n.title, message:'Menunggu persetujuan moderator', created_at:n.created_at, ref_id:n.id})),
        ...(pProds||[]).map(p => ({id:'pp'+p.id, type:'product', title:p.name, message:'Menunggu persetujuan moderator', created_at:p.created_at, ref_id:p.id})),
      ];
    }
    _notifs = [...pending, ...newsFeed, ...prodFeed]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 30);
  } catch (_) {}
  _renderNotifBadge();
  _subscribeNotifs();
}

function _subscribeNotifs() {
  if (_notifCh) { db.removeChannel(_notifCh); _notifCh = null; }
  if (!CU) return;
  _notifCh = db.channel('notif-feed-' + CU.id)
    .on('postgres_changes', {event:'UPDATE', schema:'public', table:'news'}, payload => {
      const n = payload.new;
      if (n.status === 'approved') {
        _pushNotif({id:'n'+n.id, type:'news', title:n.title, message:`Kategori: ${n.category||'info'}`, created_at:new Date().toISOString(), ref_id:n.id});
      }
    })
    .on('postgres_changes', {event:'UPDATE', schema:'public', table:'products'}, payload => {
      const p = payload.new;
      if (p.status === 'approved') {
        _pushNotif({id:'p'+p.id, type:'product', title:p.name, message:`Kategori: ${p.category||'lainnya'}`, created_at:new Date().toISOString(), ref_id:p.id});
      }
    })
    .subscribe();
}

function _pushNotif(item) {
  if (_notifs.some(n => n.id === item.id)) return;
  _notifs.unshift(item);
  if (_notifs.length > 50) _notifs.pop();
  _renderNotifBadge();
  const panel = g('notif-panel');
  if (panel && panel.style.display !== 'none') _renderNotifPanel();
}

function _renderNotifBadge() {
  const badge = g('notif-badge'); if (!badge) return;
  const readTs = parseInt(localStorage.getItem(_NOTIF_READ_KEY) || '0');
  const unread = _notifs.filter(n => new Date(n.created_at).getTime() > readTs).length;
  badge.textContent = unread > 9 ? '9+' : (unread || '');
  badge.style.display = unread > 0 ? '' : 'none';
}

function _renderNotifPanel() {
  const list = g('notif-list'); if (!list) return;
  const readTs = parseInt(localStorage.getItem(_NOTIF_READ_KEY) || '0');
  if (!_notifs.length) {
    list.innerHTML = '<div class="notif-empty"><i class="fas fa-bell-slash"></i><p>Belum ada notifikasi</p></div>';
    return;
  }
  const iconMap = {news:'fas fa-newspaper', product:'fas fa-box-open', gallery:'fas fa-images', finance:'fas fa-wallet'};
  list.innerHTML = _notifs.map(n => {
    const unread = new Date(n.created_at).getTime() > readTs;
    const icon = iconMap[n.type] || 'fas fa-bell';
    return `<div class="notif-item${unread?' notif-unread':''}" onclick="notifClick('${n.id}')">
      <div class="notif-icon"><i class="${icon}"></i></div>
      <div class="notif-body-col">
        <div class="notif-title">${esc(n.title||'')}</div>
        ${n.message?`<div class="notif-text">${esc(n.message)}</div>`:''}
        <div class="notif-time">${_timeSince(n.created_at)}</div>
      </div>
      ${unread?'<span class="notif-dot"></span>':''}
    </div>`;
  }).join('');
}

function notifClick(id) {
  const n = _notifs.find(x => String(x.id) === String(id)); if (!n) return;
  markAllNotifsRead();
  closeNotifPanel();
  if (n.type === 'news') {
    navigateTo('news');
    openNewsDetail(n.ref_id); // async, fetches from DB if not in allNews
  } else if (n.type === 'product') {
    navigateTo('products');
    openProductDetail(n.ref_id);
  } else if (n.type === 'gallery') {
    navigateTo('gallery');
    openGalleryDetail(n.ref_id);
  } else if (n.type === 'finance') {
    navigateTo('finance');
  }
}

function toggleNotifPanel() {
  const panel = g('notif-panel'); if (!panel) return;
  if (panel.style.display !== 'none') { closeNotifPanel(); return; }
  panel.style.display = '';
  _renderNotifPanel();
}

function closeNotifPanel() {
  const panel = g('notif-panel'); if (!panel) return;
  panel.style.display = 'none';
}

function markAllNotifsRead() {
  localStorage.setItem(_NOTIF_READ_KEY, Date.now().toString());
  _renderNotifBadge();
  const panel = g('notif-panel');
  if (panel && panel.style.display !== 'none') _renderNotifPanel();
}

function _clearNotifs() {
  if (_notifCh) { db.removeChannel(_notifCh); _notifCh = null; }
  _notifs = [];
  _renderNotifBadge();
  closeNotifPanel();
}

document.addEventListener('click', e => {
  const wrap = g('notif-wrap');
  if (wrap && !wrap.contains(e.target)) closeNotifPanel();
});

// ── 14. FINANCE CHART ─────────────────────────────────────────────────────────────
function getLast4Months() {
  const months = [], now = new Date();
  for (let i = 3; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  return months;
}

// Returns ISO date string (YYYY-MM-DD) for timeframe start; null = all time
function _getTimeframeStartDate(tf) {
  if (tf === 'Semua') return null;
  const monthsBack = { '1B':1, '3B':3, '6B':6, '1Thn':12 }[tf] ?? 3;
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack);
  d.setDate(1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}

// Format chart X-axis label based on sampling step size
function _fmtChartLabel(dateStr, step) {
  const d = new Date(dateStr + 'T00:00:00');
  if (step <= 14) return d.toLocaleDateString('id-ID', { day:'numeric', month:'short' });
  return d.toLocaleDateString('id-ID', { month:'short', year:'2-digit' });
}

// TradingView-style: fill every calendar day, compute absolute running balance,
// sample adaptively by timeframe. Returns { labels, data, isEmpty }.
// mode: 'semua' | 'masuk' | 'keluar'
function buildChartSeries(allTrx, mode, tf) {
  const todayStr  = formatLocalDate(new Date());
  const startDate = _getTimeframeStartDate(tf); // null = all time

  // Flat zero-baseline spanning the visible timeframe — used when no data exists
  function _flatLine() {
    const from = startDate || todayStr;
    const days = [];
    const cur = new Date(from + 'T00:00:00'), end = new Date(todayStr + 'T00:00:00');
    while (cur <= end) { days.push(formatLocalDate(cur)); cur.setDate(cur.getDate() + 1); }
    if (!days.length) days.push(todayStr);
    const span = days.length;
    const step = span <= 35 ? 1 : span <= 95 ? Math.max(2, Math.ceil(span / 30)) : Math.max(4, Math.ceil(span / 26));
    const pts = [];
    for (let i = 0; i < days.length; i += step) pts.push(days[i]);
    if (pts[pts.length - 1] !== days[days.length - 1]) pts.push(days[days.length - 1]);
    return { labels: pts.map(d => _fmtChartLabel(d, step)), data: pts.map(() => 0), isEmpty: true };
  }

  if (!allTrx?.length) return _flatLine();

  const sorted = [...allTrx].filter(t => t.date).sort((a, b) => a.date > b.date ? 1 : -1);
  if (!sorted.length) return _flatLine();

  const rangeStart = startDate || sorted[0].date;

  // Absolute balance BEFORE the visible range (for correct chart baseline)
  let balBefore = 0;
  sorted.forEach(t => {
    if (t.date >= rangeStart) return;
    const a = parseFloat(t.amount) || 0;
    if      (mode === 'masuk'  && t.type === 'masuk')  balBefore += a;
    else if (mode === 'keluar' && t.type === 'keluar') balBefore += a;
    else if (mode === 'semua')  balBefore += (t.type === 'masuk' ? a : -a);
  });

  // Check whether any transaction falls within the visible range
  let hasTrxInRange = false;
  sorted.forEach(t => {
    if (t.date < rangeStart || t.date > todayStr) return;
    if (mode === 'masuk'  && t.type !== 'masuk')  return;
    if (mode === 'keluar' && t.type !== 'keluar') return;
    hasTrxInRange = true;
  });

  // No transactions in range and no prior balance → flat baseline at 0
  if (!hasTrxInRange && balBefore === 0) return _flatLine();

  // ── All timeframes: per-transaction cumulative timeline ─────────────────
  // Each transaction gets its own data point so the chart faithfully shows
  // every rise/fall instead of a diagonal between aggregated day-buckets.
  // (The old per-day path with uniform step sampling caused 3B/6B/1TH to
  // look like smooth diagonals because transaction days were skipped.)
  const inRange = sorted.filter(t => {
    if (t.date < rangeStart || t.date > todayStr) return false;
    if (mode === 'masuk'  && t.type !== 'masuk')  return false;
    if (mode === 'keluar' && t.type !== 'keluar') return false;
    return true;
  });
  inRange.sort((a, b) => {
    if (a.date !== b.date) return a.date > b.date ? 1 : -1;
    return (a.created_at || '') > (b.created_at || '') ? 1 : -1;
  });

  const pts = [{ date: rangeStart, val: balBefore }];

  if (inRange.length > 0) {
    const firstDate = inRange[0].date;
    if (firstDate > rangeStart) {
      // Flat anchor: keep line at baseline until one day before the first trx
      const eve = new Date(firstDate + 'T00:00:00');
      eve.setDate(eve.getDate() - 1);
      const eveStr = formatLocalDate(eve);
      if (eveStr >= rangeStart) pts.push({ date: eveStr, val: balBefore });
    } else if (tf === 'Semua') {
      // tf='Semua' + rangeStart===firstDate means all trx are on a single day
      // (rangeStart = sorted[0].date = today). With 2 pts Chart.js draws a
      // diagonal — fix: extend baseline 30 days back + flat anchor day before.
      const baseline = new Date(rangeStart + 'T00:00:00');
      baseline.setDate(baseline.getDate() - 30);
      pts[0] = { date: formatLocalDate(baseline), val: balBefore };
      const eve = new Date(firstDate + 'T00:00:00');
      eve.setDate(eve.getDate() - 1);
      pts.push({ date: formatLocalDate(eve), val: balBefore });
    }
  }

  let runBal = balBefore;
  inRange.forEach(t => {
    const a = parseFloat(t.amount) || 0;
    runBal += (mode === 'semua') ? (t.type === 'masuk' ? a : -a) : a;
    pts.push({ date: t.date, val: Math.round(runBal) });
  });

  // Extend to today so chart edge always reaches the current date
  if (pts[pts.length - 1].date < todayStr) pts.push({ date: todayStr, val: runBal });

  // Label format: day+month for short ranges, month+year for 1TH
  const lblStep = { '1B': 1, '3B': 7, '6B': 14, '1Thn': 30, 'Semua': 1 }[tf] ?? 7;

  return {
    labels:  pts.map(p => _fmtChartLabel(p.date, lblStep)),
    data:    pts.map(p => p.val),
    isEmpty: false,
  };
}

function buildChartDatasets(data, months) {
  const masukData  = months.map(m => data.filter(t => t.type==='masuk'  && (t.date||'').startsWith(m)).reduce((s,t) => s+(parseFloat(t.amount)||0), 0));
  const keluarData = months.map(m => data.filter(t => t.type==='keluar' && (t.date||'').startsWith(m)).reduce((s,t) => s+(parseFloat(t.amount)||0), 0));
  const isEmpty = masukData.every(v=>v===0) && keluarData.every(v=>v===0);
  return { masukData, keluarData, isEmpty };
}

function createChart(ctx, labels, masukData, keluarData, isEmpty, chartHeight) {
  const mob = window.innerWidth < 768;
  const mkGrad = (r,g,b) => (context) => {
    const { chart } = context;
    const { ctx: c, chartArea } = chart;
    if (!chartArea) return 'transparent';
    const grad = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    grad.addColorStop(0,    isEmpty ? 'rgba(255,255,255,.015)' : `rgba(${r},${g},${b},.28)`);
    grad.addColorStop(0.65, isEmpty ? 'rgba(0,0,0,0)'         : `rgba(${r},${g},${b},.04)`);
    grad.addColorStop(1,    'rgba(0,0,0,0)');
    return grad;
  };
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Pemasukan',
          data: masukData,
          borderColor: isEmpty ? '#1c1c1c' : '#4ade80',
          backgroundColor: mkGrad(74,222,128),
          tension: 0.35, fill: true,
          borderWidth: 2,
          pointRadius: 0, pointHoverRadius: 5, pointHitRadius: 30,
          pointHoverBackgroundColor: '#4ade80',
          pointHoverBorderColor: '#060d06', pointHoverBorderWidth: 2,
        },
        {
          label: 'Pengeluaran',
          data: keluarData,
          borderColor: isEmpty ? '#1c1c1c' : '#ef4444',
          backgroundColor: mkGrad(239,68,68),
          tension: 0.35, fill: true,
          borderWidth: 2,
          pointRadius: 0, pointHoverRadius: 5, pointHitRadius: 30,
          pointHoverBackgroundColor: '#ef4444',
          pointHoverBorderColor: '#120a0a', pointHoverBorderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: mob ? false : { duration: 500, easing: 'easeInOutQuart' },
      layout: { padding: { top: 8, right: 6, bottom: 4, left: 4 } },
      plugins: {
        legend: {
          position: 'top', align: 'end',
          labels: {
            color: '#999',
            font: { size: 10, family: "'Plus Jakarta Sans',sans-serif" },
            boxWidth: 24, boxHeight: 2, padding: 14, usePointStyle: false,
          },
        },
        tooltip: {
          mode: 'index', intersect: false,
          backgroundColor: 'rgba(6,14,6,.96)',
          borderColor: 'rgba(57,255,20,.15)', borderWidth: 1,
          titleColor: '#bbb',
          titleFont: { size: 10, family: "'Plus Jakarta Sans',sans-serif" },
          bodyFont: { size: 11, family: "'Plus Jakarta Sans',sans-serif" },
          padding: 10, displayColors: true,
          callbacks: { label: c => ` ${c.dataset.label}: ${fmtRp(c.raw)}` },
        },
      },
      scales: {
        x: {
          grid: { display: false }, border: { display: false },
          ticks: {
            color: '#999', font: { size: 9 },
            maxRotation: 0, maxTicksLimit: mob ? 4 : 12,
          },
        },
        y: {
          position: 'right',
          grid: { color: 'rgba(255,255,255,.06)', drawBorder: false },
          border: { display: false },
          ticks: {
            color: '#999', font: { size: 9 }, maxTicksLimit: 5,
            callback: v => v >= 1e6 ? (v/1e6).toFixed(1)+'jt' : v >= 1e3 ? (v/1e3).toFixed(0)+'rb' : ''+v,
          },
        },
      },
      interaction: { mode: 'index', intersect: false },
    },
  });
}

// TradingView-style cumulative balance chart
function createStockChart(ctx, labels, balanceData, chartHeight, forceColor) {
  const isEmpty = !balanceData?.length || balanceData.every(v => v === 0);
  let col, colA;
  if (isEmpty) {
    col = '#252525'; colA = 'rgba(60,60,60,';
  } else if (forceColor === 'red') {
    col = '#ef4444'; colA = 'rgba(239,68,68,';
  } else if (forceColor) {
    col = '#4ade80'; colA = 'rgba(74,222,128,';
  } else {
    const last = balanceData?.[balanceData.length - 1] ?? 0;
    const first = balanceData?.find(v => v !== 0) ?? 0;
    col  = last >= first ? '#4ade80' : '#ef4444';
    colA = last >= first ? 'rgba(74,222,128,' : 'rgba(239,68,68,';
  }
  const mob   = window.innerWidth < 768;

  // Function-based gradient — uses chartArea after layout so coords are correct
  const _gradFn = ctx => {
    const { chart } = ctx;
    const { ctx: c, chartArea } = chart;
    if (!chartArea) return 'transparent';
    const gr = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gr.addColorStop(0,    isEmpty ? 'rgba(60,60,60,.06)' : colA + '0.26)');
    gr.addColorStop(0.55, isEmpty ? 'rgba(0,0,0,0)'      : colA + '0.06)');
    gr.addColorStop(1,    'rgba(0,0,0,0)');
    return gr;
  };

  // Pad single-point with a synthetic zero-baseline so line spans left→right
  let chartLabels = labels || [];
  let chartData   = balanceData || [];
  if (chartLabels.length === 1) {
    chartLabels = ['', ...chartLabels];
    chartData   = [0, ...chartData];
  }

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartLabels,
      datasets: [{
        label: 'Saldo Kumulatif',
        data: chartData,
        borderColor: col,
        backgroundColor: _gradFn,
        tension: 0.45, fill: true,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5, pointHitRadius: 32,
        pointHoverBackgroundColor: col,
        pointHoverBorderColor: '#060d06', pointHoverBorderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: mob ? false : { duration: 500, easing: 'easeInOutQuart' },
      layout: { padding: { top: 10, right: 2, bottom: 0, left: 0 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index', intersect: false,
          backgroundColor: 'rgba(4,8,4,.97)',
          borderColor: col, borderWidth: 1,
          titleColor: '#bbb',
          titleFont: { size: 10, family: "'Plus Jakarta Sans',sans-serif" },
          bodyColor: isEmpty ? '#666' : col,
          bodyFont: { size: 12, weight: '700', family: "'Plus Jakarta Sans',sans-serif" },
          padding: 10, displayColors: false,
          callbacks: {
            title: items => items[0]?.label || '',
            label: item => isEmpty ? 'Belum ada aktivitas' : ' Saldo: ' + fmtRp(item.raw),
          },
        },
      },
      scales: {
        x: {
          grid: { display: false }, border: { display: false },
          ticks: {
            color: '#999', font: { size: 9 },
            maxRotation: 0,
            maxTicksLimit: mob ? 3 : Math.min(chartLabels.length, 6),
          },
        },
        y: {
          position: 'right',
          grid: { color: 'rgba(255,255,255,.05)', drawBorder: false },
          border: { display: false },
          ticks: {
            color: '#999', font: { size: 9 }, maxTicksLimit: mob ? 3 : 5,
            callback: v => Math.abs(v) >= 1e6
              ? (v/1e6).toFixed(1)+'jt'
              : Math.abs(v) >= 1e3
                ? (v/1e3).toFixed(0)+'rb'
                : String(v),
          },
        },
      },
      interaction: { mode: 'index', intersect: false },
    },
  });
}

function renderDashboardChart(labels, balanceData) {
  const placeholder = g('fin-chart-placeholder');
  if (!placeholder || typeof Chart === 'undefined') return;
  if (_finChart) { _finChart.destroy(); _finChart = null; }
  placeholder.innerHTML = '<canvas id="dash-chart-canvas" style="height:160px;"></canvas>';
  _finChart = createStockChart(g('dash-chart-canvas').getContext('2d'), labels || [], balanceData || [], 160, 'green');
}

function renderFinanceChart(labels, balanceData, forceColor) {
  const placeholder = g('fin-chart-placeholder-full');
  if (!placeholder || typeof Chart === 'undefined') return;
  if (_finChartFull) { _finChartFull.destroy(); _finChartFull = null; }
  placeholder.innerHTML = '<canvas id="fin-chart-canvas" style="height:280px;width:100%;"></canvas>';
  _finChartFull = createStockChart(g('fin-chart-canvas').getContext('2d'), labels || [], balanceData || [], 280, forceColor || 'green');
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
  const tf   = _finTimeframe;
  const mode = _finChartMode;
  const ph   = g('fin-chart-placeholder-full');
  if (ph) {
    if (_finChartFull) { _finChartFull.destroy(); _finChartFull = null; }
    ph.innerHTML = '<div class="skel skel-chart-full"></div>';
  }

  // Use cached allTrx when available — no extra DB round-trip
  let source = (allTrx && allTrx.length) ? allTrx : null;
  if (!source) {
    try {
      const { data } = await dbQ(db.from('transactions').select('date,type,amount').order('date',{ascending:true}));
      source = data || [];
    } catch (err) {
      if (_finTimeframe !== tf) return;
      const msg = err?.code === '42501' ? 'Tidak ada akses.' : 'Gagal memuat data.';
      if (ph) ph.innerHTML = `<div class="chart-loading"><i class="fas fa-exclamation-triangle"></i>&nbsp; ${msg}</div>`;
      return;
    }
  }

  // Stale-check: user may have switched timeframe or mode during async fetch
  if (_finTimeframe !== tf || _finChartMode !== mode) return;

  const { labels, data: balData } = buildChartSeries(source, mode, tf);
  const forceColor = mode === 'keluar' ? 'red' : 'green';
  renderFinanceChart(labels, balData, forceColor);
}

function setFinChartMode(mode) {
  _finChartMode = mode;
  document.querySelectorAll('.btn-cm').forEach(b => b.classList.toggle('active', b.dataset.cm === mode));
  refreshFinChart();
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
    let q = db.from('news').select(NEWS_COLS).order('created_at',{ascending:false});
    if (!loggedIn()) q = q.eq('status','approved'); // guest: only approved on wire
    const { data, error } = await dbQ(q);
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
    const isRevision = !!n.revision_of;
    const canMgr = isMod() && CU?.id !== n.user_id;
    const canOwn = isMod();
    const pendingLabel = isRevision
      ? '<span class="pending-badge"><i class="fas fa-code-branch"></i> REVISI PENDING</span>'
      : '<span class="pending-badge"><i class="fas fa-clock"></i> PENDING</span>';
    const mediaList = mmParseUrls(n.media_urls, n.image_url);
    const mainMedia = mediaList[0] || null;
    const mediaCount = mediaList.length;
    return `<div class="news-card ${ip?'card-pending':''}">
      ${mainMedia?`<div class="nc-img" onclick="openNewsMedia('${n.id}')">${mediaCount>1?`<span class="mm-count-badge">${mediaCount} <i class="fas fa-images"></i></span>`:''}<img src="${mainMedia}" alt="${esc(n.title)}" loading="lazy"></div>`:''}
      <div class="nc-body">
        <div class="nc-meta">
          <span class="cat-badge cat-${n.category||'info'}">${n.category||'info'}</span>
          ${ip?pendingLabel:''}
          <span class="nc-date"><i class="fas fa-clock"></i> ${fmtDate(n.created_at)}</span>
        </div>
        <div class="nc-title nc-title-link" onclick="openNewsDetail('${n.id}')">${esc(n.title)}</div>
        <div class="nc-excerpt">${esc((n.content||'').slice(0,180))}${(n.content||'').length>180?'...':''}</div>
        <div class="card-actions">
          ${canMgr&&ip?`<button class="btn-approve" onclick="approveItem('news','${n.id}','${n.revision_of||''}')">${isRevision?'<i class="fas fa-code-branch"></i> Terapkan':'<i class="fas fa-check"></i> Setujui'}</button><button class="btn-reject" onclick="rejectItem('news','${n.id}','${n.image_url||''}','${n.revision_of||''}')"><i class="fas fa-times"></i> Tolak</button>`:''}
          ${loggedIn()?`<button class="btn-wa" onclick="shareNewsToWA('${n.id}')" title="Bagikan ke WhatsApp"><i class="fab fa-whatsapp"></i> Bagikan</button>`:''}
          ${canOwn?`<button class="btn-edit-xs" onclick="editNews('${n.id}')"><i class="fas fa-edit"></i></button><button class="btn-del-xs" onclick="deleteNews('${n.id}')"><i class="fas fa-trash"></i></button>`:''}
        </div>
      </div>
    </div>`;
  }).join('');
}

function filterNews() {
  const s = gv('news-search').toLowerCase(), c = gv('news-cat-filter');
  renderNews(allNews.filter(n => (!s||(n.title+n.content).toLowerCase().includes(s)) && (!c||n.category===c)));
}

// ── Category custom-input helpers ────────────────────────────────────────────
// Show/hide custom text input when "Lainnya" is selected in a category dropdown
function catSelectChange(selId, customId) {
  const isOther = g(selId)?.value === 'lainnya';
  const inp = g(customId);
  if (inp) { inp.style.display = isOther ? '' : 'none'; if (!isOther) inp.value = ''; }
}
// Read the effective category value (custom text when "Lainnya" selected)
function getCatValue(selId, customId) {
  const sel = g(selId); if (!sel) return '';
  if (sel.value === 'lainnya') {
    const raw = (g(customId)?.value || '').trim();
    if (!raw) return 'lainnya';
    const s = sanitizeInput(raw);
    return (s !== null && s.trim()) ? s.trim() : 'lainnya';
  }
  return sel.value;
}
// Set dropdown + custom input together (handles saved custom values on edit)
function setCatValue(selId, customId, value) {
  const sel = g(selId); if (!sel) return;
  const hasOpt = Array.from(sel.options).some(o => o.value === value);
  const inp = g(customId);
  if (hasOpt) {
    sel.value = value;
    if (inp) { inp.style.display = 'none'; inp.value = ''; }
  } else {
    sel.value = 'lainnya';
    if (inp) { inp.style.display = ''; inp.value = value || ''; }
  }
}
// Reset custom input (called after form.reset() to guarantee hidden state)
function _resetCatCustom(customId) {
  const el = g(customId); if (el) { el.style.display = 'none'; el.value = ''; }
}

function openNewsModal(data = null) {
  if (!isMod()) { showToast('Hanya moderator yang dapat mengelola berita.', 'error'); return; }
  g('news-modal-title').innerHTML = data ? '<i class="fas fa-edit"></i> EDIT BERITA' : '<i class="fas fa-newspaper"></i> TAMBAH BERITA';
  g('news-form').reset(); sv('news-edit-id',''); _resetCatCustom('news-cat-custom');
  mmLoadExisting('news', data?.media_urls || null, data?.image_url || null);
  if (data) {
    sv('news-edit-id', data.id); sv('news-title', data.title||'');
    setCatValue('news-cat','news-cat-custom', data.category||'pengumuman'); sv('news-content', data.content||'');
  }
  openModal('news-modal');
}

async function editNews(id) {
  const { data } = await db.from('news').select(NEWS_COLS).eq('id',id).single();
  if (data) openNewsModal(data);
}

async function handleSaveNews(e) {
  e.preventDefault();
  if (!isMod()) { showToast('Akses ditolak.', 'error'); return; }
  const btn = g('news-save-btn'); btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>';
  try {
    const editId = gv('news-edit-id');
    const title = sanitizeInput(gv('news-title'));
    const content = sanitizeInput(gv('news-content'));
    if (title === null || content === null) { showToast('Input mengandung karakter tidak diizinkan.', 'error'); return; }
    const oldRec = editId ? allNews.find(n => String(n.id) === String(editId)) : null;
    const isApproved = oldRec?.status === 'approved';
    const mediaUrls = await mmUploadAll('news', 'news');
    const image_url = mediaUrls[0] || null;
    const media_urls_json = mediaUrls.length ? JSON.stringify(mediaUrls) : null;
    if (editId && isApproved) {
      // Safe edit: insert revision — original stays live until mod approves
      const pl = { title, category:getCatValue('news-cat','news-cat-custom'), content, user_id:CU.id, status:'pending', revision_of:editId,
        image_url: image_url || oldRec.image_url || null,
        media_urls: media_urls_json || oldRec.media_urls || null };
      const { error } = await db.from('news').insert(pl);
      if (error) throw error;
      createLog('NEWS_REVISION', `Revisi berita: ${String(title).slice(0,60)}`);
      showToast('Revisi berita dikirim untuk ditinjau.', 'success');
    } else {
      // For pending edits: clean up old media no longer referenced
      if (editId && !isApproved && oldRec) {
        const oldUrls = mmParseUrls(oldRec.media_urls, oldRec.image_url);
        for (const u of oldUrls) { if (!mediaUrls.includes(u)) await deleteStorageFile(u, 'news'); }
      }
      const status = resolveContentStatus('news');
      const pl = { title, category:getCatValue('news-cat','news-cat-custom'), content, user_id:CU.id, status,
        image_url: image_url || (editId ? (oldRec?.image_url || null) : null),
        media_urls: media_urls_json || (editId ? (oldRec?.media_urls || null) : null) };
      const { error } = editId ? await db.from('news').update(pl).eq('id',editId) : await db.from('news').insert(pl);
      if (error) throw error;
      createLog(editId ? 'NEWS_UPDATE' : 'NEWS_CREATE', `${editId?'Mengubah':'Membuat'} berita: ${String(title).slice(0,60)}`);
      const newsMsg = editId ? 'Berita diperbarui!' : (status==='approved' ? 'Berita berhasil ditambahkan!' : 'Berita ditambahkan! Menunggu persetujuan moderator.');
      showToast(newsMsg, 'success');
    }
    closeModal('news-modal'); loadNews(); loadNewsPreview();
  } catch (err) { showToast(safeErr(err), 'error'); }
  finally { btn.disabled=false; btn.innerHTML='<i class="fas fa-save"></i> Simpan'; }
}

async function deleteNews(id) {
  showConfirm('Hapus Berita', 'Yakin ingin menghapus berita ini secara permanen?', async () => {
    const rec = allNews.find(n => String(n.id) === String(id));
    for (const u of mmParseUrls(rec?.media_urls, rec?.image_url)) {
      const se = await deleteStorageFile(u, 'news');
      if (se) showToast('File media gagal dihapus dari server.', 'warn');
    }
    const { error } = await db.from('news').delete().eq('id',id);
    if (error) { showToast(safeErr(error), 'error'); return; }
    createLog('NEWS_DELETE', `Menghapus berita: ${String(rec?.title||id).slice(0,60)}`);
    showToast('Berita dihapus.', 'info'); loadNews(); loadNewsPreview();
  });
}

// ── 16. PRODUCTS MODULE ─────────────────────────────────────────────────────────────
function buildWALink(phone, productName) {
  const msg = encodeURIComponent(`Halo, saya tertarik dengan produk ${productName} yang saya lihat di Dashboard ANJUNKU`);
  return `https://wa.me/${phone.replace(/\D/g,'')}?text=${msg}`;
}

function shareProduct(id) {
  if (!loggedIn()) { showAuthModal(); return; }
  const p = _allProducts.find(x => x.id === id);
  if (!p) return;
  const desc = (p.description || '').trim();
  const shortDesc = desc.length > 120 ? desc.slice(0, 120) + '...' : desc;
  const pageUrl = window.location.origin + window.location.pathname;
  const msg = `🛍️ *PRODUK ANJUN GENERATION*\n\n📦 Produk: ${p.name}\n💰 Harga: ${fmtRp(p.price)}${shortDesc ? '\n📝 Deskripsi: ' + shortDesc : ''}\n🔗 Lihat Produk: ${pageUrl}\n\n✨ Dibagikan melalui ANJUNKU`;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank', 'noopener,noreferrer');
}

async function loadProducts() {
  const el = g('products-grid');
  el.innerHTML = '<div class="skel skel-card"></div><div class="skel skel-card"></div><div class="skel skel-card"></div><div class="skel skel-card"></div>';
  try {
    let q = db.from('products').select(PROD_COLS).order('created_at',{ascending:false});
    if (!loggedIn()) q = q.eq('status','approved'); // guest: only approved on wire
    const { data, error } = await dbQ(q);
    if (error) throw error;
    allProds = data || [];
    renderProducts(allProds);
  } catch (_) { el.innerHTML = errState(); }
}

function renderProducts(data) {
  _allProducts = data || [];
  const el = g('products-grid');
  const vis = data.filter(p => p.status==='approved' || isMod() || CU?.id===p.user_id);
  if (!vis.length) { el.innerHTML = emptyState('Belum ada produk.','fas fa-box-open'); return; }
  el.innerHTML = vis.map(p => {
    const ip = p.status==='pending';
    const isRevision = !!p.revision_of;
    const canMgr = isMod() && CU?.id !== p.user_id;
    const canOwn = isMod() || CU?.id === p.user_id;
    const waLink = p.whatsapp_link ? buildWALink(p.whatsapp_link, p.name) : null;
    const pendingOv = isRevision
      ? '<div class="pending-ov"><i class="fas fa-code-branch"></i> REVISI PENDING</div>'
      : '<div class="pending-ov"><i class="fas fa-clock"></i> PENDING</div>';
    const mediaList = mmParseUrls(p.media_urls, p.image_url);
    const mainMedia = mediaList[0] || null;
    const mediaCount = mediaList.length;
    return `<div class="product-card ${ip?'card-pending':''}">
      <div class="pc-img" onclick="openProductMedia('${p.id}')">
        ${mainMedia?`${mediaCount>1?`<span class="mm-count-badge">${mediaCount} <i class="fas fa-images"></i></span>`:''}<img src="${mainMedia}" alt="${esc(p.name)}" loading="lazy">`:'<div class="pc-noimg"><i class="fas fa-box-open fa-3x"></i></div>'}
        ${ip?pendingOv:''}
      </div>
      <div class="pc-body">
        <span class="cat-badge cat-${p.category||'lainnya'}">${p.category||'lainnya'}</span>
        <div class="pc-name pc-name-link" onclick="openProductDetail('${p.id}')">${esc(p.name)}</div>
        <div class="pc-desc">${esc((p.description||'').slice(0,90))}${(p.description||'').length>90?'...':''}</div>
        <div class="pc-footer">
          <span class="pc-price">${fmtRp(p.price)}</span>
          <div class="card-actions">
            ${waLink&&loggedIn()?`<a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn-wa"><i class="fab fa-whatsapp"></i> Beli</a>`:''}
            ${loggedIn()?`<button class="btn-share-prod" onclick="shareProduct('${p.id}')" title="Bagikan produk ini"><i class="fas fa-share-alt"></i></button>`:''}
            ${canMgr&&ip?`<button class="btn-approve" onclick="approveItem('products','${p.id}','${p.revision_of||''}')">${isRevision?'<i class="fas fa-code-branch"></i>':'<i class="fas fa-check"></i>'}</button><button class="btn-reject" onclick="rejectItem('products','${p.id}','${p.image_url||''}','${p.revision_of||''}')"><i class="fas fa-times"></i></button>`:''}
            ${canOwn?`<button class="btn-edit-xs" onclick="editProduct('${p.id}')"><i class="fas fa-edit"></i></button><button class="btn-del-xs" onclick="deleteProduct('${p.id}')"><i class="fas fa-trash"></i></button>`:''}
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
  g('product-form').reset(); sv('prod-edit-id',''); _resetCatCustom('prod-cat-custom');
  mmLoadExisting('prod', data?.media_urls || null, data?.image_url || null);
  if (data) {
    sv('prod-edit-id',data.id); sv('prod-name',data.name||''); setCatValue('prod-cat','prod-cat-custom', data.category||'lainnya');
    sv('prod-desc',data.description||''); sv('prod-price',data.price||''); sv('prod-wa',data.whatsapp_link||'');
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
    const editId = gv('prod-edit-id');
    const oldRec = editId ? allProds.find(p => String(p.id) === String(editId)) : null;
    const isApproved = oldRec?.status === 'approved';
    const mediaUrls = await mmUploadAll('prod', 'products');
    const image_url = mediaUrls[0] || null;
    const media_urls_json = mediaUrls.length ? JSON.stringify(mediaUrls) : null;
    const name = sanitizeInput(gv('prod-name'));
    const desc = sanitizeInput(gv('prod-desc'));
    const wa   = sanitizeInput(gv('prod-wa'));
    if (name === null || desc === null) { showToast('Input mengandung karakter tidak diizinkan.', 'error'); return; }
    if (editId && isApproved) {
      // Safe edit: insert revision — original stays live until mod approves
      const pl = { name, category:getCatValue('prod-cat','prod-cat-custom'), description:desc, price:parseFloat(gv('prod-price'))||0,
        whatsapp_link:wa||'', user_id:CU.id, status:'pending', revision_of:editId,
        image_url: image_url || oldRec.image_url || null,
        media_urls: media_urls_json || oldRec.media_urls || null };
      const { error } = await db.from('products').insert(pl);
      if (error) throw error;
      showToast('Revisi produk dikirim untuk ditinjau moderator.', 'success');
    } else {
      // For pending edits: clean up old media no longer referenced
      if (editId && !isApproved && oldRec) {
        const oldUrls = mmParseUrls(oldRec.media_urls, oldRec.image_url);
        for (const u of oldUrls) { if (!mediaUrls.includes(u)) await deleteStorageFile(u, 'products'); }
      }
      const pl = { name, category:getCatValue('prod-cat','prod-cat-custom'), description:desc, price:parseFloat(gv('prod-price'))||0,
        whatsapp_link:wa||'', user_id:CU.id, status:resolveContentStatus('products'),
        image_url: image_url || (editId ? (oldRec?.image_url || null) : null),
        media_urls: media_urls_json || (editId ? (oldRec?.media_urls || null) : null) };
      const { error } = editId ? await db.from('products').update(pl).eq('id',editId) : await db.from('products').insert(pl);
      if (error) throw error;
      showToast('Produk berhasil disimpan!', 'success');
    }
    closeModal('product-modal'); loadProducts(); loadProductsPreview();
  } catch (err) { showToast(safeErr(err), 'error'); }
  finally { btn.disabled=false; btn.innerHTML='<i class="fas fa-save"></i> Simpan'; }
}

async function deleteProduct(id) {
  showConfirm('Hapus Produk', 'Yakin ingin menghapus produk ini?', async () => {
    const rec = allProds.find(p => String(p.id) === String(id));
    for (const u of mmParseUrls(rec?.media_urls, rec?.image_url)) {
      const se = await deleteStorageFile(u, 'products');
      if (se) showToast('File media gagal dihapus dari server.', 'warn');
    }
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
  const _skelRow = '<tr><td colspan="8" style="padding:.3rem .75rem;border:none;"><div class="skel skel-row"></div></td></tr>';
  tbody.innerHTML = _skelRow.repeat(5);

  // Transactions — visible to ALL authenticated members (readonly)
  try {
    const { data, error } = await dbQ(db.from('transactions').select(TRX_COLS).order('date',{ascending:false}));
    if (error) throw error;
    allTrx = data || [];
    renderTrx(allTrx);
    calcFinSummary(allTrx); // summary cards for ALL authenticated
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="loading-cell"><i class="fas fa-exclamation-triangle" style="color:var(--red)"></i> ${safeErr(err)}</td></tr>`;
  }

  // Chart — ALL authenticated members (TradingView cumulative balance)
  await refreshFinChart();
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
  g('transaction-form').reset(); sv('trx-edit-id',''); g('trx-prev-wrap').style.display='none'; _resetCatCustom('trx-cat-custom');
  sv('trx-date', formatLocalDate(new Date()));
  if (data) {
    sv('trx-edit-id',data.id); sv('trx-type',data.type||'masuk'); sv('trx-date',data.date||'');
    sv('trx-desc',data.description||''); setCatValue('trx-cat','trx-cat-custom', data.category||'iuran');
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
  const cat    = getCatValue('trx-cat','trx-cat-custom');
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
        if (buktiFile) {
          if (editId) {
            const oldRec = allTrx.find(t => String(t.id) === String(editId));
            if (oldRec?.bukti_url) await deleteStorageFile(oldRec.bukti_url, 'transactions');
          }
          bukti_url = await uploadMedia(buktiFile, 'transactions');
        }
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
    const storErr3 = await deleteStorageFile(buktiUrl, 'transactions');
    const t = allTrx.find(x => x.id === id);
    const { error } = await db.from('transactions').delete().eq('id',id);
    if (error) { showToast(safeErr(error), 'error'); return; }
    const tLabel = t ? `${t.type === 'masuk' ? 'pemasukan' : 'pengeluaran'} ${fmtRp(t.amount)} (${t.category||'–'})` : id;
    createLog('FINANCE_DELETE', `Menghapus transaksi ${tLabel}`);
    if (storErr3) showToast('File bukti gagal dihapus dari server.', 'warn');
    showToast('Transaksi dihapus.', 'info'); loadFinance(); loadFinanceOverview();
  });
}

// ── 18. GALLERY MODULE ─────────────────────────────────────────────────────────────
async function loadGallery() {
  const el = g('gallery-grid');
  el.innerHTML = '<div class="skel skel-gal"></div><div class="skel skel-gal"></div><div class="skel skel-gal"></div><div class="skel skel-gal"></div>';
  let data;
  try {
    let q = db.from('gallery').select(GAL_COLS).order('created_at',{ascending:false});
    if (!loggedIn()) q = q.eq('status','approved'); // guest: only approved on wire
    ({ data } = await dbQ(q));
  }
  catch (_) { el.innerHTML = errState(); return; }
  const vis = (data||[]).filter(gi => gi.status==='approved' || isMod() || CU?.id===gi.user_id);
  if (!vis.length) { el.innerHTML = emptyState('Belum ada foto galeri.','fas fa-images'); return; }
  _galItems = vis.map(gi => {
    const mediaList = mmParseUrls(gi.media_urls, gi.image_url);
    return { id: gi.id, url: gi.image_url, cap: gi.title||'Foto Kegiatan', mediaList, user_id: gi.user_id, created_at: gi.created_at, status: gi.status };
  });
  el.innerHTML = vis.map((gi, idx) => {
    const ip = gi.status==='pending';
    const isRevision = !!gi.revision_of;
    const canMgr = isMod() && CU?.id !== gi.user_id;
    const canOwn = isMod() || CU?.id === gi.user_id;
    const mediaList = mmParseUrls(gi.media_urls, gi.image_url);
    const mediaCount = mediaList.length;
    const pendingBadge = isRevision
      ? '<span class="pending-badge"><i class="fas fa-code-branch"></i> REVISI PENDING</span>'
      : '<span class="pending-badge">PENDING</span>';
    return `<div class="gal-item ${ip?'gal-pending':''}">
      <div class="gal-img-wrap" onclick="openGalLB(${idx})">
        <img src="${gi.image_url}" alt="${esc(gi.title||'')}" loading="lazy">
        ${mediaCount>1?`<span class="mm-count-badge gal-mm-badge">${mediaCount} <i class="fas fa-images"></i></span>`:''}
      </div>
      <div class="gal-overlay">${esc(gi.title||'Foto Kegiatan')} ${ip?pendingBadge:''}</div>
      <div class="gal-actions${canOwn||(canMgr&&ip)?' gal-actions-active':''}">
        ${canMgr&&ip?`<button class="btn-approve" onclick="approveItem('gallery','${gi.id}','${gi.revision_of||''}');event.stopPropagation()">${isRevision?'<i class="fas fa-code-branch"></i>':'<i class="fas fa-check"></i>'}</button><button class="btn-reject" onclick="rejectItem('gallery','${gi.id}','${gi.image_url||''}','${gi.revision_of||''}');event.stopPropagation()"><i class="fas fa-times"></i></button>`:''}
        ${canOwn?`<button class="btn-edit-xs" onclick="editGallery('${gi.id}');event.stopPropagation()"><i class="fas fa-edit"></i></button><button class="btn-del-xs" onclick="deleteGallery('${gi.id}');event.stopPropagation()"><i class="fas fa-trash"></i></button>`:''}
      </div>
    </div>`;
  }).join('');
}

function openGalleryModal() {
  if (!loggedIn()) { showAuthModal(); return; }
  g('gallery-form').reset(); sv('gal-edit-id', ''); sv('gal-edit-status', ''); sv('gal-edit-img', '');
  mmReset('gal');
  openModal('gallery-modal');
}

// ── GALLERY DETAIL ─────────────────────────────────────────────────────────────────
async function openGalleryDetail(id) {
  // Try cached _galItems first, then fetch fresh from DB
  let gi = null;
  const cached = _galItems.find(x => String(x.id) === String(id));
  if (cached) {
    gi = { id, image_url: cached.url, title: cached.cap, media_urls: null, user_id: cached.user_id, created_at: cached.created_at, status: cached.status };
    _gdMediaList = cached.mediaList && cached.mediaList.length ? cached.mediaList : [cached.url].filter(Boolean);
  } else {
    const { data } = await db.from('gallery').select(GAL_COLS + ',created_at,user_id,status').eq('id', String(id)).single();
    if (!data) { showToast('Foto tidak ditemukan atau telah dihapus.', 'warn'); return; }
    gi = data;
    _gdMediaList = mmParseUrls(data.media_urls, data.image_url);
  }
  _gdCurrentId = String(id);
  _gdIdx = 0;

  const imgEl = g('gd-img');
  if (imgEl) { imgEl.src = _gdMediaList[0] || ''; imgEl.alt = gi.title || ''; }

  const multi = _gdMediaList.length > 1;
  const prevBtn = g('gd-prev'), nextBtn = g('gd-next'), ctr = g('gd-counter');
  if (prevBtn) prevBtn.style.display = multi ? '' : 'none';
  if (nextBtn) nextBtn.style.display = multi ? '' : 'none';
  if (ctr) { ctr.textContent = multi ? `1 / ${_gdMediaList.length}` : ''; ctr.style.display = multi ? '' : 'none'; }

  const thumbsEl = g('gd-thumbs');
  if (thumbsEl) {
    if (multi) {
      thumbsEl.style.display = '';
      thumbsEl.innerHTML = _gdMediaList.map((u, i) =>
        `<img src="${u}" class="gd-thumb${i===0?' gd-thumb-active':''}" onclick="gdSetIdx(${i})" alt="" loading="lazy">`
      ).join('');
    } else {
      thumbsEl.style.display = 'none';
    }
  }

  sv2('gd-title', gi.title || 'Foto Kegiatan');
  const dateEl = g('gd-date'); if (dateEl) dateEl.innerHTML = `<i class="fas fa-clock"></i> ${fmtDate(gi.created_at)}`;
  const countEl = g('gd-media-count'); if (countEl) countEl.textContent = multi ? `${_gdMediaList.length} foto` : '1 foto';

  const authorEl = g('gd-author'); if (authorEl) authorEl.innerHTML = '';
  if (gi.user_id && authorEl) {
    db.from('profiles').select('full_name,avatar_url,role').eq('id', gi.user_id).single()
      .then(({ data: a }) => {
        if (a && authorEl) authorEl.innerHTML = `<img src="${a.avatar_url||avFallback(a.full_name)}" class="nd-author-av" onerror="this.src='${avFallback(a.full_name||'?')}'"><div class="nd-author-info"><span class="nd-author-name">${esc(a.full_name||'')}</span><span class="role-badge role-${a.role||'anggota'}">${(a.role||'anggota').toUpperCase()}</span></div>`;
      });
  }

  const actEl = g('gd-actions');
  if (actEl) {
    const canOwn = isMod() || CU?.id === gi.user_id;
    actEl.innerHTML = (loggedIn() ? `<button class="btn-pd-share" onclick="shareGallery('${id}')"><i class="fas fa-share-alt"></i> Bagikan</button>` : '')
      + (canOwn ? `<button class="btn-pd-edit" onclick="closeModal('gallery-detail-modal');editGallery('${id}')"><i class="fas fa-edit"></i> Edit</button><button class="btn-del-xs" onclick="closeModal('gallery-detail-modal');deleteGallery('${id}')"><i class="fas fa-trash"></i></button>` : '');
  }
  // Reset expand state from previous open
  g('gd-viewer')?.classList.remove('media-expanded');
  openModal('gallery-detail-modal');
}

function gdSetIdx(idx) {
  if (idx < 0 || idx >= _gdMediaList.length) return;
  _gdIdx = idx;
  _fadeSwap(g('gd-img'), _gdMediaList[idx]);
  const ctr = g('gd-counter'); if (ctr) ctr.textContent = `${_gdIdx + 1} / ${_gdMediaList.length}`;
  const thumbsEl = g('gd-thumbs');
  if (thumbsEl) thumbsEl.querySelectorAll('.gd-thumb').forEach((t, i) => t.classList.toggle('gd-thumb-active', i === _gdIdx));
}
function gdPrev() { gdSetIdx(_gdIdx - 1); }
function gdNext() { gdSetIdx(_gdIdx + 1); }
function gdOpenFull() {
  if (!_gdMediaList.length) return;
  const title = g('gd-title')?.textContent || '';
  openLBItems(_gdMediaList.map(u => ({url: u, cap: title})), _gdIdx);
}
function shareGallery(id) {
  const it = _galItems.find(x => String(x.id) === String(id));
  const title = it?.cap || 'Foto Kegiatan';
  const appLink = location.origin + '/anjunku/';
  const msg = `📸 *GALERI KEGIATAN ANJUN GENERATION*\n\n🖼️ "${title}"\n\n🔗 Lihat selengkapnya:\n${appLink}`;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank', 'noopener,noreferrer');
}

async function editGallery(id) {
  if (!loggedIn()) return;
  const { data } = await db.from('gallery').select(GAL_COLS).eq('id', id).single();
  if (!data) return;
  sv('gal-edit-id', data.id); sv('gal-edit-status', data.status || '');
  sv('gal-edit-img', data.image_url || ''); sv('gal-title', data.title || '');
  mmLoadExisting('gal', data.media_urls, data.image_url);
  openModal('gallery-modal');
}

async function handleSaveGallery(e) {
  e.preventDefault();
  const btn = g('gal-save-btn'); btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>';
  try {
    const editId   = gv('gal-edit-id');
    const galTitle = sanitizeInput(gv('gal-title'));
    if (galTitle === null) { showToast('Input mengandung karakter tidak diizinkan.', 'error'); return; }
    if (editId) {
      const isApproved = gv('gal-edit-status') === 'approved';
      const mediaUrls  = await mmUploadAll('gal', 'gallery');
      const image_url  = mediaUrls[0] || gv('gal-edit-img') || null;
      const media_urls = mediaUrls.length ? JSON.stringify(mediaUrls) : null;
      if (isApproved) {
        // Safe edit: insert revision — original stays visible until mod approves
        const { error } = await db.from('gallery').insert({ title: galTitle, image_url, media_urls, user_id: CU.id, status: 'pending', revision_of: editId });
        if (error) throw error;
        createLog('GALLERY_REVISION', `Revisi galeri: ${String(galTitle).slice(0,60)}`);
        showToast('Revisi foto dikirim untuk ditinjau.', 'success');
      } else {
        const { error } = await db.from('gallery').update({ title: galTitle, image_url, media_urls }).eq('id', editId);
        if (error) throw error;
        showToast('Foto galeri diperbarui!', 'success');
      }
    } else {
      // Add mode
      const mediaUrls = await mmUploadAll('gal', 'gallery');
      if (!mediaUrls.length) throw new Error('Pilih minimal satu foto.');
      const image_url  = mediaUrls[0];
      const media_urls = mediaUrls.length > 1 ? JSON.stringify(mediaUrls) : null;
      const { error } = await db.from('gallery').insert({ title: galTitle, image_url, media_urls, user_id: CU.id, status: resolveContentStatus('gallery') });
      if (error) throw error;
      createLog('GALLERY_ADD', `Foto galeri baru: ${String(galTitle).slice(0,60)}`);
      showToast('Foto berhasil diupload!', 'success');
    }
    closeModal('gallery-modal'); loadGallery();
  } catch (err) {
    showToast((err instanceof Error && err.message && !err.code) ? err.message : safeErr(err), 'error');
  }
  finally { btn.disabled=false; btn.innerHTML='<i class="fas fa-upload"></i> Upload'; }
}

async function deleteGallery(id) {
  showConfirm('Hapus Foto', 'Yakin ingin menghapus foto ini?', async () => {
    const { data: rec } = await db.from('gallery').select('image_url,media_urls').eq('id',id).single();
    const urls = mmParseUrls(rec?.media_urls, rec?.image_url);
    for (const u of urls) await deleteStorageFile(u, 'gallery');
    const { error } = await db.from('gallery').delete().eq('id',id);
    if (error) { showToast(safeErr(error), 'error'); return; }
    createLog('GALLERY_DELETE', `Foto galeri dihapus (id:${id})`);
    showToast('Foto dihapus.', 'info'); loadGallery();
  });
}

// ── 19. APPROVE / REJECT ──────────────────────────────────────────────────────────
async function approveItem(table, id, revisionOf) {
  if (!isMod()) { showToast('Anda tidak memiliki akses untuk tindakan ini.', 'error'); return; }
  if (revisionOf) { await _applyRevision(table, id, revisionOf); return; }
  const { error } = await db.from(table).update({ status:'approved' }).eq('id',id);
  if (error) { showToast(safeErr(error), 'error'); return; }
  showToast('Item disetujui!', 'success');
  if (table==='news') loadNews(); else if (table==='products') loadProducts(); else loadGallery();
}

async function _applyRevision(table, revisionId, originalId) {
  const cols = table === 'news' ? NEWS_COLS : (table === 'products' ? PROD_COLS : GAL_COLS);
  const [revRes, origRes] = await Promise.all([
    db.from(table).select(cols).eq('id', revisionId).single(),
    db.from(table).select(cols).eq('id', originalId).single(),
  ]);
  if (revRes.error || origRes.error || !revRes.data || !origRes.data) { showToast('Gagal memuat data revisi.', 'error'); return; }
  const rev = revRes.data, orig = origRes.data;
  let upd = { status: 'approved' };
  const revUrls = mmParseUrls(rev.media_urls, rev.image_url);
  const origUrls = mmParseUrls(orig.media_urls, orig.image_url);
  const mediaChanged = JSON.stringify(revUrls) !== JSON.stringify(origUrls);
  if (table === 'news') {
    upd = { ...upd, title: rev.title, category: rev.category, content: rev.content };
    if (mediaChanged) { upd.image_url = revUrls[0] || null; upd.media_urls = rev.media_urls; }
  } else if (table === 'products') {
    upd = { ...upd, name: rev.name, category: rev.category, description: rev.description, price: rev.price, whatsapp_link: rev.whatsapp_link };
    if (mediaChanged) { upd.image_url = revUrls[0] || null; upd.media_urls = rev.media_urls; }
  } else {
    // Gallery
    upd = { ...upd, title: rev.title };
    if (mediaChanged) { upd.image_url = revUrls[0] || null; upd.media_urls = rev.media_urls || null; }
  }
  const { error: updErr } = await db.from(table).update(upd).eq('id', originalId);
  if (updErr) { showToast(safeErr(updErr), 'error'); return; }
  const { error: delErr } = await db.from(table).delete().eq('id', revisionId);
  if (delErr) { showToast(safeErr(delErr), 'error'); return; }
  // Delete old media URLs that are not in the new revision set
  if (mediaChanged) {
    const revSet = new Set(revUrls);
    for (const u of origUrls) { if (!revSet.has(u)) await deleteStorageFile(u, table); }
  }
  createLog(`${table.toUpperCase()}_REVISION_APPROVE`, `Revisi disetujui: ${String(rev.title || rev.name || '').slice(0,60)}`);
  showToast('Revisi disetujui & diterapkan!', 'success');
  if (table==='news') { loadNews(); loadNewsPreview(); }
  else if (table==='products') { loadProducts(); loadProductsPreview(); }
  else loadGallery();
}

async function rejectItem(table, id, imgUrl, revisionOf) {
  if (!isMod()) { showToast('Anda tidak memiliki akses untuk tindakan ini.', 'error'); return; }
  showConfirm('Tolak Item', 'Tolak & hapus item ini secara permanen?', async () => {
    const cols = table === 'news' ? NEWS_COLS : (table === 'products' ? PROD_COLS : GAL_COLS);
    const cache = table === 'news' ? allNews : (table === 'products' ? allProds : []);
    if (revisionOf) {
      // Revision: only delete media not shared with the original (protect live images)
      const { data: orig } = await db.from(table).select(cols).eq('id', revisionOf).single();
      const revRec = cache.find(r => String(r.id) === String(id));
      const revUrls = new Set(mmParseUrls(revRec?.media_urls, imgUrl));
      const origUrls = new Set(mmParseUrls(orig?.media_urls, orig?.image_url));
      for (const u of revUrls) {
        if (!origUrls.has(u)) {
          const se = await deleteStorageFile(u, table);
          if (se) showToast('File media gagal dihapus dari server.', 'warn');
        }
      }
    } else {
      // Not a revision: delete all media
      const rec = cache.find(r => String(r.id) === String(id));
      for (const u of mmParseUrls(rec?.media_urls, imgUrl)) {
        const se = await deleteStorageFile(u, table);
        if (se) showToast('File media gagal dihapus dari server.', 'warn');
      }
    }
    const { error } = await db.from(table).delete().eq('id',id);
    if (error) { showToast(safeErr(error), 'error'); return; }
    showToast('Item ditolak & dihapus.', 'info');
    if (table==='news') loadNews(); else if (table==='products') loadProducts(); else loadGallery();
  });
}

// ── 20. ANGGOTA MODULE ─────────────────────────────────────────────────────────────
async function loadAnggota() {
  if (!loggedIn()) {
    _saveRedirect('anggota');
    showAuthModal('login');
    navigateTo('dashboard');
    return;
  }

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
          ${isMod()?`<button class="btn-edit-xs" onclick="editDivision('${m.id}')" title="Edit Divisi"><i class="fas fa-sitemap"></i></button>`:''}
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
      ${m.division ? `<span class="div-badge" style="margin-top:.22rem;">${esc(m.division.toUpperCase())}</span>` : ''}
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

function editDivision(uid) {
  if (!isMod()) return;
  const m = _allMembers.find(x => x.id === uid);
  if (!m) return;
  _divEditUid     = uid;
  _divEditCurrent = m.division || null;

  g('div-m-av').src = safeUrl(m.avatar_url) || avFallback(m.full_name || 'A');
  sv2('div-m-name', m.full_name || m.username || 'Anggota');
  sv2('div-m-role', (m.role || 'anggota').toUpperCase());

  const cur = (m.division || '').trim();
  const isCustom = !!cur && !DIVISIONS.some(d => d.toLowerCase() === cur.toLowerCase());

  g('div-chips-grid').innerHTML = [
    `<span class="div-chip chip-none${!m.division ? ' selected' : ''}" onclick="_selectDivChip(this,null)">Tanpa Divisi</span>`,
    ...DIVISIONS.map(d =>
      `<span class="div-chip${cur.toLowerCase() === d.toLowerCase() ? ' selected' : ''}" onclick="_selectDivChip(this,'${d}')">${esc(d)}</span>`
    ),
    `<span class="div-chip chip-other${isCustom ? ' selected' : ''}" onclick="_selectDivChip(this,'__other__')">Lainnya</span>`,
  ].join('');

  const customInp = g('div-custom-input');
  if (customInp) { customInp.style.display = isCustom ? '' : 'none'; customInp.value = isCustom ? cur : ''; }

  openModal('div-modal');
}

function _selectDivChip(el, division) {
  g('div-chips-grid').querySelectorAll('.div-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const customInp = g('div-custom-input');
  if (division === '__other__') {
    if (customInp) customInp.style.display = '';
    _divEditCurrent = customInp?.value?.trim() || '';
  } else {
    if (customInp) { customInp.style.display = 'none'; customInp.value = ''; }
    _divEditCurrent = division;
  }
}

function _divCustomInput(val) { _divEditCurrent = val.trim() || null; }

async function _saveDivision() {
  if (!_divEditUid || !isMod()) return;
  // If "Lainnya" chip is active, read the typed value
  if (g('div-chips-grid')?.querySelector('.chip-other.selected')) {
    const raw = (g('div-custom-input')?.value || '').trim();
    const s = sanitizeInput(raw);
    _divEditCurrent = (s !== null && s.trim()) ? s.trim() : null;
  }
  const btn = g('div-save-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...'; }
  try {
    const { error } = await dbQ(
      db.from('profiles').update({ division: _divEditCurrent || null }).eq('id', _divEditUid)
    );
    if (error) throw error;
    showToast('Divisi diperbarui.', 'success');
    closeModal('div-modal');
    loadAnggota();
  } catch (err) {
    showToast(safeErr(err), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Simpan'; }
  }
}

function showMemberModal(m) {
  const r = m.role || 'anggota';
  g('mm-av').src   = safeUrl(m.avatar_url) || avFallback(m.full_name||'A');
  sv2('mm-name',  m.full_name||m.username||'Anggota');
  sv2('mm-uname', '@'+(m.username||'–'));
  sv2('mm-bio',   m.bio||'Warga Anjun Generation.');
  g('mm-role').textContent = r.toUpperCase();
  g('mm-role').className   = `mm-role-pill role-${r}`;
  const mmDivWrap = g('mm-div-wrap');
  if (mmDivWrap) {
    if (m.division) { mmDivWrap.innerHTML = `<span class="div-badge">${esc(m.division.toUpperCase())}</span>`; mmDivWrap.style.display = ''; }
    else { mmDivWrap.innerHTML = ''; mmDivWrap.style.display = 'none'; }
  }
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

// Filter match: '' = all, otherwise checks if action_type contains the key
function _logMatchFilter(row, filter) {
  if (!filter) return true;
  const at = (row.action_type || '').toUpperCase();
  if (filter === 'LOGIN') return at.includes('LOGIN') || at.includes('LOGOUT') || at.includes('REGISTER');
  return at.includes(filter);
}

// Re-render terminal from cached _logData respecting current filter + expand state
function _renderLogTerminal() {
  const el = g('log-terminal');
  const footer = g('log-footer');
  if (!el) return;
  const filtered = _logData.filter(r => _logMatchFilter(r, _logFilter));
  const visible  = _logExpanded ? filtered : filtered.slice(0, _LOG_PREVIEW);
  if (!visible.length) {
    el.innerHTML = `<div class="log-empty">Tidak ada log${_logFilter ? ' untuk filter ini' : ''}.</div>`;
    if (footer) footer.style.display = 'none';
    return;
  }
  el.innerHTML = visible.map(_logEntryHTML).join('');
  if (footer) {
    const hasMore     = !_logExpanded && filtered.length > _LOG_PREVIEW;
    const canCollapse = _logExpanded  && filtered.length > _LOG_PREVIEW;
    footer.style.display = (hasMore || canCollapse) ? '' : 'none';
    const btn = footer.querySelector('.btn-log-all');
    if (btn) {
      if (hasMore) {
        btn.onclick   = expandLog;
        btn.innerHTML = `<i class="fas fa-list-ul"></i>&nbsp; Lihat Semua Log Activity (${filtered.length} entri)`;
      } else if (canCollapse) {
        btn.onclick   = collapseLog;
        btn.innerHTML = `<i class="fas fa-chevron-up"></i>&nbsp; Sembunyikan Log Activity`;
      }
    }
  }
}

function setLogFilter(btn, filter) {
  _logFilter   = filter;
  _logExpanded = false;
  document.querySelectorAll('.log-fc').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  _renderLogTerminal();
}

function expandLog() {
  _logExpanded = true;
  _renderLogTerminal();
}

function collapseLog() {
  _logExpanded = false;
  _renderLogTerminal();
}

// Fetch 200 latest logs then render preview — Owner/Ketua only
async function loadLogTerminal() {
  const el = g('log-terminal');
  if (!el || !isOK()) return;
  _logFilter = ''; _logExpanded = false; _logData = [];
  el.innerHTML = '<div class="log-loading"><i class="fas fa-spinner fa-spin fa-xs"></i> Memuat log...</div>';
  const footer = g('log-footer');
  if (footer) footer.style.display = 'none';
  // Reset filter chips to SEMUA
  document.querySelectorAll('.log-fc').forEach((b,i) => b.classList.toggle('active', i===0));
  try {
    const { data, error } = await dbQ(
      db.from('logs').select('created_at,user_name,action_type,description')
        .order('created_at', { ascending: false }).limit(200),
      6000
    );
    if (error) {
      if (error.code === '42501') { el.innerHTML = '<div class="log-empty">Anda tidak memiliki akses untuk tindakan ini.</div>'; return; }
      throw error;
    }
    _logData = data || [];
    _renderLogTerminal();
  } catch (_) {
    el.innerHTML = '<div class="log-empty">Gagal memuat log.</div>';
  }
}

// Realtime subscription — prepend to _logData, re-render
function _subscribeLogTerminal() {
  if (!isOK()) return;
  if (_logsChannel) { db.removeChannel(_logsChannel); _logsChannel = null; }
  _logsChannel = db.channel('logs-terminal')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs' },
      payload => {
        if (!isOK()) return;
        _logData.unshift(payload.new);
        if (_logData.length > 200) _logData.pop();
        _renderLogTerminal();
      })
    .subscribe();
}

// ── 22. TICKER MODULE ───────────────────────────────────────────────────────────────
async function loadTicker() {
  const track = g('tickerTrack');
  if (!track) return;

  // Only fetch content created within the last 7 days for the ticker
  const _7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [custRes, newsRes, trxRes, prodRes, galRes, aiRes] = await Promise.allSettled([
    db.from('tickers').select('id,content').order('created_at',{ascending:false}),
    db.from('news').select('id,title').eq('status','approved').gte('created_at',_7d).order('created_at',{ascending:false}).limit(3),
    db.from('transactions').select('id,type,description,category').gte('created_at',_7d).order('created_at',{ascending:false}).limit(3),
    db.from('products').select('id,name').eq('status','approved').gte('created_at',_7d).order('created_at',{ascending:false}).limit(2),
    db.from('gallery').select('id,caption').eq('status','approved').gte('created_at',_7d).order('created_at',{ascending:false}).limit(2),
    db.from('app_info').select('slogan,description,vision,mission').eq('id',1).single(),
  ]);

  // items = { type, text, id?, link:bool }
  const items = [];

  // P1: custom tickers — tampil saja, tidak clickable
  const custom = custRes.status==='fulfilled' ? (custRes.value?.data||[]) : [];
  custom.forEach(t => { if(t.content) items.push({ type:'custom', text:String(t.content).slice(0,80), link:false }); });

  // P2: news & transaksi — clickable
  const news = newsRes.status==='fulfilled' ? (newsRes.value?.data||[]) : [];
  news.forEach(n => { if(n.title) items.push({ type:'news', text:'📰 '+String(n.title).slice(0,80), id:n.id, link:true }); });

  const trxList = trxRes.status==='fulfilled' ? (trxRes.value?.data||[]) : [];
  trxList.forEach(t => {
    const emoji = t.type==='income' ? '💰' : '💸';
    const label = (t.description||t.category||'').trim().slice(0,60);
    if (label) items.push({ type:'finance', text:emoji+' '+label, id:t.id, link:true });
  });

  // P3: produk & galeri — clickable
  const prods = prodRes.status==='fulfilled' ? (prodRes.value?.data||[]) : [];
  prods.forEach(p => { if(p.name) items.push({ type:'products', text:'🛍️ '+String(p.name).slice(0,60), id:p.id, link:true }); });

  const gals = galRes.status==='fulfilled' ? (galRes.value?.data||[]) : [];
  gals.forEach(gl => { if(gl.caption) items.push({ type:'gallery', text:'📷 '+String(gl.caption).slice(0,60), id:gl.id, link:true }); });

  // Appinfo items — always built; used as distinct filler when content is sparse
  const ai = aiRes.status==='fulfilled' ? aiRes.value?.data : null;
  const aiItems = [];
  if (ai?.slogan)      aiItems.push({ type:'appinfo', text:'✨ '+ai.slogan, link:false });
  if (ai?.description) aiItems.push({ type:'appinfo', text:'ℹ️ '+String(ai.description).slice(0,80), link:false });
  if (ai?.vision)      aiItems.push({ type:'appinfo', text:'👁️ Visi: '+String(ai.vision).slice(0,80), link:false });
  if (ai?.mission)     aiItems.push({ type:'appinfo', text:'🎯 Misi: '+String(ai.mission).slice(0,80), link:false });

  // Promote appinfo as primary only when truly nothing else
  if (!items.length) items.push(...aiItems);
  if (!items.length) items.push({ type:'static', text:'🌿 Selamat datang di ANJUNKU — Portal Digital Komunitas Desa Anjun', link:false });

  // Hash check — skip re-render if unchanged (prevents animation restart)
  const hash = items.map(it => it.type+'|'+String(it.id||'')+'|'+it.text.slice(0,30)).join('::');
  if (hash === _tickerHash) return;
  _tickerHash = hash;

  // Build display: real items first, then fill gaps with distinct appinfo up to MIN=4
  const MIN = 4;
  const seen = new Set(items.map(i => i.text));
  const display = [...items];
  if (display.length < MIN) {
    for (const pad of aiItems) {
      if (display.length >= MIN) break;
      if (!seen.has(pad.text)) { seen.add(pad.text); display.push(pad); }
    }
  }
  // Last resort: repeat base items so scroll never stalls
  while (display.length < MIN) {
    const gap = MIN - display.length;
    display.push(...items.slice(0, gap));
  }

  const mkItem = ({ type, text, id, link }) => {
    const st = String(type||'').replace(/[^a-z]/gi,'');
    const si = String(id||'').replace(/[^a-z0-9\-]/gi,'');
    if (link && id) {
      return `<span class="ticker-item ticker-link" role="button" tabindex="0" aria-label="${esc(text)}" data-tick-type="${st}" data-tick-id="${si}"><i class="fas fa-diamond" aria-hidden="true"></i> ${esc(text)}</span>`;
    }
    return `<span class="ticker-item"><i class="fas fa-diamond" aria-hidden="true"></i> ${esc(text)}</span>`;
  };

  // Double the display set for seamless CSS loop (-50% keyframe)
  const half = display.map(mkItem).join('');
  track.innerHTML = half + half;
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
  const { error } = await db.from('tickers').insert({ content:val });
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
    case 'finance':  authNavTo('finance');  break;
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
    default: // 'custom', 'static'
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
  renderSponsorDash();
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
  const cnt = _sponsors.length;
  const colClass = cnt === 1 ? ' sponsor-grid-single' : '';
  const grid = `<div class="sponsor-grid${colClass}">${_sponsors.map(sp => `
    <a href="${safeUrl(sp.website_url)||'#'}" target="_blank" rel="noopener noreferrer" onclick="trackSponsorClick('${sp.id}')" class="sponsor-card">
      ${sp.logo_url
        ? `<div class="spc-logo-wrap"><img src="${safeUrl(sp.logo_url)}" alt="${esc(sp.name)}" class="spc-logo" loading="lazy" onerror="this.style.display='none'"></div>`
        : `<div class="spc-logo-wrap spc-no-logo"><i class="fas fa-building"></i></div>`}
      <div class="spc-name">${esc(sp.name)}</div>
    </a>`).join('')}</div>`;
  const waLink = buildPartnerWALink();
  const waFooter = waLink
    ? `<div class="sponsor-wa-footer"><a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn-wa btn-wa-partner"><i class="fab fa-whatsapp"></i> Hubungi Admin</a></div>`
    : '';
  el.innerHTML = manageBtn + grid + waFooter;
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
    const { data, error } = await dbQ(db.from('sponsors').select(SPON_COLS).order('priority',{ascending:false}));
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
    const storErr5 = await deleteStorageFile(logoUrl, 'sponsors');
    const { error } = await db.from('sponsors').delete().eq('id',id);
    if (error) { showToast(safeErr(error), 'error'); return; }
    if (storErr5) showToast('File logo gagal dihapus dari server.', 'warn');
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
    if (avatarFile) {
      if (CP.avatar_url) await deleteStorageFile(CP.avatar_url, 'avatars');
      avatar_url = await uploadMedia(avatarFile, 'avatars');
    }
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
  } catch (err) { showToast('Login gagal: ' + safeAuthErr(err), 'error'); }
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
  g('chpw-new').value = '';
  g('chpw-confirm').value = '';
  openModal('change-pw-modal');
}

async function handleChangePassword(e) {
  e.preventDefault();
  const newPass = sanitizeInput(g('chpw-new')?.value || '');
  const confPass = sanitizeInput(g('chpw-confirm')?.value || '');
  if (!newPass || newPass.length < 8) { showToast('Password minimal 8 karakter.', 'warn'); return; }
  if (newPass !== confPass) { showToast('Konfirmasi password tidak cocok.', 'warn'); return; }
  const btn = g('chpw-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
  try {
    const { error } = await db.auth.updateUser({ password: newPass });
    if (error) { showToast(safeAuthErr(error), 'error'); return; }
    showToast('Password berhasil diubah! Silakan login ulang jika diperlukan.', 'success');
    closeModal('change-pw-modal');
    g('chpw-new').value = '';
    g('chpw-confirm').value = '';
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
    // When a new SW activates and claims this client, reload to get fresh assets
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data?.type === 'SW_UPDATED') {
        showToast('Aplikasi diperbarui! Memuat ulang...', 'info', 2500);
        // If idle logout is in-flight (flag set, signOut still pending), complete
        // the signOut first so the reload doesn't restore a stale session.
        let pendingLogout = false;
        try { pendingLogout = !!localStorage.getItem(_FORCE_LOGOUT_KEY); } catch (_) {}
        if (pendingLogout) {
          db.auth.signOut().catch(() => {}).finally(() => {
            try { localStorage.removeItem(_FORCE_LOGOUT_KEY); } catch (_) {}
            setTimeout(() => window.location.reload(), 300);
          });
        } else {
          setTimeout(() => window.location.reload(), 2500);
        }
      }
    });
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

  // Ticker click + keyboard delegation — hanya .ticker-link (news/products/gallery/finance)
  const _tb = g('ticker-bar');
  if (_tb) {
    const _doTickerClick = e => {
      const it = e.target.closest('.ticker-link');
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
