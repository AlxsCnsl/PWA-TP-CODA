// ===== CONFIGURATION =====
const CACHE_NAME = 'meteo-pwa-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.json',
    '/icons/icon-72.png',
    '/icons/icon-96.png',
    '/icons/icon-128.png',
    '/icons/icon-144.png',
    '/icons/icon-152.png',
    '/icons/icon-192.png',
    '/icons/icon-384.png',
    '/icons/icon-512.png'
];

// ===== INSTALL =====
self.addEventListener('install', (event) => {
    console.log('[SW] Installation...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Mise en cache des assets');
                return cache.addAll(ASSETS);
            })
            .then(() => {
                return self.skipWaiting();
            })
    );
});

// ===== ACTIVATE =====
self.addEventListener('activate', (event) => {
    console.log('[SW] Activation...');
    event.waitUntil(
        caches.keys()
            .then((keys) => {
                return Promise.all(
                    keys
                        .filter((key) => key !== CACHE_NAME)
                        .map((key) => {
                            console.log('[SW] Suppression ancien cache:', key);
                            return caches.delete(key);
                        })
                );
            })
            .then(() => {
                return self.clients.claim();
            })
    );
});

// ===== FETCH =====
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET') return;
    if (!url.protocol.startsWith('http')) return;

    if (isApiRequest(url)) {
        event.respondWith(networkOnly(request));
    } else {
        event.respondWith(cacheFirst(request));
    }
});

function isApiRequest(url) {
    return url.hostname.includes('open-meteo.com') ||
           url.hostname.includes('geocoding-api');
}

async function networkOnly(request) {
    try {
        const response = await fetch(request);
        return response;
    } catch (error) {
        console.log('[SW] Erreur réseau pour API:', error);
        return new Response(
            JSON.stringify({ error: 'Pas de connexion internet' }),
            {
                status: 503,
                statusText: 'Service Unavailable',
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}

async function cacheFirst(request) {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('[SW] Erreur réseau pour asset:', request.url);
        
        if (request.headers.get('accept')?.includes('text/html')) {
            const fallback = await caches.match('/index.html');
            if (fallback) return fallback;
        }
        
        return new Response('Contenu non disponible hors-ligne', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification cliquée:', event.notification.tag);
    
    // Fermer la notification
    event.notification.close();
    
    // Ouvrir ou focaliser l'application
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Si une fenêtre est déjà ouverte, la focaliser
                for (const client of clientList) {
                    if (client.url.includes(self.registration.scope) && 'focus' in client) {
                        return client.focus();
                    }
                }
                
                // Sinon, ouvrir une nouvelle fenêtre
                if (clients.openWindow) {
                    return clients.openWindow('/');
                }
            })
    );
});

self.addEventListener('notificationclose', (event) => {
    console.log('[SW] Notification fermée:', event.notification.tag);
});

// ===== Messages depuis l'application =====
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

console.log('[SW] Service Worker chargé');