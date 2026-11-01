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

The dedicated Android TV target keeps a separate shell and remote-navigation model while the phone and desktop builds retain their own layouts. The TV rail routes to Home, All Media, Video, Music, Streams, Favorites, Playlists, History, and Settings; scan/folder/URL source actions remain grouped separately. The Android TV interface now exposes persistent favorites, editable personal playlists with ordered sequential playback, and an M3U/M3U8 IPTV importer that can fetch a remote list or read a local file, retaining common channel-name, group, and logo metadata. Imported channels use the existing media library and player rather than a parallel, fragile playback path. IPTV import is capped at 500 entries and 5 MiB per list; the TV build uses Tauri's native HTTP plugin. Phone, desktop, and web layouts remain unchanged.

ROZH still does **not** provide Kodi's metadata scraper/database, TV-season/episode model, XMLTV guide, PVR/DVR recording, Kodi add-on runtime/catalog, image viewer, games, profiles, or system power integrations. Those require independent data models, backends, permissions, and security review; the present scope is not full Kodi feature parity.

This implementation uses an original ROZH interface informed by Estuary's couch-first hierarchy. No Kodi source code, skin XML, logos, screenshots, or other branded assets were copied. Kodi's upstream code is GPL-2.0-or-later; incorporating its code or skin files would require a separate license/attribution review and could not silently remain an MIT-only distribution.

## Delivered media-center foundations

1. Dedicated Android TV shell, remote navigation, MediaStore indexing, and SAF folder selection.
2. Persistent favorites and user playlists shared by TV, desktop, phone, and web library views.
3. Sequential playlist playback through the existing player queue, plus M3U/M3U8 channel import and local/remote source handling.
4. Continue-watching, recently added, video, and music shelves backed only by metadata ROZH actually has.

## Remaining major work (not represented as complete)

1. Validate the D-pad, SAF providers, codec support, and installer behavior on physical Android TV devices; sandbox CI cannot replace device testing.
2. Add richer local metadata and image viewing only with explicit schemas and dependable parsers.
3. XMLTV/EPG, PVR/DVR, add-ons, scrapers, profiles, games, and power integrations need separately scoped backend/security work before they can be promised.

## Upstream references reviewed

- [Kodi source repository and project overview](https://github.com/xbmc/xbmc)
- [Kodi license](https://github.com/xbmc/xbmc/blob/master/LICENSE.md)
- [Kodi Android build guide](https://github.com/xbmc/xbmc/blob/master/docs/README.Android.md)
- [Estuary Home.xml](https://github.com/xbmc/xbmc/blob/master/addons/skin.estuary/xml/Home.xml) and [home widget definitions](https://github.com/xbmc/xbmc/blob/master/addons/skin.estuary/xml/Includes_Home.xml)
- [Estuary video navigation](https://github.com/xbmc/xbmc/blob/master/addons/skin.estuary/xml/MyVideoNav.xml), [music navigation](https://github.com/xbmc/xbmc/blob/master/addons/skin.estuary/xml/MyMusicNav.xml), and [file browser](https://github.com/xbmc/xbmc/blob/master/addons/skin.estuary/xml/FileBrowser.xml)
- [Estuary fullscreen video OSD](https://github.com/xbmc/xbmc/blob/master/addons/skin.estuary/xml/VideoOSD.xml), [player controls](https://github.com/xbmc/xbmc/blob/master/addons/skin.estuary/xml/PlayerControls.xml), [media-source dialog](https://github.com/xbmc/xbmc/blob/master/addons/skin.estuary/xml/DialogMediaSource.xml), and [settings](https://github.com/xbmc/xbmc/blob/master/addons/skin.estuary/xml/Settings.xml)
