// ═══════════════════════════════════════════════════════════════════════════
// ANJUNKU Digital Command Center — ui-components.js
// Modular UI Component Library — Build: 20260511-v1
// Depends on: dashboard-core.js (for global helpers), Chart.js (CDN)
// ═══════════════════════════════════════════════════════════════════════════

// ╔════════════════════════════════════════════════════════════════════════╗
// ║  MODULE 1: SKELETON UI                                                  ║
// ╚════════════════════════════════════════════════════════════════════════╝
class SkeletonUI {
  static row(n = 3) {
    return Array.from({ length: n }, () => '<div class="skel skel-row"></div>').join('');
  }

  static card(n = 4) {
    return Array.from({ length: n }, () => '<div class="skel skel-card"></div>').join('');
  }

  static cardTall(n = 3) {
    return Array.from({ length: n }, () => '<div class="skel skel-card-tall"></div>').join('');
  }

  static member(n = 6) {
    return Array.from({ length: n }, () => '<div class="skel skel-member"></div>').join('');
  }

  static gallery(n = 4) {
    return Array.from({ length: n }, () => '<div class="skel skel-gal"></div>').join('');
  }

  static mount(target, variant = 'card', count = 4) {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) return () => {};
    el.innerHTML = SkeletonUI[variant]?.(count) ?? SkeletonUI.row(count);
    return () => { el.innerHTML = ''; };
  }
}


// ╔════════════════════════════════════════════════════════════════════════╗
// ║  MODULE 2: TOAST NOTIFICATION SYSTEM                                    ║
// ║  Emerald-themed, stacked, with auto-dismiss progress bar                ║
// ╚════════════════════════════════════════════════════════════════════════╝
class ToastSystem {
  static _stack = null;

  static _getStack() {
    if (!ToastSystem._stack || !document.body.contains(ToastSystem._stack)) {
      const s = document.createElement('div');
      s.className = 'toast-stack';
      document.body.appendChild(s);
      ToastSystem._stack = s;
    }
    return ToastSystem._stack;
  }

  static show(msg, type = 'info', duration = 3500) {
    const ICONS = {
      success: 'fa-circle-check',
      error:   'fa-circle-xmark',
      warn:    'fa-triangle-exclamation',
      info:    'fa-circle-info',
    };

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    toast.innerHTML = `
      <i class="fas ${ICONS[type] ?? ICONS.info} toast-icon"></i>
      <span class="toast-msg">${msg}</span>
      <button class="toast-close" aria-label="Tutup"><i class="fas fa-times"></i></button>
      <div class="toast-bar"><div class="toast-bar-fill" style="animation-duration:${duration}ms"></div></div>`;

    const stack = ToastSystem._getStack();
    stack.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('toast-in'));

    const dismiss = () => {
      toast.classList.remove('toast-in');
      toast.classList.add('toast-out');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    };

    toast.querySelector('.toast-close').addEventListener('click', dismiss);
    setTimeout(dismiss, duration);

    return dismiss;
  }

  static success(msg, d = 3500) { return ToastSystem.show(msg, 'success', d); }
  static error(msg,   d = 4500) { return ToastSystem.show(msg, 'error',   d); }
  static warn(msg,    d = 4000) { return ToastSystem.show(msg, 'warn',    d); }
  static info(msg,    d = 3500) { return ToastSystem.show(msg, 'info',    d); }
}


// ╔════════════════════════════════════════════════════════════════════════╗
// ║  MODULE 3: CONFIRMATION DIALOG                                          ║
// ║  Blocks data writes until user explicitly approves                      ║
// ╚════════════════════════════════════════════════════════════════════════╝
class ConfirmDialog {
  static show(title, body, onConfirm) {
    const modal  = document.getElementById('confirm-modal');

    if (!modal) {
      if (window.confirm(body.replace(/<[^>]+>/g, ''))) onConfirm();
      return;
    }

    const titleEl = document.getElementById('confirm-title');
    const msgEl   = document.getElementById('confirm-message');
    const okBtn   = document.getElementById('confirm-ok-btn');

    if (titleEl) titleEl.innerHTML = `<i class="fas fa-shield-exclamation"></i> ${title}`;
    if (msgEl)   msgEl.innerHTML   = body;

    if (okBtn) {
      const clone = okBtn.cloneNode(true);
      okBtn.parentNode.replaceChild(clone, okBtn);
      clone.addEventListener('click', () => {
        ConfirmDialog.close();
        onConfirm();
      }, { once: true });
    }

    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('modal-in'));
  }

  static close() {
    const modal = document.getElementById('confirm-modal');
    if (!modal) return;
    modal.classList.remove('modal-in');
    modal.addEventListener('transitionend', () => { modal.style.display = 'none'; }, { once: true });
  }
}


// ╔════════════════════════════════════════════════════════════════════════╗
// ║  MODULE 4: PERSONAL GREETING SYSTEM                                     ║
// ║  Role-aware welcome message with time-of-day context                    ║
// ╚════════════════════════════════════════════════════════════════════════╝
class GreetingSystem {
  static ROLE_LABELS = {
    owner:     (name) => `Selamat {time}, Chief ${name}! 👑 [OWNER MODE ACTIVE]`,
    ketua:     (name) => `Selamat {time}, ${name}! [KETUA MODE]`,
    bendahara: (name) => `Selamat {time}, ${name}! [BENDAHARA]`,
    admin:     (name) => `Selamat {time}, ${name}! [ADMIN]`,
    anggota:   (name) => `Selamat {time}, ${name}!`,
  };

  static _getTimeGreet() {
    const h = new Date().getHours();
    if (h < 12) return 'pagi';
    if (h < 15) return 'siang';
    if (h < 18) return 'sore';
    return 'malam';
  }

  static greet(profile, role) {
    if (!profile) return;
    const name      = (profile.full_name || '').split(' ')[0] || 'Kawan';
    const time      = GreetingSystem._getTimeGreet();
    const template  = GreetingSystem.ROLE_LABELS[role] ?? GreetingSystem.ROLE_LABELS.anggota;
    const message   = template(name).replace('{time}', time);
    ToastSystem.success(message, 4500);
  }
}


// ╔════════════════════════════════════════════════════════════════════════╗
// ║  MODULE 5: MEMBER QR CODE SYSTEM                                        ║
// ╚════════════════════════════════════════════════════════════════════════╝
class QRModal {
  static buildUrl(memberId, base = location.origin + location.pathname) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&color=4ade80&bgcolor=0a0f08&data=${encodeURIComponent(`${base}?member=${memberId}`)}`;
  }

  static render(memberId) {
    const el = document.getElementById('mm-qr');
    if (!el) return;
    const src = QRModal.buildUrl(memberId);
    el.innerHTML = `<img src="${src}" alt="QR Code" loading="lazy"
      style="border-radius:8px;display:block;image-rendering:pixelated;">`;
  }

  static async download(memberName) {
    try {
      const img = document.getElementById('mm-qr')?.querySelector('img');
      if (!img) throw new Error('QR tidak ditemukan di modal.');

      const resp = await fetch(img.src);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();

      const a       = document.createElement('a');
      a.href        = URL.createObjectURL(blob);
      a.download    = `qr-${(memberName || 'member').replace(/\s+/g, '-').toLowerCase()}.png`;
      a.click();
      URL.revokeObjectURL(a.href);

      ToastSystem.success('QR Code berhasil diunduh!');
    } catch (err) {
      ToastSystem.error('Gagal unduh QR Code: ' + err.message);
    }
  }
}


// ╔════════════════════════════════════════════════════════════════════════╗
// ║  MODULE 6: PWA MANAGER                                                  ║
// ╚════════════════════════════════════════════════════════════════════════╝
class PWAManager {
  static _prompt    = null;
  static _installed = false;

  static init() {
    if (PWAManager.isInstalled()) {
      PWAManager._hideBanner();
      return;
    }

    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      PWAManager._prompt = e;
      if (!sessionStorage.getItem('pwa-dismissed')) {
        PWAManager._showBanner();
      }
    });

    window.addEventListener('appinstalled', () => {
      PWAManager._prompt    = null;
      PWAManager._installed = true;
      PWAManager._hideBanner();
      ToastSystem.success('ANJUNKU berhasil dipasang di perangkat Anda!', 4000);
    });
  }

  static async promptInstall() {
    if (!PWAManager._prompt) return null;
    PWAManager._prompt.prompt();
    const { outcome } = await PWAManager._prompt.userChoice;
    PWAManager._prompt = null;
    if (outcome === 'accepted') PWAManager._hideBanner();
    return outcome;
  }

  static dismiss() {
    sessionStorage.setItem('pwa-dismissed', '1');
    PWAManager._hideBanner();
  }

  static isInstalled() {
    return (
      PWAManager._installed ||
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  static _showBanner() {
    const b = document.getElementById('pwa-install-banner');
    if (b) b.style.display = 'flex';
  }

  static _hideBanner() {
    const b = document.getElementById('pwa-install-banner');
    if (b) b.style.display = 'none';
  }
}


// ╔════════════════════════════════════════════════════════════════════════╗
// ║  MODULE 7: LEADERBOARD UI                                               ║
// ╚════════════════════════════════════════════════════════════════════════╝
class LeaderboardUI {
  static MEDALS      = ['🥇', '🥈', '🥉'];
  static OWNER_EMAIL = 'anjungeneration@gmail.com';

  static WEIGHTS = { transactions: 3, news: 2, products: 2, gallery: 1 };

  static async render(supabaseClient, profiles) {
    const el = document.getElementById('leaderboard-list');
    if (!el) return;

    try {
      el.innerHTML = SkeletonUI.row(3);

      const [trx, news, prods, gal] = await Promise.all([
        supabaseClient.from('transactions').select('user_id'),
        supabaseClient.from('news').select('user_id'),
        supabaseClient.from('products').select('user_id'),
        supabaseClient.from('gallery').select('user_id'),
      ]);

      const scores = {};
      const tally  = (rows, weight) =>
        (rows?.data || []).forEach(r => {
          scores[r.user_id] = (scores[r.user_id] || 0) + weight;
        });

      tally(trx,   LeaderboardUI.WEIGHTS.transactions);
      tally(news,  LeaderboardUI.WEIGHTS.news);
      tally(prods, LeaderboardUI.WEIGHTS.products);
      tally(gal,   LeaderboardUI.WEIGHTS.gallery);

      const _esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      const _avFallback = n =>
        `https://ui-avatars.com/api/?name=${encodeURIComponent(n)}&background=0a1409&color=4ade80&size=64&bold=true`;

      const ranked = [...profiles]
        .map(p => ({ ...p, score: scores[p.id] || 0 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      if (!ranked.length) {
        el.innerHTML = '<div class="empty-mini"><i class="fas fa-trophy"></i>&nbsp; Belum ada data kontribusi.</div>';
        return;
      }

      el.innerHTML = ranked.map((m, i) => {
        const role  = m.email === LeaderboardUI.OWNER_EMAIL ? 'owner' : (m.role || 'anggota');
        const medal = LeaderboardUI.MEDALS[i] ??
          `<span style="font-size:.78rem;color:#555;font-weight:700;">${i + 1}</span>`;
        const isTop = i < 3;

        return `<div class="lb-item${isTop ? ` lb-top lb-top-${i}` : ''}">
          <span class="lb-rank">${medal}</span>
          <img src="${m.avatar_url || _avFallback(m.full_name || 'A')}" class="lb-av" loading="lazy" alt="">
          <span class="lb-name">${_esc(m.full_name || m.username || 'Anggota')}</span>
          <span class="role-badge role-${role}" style="font-size:.55rem;">${role.toUpperCase()}</span>
          <span class="lb-score">
            <i class="fas fa-star" style="font-size:.65rem;color:var(--green-muted);"></i>
            ${m.score} poin
          </span>
        </div>`;
      }).join('');

    } catch (_) {
      if (el) el.innerHTML = '<div class="empty-mini"><i class="fas fa-exclamation-triangle"></i>&nbsp; Leaderboard tidak tersedia.</div>';
    }
  }
}


// ╔════════════════════════════════════════════════════════════════════════╗
// ║  MODULE 8: SPONSOR TICKER UI                                            ║
// ╚════════════════════════════════════════════════════════════════════════╝
class SponsorTickerUI {
  static _esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  static renderBanner(sponsors, { elId = 'sponsor-banner', pickFn = null, clickFn = null } = {}) {
    const el = document.getElementById(elId);
    if (!el) return;

    if (!sponsors.length) {
      el.innerHTML = `<div class="sponsor-placeholder"><i class="fas fa-ad"></i>
        Space Iklan Tersedia &mdash;
        <span style="color:var(--green-muted);cursor:pointer;" onclick="showAuthModal?.()">Hubungi Admin</span>
      </div>`;
      return;
    }

    const sp = pickFn ? pickFn(sponsors) : sponsors[0];
    if (!sp) return;

    el.innerHTML = `
      <a href="${sp.website_url || '#'}" target="_blank" rel="noopener noreferrer"
         onclick="${clickFn ? `(${clickFn.toString()})('${sp.id}')` : ''}"
         class="sponsor-item">
        ${sp.logo_url
          ? `<img src="${SponsorTickerUI._esc(sp.logo_url)}" alt="${SponsorTickerUI._esc(sp.name)}" class="sponsor-logo" loading="lazy">`
          : ''}
        <span class="sponsor-name">${SponsorTickerUI._esc(sp.name)}</span>
      </a>`;
  }

  static renderTicker(sponsors, elId = 'sponsor-ticker-track') {
    const el = document.getElementById(elId);
    if (!el) return;

    if (!sponsors.length) {
      el.innerHTML = '<span class="spt-item" style="color:#333;font-size:.72rem;">Belum ada sponsor aktif.</span>';
      return;
    }

    const items = sponsors.map(sp => `
      <a href="${sp.website_url || '#'}" target="_blank" rel="noopener noreferrer"
         class="spt-item" title="${SponsorTickerUI._esc(sp.name)}">
        ${sp.logo_url
          ? `<img src="${SponsorTickerUI._esc(sp.logo_url)}" alt="${SponsorTickerUI._esc(sp.name)}" class="spt-logo">`
          : `<span class="spt-name">${SponsorTickerUI._esc(sp.name)}</span>`}
      </a>`).join('');

    el.innerHTML = items + items;
  }

  static renderDashSlot(sponsors, { elId = 'sponsor-dash', isMod = false, pickFn = null } = {}) {
    const el = document.getElementById(elId);
    if (!el) return;

    if (!sponsors.length) {
      const mgmt = isMod
        ? `<span style="color:var(--green-muted);cursor:pointer;" onclick="openSponsorModal?.()">Kelola Sponsor</span>`
        : 'Hubungi Admin';
      el.innerHTML = `<div class="sponsor-placeholder"><i class="fas fa-ad"></i> Space Iklan Tersedia &mdash; ${mgmt}</div>`;
      return;
    }

    const sp = pickFn ? pickFn(sponsors) : sponsors[0];
    if (!sp) return;

    el.innerHTML = `
      <a href="${sp.website_url || '#'}" target="_blank" rel="noopener noreferrer" class="sponsor-dash-item">
        ${sp.logo_url
          ? `<img src="${SponsorTickerUI._esc(sp.logo_url)}" alt="${SponsorTickerUI._esc(sp.name)}" class="sponsor-dash-logo" loading="lazy">`
          : ''}
        <div>
          <div class="sponsor-dash-name">${SponsorTickerUI._esc(sp.name)}</div>
          ${sp.website_url
            ? `<div class="sponsor-dash-url">${SponsorTickerUI._esc(sp.website_url.replace(/^https?:\/\//, ''))}</div>`
            : ''}
        </div>
      </a>`;
  }
}


// ╔════════════════════════════════════════════════════════════════════════╗
// ║  MODULE 9: WHATSAPP REDIRECT                                            ║
// ╚════════════════════════════════════════════════════════════════════════╝
class WARedirect {
  static buildLink(phone, productName) {
    const clean = (phone || '').replace(/\D/g, '');
    const msg   = encodeURIComponent(
      `Halo, saya tertarik dengan produk ${productName} yang saya lihat di Dashboard ANJUNKU. Apakah masih tersedia?`
    );
    return `https://wa.me/${clean}?text=${msg}`;
  }

  static open(phone, productName) {
    const url = WARedirect.buildLink(phone, productName);
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}


// ╔════════════════════════════════════════════════════════════════════════╗
// ║  MODULE 10: IDR NUMBER FORMATTER                                        ║
// ╚════════════════════════════════════════════════════════════════════════╝
class IDRFormatter {
  static _full = new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 0,
  });

  static _compact = new Intl.NumberFormat('id-ID', {
    notation: 'compact', compactDisplay: 'short',
  });

  static format(n) {
    return IDRFormatter._full.format(parseFloat(n) || 0);
  }

  static formatHeader(n) {
    const v = parseFloat(n) || 0;
    return v === 0 ? 'RP —' : 'RP ' + v.toLocaleString('id-ID');
  }

  static compact(n) {
    const v = parseFloat(n) || 0;
    if (v >= 1e9)  return (v / 1e9).toFixed(1).replace('.', ',') + 'M';
    if (v >= 1e6)  return (v / 1e6).toFixed(1).replace('.', ',') + 'jt';
    if (v >= 1e3)  return (v / 1e3).toFixed(0) + 'rb';
    return String(v);
  }
}


// ╔════════════════════════════════════════════════════════════════════════╗
// ║  GLOBAL BRIDGE                                                          ║
// ╚════════════════════════════════════════════════════════════════════════╝
window.SkeletonUI      = SkeletonUI;
window.ToastSystem     = ToastSystem;
window.ConfirmDialog   = ConfirmDialog;
window.GreetingSystem  = GreetingSystem;
window.QRModal         = QRModal;
window.PWAManager      = PWAManager;
window.LeaderboardUI   = LeaderboardUI;
window.SponsorTickerUI = SponsorTickerUI;
window.WARedirect      = WARedirect;
window.IDRFormatter    = IDRFormatter;
