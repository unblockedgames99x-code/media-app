import test from 'node:test'
import assert from 'node:assert/strict'
import { rankRecommendations, runRecommendationTasks, selectRecommendationSeeds } from '../src/renderer/helpers/recommendations.mjs'

const now = 1800000000000
const video = (videoId, authorId, extra = {}) => ({ videoId, authorId, title: videoId, type: 'video', ...extra })
const candidate = (videoId, authorId, source = 'related', extra = {}) => ({ video: video(videoId, authorId, extra), source })

test('exclude watched, invalid and non-video results, merging duplicates without changing input', () => {
  const candidates = [
    candidate('watched', 'a'),
    candidate('duplicate', 'b', 'related'),
    candidate('duplicate', 'b', 'subscription', { title: 'Fresh metadata' }),
    candidate('good', 'c'),
    candidate('playlist', 'd', 'related', { type: 'playlist' }),
    { video: { videoId: 'no-title' }, source: 'related' },
    { video: null, source: 'discovery' },
  ]
  const snapshot = structuredClone(candidates)
  const result = rankRecommendations(candidates, { history: [video('watched', 'a')], now })
  assert.deepEqual(result.map(item => item.videoId), ['duplicate', 'good'])
  assert.equal(result[0].title, 'Fresh metadata')
  assert.deepEqual(result[0].recommendationSources, ['related', 'subscription'])
  assert.deepEqual(candidates, snapshot)
})

test('recent interests, subscriptions and fresh uploads outrank unrelated stale discoveries', () => {
  const result = rankRecommendations([
    candidate('old-popular', 'other', 'discovery', { published: now - 90 * 86400000 }),
    candidate('related', 'interest', 'related'),
    candidate('following', 'subscribed', 'subscription', { published: now - 86400000 }),
    candidate('fresh-discovery', 'new', 'discovery', { published: now }),
  ], { history: [video('old-interest', 'interest')], subscriptions: [{ id: 'subscribed' }], now })
  assert.deepEqual(result.map(item => item.videoId), ['following', 'related', 'fresh-discovery', 'old-popular'])
})

test('one channel cannot monopolize the top of the feed; ties and limits remain deterministic', () => {
  const candidates = Array.from({ length: 5 }, (_, index) => candidate(`a${index}`, 'a', 'subscription'))
  candidates.push(candidate('b', 'b', 'related'), candidate('c', 'c', 'related'))
  const result = rankRecommendations(candidates, { now, limit: 4 })
  assert.deepEqual(result.map(item => item.videoId), ['a0', 'b', 'c', 'a1'])
  assert.deepEqual(result, rankRecommendations(candidates, { now, limit: 4 }))
  assert.deepEqual(rankRecommendations(candidates, { now, limit: 0 }), [])
})

test('missing publication dates do not introduce NaN scores or suppress usable videos', () => {
  const result = rankRecommendations([
    candidate('no-date', null),
    candidate('invalid-date', 'a', 'related', { published: NaN }),
    candidate('future', 'b', 'related', { published: now + 86400000 }),
  ], { now })
  assert.deepEqual(result.map(item => item.videoId), ['future', 'no-date', 'invalid-date'])
})

test('seed selection is bounded, recent and diverse, prioritizing subscribed recent interests', () => {
  const history = [video('a1', 'a'), video('a2', 'a'), video('b1', 'b'), video('c1', 'c'), video('d1', 'd')]
  const subscriptions = ['z', 'b', 'x', 'a', 'y', 'v', 'w', 'a'].map(id => ({ id }))
  const seeds = selectRecommendationSeeds(history, subscriptions)
  assert.deepEqual(seeds.videos, ['a1', 'b1', 'c1'])
  assert.deepEqual(seeds.channels, ['b', 'a', 'z', 'x', 'y', 'v'])
  assert.deepEqual(selectRecommendationSeeds(), { videos: [], channels: [] })
})

test('the worker pool never exceeds its concurrency bound and keeps partial successes', async () => {
  let active = 0
  let peak = 0
  const received = []
  const tasks = Array.from({ length: 7 }, (_, index) => async () => {
    active++
    peak = Math.max(peak, active)
    await new Promise(resolve => setImmediate(resolve))
    active--
    if (index === 2) throw new Error('source unavailable')
    return index
  })
  const results = await runRecommendationTasks(tasks, { concurrency: 2, onResult: value => received.push(value) })
  assert.equal(peak, 2)
  assert.equal(results[2].status, 'rejected')
  assert.deepEqual(received.sort((a, b) => a - b), [0, 1, 3, 4, 5, 6])
  assert.equal(results.length, 7)
})

test('navigation cancellation stops queued requests and ignores late results', async () => {
  const controller = new AbortController()
  let started = 0
  let delivered = 0
  const tasks = Array.from({ length: 10 }, () => async () => {
    started++
    controller.abort()
    return []
  })
  await runRecommendationTasks(tasks, { signal: controller.signal, onResult: () => delivered++ })
  assert.equal(started, 1)
  assert.equal(delivered, 0)
})
