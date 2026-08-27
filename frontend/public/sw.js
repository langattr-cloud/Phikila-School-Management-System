/**
 * Phikila service worker.
 *
 * Strategy:
 *  - App shell (HTML): network-first, so a deploy is picked up immediately,
 *    falling back to the cached shell when offline.
 *  - Hashed build assets: cache-first, since their URL changes on every build.
 *  - Timetable GET APIs: network-first with a cache fallback, so the schedule
 *    stays readable offline.
 *  - Everything else (writes, solver jobs): never cached.
 */

// Bump this whenever the API/client contract changes so browsers discard stale shell/assets.
const VERSION = 'v4'
const SHELL_CACHE = `phikila-shell-${VERSION}`
const ASSET_CACHE = `phikila-assets-${VERSION}`
const DATA_CACHE = `phikila-data-${VERSION}`

const SHELL_URLS = ['/', '/index.html', '/favicon.svg', '/site.webmanifest']

const CACHEABLE_API = [
  '/api/v1/scheduling/timetable/view',
  '/api/v1/scheduling/calendar',
  '/api/v1/scheduling/classes',
  '/api/v1/scheduling/teachers',
  '/api/v1/scheduling/subjects',
  '/api/v1/scheduling/rooms',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, ASSET_CACHE, DATA_CACHE])
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

function isAsset(url) {
  return url.pathname.startsWith('/assets/') || url.pathname.startsWith('/brand/')
}

function isCacheableApi(url) {
  return CACHEABLE_API.some((path) => url.pathname.startsWith(path))
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  // Writes are never intercepted or cached.
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (isAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            const copy = response.clone()
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy))
            return response
          }),
      ),
    )
    return
  }

  if (isCacheableApi(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(DATA_CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() =>
          caches.match(request).then(
            (hit) =>
              hit ||
              new Response(JSON.stringify({ detail: 'You are offline and this is not cached.' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              }),
          ),
        ),
    )
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy))
          return response
        })
        .catch(() => caches.match('/index.html').then((hit) => hit || caches.match('/'))),
    )
  }
})

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})
