const processors = new WeakMap()

const bounded = (value, minimum, maximum) => Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : 0

const connect = (processor) => {
  processor.source.connect(processor.bass).connect(processor.mid).connect(processor.treble)
    .connect(processor.output).connect(processor.balance).connect(processor.context.destination)
  processor.media.addEventListener('play', processor.resume)
  processor.released = false
}

export function updateAudioProcessing (media, settings) {
  let processor = processors.get(media)
  if (!settings.enabled && !processor) return false
  if (!processor) {
    const sourceUrl = media.currentSrc || media.src
    if (!media.hasAttribute('crossorigin') && !/^(blob:|file:|data:audio\/|data:video\/)/i.test(sourceUrl)) return false
    const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext
    if (typeof Context !== 'function') return false
    let context
    try {
      context = new Context({ latencyHint: 'playback' })
      const bass = context.createBiquadFilter()
      bass.type = 'lowshelf'
      bass.frequency.value = 200
      const mid = context.createBiquadFilter()
      mid.type = 'peaking'
      mid.frequency.value = 1000
      mid.Q.value = 0.7
      const treble = context.createBiquadFilter()
      treble.type = 'highshelf'
      treble.frequency.value = 4000
      const output = context.createGain()
      const balance = context.createStereoPanner()
      const source = context.createMediaElementSource(media)
      processor = {
        context, media, source, bass, mid, treble, output, balance,
        resume: () => { void context.resume().catch(() => {}) },
        released: true
      }
      connect(processor)
      processors.set(media, processor)
    } catch {
      if (context) void context.close().catch(() => {})
      return false
    }
  } else if (processor.released) {
    connect(processor)
  }
  const now = processor.context.currentTime
  const enabled = settings.enabled === true
  const bass = enabled ? bounded(settings.bass, -12, 12) : 0
  const mid = enabled ? bounded(settings.mid, -12, 12) : 0
  const treble = enabled ? bounded(settings.treble, -12, 12) : 0
  processor.bass.gain.setTargetAtTime(bass, now, 0.025)
  processor.mid.gain.setTargetAtTime(mid, now, 0.025)
  processor.treble.gain.setTargetAtTime(treble, now, 0.025)
  processor.balance.pan.setTargetAtTime(enabled ? bounded(settings.balance, -1, 1) : 0, now, 0.025)
  processor.output.channelCount = enabled && settings.mono ? 1 : 2
  processor.output.channelCountMode = enabled && settings.mono ? 'explicit' : 'max'
  const headroom = Math.max(0, bass) + Math.max(0, mid) + Math.max(0, treble)
  processor.output.gain.setTargetAtTime(10 ** (-headroom / 20), now, 0.025)
  if (!media.paused) processor.resume()
  return true
}

export function releaseAudioProcessing (media) {
  const processor = processors.get(media)
  if (!processor || processor.released) return
  processor.released = true
  media.removeEventListener('play', processor.resume)
  for (const node of ['source', 'bass', 'mid', 'treble', 'output', 'balance']) processor[node].disconnect()
  void processor.context.suspend().catch(() => {})
}
