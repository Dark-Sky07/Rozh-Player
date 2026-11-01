# Android TV Media Center: Kodi Review and ROZH Plan

This document records the TV-facing architecture and interaction patterns reviewed from the upstream Kodi repository. It is a product/design study, not a claim that ROZH Player is feature-equivalent to Kodi.

## What Kodi is made of

Kodi is not just a skin. The upstream project is a native C++/CMake media-center application with separate video, music, filesystem, input, settings, profiles, PVR, add-on, and platform layers. Its Android build has its own NDK/SDK toolchain. The default Estuary skin is an XML-driven interface coupled to Kodi's window manager, media database, skin condition system, action dispatch, add-on system, and player APIs; copying the XML alone would not make those functions work in ROZH.

The Estuary TV interaction model is a useful reference:

- A persistent, directional home menu switches among media destinations; the focused destination exposes context-aware content widgets.
- Video and TV libraries separate continue/in-progress, recently added, unwatched, genres, studios, and sets. Music exposes recently played/added, unplayed, random, and most-played collections.
- The file browser and media-source dialogs are first-class flows, rather than a generic desktop file input placed on a television screen.
- Playback has a dedicated fullscreen OSD for transport, stream selection, subtitles, bookmarks, and video/audio settings. Settings, add-ons, PVR/EPG, games, pictures, profiles, favourites, and power actions are other full subsystems, not just home-screen links.

## ROZH implementation boundary

The dedicated Android TV target keeps a separate shell and remote-navigation model while the phone and desktop builds remain unchanged. Its new vertical rail routes to Home, All Media, Video, Music, Streams, History, and Settings, with scan/folder/URL source actions grouped separately. The current implementation uses ROZH's media library, Android MediaStore/SAF bridge, stream handling, player controls, subtitle and playback settings, history, and existing native/web media layers. It does **not** currently provide Kodi's scraper/database, TV-season/episode metadata model, PVR/DVR/EPG, Kodi add-on runtime/catalog, image viewer, games, or system power integrations. Those must be built as real features before they can appear as working destinations.

This implementation uses an original ROZH interface informed by Estuary's couch-first hierarchy. No Kodi source code, skin XML, logos, screenshots, or other branded assets were copied. Kodi's upstream code is GPL-2.0-or-later; incorporating its code or skin files would require a separate license/attribution review and could not silently remain an MIT-only distribution.

## Iteration order

1. Make the TV shell and every source/library action reliably usable with a D-pad and Android TV's native document providers.
2. Build a real source browser and robust local/network library flows (including recoverable permission and scan states).
3. Expand TV-specific library organization and continue-watching/music shelves using data ROZH can actually read; do not fabricate scraped metadata.
4. Add genuinely supported playback, subtitle, audio-track, queue, and remote-control operations to the TV OSD.
5. Only then consider major Kodi subsystems such as scrapers, PVR/EPG, plug-ins, or image viewing, each with a defined backend and compatibility/security plan.

## Upstream references reviewed

- [Kodi source repository and project overview](https://github.com/xbmc/xbmc)
- [Kodi license](https://github.com/xbmc/xbmc/blob/master/LICENSE.md)
- [Kodi Android build guide](https://github.com/xbmc/xbmc/blob/master/docs/README.Android.md)
- [Estuary Home.xml](https://github.com/xbmc/xbmc/blob/master/addons/skin.estuary/xml/Home.xml) and [home widget definitions](https://github.com/xbmc/xbmc/blob/master/addons/skin.estuary/xml/Includes_Home.xml)
- [Estuary video navigation](https://github.com/xbmc/xbmc/blob/master/addons/skin.estuary/xml/MyVideoNav.xml), [music navigation](https://github.com/xbmc/xbmc/blob/master/addons/skin.estuary/xml/MyMusicNav.xml), and [file browser](https://github.com/xbmc/xbmc/blob/master/addons/skin.estuary/xml/FileBrowser.xml)
- [Estuary fullscreen video OSD](https://github.com/xbmc/xbmc/blob/master/addons/skin.estuary/xml/VideoOSD.xml), [player controls](https://github.com/xbmc/xbmc/blob/master/addons/skin.estuary/xml/PlayerControls.xml), [media-source dialog](https://github.com/xbmc/xbmc/blob/master/addons/skin.estuary/xml/DialogMediaSource.xml), and [settings](https://github.com/xbmc/xbmc/blob/master/addons/skin.estuary/xml/Settings.xml)
