// ============================================================
//  Okata PWA Helper  —  pwa.js
//  Add <script src="pwa.js"></script> to every HTML page
// ============================================================

(function () {
  'use strict';

  // ── 1. Register service worker ──────────────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('[SW] Registered, scope:', reg.scope))
        .catch(err => console.warn('[SW] Registration failed:', err));
    });
  }

  // ── 2. Install banner ───────────────────────────────────────
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;

    // Only show banner if not already installed
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    showInstallBanner();
  });

  function showInstallBanner() {
    // Don't show if dismissed recently (24 h)
    const dismissed = localStorage.getItem('okata_install_dismissed');
    if (dismissed && Date.now() - Number(dismissed) < 86400000) return;

    const banner = document.createElement('div');
    banner.id = 'okata-install-banner';
    banner.innerHTML = `
      <div style="
        position:fixed; bottom:0; left:0; right:0; z-index:99999;
        background:#2e7d32; color:#fff;
        padding:14px 16px;
        display:flex; align-items:center; gap:12px;
        box-shadow:0 -4px 20px rgba(0,0,0,0.15);
        animation: slideUp 0.3s ease;
      ">
        <img src="/icons/icon-96.png"
          style="width:40px; height:40px; border-radius:10px; flex-shrink:0;"
          onerror="this.style.display='none'">
        <div style="flex:1; min-width:0;">
          <div style="font-weight:700; font-size:0.95rem;">Install Okata</div>
          <div style="font-size:0.78rem; opacity:0.85;">
            Add to home screen for the best experience
          </div>
        </div>
        <button id="okata-install-btn" style="
          background:#fff; color:#2e7d32;
          border:none; border-radius:8px;
          padding:8px 14px; font-weight:700;
          font-size:0.85rem; cursor:pointer; flex-shrink:0;
        ">Install</button>
        <button id="okata-dismiss-btn" style="
          background:transparent; color:#fff;
          border:none; font-size:1.3rem;
          cursor:pointer; flex-shrink:0; line-height:1;
          opacity:0.7;
        ">✕</button>
      </div>
      <style>
        @keyframes slideUp {
          from { transform:translateY(100%); opacity:0; }
          to   { transform:translateY(0);   opacity:1; }
        }
      </style>
    `;

    document.body.appendChild(banner);

    document.getElementById('okata-install-btn').addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('[PWA] Install outcome:', outcome);
      deferredPrompt = null;
      removeBanner();
    });

    document.getElementById('okata-dismiss-btn').addEventListener('click', () => {
      localStorage.setItem('okata_install_dismissed', Date.now());
      removeBanner();
    });
  }

  function removeBanner() {
    const b = document.getElementById('okata-install-banner');
    if (b) b.remove();
  }

  // Hide banner once installed
  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App installed!');
    removeBanner();
  });

  // ── 3. Online / Offline indicator ──────────────────────────
  function showToast(msg, color) {
    const existing = document.getElementById('okata-net-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'okata-net-toast';
    toast.textContent = msg;
    Object.assign(toast.style, {
      position:     'fixed',
      top:          '70px',
      left:         '50%',
      transform:    'translateX(-50%)',
      background:   color,
      color:        '#fff',
      padding:      '8px 18px',
      borderRadius: '20px',
      fontSize:     '0.85rem',
      fontWeight:   '600',
      zIndex:       '99998',
      boxShadow:    '0 4px 12px rgba(0,0,0,0.2)',
      transition:   'opacity 0.4s',
    });
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 400);
    }, 2500);
  }

  window.addEventListener('online',  () => showToast('✅ Back online',       '#2e7d32'));
  window.addEventListener('offline', () => showToast('⚠️ You are offline',   '#e65100'));

})();