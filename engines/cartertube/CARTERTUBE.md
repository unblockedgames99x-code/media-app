# CarterTube

CarterTube is a local, independently modified version of [FreeTube](https://github.com/FreeTubeApp/FreeTube), based on upstream commit `4ee40d5` (0.25.3). FreeTube's AGPL-3.0-or-later license and contributor attribution remain in force. This source folder contains the corresponding modified source; upstream links in About identify the original project.

## Changes

- New CarterTube C/play logo, application identity, desktop icons and dark interface, using the locally bundled Outfit font.
- For you, Following, Discover and Continue watching feeds. Recommendation metadata comes from the selected video backend, using a small number of recent video and channel IDs. Ranking happens locally. Your complete history is never uploaded. Normal hidden-channel, title, premiere and family-safe preferences remain available.
- A two-second rebuffer threshold, smaller retained buffers, and true adaptive quality when Auto is selected. Explicit quality choices remain supported.
- Bounded playback recovery: retry stalled streaming, reload the source once while restoring the playback state, then use the existing error/fallback controls. Recovery stops when the player is disposed or the source changes. A network outage cannot trigger an endless reload loop.
- Bounded SABR redirects, request cancellation cleanup, timed recommendation requests, metadata caching and lazy-loaded application pages.
- The web build caches only static application assets with a fixed entry limit. Media, API, range and authorized requests bypass the worker cache; offline navigation returns a valid page.
- Your original subscriptions, playlists, search, history, downloads, local and Invidious backends, live video, SponsorBlock, captions, picture in picture, theatre/fullscreen, external players, profiles, import/export and preferences use the original FreeTube implementations.
- Both CarterTube and legacy FreeTube URL schemes are accepted for existing browser integrations.

## Windows build

Use Node.js 24 and pnpm with the checked-in lockfile:

```
pnpm install --frozen-lockfile
node node_modules/electron/install.js
pnpm test
pnpm run lint
pnpm run pack
pnpm run package:windows
```

The runnable app is `build/win-unpacked/CarterTube.exe`. Keep that directory together. `_scripts/smoke-cartertube.cjs` checks the production desktop app using a separate QA profile; its report and screenshots are under the ignored `qa` directory. It reads copies of the existing FreeTube library and never writes to the FreeTube profile.

For this machine, the CarterTube desktop shortcut points to the built app. CarterTube uses its own Windows profile. The first copy of your library preserves video preferences, subscriptions and history; the new default presentation uses Dark, an expanded sidebar and the For you landing page. FreeTube itself remains available.

The automatic upstream release banner defaults off because an upstream FreeTube installer would replace this fork. The original check remains available in settings. CarterTube has no separate update service.

## Validation limits

Regression tests cover recovery stages, state matching, cancellation cleanup, recommendation ranking, deduplication and concurrency. Desktop smoke results record what actually ran. These changes address specific freeze paths; they cannot guarantee uninterrupted playback on every GPU, network, live stream or third-party backend. Long-session playback on your hardware is still useful validation.

The packaged Windows build passed navigation through seven application pages and a 390px layout check. A live 1440p video played successfully. A controlled frozen-clock simulation triggered one retry and one reload, resumed near the saved position, and preserved 1440p, English captions, 1.25x speed and 60% volume. No uncaught renderer exceptions occurred in that run. Both desktop and web production bundles compiled. Routine Webpack size warnings remain; the initial desktop JS/CSS bundle fell from approximately 2.86 MiB to 1.40 MiB after route splitting.

## Licenses

See `LICENSE` for FreeTube/CarterTube and `src/renderer/assets/font/Outfit-LICENSE.txt` for Outfit. `_icons/BRANDING.md` records the replacement artwork.
