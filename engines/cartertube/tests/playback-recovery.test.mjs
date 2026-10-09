import test from 'node:test'
import assert from 'node:assert/strict'
import { getEventListeners } from 'node:events'
import { abortableDelay, chooseLegacyFormat, createPlaybackWatchdog, findRecoveryTextTrack, findRecoveryVariant } from '../src/renderer/helpers/player/PlaybackRecovery.mjs'

const playing = { currentTime: 42, paused: false, ended: false, seeking: false, online: true, loaded: true }

test('a frozen clock retries, reloads once, then surfaces failure without an endless reload loop', () => {
  const watchdog = createPlaybackWatchdog()
  const sample = now => watchdog.sample({ ...playing, now })
  assert.equal(sample(0), null)
  assert.equal(sample(14000), null)
  assert.equal(sample(15000), 'retry')
  assert.equal(sample(30000), 'reload')
  assert.equal(sample(45000), 'error')
  assert.equal(sample(60000), null)
  assert.equal(sample(75000), null)
})

test('paused, seeking, offline, loading and finished media never trigger recovery', () => {
  for (const override of [{ paused: true }, { seeking: true }, { online: false }, { loaded: false }, { ended: true }, { nearEnd: true }]) {
    const watchdog = createPlaybackWatchdog()
    watchdog.sample({ ...playing, now: 0 })
    assert.equal(watchdog.sample({ ...playing, ...override, now: 60000 }), null)
    assert.equal(watchdog.sample({ ...playing, now: 61000 }), null)
  }
})

test('steady playback clears the recovery budget; a single frame does not', () => {
  const watchdog = createPlaybackWatchdog()
  watchdog.sample({ ...playing, now: 0 })
  assert.equal(watchdog.sample({ ...playing, now: 15000 }), 'retry')
  assert.equal(watchdog.sample({ ...playing, currentTime: 43, now: 16000 }), null)
  assert.equal(watchdog.sample({ ...playing, currentTime: 43, now: 31000 }), 'reload')
  for (let now = 32000; now <= 63000; now += 1000) {
    assert.equal(watchdog.sample({ ...playing, currentTime: now / 1000, now }), null)
  }
  assert.equal(watchdog.sample({ ...playing, currentTime: 63, now: 78000 }), 'retry')
})

test('quality and audio selection survive regenerated Shaka track IDs', () => {
  const selected = { id: 1, originalAudioId: '251-en', originalVideoId: '271-1440', width: 2560, height: 1440, language: 'en', label: 'English', audioBandwidth: 128000 }
  const tracks = [{ ...selected, id: 12, height: 720, originalVideoId: '247-720' }, { ...selected, id: 13 }, { ...selected, id: 14, originalAudioId: '251-es', language: 'es' }]
  assert.equal(findRecoveryVariant(tracks, selected), tracks[1])
  assert.equal(findRecoveryVariant([{ ...selected, id: 15, originalVideoId: 'new' }], selected).id, 15)
  assert.equal(findRecoveryVariant([], selected), undefined)
  assert.equal(findRecoveryVariant(tracks, null), undefined)
})

test('caption selection matches language and label, not the old track index', () => {
  const previous = { id: 1, language: 'en', label: 'English', kind: 'captions' }
  const tracks = [{ id: 8, language: 'fr', label: 'French', kind: 'captions' }, { ...previous, id: 9 }]
  assert.equal(findRecoveryTextTrack(tracks, previous), tracks[1])
  assert.equal(findRecoveryTextTrack(tracks, null), undefined)
})

test('legacy quality respects the requested resolution for landscape and portrait media', () => {
  const formats = [{ width: 1920, height: 1080, bitrate: 4000 }, { width: 640, height: 360, bitrate: 1000 }, { width: 1280, height: 720, bitrate: 2000 }]
  const original = [...formats]
  assert.equal(chooseLegacyFormat(formats, 720), formats[2])
  assert.equal(chooseLegacyFormat(formats, 900), formats[2])
  assert.equal(chooseLegacyFormat(formats, 144), formats[1])
  assert.equal(chooseLegacyFormat(formats, Infinity), formats[0])
  assert.deepEqual(formats, original)
  const portrait = formats.map(format => ({ ...format, width: format.height, height: format.width }))
  assert.equal(chooseLegacyFormat(portrait, 720), portrait[2])
  assert.equal(chooseLegacyFormat([], 720), undefined)
})

test('a cancelled backoff rejects promptly and releases its abort listener', async () => {
  const controller = new AbortController()
  const pending = abortableDelay(60000, controller.signal)
  assert.equal(getEventListeners(controller.signal, 'abort').length, 1)
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
})

test('completed and already cancelled delays leave no listeners', async () => {
  const controller = new AbortController()
  await abortableDelay(1, controller.signal)
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
  controller.abort()
  await assert.rejects(abortableDelay(60000, controller.signal), { name: 'AbortError' })
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
})
