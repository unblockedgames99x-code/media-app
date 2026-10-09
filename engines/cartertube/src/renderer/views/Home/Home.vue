<template>
  <main class="homePage">
    <section class="homeIntro">
      <div>
        <p class="eyebrow">
          {{ t('CarterTubeHome.Your Daily Mix') }}
        </p>
        <h1>{{ t('CarterTubeHome.Find your next favorite') }}</h1>
        <p class="introDescription">
          {{ t('CarterTubeHome.Personalized locally') }}
        </p>
      </div>
      <button
        class="refreshButton"
        type="button"
        :disabled="isLoading"
        @click="refreshFeed(true)"
      >
        <FontAwesomeIcon :icon="['fas', 'sync']" />
        {{ t('CarterTubeHome.Refresh') }}
      </button>
    </section>

    <div
      class="feedTabs"
      role="group"
      :aria-label="t('CarterTubeHome.Choose your feed')"
    >
      <button
        v-for="tab in tabs"
        :key="tab.value"
        class="feedTab"
        :class="{ active: activeTab === tab.value }"
        type="button"
        :aria-pressed="activeTab === tab.value"
        @click="activeTab = tab.value"
      >
        <FontAwesomeIcon :icon="['fas', tab.icon]" />
        {{ tab.label }}
      </button>
    </div>

    <section
      class="feedSection"
      :aria-busy="isLoading"
    >
      <div class="feedHeading">
        <h2>{{ feedTitle }}</h2>
        <span
          v-if="isLoading"
          class="loadingStatus"
          role="status"
        >{{ t('CarterTubeHome.Finding videos') }}</span>
        <span
          v-else-if="shownResults.length"
          class="feedCount"
        >
          {{ t('CarterTubeHome.Video Count', { count: shownResults.length }) }}
        </span>
      </div>
      <p
        v-if="hasErrors"
        class="sourceNotice"
        role="status"
      >
        {{ t('CarterTubeHome.Some sources unavailable') }}
      </p>
      <FtLoader v-if="isLoading && !shownResults.length" />
      <FtElementList
        v-else-if="shownResults.length"
        :data="shownResults"
        :show-video-with-last-viewed-playlist="activeTab === 'continue'"
      />
      <div
        v-else
        class="emptyFeed"
      >
        <FontAwesomeIcon
          :icon="['fas', 'circle-play']"
          class="emptyIcon"
        />
        <h3>{{ emptyTitle }}</h3>
        <p>{{ emptyDescription }}</p>
        <router-link
          to="/subscriptions"
          class="browseLink"
        >
          {{ t('Subscriptions.Subscriptions') }}
          <FontAwesomeIcon :icon="['fas', 'arrow-right']" />
        </router-link>
      </div>
    </section>
  </main>
</template>

<script setup>
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FtElementList from '../../components/FtElementList/FtElementList.vue'
import FtLoader from '../../components/FtLoader/FtLoader.vue'
import store from '../../store/index'
import { rankRecommendations, runRecommendationTasks, selectRecommendationSeeds } from '../../helpers/recommendations.mjs'
import { fetchRecommendationSource } from '../../helpers/api/recommendations'

const { t } = useI18n()
const activeTab = ref('all')
const candidates = shallowRef([])
const isLoading = ref(false)
const hasErrors = ref(false)
let requestController

const history = computed(() => store.getters.getHistoryCacheSorted || [])
const subscriptions = computed(() => store.getters.getActiveProfile?.subscriptions || [])
const seeds = computed(() => selectRecommendationSeeds(history.value, subscriptions.value))
const preferredBackend = computed(() => store.getters.getBackendPreference)
const recommendationsHidden = computed(() => store.getters.getHideRecommendedVideos)
const instance = computed(() => store.getters.getCurrentInvidiousInstanceUrl)
const authorization = computed(() => store.getters.getCurrentInvidiousInstanceAuthorization)
const region = computed(() => store.getters.getRegion?.toUpperCase() || 'US')

const tabs = computed(() => [
  { value: 'all', label: t('CarterTubeHome.For you'), icon: 'random' },
  { value: 'following', label: t('CarterTubeHome.Following'), icon: 'rss' },
  { value: 'discovery', label: t('CarterTubeHome.Discover'), icon: 'globe' },
  { value: 'continue', label: t('CarterTubeHome.Continue watching'), icon: 'clock' },
])

const feedTitle = computed(() => tabs.value.find(tab => tab.value === activeTab.value).label)
const rankedVideos = computed(() => rankRecommendations(candidates.value.filter(({ video }) =>
  !store.getters.getHideUpcomingPremieres || !video.isUpcoming), {
  history: history.value,
  subscriptions: subscriptions.value,
}))

const shownResults = computed(() => {
  if (activeTab.value === 'continue') {
    return history.value.filter(video => video.watchProgress > 0 && video.lengthSeconds > 0 &&
      video.watchProgress < video.lengthSeconds * 0.95).slice(0, 24)
  }
  if (activeTab.value === 'following') {
    const subscribed = new Set(subscriptions.value.map(channel => channel.id))
    return rankedVideos.value.filter(video => subscribed.has(video.authorId))
  }
  if (activeTab.value === 'discovery') {
    return rankedVideos.value.filter(video => video.recommendationSources.some(source => source !== 'subscription'))
  }
  return rankedVideos.value
})

const emptyTitle = computed(() => {
  if (activeTab.value === 'continue') return t('CarterTubeHome.All caught up')
  if (activeTab.value === 'following') return t('CarterTubeHome.Make yourself at home')
  return t('CarterTubeHome.A fresh start')
})
const emptyDescription = computed(() => {
  if (activeTab.value === 'continue') return t('CarterTubeHome.Resume hint')
  if (activeTab.value === 'following') return t('CarterTubeHome.Following hint')
  if (recommendationsHidden.value) return t('CarterTubeHome.Recommendations hidden')
  return t('CarterTubeHome.Discovery hint')
})

// Watch identities, rather than every watch-progress tick, to avoid refetching.
const contextKey = computed(() => JSON.stringify([
  store.getters.getActiveProfile?._id,
  seeds.value,
  preferredBackend.value,
  store.getters.getBackendFallback,
  instance.value,
  authorization.value,
  region.value,
  store.getters.getShowFamilyFriendlyOnly,
  recommendationsHidden.value,
  store.getters.getHideTrendingVideos,
  store.getters.getHidePopularVideos,
]))

watch(contextKey, () => refreshFeed(), { immediate: true })
onBeforeUnmount(() => requestController?.abort())

async function refreshFeed(refresh = false) {
  requestController?.abort()
  const controller = new AbortController()
  requestController = controller
  isLoading.value = true
  hasErrors.value = false

  const subscriptionIds = new Set(subscriptions.value.map(channel => channel.id))
  candidates.value = Object.entries(store.getters.getVideoCache || {})
    .filter(([channelId]) => subscriptionIds.has(channelId))
    .flatMap(([, entry]) => (entry.videos || []).slice(0, 12).map(video => ({ video, source: 'subscription' })))
    .slice(0, 240)

  const backend = process.env.SUPPORTS_LOCAL_API ? preferredBackend.value : 'invidious'
  const requestOptions = {
    backend,
    instance: instance.value,
    authorization: authorization.value,
    region: region.value,
    safetyMode: store.getters.getShowFamilyFriendlyOnly,
    signal: controller.signal,
    refresh,
  }
  const sourceIds = [
    ...(!recommendationsHidden.value ? seeds.value.videos.map(id => ({ kind: 'related', id })) : []),
    ...seeds.value.channels.map(id => ({ kind: 'subscription', id })),
  ]

  if (!recommendationsHidden.value) {
    if (backend === 'local' && !store.getters.getHideTrendingVideos) {
      sourceIds.push(...['gaming', 'podcasts', 'sports'].map(id => ({ kind: 'discovery', id })))
    } else if (backend === 'invidious' && !store.getters.getHidePopularVideos) {
      sourceIds.push({ kind: 'discovery', id: 'popular' })
    }
  }

  const tasks = sourceIds.map(({ kind, id }) => async () => {
    let videos
    try {
      videos = await fetchRecommendationSource(kind, id, requestOptions)
    } catch (error) {
      controller.signal.throwIfAborted()
      if (!store.getters.getBackendFallback || !process.env.SUPPORTS_LOCAL_API) throw error
      const fallback = backend === 'local' ? 'invidious' : 'local'
      if (kind === 'discovery' && (fallback === 'local' ? store.getters.getHideTrendingVideos : store.getters.getHidePopularVideos)) throw error
      videos = await fetchRecommendationSource(kind, kind === 'discovery' ? (fallback === 'local' ? 'gaming' : 'popular') : id, {
        ...requestOptions,
        backend: fallback,
      })
    }
    return videos.map(video => ({ video, source: kind }))
  })

  try {
    const results = await runRecommendationTasks(tasks, {
      signal: controller.signal,
      onResult: videos => { candidates.value = [...candidates.value, ...videos] },
    })
    if (!controller.signal.aborted) {
      hasErrors.value = results.some(result => result?.status === 'rejected')
    }
  } finally {
    if (!controller.signal.aborted) isLoading.value = false
  }
}
</script>

<style scoped src="./Home.css" />
