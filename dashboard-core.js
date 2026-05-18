// ═══════════════════════════════════════════════════════════════════════════
// ANJUNKU Digital Command Center — dashboard-core.js
// Modular Backend Logic — Build: 20260511-v1
// ═══════════════════════════════════════════════════════════════════════════

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  MODULE 1: GLOBAL MEDIA PROCESSOR                                       ║
// ╚══════════════════════════════════════════════════════════════════════════╝
class MediaProcessor {
  static MAX_MB       = 10;
  static WEBP_QUALITY = 0.7;
  static MAX_PX       = 1080;

  /**
   * Process a raw image File:
   *   • Validate size ≤ MAX_MB
   *   • Resize to MAX_PX width (aspect ratio preserved)
   *   • Convert to WebP at WEBP_QUALITY (strips EXIF via Canvas redraw)
   * @param {File} file  — raw image File from <input>
   * @returns {Promise<File>}  — processed WebP File object
   */
  static async processMedia(file) {
    if (!file.type.startsWith('image/')) {
      throw new Error('File harus berupa gambar (JPG/PNG/WEBP/dll).');
    }

    const mb = file.size / (1024 * 1024);
    if (mb > MediaProcessor.MAX_MB) {
      throw new Error(
        `File terlalu besar (${mb.toFixed(1)} MB). Maksimum ${MediaProcessor.MAX_MB} MB.`
      );
    }

    return new Promise((resolve, reject) => {
      const img       = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);

        const scale  = Math.min(1, MediaProcessor.MAX_PX / img.width);
        const width  = Math.round(img.width  * scale);
        const height = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('Gagal mengkonversi gambar ke WebP.'));
            const filename = file.name.replace(/\.[^.]+$/, '.webp');
            resolve(new File([blob], filename, { type: 'image/webp' }));
          },
          'image/webp',
          MediaProcessor.WEBP_QUALITY
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('File gambar tidak valid atau rusak.'));
      };

      img.src = objectUrl;
    });
  }

  /**
   * Upload a file to Supabase Storage.
   * Images are processed through processMedia() first.
   * Returns the public URL automatically via getPublicUrl().
   * @param {File}   file           — raw File from input
   * @param {string} bucket         — Supabase storage bucket name
   * @param {object} supabaseClient — initialized Supabase client
   * @returns {Promise<string>}      — public URL of the uploaded file
   */
  static async uploadToStorage(file, bucket, supabaseClient) {
    try {
      let uploadFile = file;

      if (file.type.startsWith('image/')) {
        uploadFile = await MediaProcessor.processMedia(file);
      } else {
        const mb = file.size / (1024 * 1024);
        if (mb > MediaProcessor.MAX_MB) {
          throw new Error(`File terlalu besar (${mb.toFixed(1)} MB). Maksimum ${MediaProcessor.MAX_MB} MB.`);
        }
      }

      const path    = `${Date.now()}_${uploadFile.name}`;
      const options = uploadFile.type === 'image/webp' ? { contentType: 'image/webp' } : {};

      const { data, error } = await supabaseClient.storage
        .from(bucket)
        .upload(path, uploadFile, options);

      if (error) throw new Error('Upload gagal: ' + error.message);

      const { data: urlData } = supabaseClient.storage.from(bucket).getPublicUrl(data.path);
      return urlData.publicUrl;
    } catch (err) {
      throw err;
    }
  }
}


// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  MODULE 2: RBAC & SECURITY SYSTEM                                       ║
// ╚══════════════════════════════════════════════════════════════════════════╝
class RBACManager {
  static CRUD_ROLES    = ['owner', 'ketua', 'admin'];
  static FINANCE_ROLES = ['owner', 'ketua', 'bendahara'];

  static resolveRole(profile) {
    if (!profile) return null;
    return profile.role || 'anggota';
  }

  static hasCrudAccess(role)    { return RBACManager.CRUD_ROLES.includes(role);    }
  static hasFinanceAccess(role) { return RBACManager.FINANCE_ROLES.includes(role); }

  /**
   * Apply DOM-level visibility and access rules.
   * — Removes .btn-crud from the DOM permanently for non-CRUD roles.
   * — Locks .btn-finance (disabled + read-only style) for non-finance roles.
   * Must be called once after the role is known.
   */
  static applyDomSecurity(role) {
    // Permanently remove CRUD controls for unprivileged roles
    if (!RBACManager.hasCrudAccess(role)) {
      document.querySelectorAll('.btn-crud').forEach(el => el.remove());
    }

    // Finance lock: non-trio roles get read-only treatment
    if (!RBACManager.hasFinanceAccess(role)) {
      document.querySelectorAll('.btn-finance').forEach(el => {
        el.disabled = true;
        el.title    = 'Akses terbatas — hanya Owner / Ketua / Bendahara';
        el.style.cssText += ';opacity:.35;pointer-events:none;cursor:not-allowed;';
      });
    }
  }

  /**
   * Fetch the role row from the `profiles` table.
   */
  static async fetchUserRole(supabaseClient, userId) {
    try {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('role, email')
        .eq('id', userId)
        .single();

      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      throw new Error('Gagal mengambil data role: ' + err.message);
    }
  }
}


// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  MODULE 3: FINANCE & REAL-TIME ANALYTICS                                ║
// ╚══════════════════════════════════════════════════════════════════════════╝
class FinanceAnalytics {
  static _chart = null;

  static _fmt = new Intl.NumberFormat('id-ID', {
    style:                 'currency',
    currency:              'IDR',
    minimumFractionDigits: 0,
  });

  /**
   * Fetch all transactions, compute Pemasukan − Pengeluaran,
   * and return structured result with IDR-formatted strings.
   */
  static async calculateFinance(supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('transactions')
        .select('type, amount, date, description, category')
        .order('date', { ascending: false });

      if (error) throw new Error(error.message);

      const transactions = data || [];
      let totalMasuk  = 0;
      let totalKeluar = 0;

      for (const t of transactions) {
        const amount = parseFloat(t.amount) || 0;
        t.type === 'masuk' ? (totalMasuk += amount) : (totalKeluar += amount);
      }

      const saldo = totalMasuk - totalKeluar;

      return {
        saldo,
        totalMasuk,
        totalKeluar,
        transactions,
        formatted: {
          saldo:  FinanceAnalytics._fmt.format(saldo),
          masuk:  FinanceAnalytics._fmt.format(totalMasuk),
          keluar: FinanceAnalytics._fmt.format(totalKeluar),
        },
      };
    } catch (err) {
      throw new Error('Gagal menghitung keuangan: ' + err.message);
    }
  }

  /** Write the formatted saldo into a DOM element by ID. */
  static displaySaldo(elementId, formattedSaldo) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = formattedSaldo;
  }

  static _getLast4Months() {
    const months = [];
    const now    = new Date();
    for (let i = 3; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return months;
  }

  static _buildDatasets(transactions, months) {
    const masukData  = months.map(m =>
      transactions
        .filter(t => t.type === 'masuk' && (t.date || '').startsWith(m))
        .reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)
    );
    const keluarData = months.map(m =>
      transactions
        .filter(t => t.type === 'keluar' && (t.date || '').startsWith(m))
        .reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)
    );
    const isEmpty = masukData.every(v => v === 0) && keluarData.every(v => v === 0);
    return { masukData, keluarData, isEmpty };
  }

  /**
   * Render a Chart.js line chart (cash-flow, 4 months) inside `containerId`.
   * Shows a flat grey line labelled "No Activity" when data is empty.
   */
  static renderCashFlowChart(containerId, transactions, heightPx = 200) {
    const container = document.getElementById(containerId);
    if (!container || typeof Chart === 'undefined') return;

    const months = FinanceAnalytics._getLast4Months();
    const { masukData, keluarData, isEmpty } = FinanceAnalytics._buildDatasets(transactions, months);

    const labels   = months.map(m =>
      new Date(m + '-02').toLocaleDateString('id-ID', { month: 'short', year: '2-digit' })
    );

    const canvasId = `_finChart_${containerId}`;
    container.innerHTML = `<canvas id="${canvasId}" style="height:${heightPx}px;"></canvas>`;

    if (FinanceAnalytics._chart) {
      FinanceAnalytics._chart.destroy();
      FinanceAnalytics._chart = null;
    }

    const ctx = document.getElementById(canvasId).getContext('2d');

    const datasets = isEmpty
      ? [{
          label:              'No Activity',
          data:               [0, 0, 0, 0],
          borderColor:        'rgba(120,120,120,.45)',
          backgroundColor:    'rgba(120,120,120,.05)',
          borderDash:         [6, 4],
          tension:            0,
          fill:               true,
          pointRadius:        0,
        }]
      : [
          {
            label:              'Pemasukan',
            data:               masukData,
            borderColor:        '#4ade80',
            backgroundColor:    'rgba(74,222,128,.12)',
            tension:            0.4,
            fill:               true,
            pointRadius:        4,
            pointBackgroundColor: '#4ade80',
          },
          {
            label:              'Pengeluaran',
            data:               keluarData,
            borderColor:        '#ef4444',
            backgroundColor:    'rgba(239,68,68,.08)',
            tension:            0.4,
            fill:               true,
            pointRadius:        4,
            pointBackgroundColor: '#ef4444',
          },
        ];

    FinanceAnalytics._chart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color:    '#888',
              font:     { size: 11, family: "'Plus Jakarta Sans',sans-serif" },
              boxWidth: 12,
            },
          },
          tooltip: {
            callbacks: {
              label: ctx => ' ' + FinanceAnalytics._fmt.format(ctx.raw),
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#666', font: { size: 10 } },
            grid:  { color: 'rgba(255,255,255,.04)' },
          },
          y: {
            ticks: {
              color:    '#666',
              font:     { size: 10 },
              callback: v =>
                v >= 1e6 ? (v / 1e6).toFixed(1) + 'jt' :
                v >= 1e3 ? (v / 1e3).toFixed(0) + 'rb' : '' + v,
            },
            grid: { color: 'rgba(255,255,255,.04)' },
          },
        },
      },
    });
  }
}


// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  MODULE 4: SPONSOR SYSTEM                                               ║
// ╚══════════════════════════════════════════════════════════════════════════╝
class SponsorManager {
  static _sponsors        = [];
  static _rotationTimer   = null;
  static ROTATION_INTERVAL = 8000; // ms between ad rotations

  /**
   * Fetch sponsors where is_active = true, ordered by priority DESC.
   * Higher priority → higher weight in rotation.
   */
  static async fetchSponsors(supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('sponsors')
        .select('*')
        .eq('is_active', true)
        .order('priority', { ascending: false });

      if (error) throw new Error(error.message);

      SponsorManager._sponsors = data || [];
      return SponsorManager._sponsors;
    } catch (err) {
      SponsorManager._sponsors = [];
      throw new Error('Gagal memuat data sponsor: ' + err.message);
    }
  }

  /**
   * Weighted-random pick: probability of being chosen = priority / Σ(priorities).
   */
  static weightedPick(sponsors = SponsorManager._sponsors) {
    if (!sponsors.length) return null;
    const total  = sponsors.reduce((s, sp) => s + (sp.priority || 1), 0);
    let   cursor = Math.random() * total;
    for (const sp of sponsors) {
      cursor -= sp.priority || 1;
      if (cursor <= 0) return sp;
    }
    return sponsors[0];
  }

  /**
   * Open the sponsor's website_url in a new tab and record the click.
   * @param {string} url            — the website_url to open
   * @param {object} [supabaseClient] — optional: used to increment click counter
   * @param {string} [sponsorId]      — optional: sponsor row ID for tracking
   */
  static trackSponsorClick(url, supabaseClient = null, sponsorId = null) {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');

    if (supabaseClient && sponsorId) {
      supabaseClient
        .from('sponsors')
        .rpc('increment_click', { sponsor_id: sponsorId })
        .catch(() => {});
    }
  }

  /** Start auto-rotation; calls `renderCallback` every ROTATION_INTERVAL ms. */
  static startRotation(renderCallback) {
    SponsorManager.stopRotation();
    if (SponsorManager._sponsors.length > 1) {
      SponsorManager._rotationTimer = setInterval(renderCallback, SponsorManager.ROTATION_INTERVAL);
    }
  }

  static stopRotation() {
    if (SponsorManager._rotationTimer) {
      clearInterval(SponsorManager._rotationTimer);
      SponsorManager._rotationTimer = null;
    }
  }
}


// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  MODULE 5: AUTHENTICATION UX                                            ║
// ╚══════════════════════════════════════════════════════════════════════════╝
class AuthUX {
  /**
   * Graceful logout with animated fade-out overlay:
   *   1. Show #logout-overlay with fade-in + emerald spinner
   *   2. Wait 800 ms (lets the animation play)
   *   3. Clear local Supabase cache from localStorage/sessionStorage
   *   4. Call supabase.auth.signOut()
   *   5. Fade overlay back out
   */
  static async handleLogout(supabaseClient) {
    const overlay = document.getElementById('logout-overlay');

    try {
      if (overlay) {
        overlay.style.opacity    = '0';
        overlay.style.display    = 'flex';
        overlay.style.transition = 'opacity 0.3s ease';
        // Trigger reflow so the transition fires
        // eslint-disable-next-line no-unused-expressions
        overlay.offsetHeight;
        overlay.style.opacity    = '1';
        document.body.style.pointerEvents = 'none';
      }

      await new Promise(resolve => setTimeout(resolve, 800));

      AuthUX._clearLocalCache();

      await supabaseClient.auth.signOut();

    } catch (err) {
      console.error('[AuthUX] Logout error:', err);
    } finally {
      if (overlay) {
        overlay.style.transition = 'opacity 0.3s ease';
        overlay.style.opacity    = '0';
        setTimeout(() => {
          overlay.style.display = 'none';
          overlay.style.opacity = '';
        }, 320);
        document.body.style.pointerEvents = '';
      }
    }
  }

  /** Wipe Supabase-related keys from localStorage and sessionStorage. */
  static _clearLocalCache() {
    try {
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sb-') || key.startsWith('supabase'))) {
          toRemove.push(key);
        }
      }
      toRemove.forEach(k => localStorage.removeItem(k));
      sessionStorage.clear();
    } catch (_) {}
  }
}


// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  ORCHESTRATOR: DashboardCore                                            ║
// ║  Wires all modules together; instantiate once after Supabase is ready.  ║
// ╚══════════════════════════════════════════════════════════════════════════╝
class DashboardCore {
  /**
   * @param {object} supabaseClient — the result of supabase.createClient(...)
   */
  constructor(supabaseClient) {
    this._db      = supabaseClient;
    this.user     = null;
    this.profile  = null;
    this.role     = null;
  }

  /**
   * Call after the auth session is known.
   * Resolves the role and applies DOM security rules.
   */
  async init(user, profile) {
    this.user    = user;
    this.profile = profile;
    this.role    = RBACManager.resolveRole(profile);
    RBACManager.applyDomSecurity(this.role);
  }

  // ── Delegate helpers ──────────────────────────────────────────────────────

  async processMedia(file) {
    return MediaProcessor.processMedia(file);
  }

  async uploadMedia(file, bucket) {
    return MediaProcessor.uploadToStorage(file, bucket, this._db);
  }

  async calculateFinance() {
    return FinanceAnalytics.calculateFinance(this._db);
  }

  renderFinanceChart(containerId, transactions, heightPx) {
    FinanceAnalytics.renderCashFlowChart(containerId, transactions, heightPx);
  }

  async fetchSponsors() {
    return SponsorManager.fetchSponsors(this._db);
  }

  trackSponsorClick(url, sponsorId) {
    SponsorManager.trackSponsorClick(url, this._db, sponsorId);
  }

  startSponsorRotation(renderCallback) {
    SponsorManager.startRotation(renderCallback);
  }

  async logout() {
    await AuthUX.handleLogout(this._db);
  }

  canManageCRUD()    { return RBACManager.hasCrudAccess(this.role);    }
  canManageFinance() { return RBACManager.hasFinanceAccess(this.role); }
}


// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  GLOBAL BRIDGE                                                          ║
// ║  Expose classes on window so inline HTML event handlers can reach them. ║
// ╚══════════════════════════════════════════════════════════════════════════╝
window.MediaProcessor   = MediaProcessor;
window.RBACManager      = RBACManager;
window.FinanceAnalytics = FinanceAnalytics;
window.SponsorManager   = SponsorManager;
window.AuthUX           = AuthUX;
window.DashboardCore    = DashboardCore;

// Convenience top-level aliases matching the spec's function names
window.processMedia      = (file)              => MediaProcessor.processMedia(file);
window.fetchSponsors     = (db)                => SponsorManager.fetchSponsors(db);
window.trackSponsorClick = (url, db, id)       => SponsorManager.trackSponsorClick(url, db, id);
window.calculateFinance  = (db)                => FinanceAnalytics.calculateFinance(db);
