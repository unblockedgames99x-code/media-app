// Cache the app shell and static resources only. Video and API traffic always
// goes directly to the network, including partial media and authorized requests.
const scopeUrl = new URL(self.registration.scope)
const CACHE_PREFIX = `cartertube-static-${encodeURIComponent(scopeUrl.pathname)}-`
const CACHE = `${CACHE_PREFIX}v1`
const MAX_CACHE_ENTRIES = 96
const MAX_SCRIPT_WAIT_MS = 2500
const shellUrl = new URL('index.html', scopeUrl).href
const manifestUrl = new URL('static/manifest.json', scopeUrl).href
const precacheFiles = [shellUrl, manifestUrl]
let cacheWrites = Promise.resolve()

function isCacheableRequest(request) {
  if (request.method !== 'GET' || request.cache === 'no-store' ||
    request.headers.has('range') || request.headers.has('authorization') ||
    request.destination === 'audio' || request.destination === 'video') return false

  const url = new URL(request.url)
  if (url.origin !== scopeUrl.origin || !url.pathname.startsWith(scopeUrl.pathname) || url.search) return false
  const path = url.pathname.slice(scopeUrl.pathname.length)
  if (request.mode === 'navigate') return path === '' || path === 'index.html'

  // These are build outputs, not arbitrary same-origin JSON, media, or API URLs.
  return /^[\w.-]+\.(?:js|css)$/.test(path) ||
    /^(?:imgs|fonts)\/[\w./-]+\.(?:png|jpe?g|gif|webp|svg|woff2?|ttf|otf|eot)$/.test(path) ||
    /^static\/(?:locales|shaka-player-locales|geolocations)\/[\w.-]+\.json$/.test(path) ||
    /^static\/(?:manifest|external-player-map|invidious-instances)\.json$/.test(path)
}

function isCacheableResponse(request, response) {
  if (!response || response.status !== 200 || response.type === 'opaque' || response.type === 'opaqueredirect' ||
    response.headers.has('content-range') || response.headers.get('vary') === '*' ||
    /(?:no-store|private)/i.test(response.headers.get('cache-control') || '')) return false
  if (response.url && new URL(response.url).origin !== scopeUrl.origin) return false
  const contentType = response.headers.get('content-type') || ''
  return request.mode === 'navigate'
    ? contentType.includes('text/html')
    : /(?:javascript|css|json|image\/|font\/|application\/(?:font|vnd.ms-fontobject|octet-stream))/.test(contentType)
}

function updateCache(request, response) {
  if (!isCacheableResponse(request, response)) return Promise.resolve()
  const key = request.mode === 'navigate' ? shellUrl : request
  const copy = response.clone()
  // Serialize writes and eviction so concurrent chunk downloads cannot grow the
  // cache beyond the limit. A full or unavailable cache must not break the app.
  cacheWrites = cacheWrites.then(async () => {
    const cache = await caches.open(CACHE)
    await cache.delete(key)
    await cache.put(key, copy)
    const keys = await cache.keys()
    let excess = keys.length - MAX_CACHE_ENTRIES
    for (const entry of keys) {
      if (excess <= 0) break
      if (precacheFiles.includes(entry.url)) continue
      await cache.delete(entry)
      excess--
    }
  }).catch(() => {})
  return cacheWrites
}

function offlineNavigationResponse() {
  return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CarterTube is offline</title><body><h1>CarterTube is offline</h1><p>Connect to the internet and reload to open your video library.</p></body></html>', {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    // Only concrete URLs: stylesheets and lazy chunks are cached as requested.
    await cache.addAll(precacheFiles)
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter(name => (name.startsWith(CACHE_PREFIX) && name !== CACHE) ||
      name === 'pwabuilder-adv-cache').map(name => caches.delete(name)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (!isCacheableRequest(request)) return
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        if (response.ok) {
          await updateCache(request, response)
          return response
        }
        const cache = await caches.open(CACHE)
        return await cache.match(shellUrl) || response
      } catch {
        try {
          const cache = await caches.open(CACHE)
          return await cache.match(shellUrl) || offlineNavigationResponse()
        } catch {
          return offlineNavigationResponse()
        }
      }
    })())
    return
  }

  // Revalidate in the background, and prefer fresh scripts because the build's
  // numeric chunk filenames can change contents between releases. Register the
  // lifetime promise synchronously so rejected fetches never go unhandled.
  const network = fetch(request).then(async response => {
    await updateCache(request, response)
    return response
  }).catch(() => null)
  event.waitUntil(network.then(() => {}))
  event.respondWith((async () => {
    try {
      const cache = await caches.open(CACHE)
      const cached = await cache.match(request)
      if (cached) {
        if (!new URL(request.url).pathname.endsWith('.js')) return cached
        let timeout
        try {
          const fresh = await Promise.race([
            network,
            new Promise(resolve => { timeout = setTimeout(() => resolve(null), MAX_SCRIPT_WAIT_MS) }),
          ])
          return fresh?.ok ? fresh : cached
        } finally {
          clearTimeout(timeout)
        }
      }
    } catch {}
    return await network || Response.error()
  })())
})
