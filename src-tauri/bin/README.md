# Native FFmpeg fallback

ROZH Player hands containers the system webview cannot decode (MKV, AVI, TS,
AC3, DTS, exotic codecs) to a bundled FFmpeg binary. The binary is **not** stored
in git — fetch it with:

```bash
node scripts/fetch-ffmpeg.mjs          # picks the right build for your OS
```

That places `ffmpeg` (or `ffmpeg.exe` on Windows) in this folder, which
`tauri.conf.json` ships as an app resource. Without it everything still works;
only the exotic-format fallback is skipped and the player shows a clear message.
