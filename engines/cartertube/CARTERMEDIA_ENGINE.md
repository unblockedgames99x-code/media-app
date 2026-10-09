# Media video engine

This directory contains the complete FreeTube-derived video client used by the combined media workspace. Existing routes, player controls, profiles, subscriptions, playlists, history, local and Invidious backends, downloads, external players, and video settings remain available. The host supplies the music player, plugin system, and shared personalization.

The engine uses an isolated profile selected by the host before video datastores are constructed. Internal `CARTERMEDIA_*` names and the compatibility profile identifier remain stable for existing installations.

## Supervised launch

Installed resource paths are relative to the host's resource directory:

| Platform | Video executable |
| --- | --- |
| Windows | `video-engine/media-video.exe` |
| Linux | `video-engine/media-video` |
| macOS | `video-engine/Media Video.app/Contents/MacOS/media-video` |

The host passes `--user-data-dir=<absolute isolated profile path>` and these environment values:

| Variable | Value |
| --- | --- |
| `CARTERMEDIA_EMBEDDED` | `1` |
| `CARTERMEDIA_HANDSHAKE_FILE` | Unique absolute JSON file path |
| `CARTERMEDIA_CONTROL_TOKEN` | Random per-launch secret |
| `CARTERMEDIA_PARENT_PID` | Native host process ID |
| `CARTERMEDIA_VIDEO_DEBUG_PORT` | Optional loopback debugging port for integration checks |

The primary window starts hidden. After its page and preload controls load, the engine atomically publishes `{ "pid": number, "hwnd": "decimal string", "port": number }`. The host requires the exact spawned process and a valid control port. On Windows it also verifies HWND ownership before native attachment. Native handles remain strings to preserve 64-bit precision; Linux and macOS publish an empty handle.

Windows attaches the frameless video window within the host's Videos section. Linux and macOS use a window handoff: the complete video window appears and the music window hides after the authenticated visibility acknowledgment. The video's Music button or window close pauses video and returns to music. Reopening the application also restores music; stale status responses cannot undo a newer workspace selection. Explicitly opened extra video windows retain their normal native controls and video navigation.

Supervised mode skips standalone protocol registration and the standalone instance lock. When launched from a Linux AppImage, the host filters its own AppImage loader paths from the child environment while preserving unrelated library paths.

## Authenticated controls

Controls bind only to `127.0.0.1` on an automatically assigned port. Every request requires `Authorization: Bearer <launch secret>`. Browser-origin requests, unknown commands, invalid routes, and oversized bodies are rejected. Ordinary request bodies are limited to 16 KB; appearance uploads are limited to 6 MB. Headers and incoming requests have a three-second timeout. Native control requests have a two-second deadline, and renderer commands have a 750 ms acknowledgment deadline.

| Method and path | Body and behavior |
| --- | --- |
| `GET /status` | Returns process ID, playback and fullscreen state, playback position, title, route, hidden navigation preferences, and `workspaceReturnRevision`. |
| `POST /pause` | Pauses media in all controlled video windows and exits HTML fullscreen. |
| `POST /visibility` | `{ "visible": true, "revision": 1 }`; older revisions are ignored; hiding pauses media and exits fullscreen. |
| `POST /navigate` | `{ "path": "/home" }`; accepts established navigation routes and valid video IDs. |
| `POST /theme` | `{ "variables": { "--background": "..." } }`; accepts the shared color, typography, layout, audio, and interface sound tokens. External CSS resources are rejected. |
| `POST /appearance` | `{ "appearance": { "displayName": "My library", "backgroundStyle": "solid" } }`; applies optional identity and wallpaper settings. |
| `POST /shutdown` | Acknowledges, then follows Electron's normal quit flow. |

Appearance accepts only `displayName`, `logoDataUrl`, `backgroundImage`, `backgroundStyle`, `gradientEnd`, `gradientAngle`, `imageOpacity`, and `blur`. Names are limited to 40 characters. Images must be PNG, JPEG, or WebP base64 data URLs of at most 2.8 million characters each; empty strings clear images. Background styles are solid, gradient, or image; gradient colors are six-digit hex values. Angles range from 0 to 360, image opacity from 0 to 60, and blur from 0 to 24. The host and engine validate these values independently.

Theme and appearance are retained in the engine's main process and reapplied after renderer reloads and to new controlled video windows. User identity is optional; required upstream attribution and licenses remain available. The Windows embedded sidebar is supplied by the host. Portable and extra video windows retain their own sidebar.

## Playback and lifecycle

The engine checks that its host still exists and quits normally when the host exits. The host requests graceful shutdown before its process cleanup fallback. A continuous visible renderer failure has a bounded recovery deadline. Settings that require a restart quit normally; Retry starts a supervised replacement process.

Windows embedded fullscreen keeps the native child attachment and synchronizes the host's fullscreen state. Portable and extra windows retain native fullscreen behavior. Navigation visibility continues to respect video distraction preferences and backend availability.

Optional audio processing applies bass, mid, treble, stereo position, and mono downmix with headroom for boosts. Disabling it restores flat stereo at unity output. Detached media graphs suspend and can safely reconnect to the same element. Unsupported WebAudio environments and streams without a safe CORS/source configuration continue ordinary media playback without these effects.

## Building and checking

Use the root [build guide](../../docs/BUILDING.md) and `pnpm media:build` on the target platform. The entire unpacked Electron runtime must accompany the executable, including `resources/app.asar` and its platform libraries. macOS packaging preserves the nested app's framework symlinks.

Run `pnpm test` here for playback recovery, request deadlines, recommendations, cache policy, authenticated controls, appearance validation, and audio graph checks. Native integration checks live in `packages/player/src-tauri/src/video_engine.rs`. Local Windows checks do not substitute for running and verifying Linux/macOS builds on their respective hosts.

Exclude local `node_modules` junctions, `dist`, `build`, and QA profiles from source archives. The packaged application does not depend on local dependency junctions.

The video client remains licensed under AGPL-3.0-or-later; upstream attribution and all font licenses are retained.
