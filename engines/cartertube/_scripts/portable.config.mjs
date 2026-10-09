import originalConfiguration from './ebuilder.config.mjs'

const platform = process.env.MEDIA_BUILD_PLATFORM
const architecture = process.env.MEDIA_BUILD_ARCH
if (!['windows', 'linux', 'macos'].includes(platform) || !['x64', 'arm64'].includes(architecture)) {
  throw new Error('Use the repository root media:build command to package the video engine.')
}

export default {
  ...originalConfiguration,
  productName: 'Media Video',
  executableName: 'media-video',
  directories: { output: `./build/portable/${platform}-${architecture}` },
  protocols: [],
  publish: null,
  mac: {
    ...originalConfiguration.mac,
    identity: '-',
    hardenedRuntime: true,
    entitlements: '_scripts/entitlements.portable.mac.plist',
    entitlementsInherit: '_scripts/entitlements.portable.mac.plist',
    extendInfo: {
      ...originalConfiguration.mac.extendInfo,
      CFBundleURLTypes: [],
      CFBundleURLSchemes: [],
    },
  },
}
