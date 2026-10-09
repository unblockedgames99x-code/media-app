import test from 'node:test'
import assert from 'node:assert/strict'
import { getEventListeners } from 'node:events'
import { withRequestDeadline } from '../src/renderer/helpers/api/RequestDeadline.mjs'

test('video metadata deadline rejects and aborts in-flight work even when an IPC promise never settles', async () => {
  let signal
  await assert.rejects(withRequestDeadline(operationSignal => {
    signal = operationSignal
    return new Promise(() => {})
  }, { timeoutMs: 10 }), { name: 'TimeoutError' })
  assert.equal(signal.aborted, true)
  assert.equal(getEventListeners(signal, 'abort').length, 0)
})

test('successful metadata results keep their actions client usable after the deadline is cleared', async () => {
  const session = await withRequestDeadline(async signal => ({ signal, title: 'Video' }), { timeoutMs: 10 })
  assert.equal(session.title, 'Video')
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(session.signal.aborted, false)
  assert.equal(getEventListeners(session.signal, 'abort').length, 0)
})

test('metadata failure aborts remaining work and preserves the original error', async () => {
  const original = new Error('Access denied')
  let signal
  await assert.rejects(withRequestDeadline(async operationSignal => {
    signal = operationSignal
    throw original
  }), error => error === original)
  assert.equal(signal.aborted, true)
})

test('caller cancellation rejects promptly and releases parent and operation listeners', async () => {
  const parent = new AbortController()
  let signal
  const pending = withRequestDeadline(operationSignal => {
    signal = operationSignal
    return new Promise(() => {})
  }, { signal: parent.signal })
  await Promise.resolve()
  parent.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(signal.aborted, true)
  assert.equal(getEventListeners(parent.signal, 'abort').length, 0)
  assert.equal(getEventListeners(signal, 'abort').length, 0)
})

test('an already cancelled operation never starts a metadata request', async () => {
  const parent = new AbortController()
  parent.abort()
  let called = false
  await assert.rejects(withRequestDeadline(async () => { called = true }, { signal: parent.signal }), { name: 'AbortError' })
  assert.equal(called, false)
})
