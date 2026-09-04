// Сервис-воркер — оболочка приложения (не трогает /api/*: свежесть данных
// важнее оффлайн-доступа, полноценное офлайн-прохождение — отдельная задача
// этапа 8). Навигации — network-first с фолбэком на закэшированную оболочку;
// статика (JS/CSS/иконки) — stale-while-revalidate.

const CACHE = 'lexicon-shell-v1'
const SHELL_URL = '/'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return // никогда не кэшируем API-ответы

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          caches.open(CACHE).then((c) => c.put(SHELL_URL, res.clone()))
          return res
        })
        .catch(() => caches.match(SHELL_URL).then((r) => r || caches.match(request))),
    )
    return
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request)
      const fresh = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(request, res.clone())
          return res
        })
        .catch(() => cached)
      return cached || fresh
    }),
  )
})
