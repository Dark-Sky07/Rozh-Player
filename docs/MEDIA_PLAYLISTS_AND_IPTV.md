# Favorites, Playlists, and IPTV

The Android TV build adds personal organization without requiring a media-server account. Phone, desktop, and web library interfaces remain unchanged.

## Favorites and personal playlists

- Open **Library** and choose **Favorites** to filter starred media. Use the star control on any library card to add or remove it.
- Choose **Playlists** to create a named playlist, open it, remove entries, or play its entries in order.
- On Android TV, Favorites and Playlists are also destinations in the remote-first navigation rail.
- Playlists and favorite flags are stored with ROZH's local app data. They are not cloud-synced.
- Files opened from a temporary browser session may need to be selected again after the app restarts. Android-indexed files and URL streams retain their platform-supported source URI.

## Import an IPTV M3U playlist

1. Open **Streams** and choose **Import IPTV playlist**.
2. Paste an HTTP(S) M3U/M3U8 URL, or choose a local `.m3u` / `.m3u8` file.
3. Optionally name the playlist, then import. ROZH imports up to 500 valid HTTP(S) channel URLs and retains common `tvg-name`, `group-title`, and `tvg-logo` values.
4. Open **Library → Playlists** to browse the imported channels. Selecting a channel starts it in the normal ROZH player.
5. Optionally provide an XMLTV URL in the import form, or use a quoted `url-tvg`, `x-tvg-url`, or `tvg-url` attribute on `#EXTM3U`. Channel `tvg-id` values are matched to XMLTV channel ids; display names are used as a fallback. Open **Guide** and choose **Refresh guide** to cache current/next programme information on the device.

The importer accepts lists up to 5 MiB and at most 500 channels. It does not execute playlist scripts, access non-HTTP(S) channel schemes, or import media from provider-specific APIs. XMLTV downloads are capped at 20 MiB; the TV guide retains programmes within a seven-day forward window and shows the current and next programme, not catch-up playback. Android TV uses Tauri's native HTTP plugin for remote retrieval. Actual playback still depends on the stream format, provider availability, network, codecs, and device hardware.

This is not a tuner-backed PVR/DVR. Recording requires a supported capture/tuner backend and explicit storage permissions, neither of which is provided by the current app. Third-party add-on code is not executed: ROZH has no secure extension sandbox or permission model, so arbitrary scripts are deliberately not enabled.
