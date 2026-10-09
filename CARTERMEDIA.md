# Compatibility and migration

This repository now provides an unbranded, user-customizable media workspace. Start with [the current README](README.md) for downloads, first-launch setup, and simple Windows, Linux, and macOS installation instructions. See [the build guide](docs/BUILDING.md) for source builds.

Earlier local builds were called CarterMedia, combining Nuclear music with the CarterTube/FreeTube video client. Their saved data remains compatible. Internal package names and the profile identifier `com.cartermedia.app` remain to preserve libraries, plugins, and settings; the personal interface name and image are optional.

## Existing Windows libraries

The optional `_scripts/migrate-profile.py` utility makes a first-run copy of installed Nuclear settings, plugins, themes, playlists, queue, favorites, and an online SQLite backup of listening history. It also copies the CarterTube video library, falling back to FreeTube if needed. It does not overwrite an existing combined-app profile. Original profiles remain separate; later changes do not synchronize automatically.

Run it from this repository before the first launch if you want that starting copy:

```powershell
python _scripts/migrate-profile.py
```

Normal GitHub installers start with the combined app's own saved profile. Existing CarterMedia profiles are reused automatically. Personalization import/export contains appearance and sound settings rather than the music and video libraries.

## Links and updates

The existing `cartermedia://watch/VIDEO_ID` handler remains an internal compatibility scheme. Video IDs must contain exactly 11 valid characters. Existing FreeTube and CarterTube handlers are separate. You can also paste video URLs into video search.

Application updates are installed manually from [this repository's Releases](https://github.com/unblockedgames99x-code/media-app/releases/latest). Music plugin updates and the plugin marketplace remain available. The original upstream application updater is disabled so it cannot replace the combined app.

## Credits

Music derives from [Nuclear](https://github.com/nukeop/nuclear), originally checked out at commit `5f3b29784a1a22324aac324a14782d61328f468a`. Videos derives from the modified CarterTube/FreeTube 0.25.3 source under `engines/cartertube`. All AGPL licenses, contributor notices, and font licenses remain in the source and distributed packages. Required attribution remains available independently of the user's interface choices.
