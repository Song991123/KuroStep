use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::PathBuf};
use tauri::{
    Emitter, LogicalSize, Manager, PhysicalPosition, Position, Size, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

#[derive(Clone, Serialize)]
struct LyricPayload {
    line: String,
    translation: String,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
struct WindowPoint {
    x: i32,
    y: i32,
}

#[tauri::command]
fn set_lyrics_visible(
    app: tauri::AppHandle,
    visible: bool,
    line: String,
    translation: String,
) -> Result<(), String> {
    let lyrics = app
        .get_webview_window("lyrics")
        .ok_or_else(|| "lyrics window not found".to_string())?;

    let (width, height) = estimate_lyrics_window_size(&line, &translation);

    lyrics
        .emit("lyrics:update", LyricPayload { line, translation })
        .map_err(|error| error.to_string())?;

    lyrics
        .set_size(Size::Logical(LogicalSize { width, height }))
        .map_err(|error| error.to_string())?;

    let is_visible = lyrics.is_visible().map_err(|error| error.to_string())?;

    if visible && !is_visible {
        restore_window_position(&app, &lyrics, "lyrics", width, height);
        lyrics.show().map_err(|error| error.to_string())?;
    } else if !visible && is_visible {
        lyrics.hide().map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn estimate_lyrics_window_size(line: &str, translation: &str) -> (f64, f64) {
    let longest = line.chars().count().max(translation.chars().count()).max(10) as f64;
    let width = (longest * 11.0 + 56.0).clamp(180.0, 720.0);
    let height = if translation.trim().is_empty() { 58.0 } else { 84.0 };
    (width, height)
}

#[tauri::command]
fn set_paw_visible(
    app: tauri::AppHandle,
    visible: bool,
    reload: Option<bool>,
    auth_json: Option<String>,
    clear_auth: Option<bool>,
) -> Result<(), String> {
    let paw = get_or_create_paw_window(&app)?;

    let is_visible = paw.is_visible().map_err(|error| error.to_string())?;

    if clear_auth.unwrap_or(false) {
        paw.eval("window.localStorage.removeItem('kurostep.auth')")
            .map_err(|error| error.to_string())?;
    }

    if let Some(auth_json) = auth_json {
        let auth_literal = serde_json::to_string(&auth_json).map_err(|error| error.to_string())?;
        paw.eval(&format!(
            "window.localStorage.setItem('kurostep.auth', {auth_literal})"
        ))
        .map_err(|error| error.to_string())?;
    }

    if visible && reload.unwrap_or(false) {
        paw.eval("window.location.reload()")
            .map_err(|error| error.to_string())?;
    }

    if visible && !is_visible {
        restore_window_position(&app, &paw, "paw", 380.0, 520.0);
        paw.show().map_err(|error| error.to_string())?;
    } else if !visible && is_visible {
        paw.hide().map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn get_or_create_paw_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    if let Some(paw) = app.get_webview_window("paw") {
        return Ok(paw);
    }

    WebviewWindowBuilder::new(app, "paw", WebviewUrl::App("shell.html?view=paw".into()))
        .title("KuroStep Paw Notes")
        .inner_size(380.0, 520.0)
        .min_inner_size(360.0, 440.0)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .center()
        .shadow(false)
        .visible(false)
        .build()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_current_window_position(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("{label} window not found"))?;
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let mut positions = read_window_positions(&app);
    positions.insert(
        label,
        WindowPoint {
            x: position.x,
            y: position.y,
        },
    );
    write_window_positions(&app, &positions)
}

fn restore_window_position(
    app: &tauri::AppHandle,
    window: &WebviewWindow,
    label: &str,
    width: f64,
    height: f64,
) {
    if let Some(position) = saved_or_default_position(app, window, label, width, height) {
        let _ = window.set_position(Position::Physical(position));
    }
}

fn saved_or_default_position(
    app: &tauri::AppHandle,
    window: &WebviewWindow,
    label: &str,
    width: f64,
    height: f64,
) -> Option<PhysicalPosition<i32>> {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten())?;
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let positions = read_window_positions(app);

    if let Some(point) = positions.get(label) {
        return Some(clamp_position(
            PhysicalPosition {
                x: point.x,
                y: point.y,
            },
            monitor_position,
            monitor_size,
            width,
            height,
        ));
    }

    let margin = 24;
    let main_width = 380;
    let main_x = monitor_position.x + monitor_size.width as i32 - main_width - margin;
    let main_y = monitor_position.y + 76;
    let raw = match label {
        "main" => PhysicalPosition {
            x: main_x,
            y: main_y,
        },
        "paw" => PhysicalPosition {
            x: main_x - 400,
            y: main_y + 42,
        },
        "lyrics" => PhysicalPosition {
            x: main_x,
            y: main_y - height as i32 - 18,
        },
        _ => PhysicalPosition {
            x: monitor_position.x + margin,
            y: monitor_position.y + margin,
        },
    };

    Some(clamp_position(
        raw,
        monitor_position,
        monitor_size,
        width,
        height,
    ))
}

fn clamp_position(
    raw: PhysicalPosition<i32>,
    monitor_position: &PhysicalPosition<i32>,
    monitor_size: &tauri::PhysicalSize<u32>,
    width: f64,
    height: f64,
) -> PhysicalPosition<i32> {
    let min_x = monitor_position.x + 8;
    let min_y = monitor_position.y + 8;
    let max_x = monitor_position.x + monitor_size.width as i32 - width.ceil() as i32 - 8;
    let max_y = monitor_position.y + monitor_size.height as i32 - height.ceil() as i32 - 8;
    PhysicalPosition {
        x: raw.x.clamp(min_x, max_x.max(min_x)),
        y: raw.y.clamp(min_y, max_y.max(min_y)),
    }
}

fn window_positions_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app.path().app_config_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join("window-positions-v2.json"))
}

fn read_window_positions(app: &tauri::AppHandle) -> HashMap<String, WindowPoint> {
    let Ok(path) = window_positions_path(app) else {
        return HashMap::new();
    };
    let Ok(raw) = fs::read_to_string(path) else {
        return HashMap::new();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn write_window_positions(
    app: &tauri::AppHandle,
    positions: &HashMap<String, WindowPoint>,
) -> Result<(), String> {
    let path = window_positions_path(app)?;
    let raw = serde_json::to_string_pretty(positions).map_err(|error| error.to_string())?;
    fs::write(path, raw).map_err(|error| error.to_string())
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(main) = app.get_webview_window("main") {
                restore_window_position(app.handle(), &main, "main", 380.0, 660.0);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_lyrics_visible,
            set_paw_visible,
            save_current_window_position,
            exit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
