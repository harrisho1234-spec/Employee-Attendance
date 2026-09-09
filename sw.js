const CACHE_NAME = 'attendance-app-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Allow network-first for live Google Sheets and Firebase calls
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
