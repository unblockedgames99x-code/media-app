import { createRouter, createWebHashHistory } from 'vue-router'
const Home = () => import('../views/Home/Home.vue')
const Subscriptions = () => import('../views/Subscriptions/Subscriptions.vue')
const SubscribedChannels = () => import('../views/SubscribedChannels/SubscribedChannels.vue')
const ProfileSettings = () => import('../views/ProfileSettings/ProfileSettings.vue')
const Trending = () => import('../views/Trending/Trending.vue')
const Popular = () => import('../views/Popular/Popular.vue')
const UserPlaylists = () => import('../views/UserPlaylists/UserPlaylists.vue')
const History = () => import('../views/History/History.vue')
const Settings = () => import('../views/Settings/Settings.vue')
const About = () => import('../views/About/About.vue')
const SearchPage = () => import('../views/SearchPage/SearchPage.vue')
const Playlist = () => import('../views/Playlist/Playlist.vue')
const Channel = () => import('../views/Channel/Channel.vue')
const Watch = () => import('../views/Watch/Watch.vue')
const Hashtag = () => import('../views/Hashtag/Hashtag.vue')
const Post = () => import('../views/Post.vue')

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'default',
      meta: {
        title: 'Home'
      },
      component: Home
    },
    {
      path: '/home',
      name: 'home',
      meta: {
        title: 'Home'
      },
      component: Home
    },
    {
      path: '/subscriptions',
      name: 'subscriptions',
      meta: {
        title: 'Subscriptions'
      },
      component: Subscriptions
    },
    {
      path: '/subscribedchannels',
      name: 'subscribedChannels',
      meta: {
        title: 'Channels'
      },
      component: SubscribedChannels
    },
    ...(process.env.SUPPORTS_LOCAL_API
      ? [{
          path: '/trending',
          name: 'trending',
          meta: {
            title: 'Trending'
          },
          component: Trending
        }]
      : []),
    {
      path: '/popular',
      name: 'popular',
      meta: {
        title: 'Most Popular'
      },
      component: Popular
    },
    {
      path: '/userplaylists',
      name: 'userPlaylists',
      meta: {
        title: 'Your Playlists'
      },
      component: UserPlaylists
    },
    {
      path: '/history',
      name: 'history',
      meta: {
        title: 'History'
      },
      component: History
    },
    {
      path: '/settings',
      name: 'settings',
      meta: {
        title: 'Settings'
      },
      component: Settings
    },
    {
      path: '/about',
      name: 'about',
      meta: {
        title: 'About'
      },
      component: About
    },
    {
      path: '/settings/profile',
      name: 'profileSettings',
      meta: {
        title: 'Profile Settings'
      },
      component: ProfileSettings
    },
    {
      path: '/search/:query',
      meta: {
        title: 'Search Results'
      },
      component: SearchPage
    },
    {
      path: '/playlist/:id',
      meta: {
        title: 'Playlist'
      },
      component: Playlist
    },
    {
      path: '/channel/:id/:currentTab?',
      meta: {
        title: 'Channel'
      },
      component: Channel
    },
    {
      path: '/watch/:id',
      meta: {
        title: 'Watch'
      },
      component: Watch
    },
    {
      path: '/hashtag/:hashtag',
      meta: {
        title: 'Hashtag'
      },
      component: Hashtag
    },
    {
      path: '/post/:id',
      meta: {
        title: 'Post',
      },
      component: Post
    }
  ],
  scrollBehavior(to, from, savedPosition) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (savedPosition !== null) {
          resolve(savedPosition)
        } else {
          resolve({ left: 0, top: 0 })
        }
      }, 500)
    })
  }
})

export default router
