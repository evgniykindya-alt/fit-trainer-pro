// sw.js — Service Worker с кэшированием (офлайн-режим) + уведомления
const CACHE_VERSION = 'ft-v1.5.0';
const CACHE_NAME = 'fit-trainer-' + CACHE_VERSION;
const PRECACHE_URLS = ['./', './index.html'];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // ИСПРАВЛЕНО: individual add вместо addAll.
            // Если один URL упадёт — остальные всё равно закэшируются,
            // и SW не останется с пустым кэшем.
            return Promise.all(
                PRECACHE_URLS.map((url) =>
                    cache.add(url).catch((e) => console.warn('[SW] precache skip', url, e))
                )
            );
        }).catch((e) => console.warn('[SW] precache failed', e))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    let url;
    try { url = new URL(req.url); } catch (e) { return; }
    if (url.origin !== location.origin) return;

    // Навигация / HTML — network-first, fallback кэш
    if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
        event.respondWith(
            fetch(req)
                .then((res) => {
                    // ИСПРАВЛЕНО: кэшируем только успешные ответы (2xx).
                    // Раньше 404/500 от сервера тоже попадали в кэш и потом
                    // показывались офлайн вместо приложения.
                    if (res && res.ok) {
                        const copy = res.clone();
                        caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
                    }
                    return res;
                })
                .catch(() => caches.match(req)
                    .then((cached) => cached
                        || caches.match('./index.html')
                        .then((r) => r || caches.match('./'))
                    )
                )
        );
        return;
    }

    // Всё остальное — cache-first
    event.respondWith(
        caches.match(req).then((cached) => {
            if (cached) return cached;
            return fetch(req).then((res) => {
                if (res && res.status === 200 && res.type === 'basic') {
                    const copy = res.clone();
                    caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
                }
                return res;
            }).catch(() => {
                // ИСПРАВЛЕНО: если офлайн и в кэше нет — возвращаем
                // пустой 504 вместо undefined (иначе respondWith крашится
                // и браузер показывает неинформативную "Failed to fetch").
                return new Response('', { status: 504, statusText: 'Offline' });
            });
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
            for (const client of list) {
                if ('focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow('./');
        })
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
