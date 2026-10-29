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
    let bin = ffmpeg_path(&app)?;
    let dir = cache_dir(&app)?;
    let stem = file_stem(&path);
    let remuxed = dir.join(format!("{stem}.mp4"));
    let transcoded = dir.join(format!("{stem}.x264.mp4"));

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
    let bin = ffmpeg_path(&app)?;
    let out = tauri::async_runtime::spawn_blocking(move || {
        Command::new(bin)
            .args(["-hide_banner", "-i"])
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

/// Open a file/folder in the OS file manager.
#[tauri::command]
fn reveal_in_folder(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    let target = if p.is_file() {
        p.parent().unwrap_or(p).to_path_buf()
    } else {
        p.to_path_buf()
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
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            remux_file,
            probe_file,
            reveal_in_folder
        ]);

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
    use super::file_stem;

    #[test]
    fn stems_are_sanitised() {
        assert_eq!(file_stem("/movies/My Film (2024).mkv"), "My Film 2024");
        assert_eq!(file_stem("/x/y.mkv"), "y");
        assert_eq!(file_stem(""), "media");
    }
}
