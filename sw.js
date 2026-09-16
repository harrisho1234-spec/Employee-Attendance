const CACHE_NAME = 'attendance-app-v6';

const APP_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];


/* ============================================================
   INSTALL
   ============================================================ */

self.addEventListener('install', event => {

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(APP_FILES);
      })
  );

  self.skipWaiting();
});


/* ============================================================
   ACTIVATE
   Remove old cache versions
   ============================================================ */

self.addEventListener('activate', event => {

  event.waitUntil(

    caches
      .keys()
      .then(cacheNames => {

        return Promise.all(

          cacheNames.map(cacheName => {

            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }

          })

        );

      })
      .then(() => self.clients.claim())

  );

});


/* ============================================================
   FETCH
   Only handle files from this GitHub Pages website.

   Google Sheets
   Firebase
   Apps Script
   CDN files

   are NOT intercepted by this service worker.
   ============================================================ */

self.addEventListener('fetch', event => {

  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }


  const requestUrl =
    new URL(request.url);


  /* External request — leave it alone */
  if (
    requestUrl.origin !==
    self.location.origin
  ) {
    return;
  }


  event.respondWith(

    fetch(request)

      .then(response => {

        /*
         * Store fresh same-origin response.
         */
        if (
          response &&
          response.status === 200
        ) {

          const copy =
            response.clone();

          caches
            .open(CACHE_NAME)
            .then(cache => {
              cache.put(
                request,
                copy
              );
            });

        }

        return response;

      })

      .catch(() => {

        /*
         * Offline fallback
         */
        return caches
          .match(request)
          .then(cachedResponse => {

            if (cachedResponse) {
              return cachedResponse;
            }


            /*
             * If navigation failed,
             * use index.html.
             */
            if (
              request.mode ===
              'navigate'
            ) {

              return caches.match(
                './index.html'
              );

            }

          });

      })

  );

});
