const CACHE_NAME = 'gamas-cache-v1';
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
  'https://unpkg.com/lucide@latest',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  // Skip cross-origin requests, except for our known CDNs
  if (!event.request.url.startsWith(self.location.origin) && 
      !event.request.url.includes('unpkg.com') && 
      !event.request.url.includes('cdnjs.cloudflare') &&
      !event.request.url.includes('googleapis.com') &&
      !event.request.url.includes('jsdelivr.net')) {
    
    // For Supabase API calls (which are cross-origin), try network first, then cache
    if (event.request.url.includes('supabase.co')) {
      event.respondWith(
        fetch(event.request).catch(() => {
          console.warn('Offline: Supabase API call failed');
          return new Response(JSON.stringify({ error: 'Offline', message: 'You are currently offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        })
      );
      return;
    }
    
    return;
  }

  // Network First, Fallback to Cache Strategy for app files
  event.respondWith(
    fetch(event.request).then(response => {
      return caches.open(CACHE_NAME).then(cache => {
        cache.put(event.request, response.clone());
        return response;
      });
    }).catch(() => {
      return caches.match(event.request);
    })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
