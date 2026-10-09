import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { CompositeBuffer, UmpWriter } from 'googlevideo/ump'
import { SabrRedirect, UMPPartId } from 'googlevideo/protos'
import { concatenateChunks } from 'googlevideo/utils'

// Exercise the actual scheme plugin with real protobuf/UMP parsing. Only the
// browser-owned Shaka networking boundary and Vue's unrelated deep-copy helper
// are substituted, so this suite runs without Electron or a YouTube session.
class ShakaError extends Error {
  static Severity = { RECOVERABLE: 1, CRITICAL: 2 }
  static Category = { NETWORK: 1 }
  static Code = { OPERATION_ABORTED: 1, TIMEOUT: 2, HTTP_ERROR: 3, BAD_HTTP_STATUS: 4 }
  constructor(severity, category, code, ...data) {
    super(`Shaka error ${code}`)
    Object.assign(this, { severity, category, code, data })
  }
}

class AbortableOperation {
  constructor(promise, abort = () => Promise.resolve()) { this.promise = promise; this.abort = abort }
  static failed(error) { return new AbortableOperation(Promise.reject(error)) }
  static completed(value) { return new AbortableOperation(Promise.resolve(value)) }
  finally(callback) { this.promise.then(() => callback(), () => callback()); return this }
}

let scheme
const boundary = {
  util: { Error: ShakaError, AbortableOperation },
  net: { NetworkingEngine: {
    registerScheme(_name, handler) { scheme = handler },
    unregisterScheme() { scheme = null },
  } },
}
globalThis.__carterTubeTestShaka = boundary
let source = await readFile(new URL('../src/renderer/helpers/player/SabrSchemePlugin.js', import.meta.url), 'utf8')
source = source.replace("import shaka from 'shaka-player'", 'const shaka = globalThis.__carterTubeTestShaka')
source = source.replace("import { deepCopy } from '../utils'", 'const deepCopy = structuredClone')
source = source.replace(/from '(googlevideo\/[^']+)'/g, (_match, specifier) => `from '${import.meta.resolve(specifier)}'`)
source = source.replace("from './PlaybackRecovery.mjs'", `from '${new URL('../src/renderer/helpers/player/PlaybackRecovery.mjs', import.meta.url).href}'`)
const { setupSabrScheme } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
delete globalThis.__carterTubeTestShaka

function fixture(t, timeout = 1000) {
  const player = {
    isAudioOnly: () => true,
    getVariantTracks: () => [],
    getStats: () => ({ estimatedBandwidth: 1000000 }),
    getPlaybackRate: () => 1,
  }
  const stream = setupSabrScheme({ url: 'https://example.test/videoplayback', poToken: 'AA==', ustreamerConfig: 'AA==', clientInfo: {} },
    () => player, () => null, { value: 1920 }, { value: 1080 })
  t.after(() => stream.cleanup())
  const uri = 'sabr:audio?formatId=251-123&videoFormatId=271-123&init=1'
  const request = { uris: [uri], retryParameters: { timeout } }
  return { stream, request: () => scheme(uri, request, 1, () => {}, () => {}) }
}

test('SABR preserves access-denied and rate-limit status for existing error handling', async t => {
  for (const status of [403, 429]) {
    t.mock.method(globalThis, 'fetch', async () => new Response('<html>Denied</html>', { status }))
    const { request } = fixture(t)
    await assert.rejects(request().promise, error => error.code === ShakaError.Code.BAD_HTTP_STATUS &&
      error.severity === ShakaError.Severity.CRITICAL && error.data[1] === status)
    t.mock.restoreAll()
  }
})

test('an empty successful SABR response rejects as missing media instead of resolving undefined', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array()))
  const { request } = fixture(t)
  await assert.rejects(request().promise, error => error.code === ShakaError.Code.HTTP_ERROR &&
    error.data[1].message.includes('Incomplete segment'))
})

test('a SABR redirect loop stops after eight responses, before the request deadline', async t => {
  const buffer = new CompositeBuffer()
  new UmpWriter(buffer).write(UMPPartId.SABR_REDIRECT, SabrRedirect.encode({ url: 'https://example.test/redirect' }).finish())
  const data = concatenateChunks(buffer.chunks)
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(data))
  const { request } = fixture(t)
  await assert.rejects(request().promise, error => error.code === ShakaError.Code.HTTP_ERROR &&
    error.data[1].message === 'Too many SABR redirects')
  assert.equal(fetch.mock.callCount(), 8)
})

test('SABR request deadline aborts a stalled fetch', async t => {
  let signal
  t.mock.method(globalThis, 'fetch', (_uri, init) => new Promise((_resolve, reject) => {
    signal = init.signal
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  const { request } = fixture(t, 15)
  await assert.rejects(request().promise, error => error.code === ShakaError.Code.TIMEOUT)
  assert.equal(signal.aborted, true)
})

test('destroying SABR aborts active requests and unregisters its scheme', async t => {
  let signal
  t.mock.method(globalThis, 'fetch', (_uri, init) => new Promise((_resolve, reject) => {
    signal = init.signal
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  const { stream, request } = fixture(t)
  const pending = request().promise
  stream.cleanup()
  await assert.rejects(pending, error => error.code === ShakaError.Code.OPERATION_ABORTED)
  assert.equal(signal.aborted, true)
  assert.equal(scheme, null)
})
