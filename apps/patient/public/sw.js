const CACHE_NAME = 'medassist-v1'
const API_CACHE = 'medassist-api-v1'

const STATIC_ASSETS = [
  '/',
  '/patient/dashboard',
  '/doctor/dashboard',
  '/frontdesk/dashboard'
]

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker')
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets')
      return cache.addAll(STATIC_ASSETS).catch((error) => {
        console.warn('[SW] Error caching static assets:', error)
      })
    })
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker')
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== API_CACHE) {
            console.log('[SW] Deleting old cache:', key)
            return caches.delete(key)
          }
        })
      )
    })
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return
  }

  // API calls: network-first strategy
  if (url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const cloned = response.clone()
            caches.open(API_CACHE).then((cache) => {
              cache.put(request, cloned)
            })
          }
          return response
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) {
              return cached
            }
            return new Response('Offline - No cached data available', {
              status: 503,
              statusText: 'Service Unavailable'
            })
          })
        })
    )
    return
  }

  // Static assets: cache-first strategy
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached
      }
      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === 'error') {
            return response
          }
          const cloned = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, cloned)
          })
          return response
        })
        .catch(() => {
          return new Response('Offline - Resource not cached', {
            status: 503,
            statusText: 'Service Unavailable'
          })
        })
    })
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
