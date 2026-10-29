# Third-party components

ROZH Player's own code is MIT licensed. It builds on these projects:

| Component | Licence | Used for |
| --- | --- | --- |
| [Tauri](https://tauri.app) | Apache-2.0 / MIT | desktop & mobile shell |
| [Vite](https://vite.dev) | MIT | build tooling |
| [hls.js](https://github.com/video-dev/hls.js) | Apache-2.0 | HLS playback |
| [dash.js](https://github.com/Dash-Industry-Forum/dash.js) | BSD-3-Clause | DASH playback |
| [JASSUB](https://github.com/ThaUnknown/jassub) | MIT | libass (ASS/SSA) rendering in WebAssembly |
| [libass](https://github.com/libass/libass) | ISC | subtitle shaping (via JASSUB wasm) |
| [Vazirmatn](https://github.com/rastikerdar/vazirmatn) | OFL-1.1 | Persian/Latin UI font |
| [Lucide](https://lucide.dev) | ISC | icon geometry (redrawn inline) |
| [FFmpeg](https://ffmpeg.org) | LGPL/GPL (per build) | optional native remux/transcode |

Fonts and libass runtime files are redistributed under their own licences —
`public/fonts/OFL-Vazirmatn.txt` contains the full OFL text.

If you redistribute the FFmpeg build fetched by `scripts/fetch-ffmpeg.mjs`,
mind that it is a **GPL** build; ship its licence alongside your installer or
swap in an LGPL build (`--enable-gpl` off) if your distribution requires it.
