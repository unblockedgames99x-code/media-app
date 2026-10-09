# Build and release

Downloaded releases need no build tools. This guide is for people changing the source.

## Prerequisites

Install Node.js 24, pnpm 12, and Rust stable. Follow the [Tauri system prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system.

- Windows: Visual Studio C++ Build Tools, Windows SDK, and WebView2 Runtime.
- macOS: macOS 13 or newer and Xcode Command Line Tools. Build on the CPU architecture you intend to distribute.
- Linux: a desktop distribution with WebKitGTK 4.1, GTK 3, and the usual Electron runtime libraries. CI uses Ubuntu 22.04 x64.

On Ubuntu 22.04, install the native build dependencies:

```sh
sudo apt update
sudo apt install build-essential curl libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libgtk-3-0 libnss3 libxss1 libxtst6 libatspi2.0-0 libsecret-1-0 libasound2 libgbm1 libfuse2 gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-libav
```

## Build on your computer

```sh
git clone https://github.com/unblockedgames99x-code/media-app.git
cd media-app
pnpm install --frozen-lockfile
cd engines/cartertube
pnpm install --frozen-lockfile
node node_modules/electron/install.js
cd ../..
pnpm media:build
```

The same commands work in Windows PowerShell, macOS Terminal, and Linux shells after installing their prerequisites. The last command builds both media engines and creates the platform's installers in `build/releases/`:

- Windows x64: per-user setup installer and complete portable ZIP.
- Linux x64: AppImage and Debian package.
- macOS arm64 or x64: disk image containing the application bundle.

All packages include the complete Electron video runtime, the Tauri music application, licenses, and this repository's README. Keep the whole portable folder together. `SHA256SUMS.txt` is generated from the finished downloads.

`pnpm media:build --plan` prints the selected platform, architecture, resource locations, and target without building. `--skip-engine` reuses an already packaged video runtime. `--no-bundle` creates the executable without an installer. Build on the matching Windows or Linux architecture; macOS also accepts an explicitly installed Rust target with `--arch x64 --target x86_64-apple-darwin` or `--arch arm64 --target aarch64-apple-darwin`.

## GitHub builds

The **Build desktop downloads** workflow can be run from the repository's Actions tab. It builds Windows x64, Linux x64, macOS Apple Silicon, and macOS Intel on their corresponding runners. A successful manual run provides downloadable artifacts on that run.

To prepare a future version, run `pnpm media:prepare X.Y.Z`, review the version changes and changelog, commit the intended source, and push the matching `vX.Y.Z` tag. The preparation command updates version metadata without creating commits or tags. The workflow checks that the tag matches the app version and publishes downloads only after all four platform builds and packaging checks succeed. It uses GitHub's built-in repository token; no personal access token or upstream distribution credentials are required.

The inherited `release:prepare` command belongs to Nuclear's original `player@…` release flow. Use `media:prepare` and `v…` tags for this combined app.

The inherited Nuclear deployment, package registry, and distribution workflows live in `.github/upstream-workflows/` as inactive reference files. They cannot publish to Nuclear's repositories or close this repository's issues.

## Verification and platform limits

Windows supports native video embedding. macOS and Linux switch between the music window and the video window while keeping one visible; the video window has a Music button to return. Both run the complete video engine rather than a website wrapper.

The workflow checks video contracts, native integration contracts, resource paths, executable permissions, application archives, and release file checksums. These are build checks. They do not certify every plugin, graphics driver, or desktop environment. Runtime verification on macOS and Linux must be recorded separately from compilation.

The included macOS packages use ad-hoc signatures and are not notarized. Public distribution with a verified publisher requires your own Apple Developer identity and notarization configuration; these credentials are intentionally absent. Windows packages are currently unsigned. See [Apple's app-opening guidance](https://support.apple.com/en-us/102445) for the operating system's publisher checks.

Application updates are manual so the original upstream updater cannot replace this combined application. Plugin updates continue to use their existing plugin providers.

## Source layout and licenses

The music player and plugin SDK remain under `packages/`; the complete video client is under `engines/cartertube/`. Internal package names and the existing `com.cartermedia.app` profile identifier remain for saved-data and plugin compatibility. They are not a required personal display name.

The music source derives from [Nuclear](https://github.com/nukeop/nuclear), and the video source from [FreeTube](https://github.com/FreeTubeApp/FreeTube) with the playback and integration changes in this repository. AGPL licenses and contributor notices are retained. See [LICENSE](../LICENSE), [the video license](../engines/cartertube/LICENSE), and [font notices](../licenses/).
