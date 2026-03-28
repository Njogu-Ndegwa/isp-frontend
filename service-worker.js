// ========================================
// BITWAVE SOKO PWA - Service Worker
// Handles caching for offline functionality
// ========================================

const CACHE_NAME = 'bitwave-soko-pwa-v3';
const OFFLINE_URL = '/index.html';

// Assets to cache for offline use
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/pwa.html',
    '/pwa.css',
    '/pwa.js',
    '/styles003.css',
    '/script.js',
    '/script003.js',
    '/ads.js',
    '/manifest.json',
    '/icons/icon.svg',
    // Images
    '/images/tomatoes.jpg',
    '/images/phone-cases.jpg',
    '/images/sukuma-wiki.jpg',
    '/images/watches.jpg',
    '/images/bananas.jpg',
    '/images/tomatoes-thumb.jpg',
    // Fonts from Google Fonts (will be cached on first load)
];

// Install event - cache assets
self.addEventListener('install', (event) => {
    console.log('[ServiceWorker] Installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[ServiceWorker] Caching app shell');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => {
                console.log('[ServiceWorker] Install complete');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[ServiceWorker] Install failed:', error);
            })
    );
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
    console.log('[ServiceWorker] Activating...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => {
                            console.log('[ServiceWorker] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[ServiceWorker] Claiming clients');
                return self.clients.claim();
            })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Skip API requests (don't cache dynamic data)
    if (url.pathname.includes('/api/')) {
        event.respondWith(
            fetch(request)
                .catch(() => {
                    // Return a simple offline response for API calls
                    return new Response(
                        JSON.stringify({ error: 'Offline', message: 'You are currently offline' }),
                        { 
                            status: 503,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                })
        );
        return;
    }
    
    // For navigation requests, try network first then cache
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // Cache the new version
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    return caches.match(request)
                        .then((cachedResponse) => {
                            return cachedResponse || caches.match(OFFLINE_URL);
                        });
                })
        );
        return;
    }
    
    // For other requests (assets), try cache first then network
    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // Return cached version, but update cache in background
                    event.waitUntil(
                        fetch(request)
                            .then((networkResponse) => {
                                caches.open(CACHE_NAME).then((cache) => {
                                    cache.put(request, networkResponse);
                                });
                            })
                            .catch(() => {})
                    );
                    return cachedResponse;
                }
                
                // Not in cache, fetch from network
                return fetch(request)
                    .then((response) => {
                        // Don't cache non-successful responses
                        if (!response || response.status !== 200) {
                            return response;
                        }
                        
                        // Cache the response
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseClone);
                        });
                        
                        return response;
                    });
            })
    );
});

// Handle background sync for speed test results
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-speed-tests') {
        console.log('[ServiceWorker] Syncing speed test results');
        event.waitUntil(syncSpeedTests());
    }
});

async function syncSpeedTests() {
    try {
        // Get pending speed tests from IndexedDB
        const pendingTests = await getPendingSpeedTests();
        
        for (const test of pendingTests) {
            try {
                const response = await fetch('https://isp.bitwavetechnologies.com/api/speed-tests', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(test)
                });
                
                if (response.ok) {
                    await removePendingSpeedTest(test.id);
                    console.log('[ServiceWorker] Speed test synced:', test.id);
                }
            } catch (error) {
                console.error('[ServiceWorker] Failed to sync test:', test.id, error);
            }
        }
    } catch (error) {
        console.error('[ServiceWorker] Sync failed:', error);
    }
}

// Placeholder functions for IndexedDB operations
// These will be implemented in the main app
async function getPendingSpeedTests() {
    return [];
}

async function removePendingSpeedTest(id) {
    return;
}

// Push notification support (for future use)
self.addEventListener('push', (event) => {
    if (!event.data) return;
    
    const data = event.data.json();
    const options = {
        body: data.body || 'New notification from Bitwave Soko',
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
        vibrate: [100, 50, 100],
        data: {
            url: data.url || '/pwa.html'
        }
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title || 'Bitwave Soko', options)
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    event.waitUntil(
        clients.matchAll({ type: 'window' })
            .then((clientList) => {
                // Check if app is already open
                for (const client of clientList) {
                    if (client.url.includes('/pwa.html') && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Open new window
                if (clients.openWindow) {
                    return clients.openWindow(event.notification.data.url || '/pwa.html');
                }
            })
    );
});

console.log('[ServiceWorker] Script loaded');

