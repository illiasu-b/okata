// ============================================================
//  Okata Service Worker  —  sw.js
//  Cache-first for static assets, network-first for Firebase
// ============================================================

const CACHE_NAME   = 'okata-v1';
const OFFLINE_PAGE = '/offline.html';

// Files to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/shop.html',
  '/order.html',
  '/tracking.html',
  '/offline.html',
  '/manifest.json',
  '/style.css',
  '/search.css',
  '/testimonial.css',
  '/subscribe.css',
  '/promo.css',
  '/hero.css',
  '/darkmode.css',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
];

// ── INSTALL: pre-cache shell ──────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache what we can; don't fail install on missing files
      return Promise.allSettled(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(err => console.warn('Precache skipped:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: clean old caches ────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: strategy depends on request type ───────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET & browser-extension requests
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // Network-first for Firebase, Paystack, EmailJS, and API calls
  const networkFirst = [
    'firebaseapp.com',
    'firebasestorage.googleapis.com',
    'firestore.googleapis.com',
    'googleapis.com',
    'identitytoolkit.googleapis.com',
    'js.paystack.co',
    'emailjs.com',
    'api.emailjs.com',
  ];
  if (networkFirst.some(d => url.hostname.includes(d))) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Cache-first for everything else (HTML, CSS, JS, images, fonts)
  event.respondWith(cacheFirstStrategy(request));
});

// ── Strategies ────────────────────────────────────────────────

async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type !== 'opaque') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline fallback for navigation requests
    if (request.mode === 'navigate') {
      return caches.match(OFFLINE_PAGE);
    }
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirstStrategy(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Network error', { status: 503 });
  }
}

// ── PUSH NOTIFICATIONS (optional, ready when you add a backend) ──
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Okata', {
      body:  data.body  || 'You have a new notification',
      icon:  '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      data:  { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});