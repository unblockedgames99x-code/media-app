import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { bindEmbeddedInputFocus } from '../src/main/embedded.mjs'

function fixture () {
  const window = new EventEmitter()
  const contents = new EventEmitter()
  const state = { visible: true, destroyed: false, contentsDestroyed: false, url: 'app://bundle/index.html#/home', focused: 0 }
  Object.assign(window, {
    isVisible: () => state.visible,
    isDestroyed: () => state.destroyed,
    webContents: contents
  })
  Object.assign(contents, {
    isDestroyed: () => state.contentsDestroyed,
    getURL: () => state.url,
    focus: () => { state.focused++ }
  })
  const stop = bindEmbeddedInputFocus(window, url => url.startsWith('app://bundle/index.html'))
  const click = () => contents.emit('before-mouse-event', { preventDefault: () => assert.fail('The original click must be delivered') }, { type: 'mouseDown', button: 'left' })
  return { window, contents, state, stop, click }
}

test('clicking the embedded video page explicitly focuses Chromium without swallowing the click', () => {
  const { contents, state, stop, click } = fixture()
  contents.emit('before-mouse-event', {}, { type: 'mouseMove' })
  contents.emit('before-mouse-event', {}, { type: 'mouseUp' })
  assert.equal(state.focused, 0)
  click()
  assert.equal(state.focused, 1)
  stop()
})

test('hidden, destroyed and untrusted video pages cannot take keyboard focus', () => {
  const { state, stop, click } = fixture()
  for (const change of [
    { visible: false },
    { visible: true, destroyed: true },
    { destroyed: false, contentsDestroyed: true },
    { contentsDestroyed: false, url: 'https://untrusted.test/' }
  ]) {
    Object.assign(state, change)
    click()
  }
  assert.equal(state.focused, 0)
  stop()
})

test('returning to Music releases the click path until video is shown and clicked again', () => {
  const { state, stop, click } = fixture()
  click()
  state.visible = false
  click()
  assert.equal(state.focused, 1)
  state.visible = true
  assert.equal(state.focused, 1)
  click()
  assert.equal(state.focused, 2)
  stop()
})

test('closing the embedded window removes every input and lifecycle listener', () => {
  const { window, contents, state, stop, click } = fixture()
  window.emit('closed')
  assert.equal(contents.listenerCount('before-mouse-event'), 0)
  assert.equal(contents.listenerCount('destroyed'), 0)
  assert.equal(window.listenerCount('closed'), 0)
  stop()
  click()
  assert.equal(state.focused, 0)
})

test('destroying the renderer or explicitly stopping is idempotent and leaves no focus relay', () => {
  for (const destroyRenderer of [true, false]) {
    const { window, contents, state, stop, click } = fixture()
    if (destroyRenderer) contents.emit('destroyed')
    else stop()
    stop()
    assert.equal(contents.listenerCount('before-mouse-event'), 0)
    assert.equal(contents.listenerCount('destroyed'), 0)
    assert.equal(window.listenerCount('closed'), 0)
    click()
    assert.equal(state.focused, 0)
  }
})
