import test from 'node:test'
import assert from 'node:assert/strict'
import { updateAudioProcessing, releaseAudioProcessing } from '../src/shared/audioProcessing.mjs'

const defaults = { enabled: true, bass: 0, mid: 0, treble: 0, balance: 0, mono: false }

const mediaElement = (url = 'blob:media', cors = false) => {
  const listeners = new Map()
  return {
    currentSrc: url, src: url, paused: true,
    hasAttribute: name => name === 'crossorigin' && cors,
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name, listener) => { if (listeners.get(name) === listener) listeners.delete(name) },
    play: function () { this.paused = false; listeners.get('play')?.() }
  }
}

const audioEnvironment = (context) => {
  const contexts = []
  const bound = new WeakSet()
  const parameter = () => ({ value: 0, setTargetAtTime: function (value) { this.value = value } })
  const node = (type) => ({
    type, connections: [], gain: parameter(), pan: parameter(), frequency: parameter(), Q: parameter(),
    connect: function (destination) { this.connections.push(destination); return destination },
    disconnect: function () { this.connections = [] }
  })
  class TestAudioContext {
    constructor () {
      this.currentTime = 4
      this.destination = node('destination')
      this.filters = []
      this.state = 'suspended'
      this.resumeCalls = 0
      this.closeCalls = 0
      this.sources = []
      contexts.push(this)
    }
    createBiquadFilter () { const filter = node('filter'); this.filters.push(filter); return filter }
    createGain () { this.output = node('output'); return this.output }
    createStereoPanner () { this.balance = node('panner'); return this.balance }
    createMediaElementSource (media) {
      if (bound.has(media)) throw new Error('An element can only bind once')
      bound.add(media)
      const source = node('source')
      this.sources.push(source)
      return source
    }
    async resume () { this.state = 'running'; this.resumeCalls++ }
    async suspend () { this.state = 'suspended' }
    async close () { this.state = 'closed'; this.closeCalls++ }
  }
  const previous = globalThis.AudioContext
  globalThis.AudioContext = TestAudioContext
  context.after(() => { globalThis.AudioContext = previous })
  return contexts
}

test('disabled processing and unsupported or unknown cross-origin sources keep native playback untouched', context => {
  const contexts = audioEnvironment(context)
  assert.equal(updateAudioProcessing(mediaElement(), { ...defaults, enabled: false }), false)
  for (const url of ['', 'https://video.example/stream']) {
    assert.equal(updateAudioProcessing(mediaElement(url), defaults), false)
  }
  assert.equal(contexts.length, 0)
  assert.equal(updateAudioProcessing(mediaElement('https://video.example/stream', true), defaults), true)
  assert.equal(contexts.length, 1)
})

test('effects route sound through bass, mid, treble, output downmix and stereo position to speakers', context => {
  const contexts = audioEnvironment(context)
  const media = mediaElement()
  assert.equal(updateAudioProcessing(media, { ...defaults, bass: 6, mid: -3, treble: 4, balance: -0.75, mono: true }), true)
  const audio = contexts[0]
  assert.deepEqual(audio.sources[0].connections, [audio.filters[0]])
  assert.deepEqual(audio.filters[0].connections, [audio.filters[1]])
  assert.deepEqual(audio.filters[1].connections, [audio.filters[2]])
  assert.deepEqual(audio.filters[2].connections, [audio.output])
  assert.deepEqual(audio.output.connections, [audio.balance])
  assert.deepEqual(audio.balance.connections, [audio.destination])
  assert.deepEqual(audio.filters.map(filter => filter.gain.value), [6, -3, 4])
  assert.equal(audio.output.channelCount, 1)
  assert.equal(audio.output.channelCountMode, 'explicit')
  assert.equal(audio.balance.pan.value, -0.75)
  assert.ok(Math.abs(audio.output.gain.value - 10 ** (-10 / 20)) < 1e-10)
})

test('turning effects off restores flat stereo and unity output without rebinding media', context => {
  const contexts = audioEnvironment(context)
  const media = mediaElement()
  updateAudioProcessing(media, { ...defaults, bass: 12, mid: 12, treble: 12, mono: true, balance: 1 })
  updateAudioProcessing(media, { ...defaults, enabled: false })
  const audio = contexts[0]
  assert.equal(contexts.length, 1)
  assert.equal(audio.sources.length, 1)
  assert.deepEqual(audio.filters.map(filter => filter.gain.value), [0, 0, 0])
  assert.equal(audio.output.channelCount, 2)
  assert.equal(audio.output.channelCountMode, 'max')
  assert.equal(audio.balance.pan.value, 0)
  assert.equal(audio.output.gain.value, 1)
})

test('detached media releases active audio resources and safely resumes when the same element is reused', context => {
  const contexts = audioEnvironment(context)
  const media = mediaElement()
  updateAudioProcessing(media, defaults)
  const audio = contexts[0]
  releaseAudioProcessing(media)
  releaseAudioProcessing(media)
  assert.equal(audio.state, 'suspended')
  assert.equal(audio.closeCalls, 0)
  assert.deepEqual(audio.sources[0].connections, [])
  media.play()
  assert.equal(audio.resumeCalls, 0)
  assert.equal(updateAudioProcessing(media, { ...defaults, balance: 0.5 }), true)
  assert.equal(contexts.length, 1)
  assert.equal(audio.sources.length, 1)
  assert.equal(audio.state, 'running')
  assert.deepEqual(audio.balance.connections, [audio.destination])
  assert.equal(audio.balance.pan.value, 0.5)
})

test('invalid audio parameters are bounded before reaching browser automation', context => {
  const contexts = audioEnvironment(context)
  updateAudioProcessing(mediaElement(), { ...defaults, bass: Infinity, mid: -200, treble: 200, balance: NaN })
  assert.deepEqual(contexts[0].filters.map(filter => filter.gain.value), [0, -12, 12])
  assert.equal(contexts[0].balance.pan.value, 0)
})

test('missing WebAudio and constructor failure leave media playback available without processing', context => {
  audioEnvironment(context)
  globalThis.AudioContext = undefined
  assert.equal(updateAudioProcessing(mediaElement(), defaults), false)
  globalThis.AudioContext = class { constructor () { throw new Error('Audio device unavailable') } }
  assert.equal(updateAudioProcessing(mediaElement(), defaults), false)
})
