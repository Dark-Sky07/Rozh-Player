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

## Desktop recording and metadata

- On Windows/macOS/Linux native builds, choose **Record stream** for a live HTTP(S) IPTV feed, or **Schedule recording** for the next programme in Guide. Both save to `.mkv` with FFmpeg `-c copy`: audio/video are not decoded or re-encoded, preserving the incoming streams bit-for-bit where the container accepts them.
- EPG schedules persist across ROZH restarts and are restored when the app opens. ROZH must be running and the computer awake at the programme time; closing the app or suspending the computer stops capture. One FFmpeg recording can run at a time, and overlapping schedules are rejected.
- EPG scheduling requires a valid XMLTV feed. This is still not a tuner integration: broadcast hardware inputs need platform-specific device APIs and permissions. Web, phone, and Android TV recording are not provided.
- Use the magnifier on a library item to search TVmaze for series or Apple Search for movies. The selected title, year, synopsis, genres, rating/artwork (where supplied) are stored locally. Results require internet and are limited to those catalogs.
- Desktop codec fallback is quality-first: direct playback and lossless stream-copy remux are tried first. Conversion to H.264/AAC is offered only after playback still fails and only after confirmation; it can change quality, and the source is never overwritten. Declining conversion preserves the original but may leave playback unavailable on a device lacking that decoder.

Data-only JSON source packs are supported for playlist/EPG URLs; they are imported only after user selection and execute no pack-provided code. A general executable add-on system remains disabled until a platform-wide sandbox and permission broker can be security-reviewed. Tuner integration remains future work because it depends on physical capture hardware and OS-specific APIs.
