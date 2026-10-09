export const EMBEDDED_COMMAND_CHANNEL = 'cartermedia:command'
export const EMBEDDED_RESULT_CHANNEL = 'cartermedia:result'
export const WORKSPACE_RETURN_CHANNEL = 'cartermedia:return-to-music'
export const WORKSPACE_STATE_CHANNEL = 'cartermedia:workspace-state'

const THEME_KEYS = new Set([
  '--background', '--foreground', '--muted', '--muted-foreground',
  '--card', '--card-foreground', '--primary', '--primary-foreground',
  '--popover', '--popover-foreground', '--input', '--input-foreground',
  '--border', '--border-width', '--radius-sm', '--radius-md', '--radius-lg',
  '--font-family', '--font-family-heading', '--secondary', '--secondary-foreground',
  '--accent', '--accent-foreground', '--ring', '--font-size-base', '--line-height',
  '--font-weight-normal', '--density', '--artwork-radius', '--artwork-saturation',
  '--artwork-visible', '--motion-level', '--tooltips-visible', '--audio-enabled',
  '--audio-bass', '--audio-mid', '--audio-treble', '--audio-balance', '--audio-mono',
  '--sounds-enabled', '--sounds-volume', '--sounds-tone', '--sounds-selection',
  '--sounds-navigation', '--sounds-notification'
])

const NAVIGATION_PATHS = new Set([
  '/', '/home', '/subscriptions', '/subscribedchannels', '/trending', '/popular',
  '/userplaylists', '/history', '/settings', '/about', '/settings/profile'
])

export function navigationVisibility ({ supportsLocalApi, backendPreference, backendFallback, hideTrending, hidePopular, hidePlaylists }) {
  return {
    trending: !supportsLocalApi || !!hideTrending || !(backendFallback || backendPreference === 'local'),
    popular: !!hidePopular || !(backendFallback || backendPreference === 'invidious'),
    playlists: !!hidePlaylists
  }
}

export function navigationStatus (hash, serializedSettings) {
  const candidate = typeof hash === 'string' ? hash.replace(/^#/, '').split(/[?#]/)[0].replace(/\/+$/, '') : ''
  const route = candidate || '/'
  let settings
  try {
    settings = JSON.parse(serializedSettings)
  } catch {}
  return {
    path: route.startsWith('/') && !route.startsWith('//') ? route : '/home',
    hiddenNavigation: {
      trending: settings?.trending === true,
      popular: settings?.popular === true,
      playlists: settings?.playlists === true
    }
  }
}

export function sanitizeNavigationPath (route) {
  if (typeof route !== 'string' || (!NAVIGATION_PATHS.has(route) && !/^\/watch\/[A-Za-z0-9_-]{11}$/.test(route))) {
    throw new Error('Invalid video navigation path')
  }
  return route
}

export function sanitizeThemeVariables (variables) {
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
    throw new Error('Theme variables must be an object')
  }
  const result = {}
  for (const [key, value] of Object.entries(variables)) {
    if (!THEME_KEYS.has(key) || typeof value !== 'string' ||
      value.length === 0 || value.length > 512 ||
      /[;{}<>@]|url\s*\(|expression\s*\(/i.test(value) ||
      Array.from(value).some(character => character.charCodeAt(0) < 32)) {
      throw new Error('Invalid theme variable')
    }
    result[key] = value
  }
  return result
}

export function sanitizeAppearance (appearance) {
  if (!appearance || typeof appearance !== 'object' || Array.isArray(appearance)) {
    throw new Error('Appearance must be an object')
  }
  const result = {}
  for (const [key, value] of Object.entries(appearance)) {
    if (typeof value !== 'string') throw new Error('Invalid appearance value')
    if (key === 'displayName') {
      if (Array.from(value).length > 40 || /[\u0000-\u001f\u007f-\u009f]/.test(value)) throw new Error('Invalid display name')
    } else if (key === 'logoDataUrl' || key === 'backgroundImage') {
      if (value !== '') {
        const payload = value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]*={0,2})$/)?.[2]
        if (value.length > 2800000 || !payload || payload.length % 4 !== 0) throw new Error('Invalid appearance image')
      }
    } else if (key === 'backgroundStyle') {
      if (!['solid', 'gradient', 'image'].includes(value)) throw new Error('Invalid background style')
    } else if (key === 'gradientEnd') {
      if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Invalid gradient color')
    } else if (key === 'gradientAngle' || key === 'imageOpacity' || key === 'blur') {
      const number = Number(value)
      const maximum = key === 'gradientAngle' ? 360 : key === 'imageOpacity' ? 60 : 24
      if (!value.trim() || !Number.isFinite(number) || number < 0 || number > maximum) throw new Error('Invalid appearance number')
    } else {
      throw new Error('Unknown appearance setting')
    }
    result[key] = value
  }
  return result
}
