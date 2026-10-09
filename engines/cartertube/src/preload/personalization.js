import { releaseAudioProcessing, updateAudioProcessing } from '../shared/audioProcessing.mjs'

let variables = {}
let soundContext
let lastSound = 0
let observing = false
let appearance = {}

export function getAppearance () {
  return { ...appearance }
}

export function applyAppearance (newAppearance) {
  appearance = { ...appearance, ...newAppearance }
  const root = document.documentElement
  const background = appearance.backgroundStyle === 'gradient'
    ? `linear-gradient(${Number(appearance.gradientAngle) || 0}deg, var(--cm-background), ${appearance.gradientEnd || '#29293b'})`
    : appearance.backgroundStyle === 'image' && appearance.backgroundImage
      ? `url("${appearance.backgroundImage}")`
      : 'none'
  root.style.setProperty('--cm-workspace-background', background)
  root.style.setProperty('--cm-workspace-opacity', appearance.backgroundStyle === 'gradient' ? '1' : String((Number(appearance.imageOpacity) || 0) / 100))
  root.style.setProperty('--cm-workspace-blur', `${Number(appearance.blur) || 0}px`)
}

const numeric = (key, fallback = 0) => {
  const value = Number.parseFloat(variables[key])
  return Number.isFinite(value) ? value : fallback
}

const applyAudio = (media) => {
  updateAudioProcessing(media, {
    enabled: numeric('--audio-enabled') === 1,
    bass: Math.max(-12, Math.min(12, numeric('--audio-bass'))),
    mid: Math.max(-12, Math.min(12, numeric('--audio-mid'))),
    treble: Math.max(-12, Math.min(12, numeric('--audio-treble'))),
    balance: Math.max(-1, Math.min(1, numeric('--audio-balance'))),
    mono: numeric('--audio-mono') === 1
  })
}

const playSound = () => {
  if (numeric('--sounds-enabled') !== 1 || !window.AudioContext) return
  const volume = Math.max(0, Math.min(100, numeric('--sounds-volume')))
  if (!volume || performance.now() - lastSound < 70) return
  lastSound = performance.now()
  soundContext ??= new AudioContext()
  const context = soundContext
  context.resume().then(() => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const start = context.currentTime
    const tone = variables['--sounds-tone']
    oscillator.type = tone === 'digital' ? 'triangle' : 'sine'
    oscillator.frequency.setValueAtTime(tone === 'bright' ? 880 : tone === 'digital' ? 620 : 440, start)
    oscillator.frequency.exponentialRampToValueAtTime(tone === 'soft' ? 330 : 660, start + 0.08)
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(volume / 100 * 0.12, start + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.1)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(start)
    oscillator.stop(start + 0.12)
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
  }).catch(() => {})
}

const mediaIn = (node) => node instanceof Element
  ? [...(node.matches('video,audio') ? [node] : []), ...node.querySelectorAll('video,audio')]
  : []

export function applyPersonalization (newVariables) {
  variables = { ...variables, ...newVariables }
  const root = document.documentElement
  root.dataset.motion = numeric('--motion-level', 2) === 0 ? 'none' : numeric('--motion-level', 2) === 1 ? 'reduced' : 'full'
  root.dataset.artwork = numeric('--artwork-visible', 1) === 1 ? 'visible' : 'hidden'
  root.dataset.tooltips = numeric('--tooltips-visible', 1) === 1 ? 'visible' : 'hidden'
  root.dataset.density = variables['--density'] || 'comfortable'
  for (const media of document.querySelectorAll('video,audio')) applyAudio(media)
  if (observing) return
  observing = true
  document.addEventListener('loadedmetadata', (event) => {
    if (event.target instanceof HTMLMediaElement) applyAudio(event.target)
  }, true)
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('button,a,[role="tab"]') : null
    if (!target) return
    const navigation = target.tagName === 'A' || target.getAttribute('role') === 'tab'
    if (numeric(navigation ? '--sounds-navigation' : '--sounds-selection') === 1) playSound()
  })
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        for (const media of mediaIn(node)) applyAudio(media)
        if (numeric('--sounds-notification') === 1 && node instanceof Element && node.matches('[role="alert"]')) playSound()
      }
      for (const node of record.removedNodes) {
        for (const media of mediaIn(node)) {
          queueMicrotask(() => { if (!media.isConnected) releaseAudioProcessing(media) })
        }
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
}
