const CACHE_NAME = 'small-ai-cache-v2.5'; // Update version for new deployments
const API_CACHE_NAME = 'small-ai-api-cache-v3'; // Dedicated cache for API responses (not used for Gemini)

// List of essential app shell files to cache for offline use
const urlsToCache = [
    '/',
    '/index.html',
    '/manifest.json',
    '/logo.png', // Ensure this file exists in your root directory
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap',
    'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
    'https://cdn.jsdelivr.net/npm/lucide-dynamic@latest/dist/lucide.min.js',
    'https://unpkg.com/lucide@latest'
    // Add any other crucial static assets here
];

// Install event: Cache all app shell assets
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Caching app shell');
                // Use cache.addAll to ensure all assets are cached before finishing installation
                return cache.addAll(urlsToCache);
            })
            .catch((error) => {
                console.error('[Service Worker] Failed to cache during install:', error);
            })
    );
    self.skipWaiting(); // Force the waiting service worker to become the active service worker
});

// Activate event: Clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Delete old caches that don't match the current CACHE_NAME or API_CACHE_NAME
                    if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // Ensure the service worker takes control of clients immediately
            return self.clients.claim();
        })
    );
    console.log('[Service Worker] Activated');
});

// Fetch event: Intercept network requests
self.addEventListener('fetch', (event) => {
    // Only handle HTTP/HTTPS requests, ignore chrome-extension:// etc.
    if (!event.request.url.startsWith('http')) {
        return;
    }

    const requestUrl = new URL(event.request.url);

    // Strategy for Gemini API calls: Network-only (AI responses are dynamic and shouldn't be cached)
    // The Gemini API endpoint is: https://generativelanguage.googleapis.com
    if (requestUrl.hostname === 'generativelanguage.googleapis.com') {
        event.respondWith(
            fetch(event.request).catch((error) => {
                console.error('[Service Worker] Gemini API fetch failed:', error);
                // Even for API, provide a fallback for complete offline situations
                return new Response('AI services are unavailable offline. Please check your internet connection.', {
                    headers: { 'Content-Type': 'text/plain' }
                });
            })
        );
        return;
    }

    // Cache-first strategy for app shell assets and other static content
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // If asset is in cache, return it immediately
            if (cachedResponse) {
                return cachedResponse;
            }

            // Otherwise, fetch from the network
            return fetch(event.request).then((networkResponse) => {
                // Check if we received a valid response
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }

                // IMPORTANT: Clone the response. A response is a stream and
                // can only be consumed once. We are consuming it once to cache it
                // and once to return it to the browser.
                const responseToCache = networkResponse.clone();

                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });

                return networkResponse;
            }).catch(() => {
                // This catch handles network errors (e.g., completely offline)
                console.log('[Service Worker] Fetch failed for:', event.request.url);
                // Fallback for when both cache and network fail (e.g., request for an image not in cache while offline)
                // You could serve a specific offline page here if event.request.mode === 'navigate'
                if (event.request.mode === 'navigate') {
                    // For navigations, provide a simple offline page response
                    return new Response('<h1>You are offline!</h1><p>Please check your internet connection.</p>', {
                        headers: { 'Content-Type': 'text/html' }
                    });
                }
                // For other types of requests (e.g., images, scripts not in cache), return a generic error or a placeholder
                return new Response('You are offline.', {
                    headers: { 'Content-Type': 'text/plain' }
                });
            });
        })
    );
});