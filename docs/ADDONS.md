# ROZH source-pack add-ons

ROZH 1.3.0 supports **data-only source packs**. A pack adds named IPTV playlist and optional XMLTV guide URLs to the Streams view. It is not a general executable plugin system.

## Install

1. Open **Settings → Source add-ons**.
2. Select a `.json` source-pack file (maximum 64 KiB).
3. Open **Streams**, select the installed source, review the playlist and EPG URLs, then choose **Import**. ROZH fetches/imports the playlist only after this explicit action.
4. Remove packs at any time from the same Settings section.

Installed packs are stored locally in ROZH's app data. They are not synced, signed, or obtained from an app store/catalog. Import only packs from a source you trust, and review each URL before importing.

## Schema

The accepted schema is `rozh.source-pack/v1`. Unknown fields are ignored. A pack can contain 1–16 sources, each with one playlist URL and an optional XMLTV URL. HTTP(S) is required; embedded credentials are rejected. M3U imports retain existing bounds (5 MiB and 500 channels).

```json
{
  "schema": "rozh.source-pack/v1",
  "id": "example-provider",
  "name": "Example Provider",
  "version": "1.0.0",
  "description": "Example IPTV source pack",
  "sources": [
    {
      "name": "Live channels",
      "playlistUrl": "https://example.org/live.m3u",
      "epgUrl": "https://example.org/guide.xml"
    }
  ]
}
```

Replace example URLs with endpoints you are authorized to access. The pack format does not support executable hooks, custom HTML, JavaScript, native libraries, arbitrary file access, or automatic updates.

## Why data-only

Executing third-party code inside a desktop/TV media player would expose local files, network access, and native commands unless each platform had a strong sandbox and permission broker. The current source-pack runtime executes no pack-provided code. A broader executable extension API needs a separately reviewed sandbox design and is not claimed here.
