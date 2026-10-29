# ROZH Player — architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        UI (TypeScript, no framework)             │
│  shell.ts ── routing, sidebar, top bar, library ingestion        │
│  views/*  ── player · library · streams · history · settings     │
│  styles/*  ── tokens → components → views → overlays             │
└───────────────▲──────────────────────────────┬───────────────────┘
                │ events                        │ commands
┌───────────────┴───────────────┐  ┌────────────▼───────────────────┐
│  player.ts (playback engine)  │  │  native.ts (Tauri bridge)      │
│  · <video> transport          │  │  · asset protocol URLs         │
│  · HLS / DASH adapters        │  │  · remux_file / probe_file     │
│  · subtitle engine            │  │  · tray commands, fullscreen   │
│  · Web Audio EQ               │  └────────────┬───────────────────┘
│  · gestures, keyboard, PiP    │               │
└───────────────┬───────────────┘  ┌────────────▼───────────────────┐
                │                  │  Rust (src-tauri)              │
┌───────────────▼───────────────┐  │  · FFmpeg sidecar fallback     │
│  store.ts                     │  │  · tray menu, window control   │
│  localStorage → settings      │  │  · reveal in folder, probe     │
│  IndexedDB    → library       │  └────────────────────────────────┘
└───────────────────────────────┘
```

## Principles

**No framework.** The UI is hand-written DOM with a tiny `$`/`$$` helper, one
delegated click listener per surface and explicit re-render functions. That keeps
the bundle at ~130 kB gzip for the whole app, and makes the player hot path
(zero garbage per frame) trivial to reason about.

**Tokens first.** `styles/theme.css` defines every colour, radius, blur, motion
curve and layout size as a CSS custom property. Accents, glass density, motion
and TV mode are implemented by flipping attributes on `<html>` — no JavaScript
re-styling, no flash.

**Views are functions.** Each view exports `render(host, ctx)` and rebuilds only
its own subtree. `AppContext` (see `core/context.ts`) hands views the player, the
navigation function and the ingestion helpers, which keeps views free of
circular imports.

**The player owns the element.** One `<video>` element lives for the lifetime of
the app. Stream engines (hls.js / dash.js) are created and destroyed around it;
subtitles, EQ nodes and object URLs are tracked so nothing leaks when files swap.

## Playback pipeline

1. `load(item)` tears down any previous engine, computes the container type from
   the URL and attaches the right engine:
   - `.m3u8` → `hls.js` (native HLS on Safari falls back to `video.src`)
   - `.mpd` → `dash.js`
   - anything else → `video.src`
2. Resume position is resolved *before* metadata arrives and applied in
   `loadedmetadata`, so the first frame is already the right one.
3. On a fatal `error` event the native bridge is asked to remux the file
   (desktop only) before any error UI is shown.
4. Positions are persisted every 5 s, on pause and on `beforeunload`, keyed by
   `name::size` so a re-opened file resumes correctly.

## Subtitles

| Format | Path |
| --- | --- |
| VTT | tracked as-is (`<track>`) |
| SRT | converted to WebVTT in memory (`srtToVtt`), then a blob-track |
| ASS / SSA | rendered by libass via JASSUB onto an overlay canvas |

Text tracks are styled through an injected `video::cue` stylesheet driven by the
subtitle settings; libass handles its own styling from the ASS script.

## Storage

- `localStorage` (`rozh.v1.*`): settings and the resume map — synchronous and tiny.
- `IndexedDB` (`rozh-player` → `state`): the media library, including poster
  frames (~30 kB each). Written through a debounced 350 ms queue.
- Blobs are **not** persisted. Local files are re-attached per session; clicking
  a library card from a previous session asks for the file once and matches it by
  name and size, preserving the resume point.

## Native layer

`src-tauri/src/lib.rs` exposes three commands:

| Command | Purpose |
| --- | --- |
| `remux_file` | Lossless remux into fragmented MP4, then a libx264 transcode fallback |
| `probe_file` | Duration and stream summary parsed from FFmpeg's stderr |
| `reveal_in_folder` | Open the OS file manager at a path |

FFmpeg is shipped as an app resource (`src-tauri/bin/`), fetched by
`scripts/fetch-ffmpeg.mjs`. Without it everything still works; only the exotic
container fallback is unavailable, and the UI says so.

A tray icon offers Play/Pause and Open on desktop, emitting `rozh:command`
events the frontend listens for.

## Accessibility & TV

- Every interactive element is a real `<button>`, focus rings are token-driven
  and 3 px in TV mode.
- Arrow keys seek on desktop but navigate focus when `data-tv="true"`, so a
  remote behaves the way a TV user expects.
- `prefers-reduced-motion` disables the ember particles and animation globally.
