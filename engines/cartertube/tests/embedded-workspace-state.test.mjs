import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { startEmbeddedHost } from '../src/main/embeddedHost.js'
import { EMBEDDED_RESULT_CHANNEL, WORKSPACE_STATE_CHANNEL } from '../src/shared/embedded.mjs'

test('workspace diagnostics report native visibility only to the trusted primary renderer', async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'media-workspace-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const handlers = new Map()
  const ipcMain = new EventEmitter()
  ipcMain.handle = (channel, handler) => handlers.set(channel, handler)
  ipcMain.removeHandler = channel => handlers.delete(channel)
  const application = new EventEmitter()
  const window = new EventEmitter()
  const trustedUrl = 'app://index.html'
  const trustedEvent = { sender: { id: 17 }, senderFrame: { url: trustedUrl } }
  let visible = true
  window.id = 4
  window.isVisible = () => visible
  window.isDestroyed = () => false
  window.getNativeWindowHandle = () => Buffer.from([1, 0, 0, 0])
  window.webContents = new EventEmitter()
  window.webContents.id = trustedEvent.sender.id
  window.webContents.getURL = () => trustedUrl
  window.webContents.send = (_channel, message) => queueMicrotask(() => {
    ipcMain.emit(EMBEDDED_RESULT_CHANNEL, trustedEvent, { id: message.id, status: { paused: true } })
  })
  const control = await startEmbeddedHost({
    app: application,
    window,
    config: { token: 'test-workspace-state-secret', handshakeFile: path.join(directory, 'handshake.json') },
    ipcMain,
    windows: () => [window],
    isTrusted: url => url === trustedUrl
  })
  context.after(async () => {
    application.emit('will-quit')
    await control.close()
  })
  const readState = handlers.get(WORKSPACE_STATE_CHANNEL)
  assert.deepEqual(readState(trustedEvent), { visible: true, returnRevision: 0 })
  visible = false
  assert.deepEqual(readState(trustedEvent), { visible: false, returnRevision: 0 })
  assert.throws(() => readState({ ...trustedEvent, sender: { id: 18 } }))
  assert.throws(() => readState({ ...trustedEvent, senderFrame: { url: 'https://example.com' } }))
})
