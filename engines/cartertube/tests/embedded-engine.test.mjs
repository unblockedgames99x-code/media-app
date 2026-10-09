import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createEmbeddedServer, nativeHandleString, readEmbeddedConfig, watchParent, quitEmbeddedForRestart, toggleWindowFullscreen, createVisibilityController, createWorkspaceController } from '../src/main/embedded.mjs'
import { sanitizeThemeVariables, sanitizeNavigationPath, sanitizeAppearance, navigationStatus, navigationVisibility } from '../src/shared/embedded.mjs'

const token = 'test-cartermedia-control-token'

async function controlServer (t, overrides = {}) {
  const calls = []
  const server = await createEmbeddedServer({ token }, {
    status: async () => ({ paused: false, fullscreen: false }),
    pause: async () => { calls.push('pause'); return { paused: true } },
    theme: async variables => { calls.push(variables); return { applied: true } },
    appearance: async appearance => { calls.push(appearance); return { applied: true } },
    navigate: async destination => { calls.push(destination); return { navigated: true } },
    visibility: async (visible, revision) => { calls.push({ visible, revision }); return { visible, revision } },
    shutdown: () => calls.push('shutdown'),
    ...overrides
  })
  t.after(() => server.close())
  const request = (route, options = {}) => fetch(`http://127.0.0.1:${server.port}${route}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers }
  })
  return { request, calls }
}

test('embedded configuration requires an isolated absolute profile, parent and secret', () => {
  assert.equal(readEmbeddedConfig({}, []), null)
  const env = {
    CARTERMEDIA_EMBEDDED: '1',
    CARTERMEDIA_HANDSHAKE_FILE: path.resolve('handshake.json'),
    CARTERMEDIA_CONTROL_TOKEN: token,
    CARTERMEDIA_PARENT_PID: '1234'
  }
  const directory = path.resolve('video-profile')
  assert.deepEqual(readEmbeddedConfig(env, [`--user-data-dir=${directory}`]), {
    handshakeFile: env.CARTERMEDIA_HANDSHAKE_FILE, token, parentPid: 1234, userDataDirectory: directory
  })
  assert.equal(readEmbeddedConfig(env, ['--user-data-dir', directory]).userDataDirectory, directory)
  assert.throws(() => readEmbeddedConfig(env, []))
  assert.throws(() => readEmbeddedConfig({ ...env, CARTERMEDIA_PARENT_PID: 'NaN' }, [`--user-data-dir=${directory}`]))
  assert.throws(() => readEmbeddedConfig({ ...env, CARTERMEDIA_CONTROL_TOKEN: 'short' }, [`--user-data-dir=${directory}`]))
})

test('native HWND serialization preserves all 64 bits', () => {
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64LE(0xfedcba9876543210n)
  assert.equal(nativeHandleString(buffer), '18364758544493064720')
  assert.equal(nativeHandleString(Buffer.from([0x78, 0x56, 0x34, 0x12])), '305419896')
  assert.throws(() => nativeHandleString(Buffer.alloc(3)))
})

test('theme values accept Nuclear tokens and reject CSS resource injection', () => {
  const variables = { '--background': 'oklch(0.22 0.03 20)', '--font-family': "'DM Sans', system-ui", '--radius-md': '8px', '--popover': '#222', '--input': '#111', '--popover-foreground': '#fff', '--input-foreground': '#fff' }
  assert.deepEqual(sanitizeThemeVariables(variables), variables)
  for (const invalid of [[], null, { '--background': 'url(https://invalid.test)' },
    { '--background': 'red; display:none' }, { '--unknown': 'red' }, { '--primary': 3 }]) {
    assert.throws(() => sanitizeThemeVariables(invalid))
  }
})

test('managed video themes keep surface and text pairs for distinct sidebar and top bar colors', () => {
  const variables = {
    '--muted': '#ffffff', '--muted-foreground': '#000000',
    '--topbar': '#f8f8f8', '--topbar-foreground': '#161616',
    '--sidebar-left': '#225a80', '--sidebar-left-foreground': '#ffffff',
    '--primary': '#ffb065', '--primary-foreground': '#161616',
    '--shadow-x': '0px', '--shadow-y': '7px', '--artwork-radius': '50%'
  }
  assert.deepEqual(sanitizeThemeVariables(variables), variables)
  assert.throws(() => sanitizeThemeVariables({ '--sidebar-left': 'url(https://invalid.test)' }))
})

test('navigation allowlist preserves video settings while rejecting external destinations', () => {
  for (const route of ['/home', '/popular', '/settings/profile', '/history', '/watch/dQw4w9WgXcQ']) {
    assert.equal(sanitizeNavigationPath(route), route)
  }
  for (const route of ['https://invalid.test', '//invalid.test', '/home?redirect=https://invalid.test', '/unknown', '/watch/invalid', '/watch/dQw4w9WgXcQ?redirect=https://invalid.test', '/watch/dQw4w9WgXcQ/extra', '/watch/../../settings']) {
    assert.throws(() => sanitizeNavigationPath(route))
  }
})

test('navigation status preserves real routes and exact hidden preferences across video pages', () => {
  assert.deepEqual(navigationStatus('#/settings/profile/?tab=blocked', JSON.stringify({ trending: true, popular: false, playlists: true })), {
    path: '/settings/profile', hiddenNavigation: { trending: true, popular: false, playlists: true }
  })
  assert.equal(navigationStatus('#/watch/abc?t=30', '{}').path, '/watch/abc')
  assert.equal(navigationStatus('#/settings#privacy', '{}').path, '/settings')
  assert.deepEqual(navigationStatus('#/history', '{"trending":"true","popular":1,"unknown":true}'), {
    path: '/history', hiddenNavigation: { trending: false, popular: false, playlists: false }
  })
  assert.deepEqual(navigationStatus('#/home', 'malformed'), {
    path: '/home', hiddenNavigation: { trending: false, popular: false, playlists: false }
  })
  assert.equal(navigationStatus('#https://untrusted.test', '{}').path, '/home')
})

test('navigation visibility matches original backend availability and distraction preferences', () => {
  const base = { supportsLocalApi: true, backendPreference: 'local', backendFallback: false, hideTrending: false, hidePopular: false, hidePlaylists: false }
  assert.deepEqual(navigationVisibility(base), { trending: false, popular: true, playlists: false })
  assert.deepEqual(navigationVisibility({ ...base, backendPreference: 'invidious' }), { trending: true, popular: false, playlists: false })
  assert.deepEqual(navigationVisibility({ ...base, backendFallback: true }), { trending: false, popular: false, playlists: false })
  assert.deepEqual(navigationVisibility({ ...base, backendFallback: true, supportsLocalApi: false }), { trending: true, popular: false, playlists: false })
  assert.deepEqual(navigationVisibility({ ...base, backendFallback: true, hideTrending: true, hidePopular: true, hidePlaylists: true }), { trending: true, popular: true, playlists: true })
})

test('control rejects missing or incorrect auth and browser-origin requests', async t => {
  const { request, calls } = await controlServer(t)
  for (const headers of [{ Authorization: '' }, { Authorization: 'Bearer incorrect' }, { Origin: 'https://invalid.test' }]) {
    const response = await request('/pause', { method: 'POST', headers })
    assert.equal(response.status, 401)
    await response.json()
  }
  assert.deepEqual(calls, [])
})

test('authenticated status and pause report actual engine action results', async t => {
  const { request, calls } = await controlServer(t)
  const status = await request('/status')
  assert.equal(status.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await status.json(), { paused: false, fullscreen: false })
  const pause = await request('/pause', { method: 'POST' })
  assert.deepEqual(await pause.json(), { paused: true })
  assert.deepEqual(calls, ['pause'])
})

test('theme and navigation requests validate payloads before touching renderer', async t => {
  const { request, calls } = await controlServer(t)
  const variables = { '--primary': '#ff785c' }
  for (const [route, body] of [['/theme', { variables }], ['/navigate', { path: '/settings' }]]) {
    const response = await request(route, { method: 'POST', body: JSON.stringify(body) })
    assert.equal(response.status, 200)
    await response.json()
  }
  assert.deepEqual(calls, [variables, '/settings'])
  for (const [route, body] of [['/theme', '{'], ['/navigate', '{"path":"https://invalid.test"}']]) {
    const response = await request(route, { method: 'POST', body })
    assert.equal(response.status, 400)
    await response.json()
  }
  assert.equal(calls.length, 2)
})

test('unknown commands, incorrect methods and oversized payloads fail safely', async t => {
  const { request, calls } = await controlServer(t)
  for (const [route, options, expected] of [
    ['/execute', { method: 'POST' }, 404], ['/pause', {}, 405],
    ['/theme', { method: 'POST', body: 'x'.repeat(17000) }, 413]
  ]) {
    const response = await request(route, options)
    assert.equal(response.status, expected)
    await response.json()
  }
  assert.deepEqual(calls, [])
})

test('unavailable renderer fails closed with a bounded error response', async t => {
  const { request } = await controlServer(t, { status: async () => { throw new Error('renderer exited') } })
  const response = await request('/status')
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: 'Video engine is not ready' })
})

test('shutdown acknowledges before ending the engine', async t => {
  const { request, calls } = await controlServer(t)
  const response = await request('/shutdown', { method: 'POST' })
  assert.deepEqual(await response.json(), { stopping: true })
  await delay(40)
  assert.deepEqual(calls, ['shutdown'])
})

test('parent watchdog exits once on missing parent and tolerates permission errors', async () => {
  let attempts = 0
  let shutdowns = 0
  const stop = watchParent(1234, () => { shutdowns++ }, 5, () => {
    attempts++
    throw Object.assign(new Error('probe'), { code: attempts === 1 ? 'EPERM' : 'ESRCH' })
  })
  await delay(40)
  stop()
  assert.equal(attempts, 2)
  assert.equal(shutdowns, 1)
})

test('embedded settings restart quits normally without spawning an unsupervised engine', () => {
  const calls = []
  const application = {
    quit: () => calls.push('quit'),
    exit: () => calls.push('exit'),
    relaunch: () => calls.push('relaunch')
  }
  assert.equal(quitEmbeddedForRestart({ parentPid: 1234 }, application), true)
  assert.deepEqual(calls, ['quit'])
  assert.equal(quitEmbeddedForRestart(null, application), false)
  assert.deepEqual(calls, ['quit'])
})

test('embedded primary fullscreen targets only a trusted renderer and retains its native parent', () => {
  const sent = []
  const nativeTransitions = []
  let url = 'app://bundle/index.html#/watch/abc'
  const window = {
    id: 10,
    isDestroyed: () => false,
    isFullScreen: () => false,
    setFullScreen: value => nativeTransitions.push(value),
    webContents: { getURL: () => url, send: (...args) => sent.push(args) }
  }
  const trusted = address => address.startsWith('app://bundle/index.html')
  toggleWindowFullscreen(window, 10, trusted)
  assert.equal(sent.length, 1)
  assert.equal(sent[0][0], 'cartermedia:command')
  assert.equal(sent[0][1].command, 'toggleFullscreen')
  assert.equal(typeof sent[0][1].id, 'string')
  assert.deepEqual(nativeTransitions, [])
  url = 'https://untrusted.test'
  toggleWindowFullscreen(window, 10, trusted)
  assert.equal(sent.length, 1)
})

test('extra video windows and standalone mode retain native fullscreen toggling', () => {
  const nativeTransitions = []
  let fullscreen = false
  const window = {
    id: 20,
    isDestroyed: () => false,
    isFullScreen: () => fullscreen,
    setFullScreen: value => { nativeTransitions.push(value); fullscreen = value }
  }
  toggleWindowFullscreen(window, 10, () => false)
  toggleWindowFullscreen(window, null, () => false)
  assert.deepEqual(nativeTransitions, [true, false])
  toggleWindowFullscreen(null, 10, () => true)
  toggleWindowFullscreen({ ...window, isDestroyed: () => true }, 10, () => true)
  assert.deepEqual(nativeTransitions, [true, false])
})

test('visibility updates Electron lifecycle after attachment and hides before awaiting media pause', async () => {
  const calls = []
  let visible = false
  let completePause
  const window = {
    isDestroyed: () => false,
    isVisible: () => visible,
    showInactive: () => { visible = true; calls.push('showInactive') },
    hide: () => { visible = false; calls.push('hide') }
  }
  const controller = createVisibilityController(window, () => new Promise(resolve => { completePause = resolve; calls.push('pause') }))
  assert.deepEqual(await controller(true, 1), { visible: true, revision: 1 })
  const hiding = controller(false, 2)
  assert.equal(visible, false)
  assert.deepEqual(calls, ['showInactive', 'hide', 'pause'])
  completePause()
  assert.deepEqual(await hiding, { visible: false, revision: 2 })
})

test('stale visibility requests cannot undo a newer hide or show across request races', async () => {
  const calls = []
  let visible = false
  const window = {
    isDestroyed: () => false,
    isVisible: () => visible,
    showInactive: () => { visible = true; calls.push('show') },
    hide: () => { visible = false; calls.push('hide') }
  }
  const controller = createVisibilityController(window, async () => calls.push('pause'))
  await controller(false, 4)
  assert.deepEqual(await controller(true, 3), { visible: false, revision: 4 })
  await controller(true, 5)
  assert.deepEqual(await controller(false, 4), { visible: true, revision: 5 })
  assert.deepEqual(calls, ['hide', 'pause', 'show'])
})

test('a newer visible acknowledgment waits until the previously accepted renderer pause completes', async () => {
  let visible = false
  let completePause
  let showAcknowledged = false
  const calls = []
  const window = {
    isDestroyed: () => false,
    isVisible: () => visible,
    showInactive: () => { visible = true; calls.push('show') },
    hide: () => { visible = false; calls.push('hide') }
  }
  const controller = createVisibilityController(window, () => new Promise(resolve => {
    completePause = () => { calls.push('pause-complete'); resolve() }
  }))
  await controller(true, 1)
  const hiding = controller(false, 2)
  const showing = controller(true, 3).then(result => { showAcknowledged = true; return result })
  await Promise.resolve()
  assert.equal(visible, false)
  assert.equal(showAcknowledged, false)
  completePause()
  await hiding
  assert.deepEqual(await showing, { visible: true, revision: 3 })
  assert.deepEqual(calls, ['show', 'hide', 'pause-complete', 'show'])
})

test('a queued show overtaken by a newer hide stays hidden and the final show waits for all pauses', async () => {
  let visible = false
  const pauses = []
  const shown = []
  const window = {
    isDestroyed: () => false,
    isVisible: () => visible,
    showInactive: () => { visible = true; shown.push('show') },
    hide: () => { visible = false }
  }
  const controller = createVisibilityController(window, () => new Promise(resolve => pauses.push(resolve)))
  const firstHide = controller(false, 2)
  const supersededShow = controller(true, 3)
  const latestHide = controller(false, 4)
  const finalShow = controller(true, 5)
  pauses[0]()
  await firstHide
  assert.deepEqual(await supersededShow, { visible: false, revision: 5 })
  assert.deepEqual(shown, [])
  pauses[1]()
  await latestHide
  assert.deepEqual(await finalShow, { visible: true, revision: 5 })
  assert.deepEqual(shown, ['show'])
})

test('visibility HTTP requires an exact Boolean and positive safe revision before applying lifecycle', async t => {
  const { request, calls } = await controlServer(t)
  const response = await request('/visibility', { method: 'POST', body: JSON.stringify({ visible: true, revision: 2 }) })
  assert.deepEqual(await response.json(), { visible: true, revision: 2 })
  for (const body of [{ visible: 'true', revision: 3 }, { visible: false, revision: 0 }, { visible: true }, { visible: true, revision: 1.5 }]) {
    const invalid = await request('/visibility', { method: 'POST', body: JSON.stringify(body) })
    assert.equal(invalid.status, 400)
    await invalid.json()
  }
  assert.deepEqual(calls, [{ visible: true, revision: 2 }])
})

test('portable workspace return hides video and pauses media while keeping the engine reusable', async () => {
  const calls = []
  let destroyed = false
  const window = {
    isDestroyed: () => destroyed,
    hide: () => calls.push('hide')
  }
  const workspace = createWorkspaceController(window, async () => { calls.push('pause') })
  assert.equal(workspace.revision, 0)
  workspace.returnToMusic()
  await Promise.resolve()
  assert.equal(workspace.revision, 1)
  assert.deepEqual(calls, ['hide', 'pause'])
  workspace.returnToMusic()
  assert.equal(workspace.revision, 2)
  destroyed = true
  workspace.returnToMusic()
  assert.equal(workspace.revision, 2)
})

test('portable workspace visibility focuses the video window after a completed hide and media pause', async () => {
  const calls = []
  let visible = false
  let completePause
  const window = {
    isDestroyed: () => false,
    isVisible: () => visible,
    hide: () => { visible = false; calls.push('hide') },
    show: () => { visible = true; calls.push('show') },
    focus: () => calls.push('focus')
  }
  const visibility = createVisibilityController(window, () => new Promise(resolve => {
    completePause = resolve
  }), true)
  const hiding = visibility(false, 1)
  const showing = visibility(true, 2)
  await Promise.resolve()
  assert.equal(visible, false)
  completePause()
  await hiding
  assert.deepEqual(await showing, { visible: true, revision: 2 })
  assert.deepEqual(calls, ['hide', 'show', 'focus'])
})

test('custom identity and wallpaper accept only bounded raster images, display text and background controls', () => {
  const appearance = {
    displayName: 'My library 🎵', logoDataUrl: 'data:image/png;base64,AA==',
    backgroundImage: '', backgroundStyle: 'gradient', gradientEnd: '#123456',
    gradientAngle: '180', imageOpacity: '25', blur: '4'
  }
  assert.deepEqual(sanitizeAppearance(appearance), appearance)
  for (const invalid of [
    [], null, { unknown: 'value' }, { displayName: 'a'.repeat(41) },
    { displayName: 'injected\nname' }, { displayName: 3 },
    { backgroundImage: 'https://untrusted.example/photo.png' },
    { logoDataUrl: 'data:image/svg+xml;base64,AAAA' },
    { logoDataUrl: 'data:image/png;base64,<script>' },
    { logoDataUrl: 'data:image/png;base64,A===' },
    { logoDataUrl: 'data:image/png;base64,' + 'AAAA'.repeat(700001) },
    { backgroundStyle: 'custom-css' }, { gradientEnd: 'red;display:none' },
    { gradientAngle: '361' }, { imageOpacity: '61' }, { blur: '-1' }, { blur: 'NaN' }
  ]) assert.throws(() => sanitizeAppearance(invalid))
})

test('authenticated appearance accepts uploaded images larger than CSS payloads while keeping other commands bounded', async context => {
  const { request, calls } = await controlServer(context)
  const appearance = { backgroundImage: 'data:image/webp;base64,' + 'AAAA'.repeat(9000) }
  const response = await request('/appearance', { method: 'POST', body: JSON.stringify({ appearance }) })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { applied: true })
  assert.deepEqual(calls, [appearance])
  const invalid = await request('/appearance', { method: 'POST', body: JSON.stringify({ appearance: { backgroundImage: 'url(https://untrusted.example)' } }) })
  assert.equal(invalid.status, 400)
  await invalid.json()
  const denied = await request('/appearance', { method: 'POST', headers: { Authorization: 'Bearer incorrect' }, body: '{}' })
  assert.equal(denied.status, 401)
  await denied.json()
  const oversized = await request('/appearance', { method: 'POST', body: 'x'.repeat(6000001) })
  assert.equal(oversized.status, 413)
  await oversized.json()
  assert.deepEqual(calls, [appearance])
})
