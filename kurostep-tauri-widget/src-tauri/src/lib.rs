use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::PathBuf, sync::Mutex};
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

#[derive(Clone, Copy)]
struct WindowRect {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

#[derive(Default)]
struct LyricContextState {
    current: Mutex<String>,
}

const DEPLOYED_WIDGET_URL: &str = "https://song991123.github.io/KuroStep/";
const CONTENT_CACHE_VERSION: &str = "20260713-v042";

#[tauri::command]
fn set_lyrics_visible(
    app: tauri::AppHandle,
    state: tauri::State<LyricContextState>,
    visible: bool,
    line: String,
    translation: String,
    context_json: Option<String>,
) -> Result<(), String> {
    let display_line = if line.trim().is_empty() {
        "가사 발자국을 기다리는 중이다냥.".to_string()
    } else {
        line
    };
    let display_translation = if translation.trim() == display_line.trim() {
        "".to_string()
    } else {
        translation
    };
    let lyrics = app
        .get_webview_window("lyrics")
        .ok_or_else(|| "lyrics window not found".to_string())?;

    let (width, height) = estimate_lyrics_window_size(&display_line, &display_translation);

    lyrics
        .emit(
            "lyrics:update",
            LyricPayload {
                line: display_line,
                translation: display_translation,
            },
        )
        .map_err(|error| error.to_string())?;

    lyrics
        .set_size(Size::Logical(LogicalSize { width, height }))
        .map_err(|error| error.to_string())?;

    let is_visible = lyrics.is_visible().map_err(|error| error.to_string())?;

    if visible && !is_visible {
        restore_window_position(&app, &lyrics, "lyrics", width, height);
        lyrics.show().map_err(|error| error.to_string())?;
        refocus_main_window(&app);
    } else if !visible && is_visible {
        lyrics.hide().map_err(|error| error.to_string())?;
    }

    if let Some(context_json) = context_json {
        sync_paw_context(&app, &state, context_json)?;
    }

    Ok(())
}

fn estimate_lyrics_window_size(line: &str, translation: &str) -> (f64, f64) {
    let line_units = visual_units(line).max(10.0);
    let translation_units = visual_units(translation);
    let longest = line_units.max(translation_units);
    let width = (longest * 15.5 + 88.0).clamp(280.0, 1480.0);
    let height = if translation.trim().is_empty() {
        62.0
    } else {
        92.0
    };
    (width, height)
}

fn visual_units(value: &str) -> f64 {
    value
        .chars()
        .map(|character| if character.is_ascii() { 0.78 } else { 1.12 })
        .sum()
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
        refocus_main_window(&app);
    } else if !visible && is_visible {
        paw.hide().map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn sync_paw_lyric_context(
    app: tauri::AppHandle,
    state: tauri::State<LyricContextState>,
    context_json: String,
) -> Result<(), String> {
    sync_paw_context(&app, &state, context_json)
}

fn sync_paw_context(
    app: &tauri::AppHandle,
    state: &tauri::State<LyricContextState>,
    context_json: String,
) -> Result<(), String> {
    *state.current.lock().map_err(|error| error.to_string())? = context_json.clone();

    if let Some(paw) = app.get_webview_window("paw") {
        let _ = paw.emit("paw:lyric-context", context_json.clone());
        let _ = paw.eval(&paw_lyric_context_script(&context_json));
    }

    Ok(())
}

fn paw_lyric_context_script(context_json: &str) -> String {
    let context_literal =
        serde_json::to_string(context_json).unwrap_or_else(|_| "\"{}\"".to_string());
    format!(
        r##"(() => {{
  const contextJson = {context_literal};
  window.__KUROSTEP_LATEST_LYRIC_CONTEXT__ = contextJson;
  const message = {{
    source: "kurostep-shell",
    type: "current_lyric_context",
    contextJson,
  }};
  const frame = document.querySelector("#shell-frame");
  if (frame?.contentWindow) {{
    frame.contentWindow.postMessage(message, "*");
  }} else {{
    window.postMessage(message, "*");
  }}
  window.dispatchEvent(new CustomEvent("kurostep:lyric-context", {{ detail: contextJson }}));
}})();"##
    )
}

#[tauri::command]
fn get_current_lyric_context(state: tauri::State<LyricContextState>) -> Result<String, String> {
    state
        .current
        .lock()
        .map(|context| context.clone())
        .map_err(|error| error.to_string())
}

fn get_or_create_paw_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    if let Some(paw) = app.get_webview_window("paw") {
        return Ok(paw);
    }

    let paw_url: tauri::Url = format!(
        "{DEPLOYED_WIDGET_URL}?view=paw&shell=tauri&v={CONTENT_CACHE_VERSION}"
    )
    .parse::<tauri::Url>()
    .map_err(|error| error.to_string())?;

    WebviewWindowBuilder::new(app, "paw", WebviewUrl::External(paw_url))
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

fn refocus_main_window(app: &tauri::AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
}

#[tauri::command]
fn save_current_window_position(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("{label} window not found"))?;
    if label != "main" && !window.is_visible().map_err(|error| error.to_string())? {
        return Ok(());
    }
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
    let monitor = app
        .get_webview_window("main")
        .and_then(|main| main.current_monitor().ok().flatten())
        .or_else(|| window.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())?;
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let scale_factor = monitor.scale_factor();
    let positions = read_window_positions(app);
    let width_px = width * scale_factor;
    let height_px = height * scale_factor;

    if let Some(point) = positions.get(label) {
        let saved_position = clamp_position(
            PhysicalPosition {
                x: point.x,
                y: point.y,
            },
            monitor_position,
            monitor_size,
            width_px,
            height_px,
        );
        let safety_gap = (12.0 * scale_factor).round() as i32;
        if label == "main"
            || !overlaps_visible_peer_window(
                app,
                label,
                saved_position,
                width_px,
                height_px,
                safety_gap,
            )
        {
            return Some(saved_position);
        }

        if let Some(position) = child_position_from_main(
            app,
            label,
            width_px,
            height_px,
            monitor_position,
            monitor_size,
        ) {
            return Some(position);
        }
    }

    if label != "main" {
        if let Some(position) = child_position_from_main(
            app,
            label,
            width_px,
            height_px,
            monitor_position,
            monitor_size,
        ) {
            return Some(position);
        }
    }

    let margin = (24.0 * scale_factor).round() as i32;
    let main_width = (380.0 * scale_factor).round() as i32;
    let main_height = (720.0 * scale_factor).round() as i32;
    let paw_gap = (20.0 * scale_factor).round() as i32;
    let lyrics_gap = (18.0 * scale_factor).round() as i32;
    let main_x = monitor_position.x + monitor_size.width as i32 - main_width - margin;
    let main_y = monitor_position.y + (76.0 * scale_factor).round() as i32;
    let lyrics_y_above = main_y - height_px.ceil() as i32 - lyrics_gap;
    let lyrics_y_below = main_y + main_height + lyrics_gap;
    let lyrics_y = if lyrics_y_above >= monitor_position.y + margin {
        lyrics_y_above
    } else {
        lyrics_y_below
    };
    let raw = match label {
        "main" => PhysicalPosition {
            x: main_x,
            y: main_y,
        },
        "paw" => PhysicalPosition {
            x: main_x - main_width - paw_gap,
            y: main_y + (42.0 * scale_factor).round() as i32,
        },
        "lyrics" => PhysicalPosition {
            x: main_x,
            y: lyrics_y,
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
        width_px,
        height_px,
    ))
}

fn overlaps_visible_peer_window(
    app: &tauri::AppHandle,
    label: &str,
    position: PhysicalPosition<i32>,
    width: f64,
    height: f64,
    gap: i32,
) -> bool {
    let candidate = WindowRect {
        x: position.x,
        y: position.y,
        width: width.ceil() as i32,
        height: height.ceil() as i32,
    };

    ["main", "paw", "lyrics"]
        .iter()
        .filter(|peer_label| **peer_label != label)
        .filter_map(|peer_label| app.get_webview_window(peer_label))
        .filter(|peer| peer.is_visible().unwrap_or(false))
        .filter_map(|peer| current_window_rect(&peer))
        .any(|peer_rect| rectangles_touch_or_overlap(candidate, peer_rect, gap))
}

fn current_window_rect(window: &WebviewWindow) -> Option<WindowRect> {
    let position = window.outer_position().ok()?;
    let size = window.outer_size().ok()?;
    Some(WindowRect {
        x: position.x,
        y: position.y,
        width: size.width as i32,
        height: size.height as i32,
    })
}

fn rectangles_touch_or_overlap(a: WindowRect, b: WindowRect, gap: i32) -> bool {
    let a_right = a.x + a.width;
    let a_bottom = a.y + a.height;
    let b_right = b.x + b.width;
    let b_bottom = b.y + b.height;

    a.x < b_right + gap && a_right + gap > b.x && a.y < b_bottom + gap && a_bottom + gap > b.y
}

fn child_position_from_main(
    app: &tauri::AppHandle,
    label: &str,
    width_px: f64,
    height_px: f64,
    monitor_position: &PhysicalPosition<i32>,
    monitor_size: &tauri::PhysicalSize<u32>,
) -> Option<PhysicalPosition<i32>> {
    let main = app.get_webview_window("main")?;
    let main_position = main.outer_position().ok()?;
    let main_size = main.outer_size().ok()?;
    let scale_factor = main.scale_factor().unwrap_or(1.0);
    let gap = (20.0 * scale_factor).round() as i32;
    let raw = match label {
        "paw" => PhysicalPosition {
            x: main_position.x - width_px.ceil() as i32 - gap,
            y: main_position.y + (42.0 * scale_factor).round() as i32,
        },
        "lyrics" => {
            let above_y = main_position.y - height_px.ceil() as i32 - gap;
            let below_y = main_position.y + main_size.height as i32 + gap;
            PhysicalPosition {
                x: main_position.x,
                y: if above_y >= monitor_position.y + gap {
                    above_y
                } else {
                    below_y
                },
            }
        }
        _ => return None,
    };

    Some(clamp_position(
        raw,
        monitor_position,
        monitor_size,
        width_px,
        height_px,
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
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join("window-positions-v5.json"))
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
        .manage(LyricContextState::default())
        .setup(|app| {
            if let Some(main) = app.get_webview_window("main") {
                restore_window_position(app.handle(), &main, "main", 380.0, 720.0);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_lyrics_visible,
            set_paw_visible,
            sync_paw_lyric_context,
            get_current_lyric_context,
            save_current_window_position,
            exit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
