//! ROZH Player — native shell.
//!
//! The UI is a Tauri webview running the same bundle as the web build. This
//! crate adds the abilities a browser cannot offer:
//!   * native file dialogs and asset-protocol playback of arbitrary paths
//!   * an FFmpeg fallback for containers/codecs the system webview refuses
//!     (MKV, AVI, TS, AC3, DTS …), remuxed losslessly when possible
//!   * a tray icon with quick transport actions
//!   * a macOS close-to-tray behaviour so playback survives window closing

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::hash::{Hash, Hasher};

#[derive(Default)]
struct InitialOpenFiles(Mutex<Vec<String>>);

#[tauri::command]
fn take_initial_open_files(state: tauri::State<'_, InitialOpenFiles>) -> Vec<String> {
    state
        .0
        .lock()
        .map(|mut files| std::mem::take(&mut *files))
        .unwrap_or_default()
}

const MEDIA_EXTENSIONS: &[&str] = &[
    "mp4", "m4v", "mov", "mkv", "avi", "webm", "wmv", "flv", "ts", "m2ts", "mpg", "mpeg",
    "3gp", "ogv", "mp3", "m4a", "m4b", "aac", "flac", "wav", "ogg", "oga", "opus", "wma",
    "aif", "aiff", "ape", "alac", "m3u8",
];

fn validate_local_media_path(raw: &str) -> Result<PathBuf, String> {
    if raw.is_empty() || raw.len() > 4096 || raw.starts_with('-') || raw.contains('\0') {
        return Err("invalid media path".into());
    }
    let path = Path::new(raw)
        .canonicalize()
        .map_err(|_| "media file is not accessible".to_string())?;
    let metadata = path.metadata().map_err(|_| "media file is not accessible".to_string())?;
    if !metadata.is_file() {
        return Err("media path is not a regular file".into());
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| "unsupported media file".to_string())?;
    if !MEDIA_EXTENSIONS.contains(&extension.as_str()) {
        return Err("unsupported media file".into());
    }
    Ok(path)
}

fn normalize_media_path(raw: &str, cwd: &Path) -> Option<String> {
    let raw = raw.trim().trim_matches('"');
    if raw.is_empty() || raw.starts_with('-') || raw.len() > 4096 {
        return None;
    }
    let raw_path = PathBuf::from(raw);
    let path = if raw_path.is_absolute() { raw_path } else { cwd.join(raw_path) };
    let canonical = validate_local_media_path(&path.to_string_lossy()).ok()?;
    Some(canonical.to_string_lossy().into_owned())
}

fn validate_android_update_url(raw: &str) -> Result<(), String> {
    const PREFIX: &str = "https://github.com/Dark-Sky07/Rozh-Player/releases/download/";
    let rest = raw.strip_prefix(PREFIX).ok_or_else(|| "update URL is not an official ROZH release".to_string())?;
    if rest.len() > 256 || rest.chars().any(|c| matches!(c, '?' | '#' | '%' | '@' | '\\')) {
        return Err("invalid update URL".into());
    }
    let (tag, filename) = rest.split_once('/').ok_or_else(|| "invalid update URL".to_string())?;
    if filename.contains('/') || !tag.starts_with('v') {
        return Err("invalid update URL".into());
    }
    let version = &tag[1..];
    let parts: Vec<&str> = version.split('.').collect();
    if parts.len() != 3 || parts.iter().any(|part| part.is_empty() || !part.bytes().all(|b| b.is_ascii_digit())) {
        return Err("invalid release version".into());
    }
    if filename != format!("ROZH-Player-{version}.apk") && filename != format!("ROZH-Player-TV-{version}.apk") {
        return Err("update asset is not an official ROZH APK".into());
    }
    Ok(())
}

fn validate_android_media_uri(uri: &str, mime: &str) -> Result<(), String> {
    let lower = uri.to_ascii_lowercase();
    if uri.len() > 8192
        || uri.bytes().any(|byte| byte.is_ascii_control() || byte.is_ascii_whitespace())
        || !(lower.starts_with("content://") || lower.starts_with("file://"))
    {
        return Err("invalid local media URI".into());
    }
    let valid_mime = matches!(mime, "video/*" | "audio/*")
        || mime.split_once('/').is_some_and(|(major, minor)| {
            matches!(major, "video" | "audio")
                && !minor.is_empty()
                && minor.bytes().all(|b| {
                    b.is_ascii_alphanumeric() || matches!(b, b'!' | b'#' | b'$' | b'&' | b'^' | b'_' | b'.' | b'+' | b'-' | b'*')
                })
        });
    if !valid_mime || mime.len() > 128 {
        return Err("invalid media type".into());
    }
    Ok(())
}

fn source_hash(path: &Path) -> u64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    path.hash(&mut hasher);
    hasher.finish()
}

fn media_paths_from_args<I, S>(args: I, cwd: &Path) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut paths = Vec::new();
    for arg in args {
        if let Some(path) = normalize_media_path(arg.as_ref(), cwd) {
            if !paths.contains(&path) {
                paths.push(path);
            }
        }
    }
    paths
}

#[cfg(desktop)]
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
#[cfg(desktop)]
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager};

/// Where the bundled FFmpeg lives. `src-tauri/bin/ffmpeg[.exe]` is copied into
/// the app resources at build time (see `bundle.resources` in tauri.conf.json).
fn ffmpeg_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let exe = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(dir) = app.path().resource_dir() {
        candidates.push(dir.join("bin").join(exe));
        candidates.push(dir.join(exe));
    }
    // dev runs execute from src-tauri/target/debug
    if let Ok(dir) = std::env::current_dir() {
        candidates.push(dir.join("bin").join(exe));
        candidates.push(dir.join("src-tauri").join("bin").join(exe));
    }

    candidates
        .into_iter()
        .find(|p| p.is_file())
        .ok_or_else(|| "ffmpeg sidecar not found — see docs/BUILD.md".to_string())
}

fn cache_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("remux");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn file_stem(path: &str) -> String {
    let raw = Path::new(path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "media".into());
    let cleaned: String = raw
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { ' ' })
        .take(48)
        .collect();
    let trimmed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    if trimmed.is_empty() {
        "media".into()
    } else {
        trimmed
    }
}

fn size_of(path: &Path) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

/// Run ffmpeg with a fixed argument list; returns Ok when a playable file exists.
fn run_ffmpeg(bin: &Path, input: &str, output: &Path, args: &[&str]) -> Result<(), String> {
    if output.is_file() {
        let _ = std::fs::remove_file(output);
    }
    let status = Command::new(bin)
        .arg("-hide_banner")
        .arg("-protocol_whitelist")
        .arg("file,crypto,data")
        .arg("-loglevel")
        .arg("error")
        .arg("-y")
        .arg("-i")
        .arg(input)
        .args(args)
        .arg(output)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|e| format!("failed to launch ffmpeg: {e}"))?;

    if status.success() && size_of(output) > 1024 {
        Ok(())
    } else {
        Err(format!("ffmpeg exited with {status}"))
    }
}

/// Make any local file playable by the webview.
///
/// 1. Try a **lossless remux** into MP4 (H.264/VP9/AV1 + AAC/Opus).
/// 2. Fall back to a **hardware-friendly transcode** (H.264 + AAC) when the
///    source codecs are not supported by the platform decoder.
#[tauri::command]
async fn remux_file(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let path = validate_local_media_path(&path)?.to_string_lossy().into_owned();
    let bin = ffmpeg_path(&app)?;
    let dir = cache_dir(&app)?;
    let stem = file_stem(&path);
    let source_id = source_hash(Path::new(&path));
    let remuxed = dir.join(format!("{stem}-{source_id:016x}.mp4"));
    let transcoded = dir.join(format!("{stem}-{source_id:016x}.x264.mp4"));

    // ---- pass 1: copy the video stream, normalise audio to AAC -----------
    let first = {
        let bin = bin.clone();
        let input = path.clone();
        let out = remuxed.clone();
        tauri::async_runtime::spawn_blocking(move || {
            run_ffmpeg(
                &bin,
                &input,
                &out,
                &[
                    "-map",
                    "0:v:0?",
                    "-map",
                    "0:a:0?",
                    "-c:v",
                    "copy",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "192k",
                    "-movflags",
                    "+faststart",
                    "-f",
                    "mp4",
                ],
            )
            .map(|_| out.to_string_lossy().to_string())
        })
        .await
    };

    if let Ok(Ok(playable)) = first {
        return Ok(playable);
    }

    // ---- pass 2: full transcode — slower, plays anything FFmpeg decodes --
    let _ = app.emit("rozh:transcoding", &path);
    let second = {
        let bin = bin.clone();
        let input = path.clone();
        let out = transcoded.clone();
        tauri::async_runtime::spawn_blocking(move || {
            run_ffmpeg(
                &bin,
                &input,
                &out,
                &[
                    "-map",
                    "0:v:0?",
                    "-map",
                    "0:a:0?",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "veryfast",
                    "-crf",
                    "22",
                    "-pix_fmt",
                    "yuv420p",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "192k",
                    "-movflags",
                    "+faststart",
                    "-f",
                    "mp4",
                ],
            )
            .map(|_| out.to_string_lossy().to_string())
        })
        .await
    };

    match second {
        Ok(Ok(playable)) => Ok(playable),
        Ok(Err(e)) => Err(e),
        Err(e) => Err(e.to_string()),
    }
}

/// Probe a file using FFmpeg's own metadata output.
#[tauri::command]
async fn probe_file(app: tauri::AppHandle, path: String) -> Result<serde_json::Value, String> {
    let path = validate_local_media_path(&path)?.to_string_lossy().into_owned();
    let bin = ffmpeg_path(&app)?;
    let out = tauri::async_runtime::spawn_blocking(move || {
        Command::new(bin)
            .args(["-hide_banner", "-protocol_whitelist", "file,crypto,data", "-i"])
            .arg(&path)
            .output()
            .map(|o| String::from_utf8_lossy(&o.stderr).to_string())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    let mut video = String::new();
    let mut audio = String::new();
    let mut duration = 0f64;
    for line in out.lines() {
        if line.contains("Duration:") {
            if let Some(rest) = line.split("Duration:").nth(1) {
                let t = rest.trim().split(',').next().unwrap_or("").trim();
                let parts: Vec<&str> = t.split(':').collect();
                if parts.len() == 3 {
                    duration = parts[0].parse::<f64>().unwrap_or(0.0) * 3600.0
                        + parts[1].parse::<f64>().unwrap_or(0.0) * 60.0
                        + parts[2].parse::<f64>().unwrap_or(0.0);
                }
            }
        }
        if line.contains("Video:") && video.is_empty() {
            video = line.trim().to_string();
        }
        if line.contains("Audio:") && audio.is_empty() {
            audio = line.trim().to_string();
        }
    }
    Ok(serde_json::json!({ "duration": duration, "video": video, "audio": audio }))
}

/* ------------------------------------------------------------------ */
/* Android: device media index                                         */
/* ------------------------------------------------------------------ */
/*
 * The phone and TV builds have to show everything that is already on the
 * device, and they have to do it on every launch. The Android side of that is
 * a MediaStore query plus the Storage Access Framework, which only exists in
 * Java — so `MediaBridge.java` (injected by scripts/patch-android-native.mjs)
 * does the talking and this module is the mailbox between it and the webview:
 *
 *     JS  ──invoke──▶  command.json   ──polled by MediaBridge──▶  MediaStore
 *     JS  ◀──state.json──────────────  MediaBridge writes  ◀────── SAF / permissions
 *
 * A file mailbox instead of JNI keeps the Rust side free of the JavaVM, class
 * loaders and thread attachment rules — and it keeps working on every Android
 * version from 7 to 16 without a single unsafe block.
 */

use std::sync::atomic::{AtomicU32, Ordering};

static MEDIA_TOKEN: AtomicU32 = AtomicU32::new(0);

/// A fresh mailbox id for every command.
///
/// Java ignores a command whose token equals the last one it handled, so the id
/// only has to be unique — but it must also be *newer* than anything a previous
/// run left on disk, otherwise the first commands after a relaunch are dropped.
/// Wall-clock milliseconds + a counter gives that for free.
fn next_token() -> u32 {
    let ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u32)
        .unwrap_or(0);
    // Android's JSONObject.optInt reads this value as a signed 32-bit number.
    // Keep it positive so the request id round-trips through Java and JS.
    (MEDIA_TOKEN.fetch_add(1, Ordering::SeqCst).wrapping_add(ms) & 0x7fff_ffff).max(1)
}

const MEDIA_DIR: &str = "rozh-media";

#[allow(unused_variables)]
fn media_candidates(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    if let Ok(dir) = app.path().app_cache_dir() {
        out.push(dir.join(MEDIA_DIR));
    }
    // `app_cache_dir` comes from the Java context; keep the well-known layouts
    // as a fallback so a resolver change cannot break the bridge. The Java side
    // can also fall back to its files dir, so both are probed.
    let id = app.config().identifier.replace('-', "_");
    for base in [
        format!("/data/user/0/{id}/cache"),
        format!("/data/data/{id}/cache"),
        format!("/data/user/0/{id}/files"),
        format!("/data/data/{id}/files"),
    ] {
        out.push(PathBuf::from(format!("{base}/{MEDIA_DIR}")));
    }
    out
}

/// Directory the injected Java bridge is actually using.
#[allow(unused_variables)]
fn media_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let candidates = media_candidates(app);
    for dir in &candidates {
        if dir.join("hello.json").is_file() || dir.join("state.json").is_file() {
            return Ok(dir.clone());
        }
    }
    let first = candidates.first().cloned().ok_or("no cache directory")?;
    let _ = std::fs::create_dir_all(&first);
    Ok(first)
}

#[allow(unused_variables)]
fn read_media_state(app: &tauri::AppHandle) -> serde_json::Value {
    let Ok(dir) = media_dir(app) else {
        return serde_json::json!({ "state": "error", "message": "no cache directory" });
    };
    match std::fs::read_to_string(dir.join("state.json")) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_else(|_| {
            serde_json::json!({ "state": "error", "message": "state file is not valid json" })
        }),
        Err(_) => serde_json::json!({ "state": "starting" }),
    }
}

#[allow(unused_variables)]
fn send_media_command(app: &tauri::AppHandle, cmd: &str, audio: bool) -> Result<serde_json::Value, String> {
    let dir = media_dir(app)?;
    let token = next_token();
    let state = serde_json::json!({
        "state": if cmd == "pick" { "picking" } else { "starting" },
        "count": 0,
        "requestToken": token,
        "ts": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0),
    });
    // Do not return the previous launch's `ready` snapshot as the result of a
    // new request. Publish the request id before the command so the UI can
    // distinguish this scan from stale mailbox state.
    std::fs::write(
        dir.join("state.json"),
        serde_json::to_vec(&state).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let payload = serde_json::json!({ "cmd": cmd, "token": token, "audio": audio });
    std::fs::write(
        dir.join("command.json"),
        serde_json::to_vec(&payload).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(state)
}

/// Kick a full device scan (MediaStore video + optional audio).
///
/// Returns the current state immediately; the caller polls `android_media_status`
/// until it reports `ready`, `denied` or `error`.
#[tauri::command]
fn android_media_scan(app: tauri::AppHandle, audio: Option<bool>) -> Result<serde_json::Value, String> {
    send_media_command(&app, "scan", audio.unwrap_or(true))
}

/// Read-only poll — no command is sent, so a running scan is never restarted.
#[tauri::command]
fn android_media_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    Ok(read_media_state(&app))
}

/// Ask the system for a folder (SAF tree) and index everything inside it.
#[tauri::command]
fn android_media_pick_folder(app: tauri::AppHandle, audio: Option<bool>) -> Result<serde_json::Value, String> {
    send_media_command(&app, "pick", audio.unwrap_or(true))
}

/// Android: hand a media URI to the device's own player.
#[tauri::command]
fn android_open_external(app: tauri::AppHandle, uri: String, mime: String) -> Result<(), String> {
    validate_android_media_uri(&uri, &mime)?;
    let dir = media_dir(&app)?;
    let token = next_token();
    let payload = serde_json::json!({ "cmd": "play", "token": token, "uri": uri, "mime": mime });
    std::fs::write(
        dir.join("command.json"),
        serde_json::to_vec(&payload).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

/// Port of the loopback media server started by `MediaBridge.java` (0 = none).
#[tauri::command]
fn android_media_server(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let Ok(dir) = media_dir(&app) else {
        return Ok(serde_json::json!({ "port": 0 }));
    };
    match std::fs::read_to_string(dir.join("server.json")) {
        Ok(raw) => {
            let parsed: serde_json::Value =
                serde_json::from_str(&raw).unwrap_or_else(|_| serde_json::json!({ "port": 0 }));
            let port = parsed.get("port").and_then(|p| p.as_u64()).filter(|p| (1..=65535).contains(p)).unwrap_or(0);
            let token = parsed.get("token").and_then(|v| v.as_str()).filter(|s| s.len() == 43 && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')).unwrap_or("");
            Ok(serde_json::json!({ "port": port, "token": token }))
        }
        Err(_) => Ok(serde_json::json!({ "port": 0, "token": "" })),
    }
}

/// Read the download/install progress the Java bridge wrote for the APK update.
#[tauri::command]
fn android_update_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let Ok(dir) = media_dir(&app) else {
        return Ok(serde_json::json!({ "state": "idle" }));
    };
    match std::fs::read_to_string(dir.join("update.json")) {
        Ok(raw) => Ok(serde_json::from_str(&raw)
            .unwrap_or_else(|_| serde_json::json!({ "state": "idle" }))),
        Err(_) => Ok(serde_json::json!({ "state": "idle" })),
    }
}

/// Download an APK through the system download manager and open the installer.
#[tauri::command]
fn android_update_install(app: tauri::AppHandle, url: String) -> Result<serde_json::Value, String> {
    validate_android_update_url(&url)?;
    let dir = media_dir(&app)?;
    let token = next_token();
    let payload = serde_json::json!({ "cmd": "install", "token": token, "url": url });
    std::fs::write(
        dir.join("command.json"),
        serde_json::to_vec(&payload).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    // give the bridge a moment to pick the command up so the caller sees the
    // first real status instead of a stale one
    std::thread::sleep(std::time::Duration::from_millis(120));
    android_update_status(app)
}

/// Open a file/folder in the OS file manager.
#[tauri::command]
fn reveal_in_folder(path: String) -> Result<(), String> {
    if path.is_empty() || path.len() > 4096 || path.contains('\0') {
        return Err("invalid path".into());
    }
    let p = Path::new(&path).canonicalize().map_err(|_| "path is not accessible".to_string())?;
    let target = if p.is_file() {
        p.parent().unwrap_or(&p).to_path_buf()
    } else if p.is_dir() {
        p
    } else {
        return Err("path is not a file or directory".into());
    };

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let startup_cwd = std::env::current_dir().unwrap_or_default();
    let startup_open_files = media_paths_from_args(
        std::env::args_os().skip(1).map(|arg| arg.to_string_lossy().into_owned()),
        &startup_cwd,
    );

    let mut builder = tauri::Builder::default();
    // Must be the first plugin: Explorer may invoke ROZH again for every file,
    // and this forwards those paths to the already-running window.
    #[cfg(target_os = "windows")]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let paths = media_paths_from_args(argv.iter().skip(1), Path::new(&cwd));
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            if !paths.is_empty() {
                if let Err(error) = app.emit("rozh:open-files", paths) {
                    eprintln!("[rozh] could not forward Explorer media paths: {error}");
                }
            }
        }));
    }

    builder = builder
        .manage(InitialOpenFiles(Mutex::new(startup_open_files)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            remux_file,
            probe_file,
            reveal_in_folder,
            android_media_scan,
            android_media_status,
            android_media_pick_folder,
            android_open_external,
            android_media_server,
            android_update_status,
            android_update_install,
            take_initial_open_files
        ]);

    // The updater only exists on desktop: Android updates itself through the
    // package installer (see MediaBridge), not through Tauri's updater.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder = builder.setup(|app| {
        // ---- tray: quick transport for the desktop build ----------------
        #[cfg(desktop)]
        {
            let show = MenuItem::with_id(app, "show", "Show ROZH Player", true, None::<&str>)?;
            let play = MenuItem::with_id(app, "play", "Play / Pause", true, None::<&str>)?;
            let open = MenuItem::with_id(app, "open", "Open file…", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&show, &sep, &play, &open, &sep, &quit])?;

            let mut tray = TrayIconBuilder::with_id("rozh-tray")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("ROZH Player");

            if let Some(icon) = app.default_window_icon().cloned() {
                tray = tray.icon(icon);
            }

            tray.on_menu_event(|app, event| match event.id().as_ref() {
                "quit" => app.exit(0),
                "show" => {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.unminimize();
                        let _ = w.set_focus();
                    }
                }
                "play" => {
                    let _ = app.emit("rozh:command", "toggle");
                }
                "open" => {
                    let _ = app.emit("rozh:command", "open");
                }
                _ => {}
            })
            .on_tray_icon_event(|tray, event| {
                if let tauri::tray::TrayIconEvent::DoubleClick { .. } = event {
                    let app = tray.app_handle();
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.unminimize();
                        let _ = w.set_focus();
                    }
                }
            })
            .build(app)?;
        }

        Ok(())
    });

    builder
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // On macOS the app keeps running in the tray/dock after the
                // window closes, so playback state survives.
                #[cfg(target_os = "macos")]
                {
                    api.prevent_close();
                    let _ = _window.hide();
                }
                #[cfg(not(target_os = "macos"))]
                {
                    let _ = api;
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running ROZH Player");
}

#[cfg(test)]
mod tests {
    use super::{file_stem, next_token, validate_android_media_uri, validate_android_update_url};

    #[test]
    fn stems_are_sanitised() {
        assert_eq!(file_stem("/movies/My Film (2024).mkv"), "My Film 2024");
        assert_eq!(file_stem("/x/y.mkv"), "y");
        assert_eq!(file_stem(""), "media");
    }

    #[test]
    fn android_mailbox_tokens_round_trip_as_positive_java_ints() {
        for _ in 0..16 {
            let token = next_token();
            assert!(token > 0);
            assert!(token <= i32::MAX as u32);
        }
    }

    #[test]
    fn android_media_handoff_only_accepts_local_media_uris() {
        assert!(validate_android_media_uri("content://media/external/video/1", "video/mp4").is_ok());
        assert!(validate_android_media_uri("file:///storage/emulated/0/movie.mkv", "video/*").is_ok());
        assert!(validate_android_media_uri("https://example.com/movie.mp4", "video/mp4").is_err());
        assert!(validate_android_media_uri("content://media/video/1\r\nX: y", "video/mp4").is_err());
        assert!(validate_android_media_uri("content://media/video/1", "text/html").is_err());
    }

    #[test]
    fn android_updates_only_accept_exact_official_release_assets() {
        assert!(validate_android_update_url("https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.2.3/ROZH-Player-1.2.3.apk").is_ok());
        assert!(validate_android_update_url("https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.2.3/ROZH-Player-TV-1.2.3.apk").is_ok());
        assert!(validate_android_update_url("http://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.2.3/ROZH-Player-1.2.3.apk").is_err());
        assert!(validate_android_update_url("https://example.com/ROZH-Player-1.2.3.apk").is_err());
        assert!(validate_android_update_url("https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.2.3/ROZH-Player-1.2.3.apk?mirror=evil").is_err());
    }
}
