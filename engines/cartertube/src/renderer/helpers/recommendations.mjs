const DAY = 24 * 60 * 60 * 1000
const SOURCE_WEIGHTS = { related: 54, subscription: 62, discovery: 12 }

/**
 * Pick a small, diverse set of recent interests without sending the history itself.
 * @param {object[]} history Most recent first.
 * @param {object[]} subscriptions
 * @returns {{videos: string[], channels: string[]}}
 */
export function selectRecommendationSeeds (history = [], subscriptions = []) {
  const videos = []
  const watchedChannels = new Set()
  for (const video of history.slice(0, 100)) {
    if (!video.videoId || videos.includes(video.videoId)) continue
    if (video.authorId && watchedChannels.has(video.authorId)) continue
    videos.push(video.videoId)
    if (video.authorId) watchedChannels.add(video.authorId)
    if (videos.length === 3) break
  }

  const channels = [...new Set(subscriptions.map(channel => channel.id).filter(Boolean))]
  channels.sort((a, b) => Number(watchedChannels.has(b)) - Number(watchedChannels.has(a)))
  return { videos, channels: channels.slice(0, 6) }
}

/**
 * Rank real API results locally. Exclude watched videos and duplicates, then
 * penalize repeated channels so a prolific uploader cannot occupy the whole feed.
 * No popularity tracking, account, or remote personalization service is used.
 * @param {{video: object, source: 'related'|'subscription'|'discovery'}[]} candidates
 * @param {object} options
 * @param {object[]} [options.history]
 * @param {object[]} [options.subscriptions]
 * @param {number} [options.now]
 * @param {number} [options.limit]
 * @returns {object[]}
 */
export function rankRecommendations (candidates, { history = [], subscriptions = [], now = Date.now(), limit = 72 } = {}) {
  const watchedIds = new Set(history.map(video => video.videoId))
  const subscribedIds = new Set(subscriptions.map(channel => channel.id))
  const affinity = new Map()
  history.slice(0, 100).forEach((video, index) => {
    if (!video.authorId) return
    affinity.set(video.authorId, Math.min(18, (affinity.get(video.authorId) || 0) + 6 / (1 + index / 8)))
  })

  const unique = new Map()
  for (const { video, source } of candidates) {
    if (!video || !video.videoId || !video.title || watchedIds.has(video.videoId)) continue
    if (video.type && video.type !== 'video' && video.type !== 'shortVideo') continue
    const freshness = Number.isFinite(video.published)
      ? Math.max(0, 14 - Math.max(0, now - video.published) / DAY)
      : 0
    const score = (SOURCE_WEIGHTS[source] || 0) + freshness + (affinity.get(video.authorId) || 0) +
      (subscribedIds.has(video.authorId) ? 14 : 0)
    const existing = unique.get(video.videoId)
    if (existing) {
      existing.sources.add(source)
      if (score > existing.score) {
        existing.score = score
        existing.video = video
      }
    } else {
      unique.set(video.videoId, { video, score, sources: new Set([source]) })
    }
  }

  const remaining = [...unique.values()]
  const channelCounts = new Map()
  const ranked = []
  while (remaining.length && ranked.length < Math.max(0, limit)) {
    let bestIndex = 0
    let bestScore = -Infinity
    remaining.forEach((entry, index) => {
      const repeats = channelCounts.get(entry.video.authorId) || 0
      const score = entry.score + Math.min(8, (entry.sources.size - 1) * 4) - repeats * 22
      if (score > bestScore) {
        bestScore = score
        bestIndex = index
      }
    })
    const [entry] = remaining.splice(bestIndex, 1)
    ranked.push({ ...entry.video, type: entry.video.type || 'video', recommendationSources: [...entry.sources] })
    if (entry.video.authorId) {
      channelCounts.set(entry.video.authorId, (channelCounts.get(entry.video.authorId) || 0) + 1)
    }
  }
  return ranked
}

/**
 * Run network tasks with an actual concurrency bound, preserving partial success.
 * @param {Function[]} tasks
 * @param {object} [options]
 * @param {number} [options.concurrency]
 * @param {AbortSignal} [options.signal]
 * @param {Function} [options.onResult]
 * @returns {Promise<PromiseSettledResult[]>}
 */
export async function runRecommendationTasks (tasks, { concurrency = 2, signal, onResult } = {}) {
  const results = new Array(tasks.length)
  let nextIndex = 0
  async function worker () {
    while (nextIndex < tasks.length) {
      if (signal && signal.aborted) return
      const index = nextIndex++
      try {
        const value = await tasks[index]()
        results[index] = { status: 'fulfilled', value }
        if (!(signal && signal.aborted) && onResult) onResult(value)
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(tasks.length, Math.max(1, Math.floor(concurrency))) }, worker))
  return results
}
