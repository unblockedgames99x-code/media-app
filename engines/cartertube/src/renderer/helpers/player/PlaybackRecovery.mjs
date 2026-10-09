/**
 * Detect a stopped playback clock independently of media events, which can stop
 * firing when a decoder or a request gets stuck. Recovery is bounded per stall.
 * Pausing, seeking, loading and going offline must never count as a stall.
 * @param {{ stallMs?: number, healthyMs?: number }} [options]
 */
export function createPlaybackWatchdog ({ stallMs = 15000, healthyMs = 30000 } = {}) {
  let lastTime = null
  let lastProgressAt = null
  let healthySince = null
  let stage = 0

  return {
    sample ({ now, currentTime, paused, ended, seeking, online, loaded, nearEnd = false }) {
      if (!loaded || paused || ended || seeking || !online || nearEnd || !Number.isFinite(currentTime)) {
        lastTime = currentTime
        lastProgressAt = now
        healthySince = null
        return null
      }

      if (lastTime === null || lastProgressAt === null || Math.abs(currentTime - lastTime) >= 0.01) {
        lastTime = currentTime
        lastProgressAt = now
        if (healthySince === null) healthySince = now
        if (now - healthySince >= healthyMs) stage = 0
        return null
      }

      // Allow the player's ordinary gap jumping and request retries to work first.
      if (now - lastProgressAt < stallMs) return null
      healthySince = null
      lastProgressAt = now
      return ['retry', 'reload', 'error'][stage++] || null
    },
  }
}

/**
 * Track IDs can change after load; original format IDs and language/label remain
 * stable. Keep a manually selected video quality and audio language on recovery.
 * @param {object[]} tracks
 * @param {object} previous
 */
export function findRecoveryVariant (tracks, previous) {
  if (!previous) return undefined
  const exactMatch = (previous.originalAudioId != null || previous.originalVideoId != null) && tracks.find(track =>
    track.originalAudioId === previous.originalAudioId &&
    track.originalVideoId === previous.originalVideoId)
  return exactMatch ||
    tracks.find(track =>
      track.language === previous.language && track.label === previous.label &&
      track.width === previous.width && track.height === previous.height &&
      track.audioBandwidth === previous.audioBandwidth)
}

/** @param {object[]} tracks @param {object} previous */
export function findRecoveryTextTrack (tracks, previous) {
  if (!previous) return undefined
  return tracks.find(track => track.language === previous.language &&
    track.label === previous.label && track.kind === previous.kind)
}

/**
 * Choose the closest available quality at or below the preference, with a
 * lowest-quality fallback. Never sort the reactive formats array in place.
 * @param {object[]} formats
 * @param {number} requestedQuality
 */
export function chooseLegacyFormat (formats, requestedQuality) {
  const sorted = [...formats].sort((a, b) =>
    Math.min(b.width, b.height) - Math.min(a.width, a.height) || b.bitrate - a.bitrate)
  return sorted.find(format => Math.min(format.width, format.height) <= requestedQuality) || sorted[sorted.length - 1]
}

/**
 * Backoff and preroll waits must release both timer and listener on cancellation.
 * @param {number} delayMs
 * @param {AbortSignal} signal
 * @returns {Promise<void>}
 */
export function abortableDelay (delayMs, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason || new DOMException('Aborted', 'AbortError'))
      return
    }

    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(signal.reason || new DOMException('Aborted', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, delayMs)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
