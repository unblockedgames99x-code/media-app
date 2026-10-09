import { Mixins, Parser, Session, YT, YTNodes } from 'youtubei.js'
import { parseLocalChannelHeader, parseLocalChannelVideos, parseLocalListVideo, parseLocalWatchNextVideo } from './local'

const CACHE_TTL = 15 * 60 * 1000
const MAX_CACHE_ENTRIES = 80
const cache = new Map()
const TRENDING_PARAMS = {
  gaming: { browseId: 'UCOpNcN46UbXVtpKMrmU4Abg', params: 'Egh0cmVuZGluZ7gBAJIDAPIGBAoCMgA' },
  podcasts: { browseId: 'FEpodcasts_destination', params: 'qgcCCAM%3D' },
  sports: { browseId: 'UCEgdi0XIXXZ-qJOFPf4JSKw', params: 'EglzcG9ydHN0YWK4AQCSAwDyBgQKAjIA' },
}

/**
 * A fresh, anonymous metadata session; it never downloads or deciphers a player.
 * @param {object} options
 * @param {string} options.region
 * @param {boolean} options.safetyMode
 * @param {AbortSignal} options.signal
 */
async function createMetadataSession({ region, safetyMode, signal }) {
  return Session.create({
    enable_session_cache: false,
    retrieve_innertube_config: false,
    retrieve_player: false,
    generate_session_locally: true,
    user_agent: navigator.userAgent,
    location: region,
    enable_safety_mode: safetyMode,
    fetch: (input, init) => fetch(input, { ...init, signal }),
  })
}

async function fetchLocalSource(kind, id, options) {
  const session = await createMetadataSession(options)
  if (kind === 'related') {
    const response = await session.actions.execute('/next', { videoId: id })
    const parsed = Parser.parseResponse(response.data)
    const secondary = parsed.contents?.item().as(YTNodes.TwoColumnWatchNextResults)?.secondary_results
    const feed = secondary?.firstOfType(YTNodes.ItemSection)?.contents || secondary || []
    return feed.filter(video => video.is(YTNodes.CompactVideo, YTNodes.CompactMovie) ||
      (video.is(YTNodes.LockupView) && ['VIDEO', 'STATION'].includes(video.content_type)))
      .map(parseLocalWatchNextVideo).filter(Boolean)
  }
  if (kind === 'subscription') {
    const response = await session.actions.execute('/browse', { browseId: id, params: 'EgZ2aWRlb3PyBgQKAjoA' })
    const channel = new YT.Channel(session.actions, response)
    const header = parseLocalChannelHeader(channel, true)
    return parseLocalChannelVideos(channel.videos, id, header.name)
  }
  const response = await session.actions.execute('/browse', TRENDING_PARAMS[id])
  return new Mixins.Feed(session.actions, response).videos.map(video => parseLocalListVideo(video)).filter(Boolean)
}

async function fetchInvidiousSource(kind, id, { instance, authorization, signal }) {
  const path = kind === 'related'
    ? `videos/${encodeURIComponent(id)}`
    : kind === 'subscription'
      ? `channels/${encodeURIComponent(id)}/videos?sort_by=newest`
      : 'popular'
  const response = await fetch(`${instance.replace(/\/$/, '')}/api/v1/${path}`, {
    signal,
    headers: authorization ? { Authorization: authorization } : undefined,
  })
  if (!response.ok) throw new Error(`Recommendation source returned ${response.status}`)
  const data = await response.json()
  if (data.error) throw new Error(data.error)
  const videos = kind === 'related' ? data.recommendedVideos : kind === 'subscription' ? data.videos : data
  return (Array.isArray(videos) ? videos : []).map(video => ({
    ...video,
    type: video.type || 'video',
    authorId: video.authorId || (kind === 'subscription' ? id : null),
    published: video.liveNow ? Date.now() : video.isUpcoming ? video.premiereTimestamp * 1000 : video.published * 1000,
  }))
}

/**
 * Cache only bounded metadata, scoped to backend, instance and safety preferences.
 * Abort fetches on navigation and after 12 seconds so a stalled feed cannot hang.
 * @param {'related'|'subscription'|'discovery'} kind
 * @param {string} id
 * @param {object} options
 * @returns {Promise<object[]>}
 */
export async function fetchRecommendationSource(kind, id, options) {
  const { backend, instance, authorization, region, safetyMode, signal, refresh = false } = options
  const key = JSON.stringify([backend, instance, authorization, region, safetyMode, kind, id])
  const cached = cache.get(key)
  if (!refresh && cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.videos
  signal?.throwIfAborted()
  const controller = new AbortController()
  const abort = () => controller.abort(signal.reason)
  signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(() => controller.abort(), 12000)
  try {
    const requestOptions = { ...options, signal: controller.signal }
    const result = backend === 'local'
      ? await fetchLocalSource(kind, id, requestOptions)
      : await fetchInvidiousSource(kind, id, requestOptions)
    const videos = result.slice(0, kind === 'subscription' ? 12 : 24)
    cache.delete(key)
    cache.set(key, { videos, timestamp: Date.now() })
    if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value)
    return videos
  } catch (error) {
    // Keep a usable offline feed while reporting that fresh results failed.
    if (!signal?.aborted && cached?.videos.length) return cached.videos
    throw error
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}
