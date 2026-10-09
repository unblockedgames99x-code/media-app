import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../static/pwabuilder-sw.js', import.meta.url), 'utf8')
const scope = 'https://cartertube.test/apps/cartertube/'
const response = (body = 'asset', type = 'application/javascript', headers = {}) => new Response(body, {
  headers: { 'Content-Type': type, ...headers },
})
const request = (path, overrides = {}) => ({
  url: new URL(path, scope).href,
  method: 'GET',
  mode: 'cors',
  cache: 'default',
  destination: '',
  headers: new Headers(),
  ...overrides,
})

function harness () {
  const handlers = new Map()
  const stores = new Map()
  const precached = []
  const timers = new Map()
  let timerId = 0
  let fetchImpl = async item => response('shell', new URL(item.url || item).pathname.endsWith('index.html') ? 'text/html' : 'application/json')
  let skipped = false
  let claimed = false
  const key = item => typeof item === 'string' ? item : item.url
  const cacheStorage = {
    async keys () { return [...stores.keys()] },
    async delete (name) { return stores.delete(name) },
    async open (name) {
      if (!stores.has(name)) stores.set(name, new Map())
      const entries = stores.get(name)
      return {
        async match (item) { return entries.get(key(item))?.clone() },
        async put (item, value) { entries.set(key(item), value.clone()) },
        async delete (item) { return entries.delete(key(item)) },
        async keys () { return [...entries.keys()].map(url => ({ url })) },
        async addAll (items) {
          precached.push(...items)
          for (const item of items) {
            const value = await fetchImpl(item)
            if (!value.ok) throw new Error('precache failed')
            entries.set(item, value.clone())
          }
        },
      }
    },
  }
  const context = vm.createContext({
    URL,
    Response,
    setTimeout: callback => { timers.set(++timerId, callback); return timerId },
    clearTimeout: id => timers.delete(id),
    caches: cacheStorage,
    fetch: item => fetchImpl(item),
    self: {
      registration: { scope },
      addEventListener: (name, handler) => handlers.set(name, handler),
      skipWaiting: async () => { skipped = true },
      clients: { claim: async () => { claimed = true } },
    },
  })
  vm.runInContext(source, context)
  function dispatch (name, item) {
    const pending = []
    let responsePromise
    handlers.get(name)({
      request: item,
      waitUntil: value => pending.push(value),
      respondWith: value => { responsePromise = value },
    })
    return { response: responsePromise, done: () => Promise.all(pending) }
  }
  return {
    context,
    stores,
    cacheStorage,
    precached,
    expireTimers: () => { for (const callback of timers.values()) callback() },
    dispatch,
    fetch: implementation => { fetchImpl = implementation },
    value: expression => vm.runInContext(expression, context),
    skipped: () => skipped,
    claimed: () => claimed,
  }
}

test('installation precaches concrete relative app URLs without nonexistent CSS or wildcards', async () => {
  const sw = harness()
  await sw.dispatch('install').done()
  assert.deepEqual(sw.precached, [`${scope}index.html`, `${scope}static/manifest.json`])
  assert.equal(sw.skipped(), true)
})

test('cache policy accepts build assets and excludes APIs, media, cross-origin, partial and authorized traffic', () => {
  const sw = harness()
  const accepts = item => sw.context.isCacheableRequest(item)
  for (const path of ['web.js', '870.js', 'web.abc123.css', 'imgs/cartertube-mark.svg', 'fonts/Outfit.woff2', 'static/locales/en-US.json']) {
    assert.equal(accepts(request(path)), true, path)
  }
  for (const path of ['https://i.ytimg.com/vi/example/hqdefault.jpg', 'api/v1/videos/example', 'videoplayback', 'watch.mp4', 'stream.mpd', 'static/private.json', 'web.js?token=private', '/other/web.js']) {
    assert.equal(accepts(request(path)), false, path)
  }
  assert.equal(accepts(request('web.js', { headers: new Headers({ Range: 'bytes=0-1024' }) })), false)
  assert.equal(accepts(request('web.js', { headers: new Headers({ Authorization: 'Bearer secret' }) })), false)
  assert.equal(accepts(request('web.js', { destination: 'video' })), false)
  assert.equal(accepts(request('web.js', { cache: 'no-store' })), false)
  assert.equal(accepts(request('web.js', { method: 'POST' })), false)
  assert.equal(accepts(request('index.html', { mode: 'navigate' })), true)
  assert.equal(accepts(request('account', { mode: 'navigate' })), false)
})

test('excluded traffic is left to the browser without a service-worker fetch or cache lookup', () => {
  const sw = harness()
  let fetches = 0
  sw.fetch(async () => { fetches++; return response() })
  assert.equal(sw.dispatch('fetch', request('https://video.test/videoplayback')).response, undefined)
  assert.equal(sw.dispatch('fetch', request('api/v1/recommendations')).response, undefined)
  assert.equal(fetches, 0)
  assert.equal(sw.stores.size, 0)
})

test('private, partial, failed, opaque and HTML-disguised asset responses never enter the cache', async () => {
  const sw = harness()
  const asset = request('web.js')
  const denied = [
    response('private', 'application/javascript', { 'Cache-Control': 'private' }),
    response('private', 'application/javascript', { 'Cache-Control': 'no-store' }),
    response('partial', 'application/javascript', { 'Content-Range': 'bytes 0-1/2' }),
    response('vary', 'application/javascript', { Vary: '*' }),
    response('login', 'text/html'),
    new Response('missing', { status: 404 }),
    new Response('partial', { status: 206 }),
    { status: 200, type: 'opaque', headers: new Headers() },
  ]
  for (const item of denied) {
    assert.equal(sw.context.isCacheableResponse(asset, item), false)
    await sw.context.updateCache(asset, item)
  }
  assert.equal(sw.stores.size, 0)
})

test('concurrent asset writes stay bounded and preserve the offline app shell', async () => {
  const sw = harness()
  await sw.dispatch('install').done()
  await Promise.all(Array.from({ length: 120 }, (_, index) => sw.context.updateCache(request(`${index}.js`), response(String(index)))))
  const cache = await sw.cacheStorage.open(sw.value('CACHE'))
  assert.equal((await cache.keys()).length, sw.value('MAX_CACHE_ENTRIES'))
  assert.ok(await cache.match(`${scope}index.html`))
  assert.ok(await cache.match(`${scope}static/manifest.json`))
  assert.equal(await cache.match(`${scope}0.js`), undefined)
  assert.ok(await cache.match(`${scope}119.js`))
})

test('offline navigation returns the cached shell or a real 503 HTML response', async () => {
  const sw = harness()
  await sw.dispatch('install').done()
  sw.fetch(async () => { throw new Error('offline') })
  const cached = await sw.dispatch('fetch', request('', { mode: 'navigate' })).response
  assert.equal(cached.status, 200)
  assert.equal(await cached.text(), 'shell')
  const empty = harness()
  empty.fetch(async () => { throw new Error('offline') })
  const fallback = await empty.dispatch('fetch', request('', { mode: 'navigate' })).response
  assert.equal(fallback.status, 503)
  assert.match(fallback.headers.get('Content-Type'), /text\/html/)
  assert.match(await fallback.text(), /CarterTube is offline/)
})

test('uncached offline assets return Response.error rather than undefined or app HTML', async () => {
  const sw = harness()
  sw.fetch(async () => { throw new Error('offline') })
  const event = sw.dispatch('fetch', request('web.js'))
  const result = await event.response
  await event.done()
  assert.equal(result.type, 'error')
  assert.equal(result.status, 0)
})

test('cached styles render immediately while a tracked background fetch updates them', async () => {
  const sw = harness()
  const asset = request('web.abc123.css')
  await sw.context.updateCache(asset, response('old'))
  let finishFetch
  sw.fetch(() => new Promise(resolve => { finishFetch = resolve }))
  const event = sw.dispatch('fetch', asset)
  assert.equal(await (await event.response).text(), 'old')
  finishFetch(response('new'))
  await event.done()
  const cache = await sw.cacheStorage.open(sw.value('CACHE'))
  assert.equal(await (await cache.match(asset)).text(), 'new')
})

test('mutable script filenames prefer the network to avoid incompatible stale chunks', async () => {
  const sw = harness()
  const asset = request('870.js')
  await sw.context.updateCache(asset, response('old chunk'))
  sw.fetch(async () => response('new chunk'))
  const event = sw.dispatch('fetch', asset)
  assert.equal(await (await event.response).text(), 'new chunk')
  await event.done()
})

test('a stalled script request falls back promptly to cache and still refreshes when the network returns', async () => {
  const sw = harness()
  const asset = request('web.js')
  await sw.context.updateCache(asset, response('cached script'))
  let finishFetch
  sw.fetch(() => new Promise(resolve => { finishFetch = resolve }))
  const event = sw.dispatch('fetch', asset)
  await new Promise(resolve => setImmediate(resolve))
  sw.expireTimers()
  assert.equal(await (await event.response).text(), 'cached script')
  finishFetch(response('fresh script'))
  await event.done()
  const cache = await sw.cacheStorage.open(sw.value('CACHE'))
  assert.equal(await (await cache.match(asset)).text(), 'fresh script')
})

test('activation removes only old CarterTube versions in this scope and the broken legacy cache', async () => {
  const sw = harness()
  const current = sw.value('CACHE')
  const old = `${sw.value('CACHE_PREFIX')}v0`
  const anotherScope = 'cartertube-static-%2Fanother%2F-v1'
  for (const name of [current, old, anotherScope, 'pwabuilder-adv-cache', 'unrelated-app']) {
    await sw.cacheStorage.open(name)
  }
  await sw.dispatch('activate').done()
  assert.deepEqual((await sw.cacheStorage.keys()).sort(), [current, anotherScope, 'unrelated-app'].sort())
  assert.equal(sw.claimed(), true)
})

test('web manifest uses valid relative CarterTube metadata and an existing square SVG icon', () => {
  const manifest = JSON.parse(readFileSync(new URL('../static/manifest.json', import.meta.url), 'utf8'))
  const manifestUrl = `${scope}static/manifest.json`
  assert.equal(manifest.name, 'CarterTube')
  assert.equal(new URL(manifest.scope, manifestUrl).href, scope)
  assert.equal(new URL(manifest.start_url, manifestUrl).href, `${scope}#/home`)
  assert.equal(new URL(manifest.icons[0].src, manifestUrl).href, `${scope}imgs/cartertube-mark.svg`)
  assert.equal(manifest.icons[0].type, 'image/svg+xml')
  assert.match(readFileSync(new URL('../src/renderer/assets/img/cartertube-mark.svg', import.meta.url), 'utf8'), /viewBox="0 0 128 128"/)
})
