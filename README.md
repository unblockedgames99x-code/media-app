# Your media workspace

An unbranded music and video app that you make your own. The operating system calls the download **Media**; the interface starts without a logo or fixed personal name.

[**Download for Windows, Linux, or Mac**](https://github.com/unblockedgames99x-code/media-app/releases/latest)

## Install

You only need the download for your computer. No coding or developer tools are required.

Windows downloads require Windows 10 or newer; Mac downloads require macOS 13 Ventura or newer, matching the included [Electron runtime's supported platforms](https://github.com/electron/electron/blob/v44.5.1/README.md#platform-support). Linux packages are built on Ubuntu 22.04 with WebKitGTK 4.1.

| Computer | Download |
| --- | --- |
| Windows, most PCs | `Media-…-windows-x64-setup.exe` |
| Linux, Ubuntu / Debian | `Media-…-linux-x64.deb` |
| Linux, portable | `Media-…-linux-x64.AppImage` |
| Mac with an M-series chip | `Media-…-macos-arm64.dmg` |
| Mac with an Intel chip | `Media-…-macos-x64.dmg` |

### Windows

1. Download the Windows **setup.exe** from [Releases](https://github.com/unblockedgames99x-code/media-app/releases/latest).
2. Open it and choose **Install**. It installs for your Windows account.
3. Open **Media** from the Start menu and complete the short setup.

Prefer a portable app? Download **windows-x64-portable.zip**, extract the entire folder, and open **Media.exe**. Keep its `video-engine` folder beside it.

### Linux

On Ubuntu or Debian, download the **.deb**, open it in your software installer, and choose **Install**. Open **Media** from your application menu.

If your software installer does not open downloaded packages, open Terminal and run `sudo apt install ~/Downloads/Media-*-linux-x64.deb` after saving the download in Downloads.

On Ubuntu 24.04 or newer, use the **.deb**. Its installer adds the application-specific permission needed by the video sandbox while preserving your system's security settings.

For the portable version, download the **.AppImage**, open its file **Properties → Permissions**, allow it to run as a program, then double-click it. If your desktop does not offer that setting:

```sh
chmod +x Media-*-linux-x64.AppImage
```

The AppImage needs a desktop with WebKitGTK 4.1, GTK 3, and the usual Electron libraries. The Debian package installs its declared dependencies automatically. If AppImage reports a missing FUSE library, use the Debian package or your distribution's FUSE package; [Tauri's AppImage guide](https://v2.tauri.app/distribute/appimage/) explains the runtime requirements.

### Mac

1. Download the **arm64.dmg** for an M-series Mac, or **x64.dmg** for an Intel Mac.
2. Open it and drag **Media** into **Applications**.
3. Open **Media** from Applications and complete setup.

These community downloads are ad-hoc signed and are not Apple notarized. If macOS blocks the app because it cannot verify the developer, review [Apple's instructions for opening an app you trust](https://support.apple.com/en-us/102445). Windows downloads are currently unsigned as well.

Only successful builds appear in Releases. All four targets must pass packaging and packaged-app startup checks before publication. These checks do not cover every graphics driver, plugin, or desktop environment.

## Make it yours

The first launch opens setup. You can change your choices later in **Settings → Make it yours**.

- Start with Neutral, Linen, Ocean, or Terminal, then edit the details.
- Choose your own optional display name and image, or keep both hidden.
- Customize seven colors, body and heading fonts, text size and weight, and line spacing. Installed font families are supported.
- Use a solid, gradient, or local image background with adjustable angle, opacity, and blur.
- Adjust density, scale, sidebar width and collapse, content width, corners, borders, shadows, and artwork shape or saturation.
- Change motion and tooltips, or hide artwork entirely.
- Choose soft, bright, or digital interface sounds; control their volume and selection, navigation, and notification cues.
- Set music's three-band equalizer, left/right balance, and mono playback.
- Save, import, export, reset, or restart setup. Exported profiles contain your appearance and sound choices, including uploaded images; they exclude libraries, plugins, and secrets.

The Music / Videos switch stays available in both sections. Windows shows both engines inside the same window. Linux and macOS switch between them with one window visible; use **Music** in the video window to return.

Music keeps the plugin marketplace, sources, search, playlists and imports, queue, favorites, lyrics providers, history and statistics, keyboard shortcuts, remote control, MCP, MPD, and its existing preferences. Optional features still need their corresponding plugins. A fresh installation can add providers from **Settings → Plugins → Store**.

Videos keeps search, recommendations, subscriptions and profiles, channels, playlists, history, downloads, captions, SponsorBlock, playback settings, and external-player options. Playback recovery includes bounded requests and a restart option when a video engine stops responding. Service availability and third-party plugins can change independently of this app.

## Updates and your data

Download a newer release from this repository and install it over the previous version. Application updates are manual; music plugin updates remain available in the plugin settings.

Existing CarterMedia data uses the same profile identifier for compatibility. Profiles live in `%APPDATA%/com.cartermedia.app` on Windows, `~/.local/share/com.cartermedia.app` on Linux, and `~/Library/Application Support/com.cartermedia.app` on macOS. Video data is in the profile's `video` subfolder. Uninstalling or replacing the application should be separate from deleting this data.

Downloaded installers start with their own profile. The optional Windows source utility `_scripts/migrate-profile.py` can copy an existing Nuclear and CarterTube/FreeTube library into a new profile without overwriting one that already exists.

## Source, builds, and credits

[Build from source or create releases](docs/BUILDING.md). [Report a problem](https://github.com/unblockedgames99x-code/media-app/issues).

This app combines [Nuclear](https://github.com/nukeop/nuclear) and [FreeTube](https://github.com/FreeTubeApp/FreeTube), with the complete source and modifications in this repository. Original contributor notices, plugin identifiers, and AGPL licenses are retained. See [LICENSE](LICENSE), [the video license](engines/cartertube/LICENSE), and [font licenses](licenses/). The neutral interface does not remove required attribution.

[Upstream Nuclear documentation](docs/UPSTREAM_NUCLEAR.md) is preserved as a reference, separate from this app's installation instructions.
