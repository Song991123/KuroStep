use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::Mutex,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{
    Emitter, LogicalSize, Manager, PhysicalPosition, Position, Size, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

#[derive(Clone, Serialize)]
struct LyricPayload {
    line: String,
    translation: String,
}

#[derive(Serialize)]
struct ClientStatus {
    view: String,
    stage: String,
    authenticated: bool,
    text: String,
    timestamp_ms: u128,
    windows: Vec<WindowStatus>,
    overlaps: Vec<String>,
}

#[derive(Serialize)]
struct WindowStatus {
    label: String,
    visible: bool,
    x: Option<i32>,
    y: Option<i32>,
    width: Option<i32>,
    height: Option<i32>,
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
        normalize_overlay_text(&line)
    };
    let display_translation = if translation.trim() == display_line.trim() {
        "".to_string()
    } else {
        normalize_overlay_text(&translation)
    };
    let lyrics = get_or_create_lyrics_window(&app)?;

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
        let _ = lyrics.set_visible_on_all_workspaces(true);
        lyrics.show().map_err(|error| error.to_string())?;
        restore_window_position(&app, &lyrics, "lyrics", width, height);
        restore_window_position_after_show(app.clone(), "lyrics", width, height);
        refocus_main_window(&app);
    } else if visible {
        restore_window_position(&app, &lyrics, "lyrics", width, height);
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
    let width = (longest * 18.0 + 132.0).clamp(360.0, 1280.0);
    let line_rows = wrapped_overlay_rows(line_units, width).max(1);
    let translation_rows = if translation.trim().is_empty() {
        0
    } else {
        wrapped_overlay_rows(translation_units, width).max(1)
    };
    let height = (42.0
        + f64::from(line_rows) * 31.0
        + if translation_rows > 0 {
            6.0 + f64::from(translation_rows) * 25.0
        } else {
            0.0
        })
    .clamp(76.0, 240.0);
    (width, height)
}

fn wrapped_overlay_rows(units: f64, width: f64) -> u32 {
    if units <= 0.0 {
        return 0;
    }
    let usable_units = ((width - 132.0) / 18.0).max(10.0);
    (units / usable_units).ceil().max(1.0) as u32
}

fn normalize_overlay_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
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
        let _ = paw.set_visible_on_all_workspaces(true);
        paw.show().map_err(|error| error.to_string())?;
        restore_window_position(&app, &paw, "paw", 380.0, 520.0);
        restore_window_position_after_show(app.clone(), "paw", 380.0, 520.0);
        refocus_main_window(&app);
    } else if visible {
        restore_window_position(&app, &paw, "paw", 380.0, 520.0);
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

    WebviewWindowBuilder::new(app, "paw", WebviewUrl::App("index.html#?view=paw&shell=tauri".into()))
        .title("KuroStep Paw Notes")
        .inner_size(380.0, 520.0)
        .min_inner_size(360.0, 440.0)
        .resizable(false)
        .decorations(false)
        .transparent(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible_on_all_workspaces(true)
        .center()
        .shadow(false)
        .devtools(false)
        .visible(false)
        .build()
        .map_err(|error| error.to_string())
}

fn get_or_create_lyrics_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    if let Some(lyrics) = app.get_webview_window("lyrics") {
        return Ok(lyrics);
    }

    WebviewWindowBuilder::new(app, "lyrics", WebviewUrl::App("lyrics.html".into()))
        .title("KuroStep Lyrics")
        .inner_size(360.0, 84.0)
        .min_inner_size(180.0, 58.0)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible_on_all_workspaces(true)
        .position(987.0, 52.0)
        .shadow(false)
        .devtools(false)
        .visible(false)
        .build()
        .map_err(|error| error.to_string())
}

fn get_or_create_main_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    if let Some(main) = app.get_webview_window("main") {
        return Ok(main);
    }

    WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("KuroStep")
        .inner_size(380.0, 720.0)
        .min_inner_size(360.0, 660.0)
        .resizable(false)
        .decorations(false)
        .transparent(false)
        .always_on_top(true)
        .skip_taskbar(false)
        .visible_on_all_workspaces(true)
        .center()
        .shadow(false)
        .devtools(false)
        .visible(true)
        .build()
        .map_err(|error| error.to_string())
}

fn refocus_main_window(app: &tauri::AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
}

fn ensure_main_window_after_launch(app: tauri::AppHandle) {
    thread::spawn(move || {
        for attempt in 0..10 {
            thread::sleep(Duration::from_millis(250));
            let Ok(main) = get_or_create_main_window(&app) else {
                continue;
            };
            let _ = main.set_size(Size::Logical(LogicalSize {
                width: 380.0,
                height: 720.0,
            }));
            restore_window_position(&app, &main, "main", 380.0, 720.0);
            let _ = main.set_visible_on_all_workspaces(true);
            let _ = main.show();
            if attempt == 0 {
                let _ = main.set_focus();
            }
        }
    });
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

fn restore_window_position_after_show(
    app: tauri::AppHandle,
    label: &'static str,
    width: f64,
    height: f64,
) {
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(180));
        if let Some(window) = app.get_webview_window(label) {
            restore_window_position(&app, &window, label, width, height);
            correct_visible_child_window_position(&app, &window, label);
        }
    });
}

fn reconcile_child_window_positions_after_launch(app: tauri::AppHandle) {
    thread::spawn(move || {
        for _ in 0..20 {
            thread::sleep(Duration::from_millis(500));
            if let Some(paw) = app.get_webview_window("paw") {
                if paw.is_visible().unwrap_or(false) {
                    restore_window_position(&app, &paw, "paw", 380.0, 520.0);
                    correct_visible_child_window_position(&app, &paw, "paw");
                }
            }
            if let Some(lyrics) = app.get_webview_window("lyrics") {
                if lyrics.is_visible().unwrap_or(false) {
                    let size = lyrics.outer_size().ok();
                    let width = size.map(|value| value.width as f64).unwrap_or(380.0);
                    let height = size.map(|value| value.height as f64).unwrap_or(84.0);
                    restore_window_position(&app, &lyrics, "lyrics", width, height);
                    correct_visible_child_window_position(&app, &lyrics, "lyrics");
                }
            }
        }
    });
}

fn correct_visible_child_window_position(
    app: &tauri::AppHandle,
    window: &WebviewWindow,
    label: &str,
) {
    if label == "main" || !window.is_visible().unwrap_or(false) {
        return;
    }
    let Some(rect) = current_window_rect(window) else {
        return;
    };
    if !overlaps_visible_peer_rect(app, label, rect, 12) {
        return;
    }

    let Some(monitor) = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten())
    else {
        return;
    };
    let monitor_position = *monitor.position();
    let monitor_size = *monitor.size();
    let gap = 24;
    let candidates = physical_child_candidates(app, label, rect.width, rect.height, gap);
    let mut candidates = candidates;
    candidates.extend(physical_monitor_edge_candidates(
        label,
        &monitor_position,
        &monitor_size,
        rect.width,
        rect.height,
        gap,
    ));

    let Some(next) = candidates
        .iter()
        .map(|position| {
            clamp_physical_position(
                *position,
                &monitor_position,
                &monitor_size,
                rect.width,
                rect.height,
            )
        })
        .find(|position| {
            let candidate = WindowRect {
                x: position.x,
                y: position.y,
                width: rect.width,
                height: rect.height,
            };
            !overlaps_visible_peer_rect(app, label, candidate, 12)
        })
    else {
        return;
    };

    let _ = window.set_position(Position::Physical(next));
    let mut positions = read_window_positions(app);
    positions.insert(
        label.to_string(),
        WindowPoint {
            x: next.x,
            y: next.y,
        },
    );
    let _ = write_window_positions(app, &positions);
}

fn physical_child_candidates(
    app: &tauri::AppHandle,
    label: &str,
    width: i32,
    height: i32,
    gap: i32,
) -> Vec<PhysicalPosition<i32>> {
    let Some(main) = app.get_webview_window("main") else {
        return Vec::new();
    };
    let Some(main_rect) = current_window_rect(&main) else {
        return Vec::new();
    };
    let titlebar_offset = 84;
    match label {
        "paw" => vec![
            PhysicalPosition {
                x: main_rect.x - width - gap,
                y: main_rect.y + titlebar_offset,
            },
            PhysicalPosition {
                x: main_rect.x + main_rect.width + gap,
                y: main_rect.y + titlebar_offset,
            },
            PhysicalPosition {
                x: main_rect.x,
                y: main_rect.y + main_rect.height + gap,
            },
            PhysicalPosition {
                x: main_rect.x,
                y: main_rect.y - height - gap,
            },
        ],
        "lyrics" => vec![
            PhysicalPosition {
                x: main_rect.x,
                y: main_rect.y - height - gap,
            },
            PhysicalPosition {
                x: main_rect.x,
                y: main_rect.y + main_rect.height + gap,
            },
            PhysicalPosition {
                x: main_rect.x - width - gap,
                y: main_rect.y,
            },
            PhysicalPosition {
                x: main_rect.x + main_rect.width + gap,
                y: main_rect.y,
            },
        ],
        _ => Vec::new(),
    }
}

fn physical_monitor_edge_candidates(
    label: &str,
    monitor_position: &PhysicalPosition<i32>,
    monitor_size: &tauri::PhysicalSize<u32>,
    width: i32,
    height: i32,
    gap: i32,
) -> Vec<PhysicalPosition<i32>> {
    let margin = gap.max(24);
    let left = monitor_position.x + margin;
    let top = monitor_position.y + margin;
    let right = monitor_position.x + monitor_size.width as i32 - width - margin;
    let bottom = monitor_position.y + monitor_size.height as i32 - height - margin;
    let center_x = monitor_position.x + ((monitor_size.width as i32 - width) / 2);
    let center_y = monitor_position.y + ((monitor_size.height as i32 - height) / 2);

    match label {
        "lyrics" => vec![
            PhysicalPosition { x: center_x, y: top },
            PhysicalPosition { x: center_x, y: bottom },
            PhysicalPosition { x: left, y: top },
            PhysicalPosition { x: right, y: top },
        ],
        "paw" => vec![
            PhysicalPosition { x: left, y: center_y },
            PhysicalPosition { x: right, y: center_y },
            PhysicalPosition { x: left, y: bottom },
            PhysicalPosition { x: right, y: bottom },
        ],
        _ => Vec::new(),
    }
}

fn clamp_physical_position(
    raw: PhysicalPosition<i32>,
    monitor_position: &PhysicalPosition<i32>,
    monitor_size: &tauri::PhysicalSize<u32>,
    width: i32,
    height: i32,
) -> PhysicalPosition<i32> {
    let min_x = monitor_position.x + 8;
    let min_y = monitor_position.y + 8;
    let max_x = monitor_position.x + monitor_size.width as i32 - width - 8;
    let max_y = monitor_position.y + monitor_size.height as i32 - height - 8;
    PhysicalPosition {
        x: raw.x.clamp(min_x, max_x.max(min_x)),
        y: raw.y.clamp(min_y, max_y.max(min_y)),
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
    let scale_factor = monitor.scale_factor().max(1.0);
    let raw_monitor_position = monitor.position();
    let raw_monitor_size = monitor.size();
    let monitor_position = PhysicalPosition {
        x: (raw_monitor_position.x as f64 / scale_factor).round() as i32,
        y: (raw_monitor_position.y as f64 / scale_factor).round() as i32,
    };
    let monitor_size = tauri::PhysicalSize {
        width: (raw_monitor_size.width as f64 / scale_factor).round().max(1.0) as u32,
        height: (raw_monitor_size.height as f64 / scale_factor).round().max(1.0) as u32,
    };
    let positions = read_window_positions(app);
    let width_px = width;
    let height_px = height;

    if let Some(point) = positions.get(label) {
        let saved_position = clamp_position(
            PhysicalPosition {
                x: point.x,
                y: point.y,
            },
            &monitor_position,
            &monitor_size,
            width_px,
            height_px,
        );
        let safety_gap = 12;
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
            &monitor_position,
            &monitor_size,
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
            &monitor_position,
            &monitor_size,
        ) {
            return Some(position);
        }
    }

    let margin = 24;
    let main_width = 380;
    let main_height = 720;
    let paw_gap = 20;
    let lyrics_gap = 18;
    let main_x = monitor_position.x + monitor_size.width as i32 - main_width - margin;
    let main_y = monitor_position.y + 76;
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
            y: main_y + 42,
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
        &monitor_position,
        &monitor_size,
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

fn overlaps_visible_peer_rect(
    app: &tauri::AppHandle,
    label: &str,
    candidate: WindowRect,
    gap: i32,
) -> bool {
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
    let gap = 20;
    let width = width_px.ceil() as i32;
    let height = height_px.ceil() as i32;
    let titlebar_offset = 42;
    let mut candidates = match label {
        "paw" => vec![
            PhysicalPosition {
                x: main_position.x - width - gap,
                y: main_position.y + titlebar_offset,
            },
            PhysicalPosition {
                x: main_position.x + main_size.width as i32 + gap,
                y: main_position.y + titlebar_offset,
            },
            PhysicalPosition {
                x: main_position.x,
                y: main_position.y + main_size.height as i32 + gap,
            },
            PhysicalPosition {
                x: main_position.x,
                y: main_position.y - height - gap,
            },
        ],
        "lyrics" => vec![
            PhysicalPosition {
                x: main_position.x,
                y: main_position.y - height - gap,
            },
            PhysicalPosition {
                x: main_position.x,
                y: main_position.y + main_size.height as i32 + gap,
            },
            PhysicalPosition {
                x: main_position.x - width - gap,
                y: main_position.y,
            },
            PhysicalPosition {
                x: main_position.x + main_size.width as i32 + gap,
                y: main_position.y,
            },
        ],
        _ => return None,
    };
    candidates.extend(monitor_edge_candidates(
        label,
        monitor_position,
        monitor_size,
        width,
        height,
        gap,
    ));
    let fallback = *candidates.first()?;

    first_non_overlapping_position(
        app,
        label,
        &candidates,
        monitor_position,
        monitor_size,
        width_px,
        height_px,
        gap,
    )
    .or_else(|| {
        Some(clamp_position(
            fallback,
            monitor_position,
            monitor_size,
            width_px,
            height_px,
        ))
    })
}

fn monitor_edge_candidates(
    label: &str,
    monitor_position: &PhysicalPosition<i32>,
    monitor_size: &tauri::PhysicalSize<u32>,
    width: i32,
    height: i32,
    gap: i32,
) -> Vec<PhysicalPosition<i32>> {
    let margin = gap.max(16);
    let left = monitor_position.x + margin;
    let top = monitor_position.y + margin;
    let right = monitor_position.x + monitor_size.width as i32 - width - margin;
    let bottom = monitor_position.y + monitor_size.height as i32 - height - margin;
    let center_x = monitor_position.x + ((monitor_size.width as i32 - width) / 2);
    let center_y = monitor_position.y + ((monitor_size.height as i32 - height) / 2);

    match label {
        "lyrics" => vec![
            PhysicalPosition { x: center_x, y: top },
            PhysicalPosition { x: center_x, y: bottom },
            PhysicalPosition { x: left, y: top },
            PhysicalPosition { x: right, y: top },
        ],
        "paw" => vec![
            PhysicalPosition { x: left, y: center_y },
            PhysicalPosition { x: right, y: center_y },
            PhysicalPosition { x: left, y: bottom },
            PhysicalPosition { x: right, y: bottom },
        ],
        _ => Vec::new(),
    }
}

fn first_non_overlapping_position(
    app: &tauri::AppHandle,
    label: &str,
    candidates: &[PhysicalPosition<i32>],
    monitor_position: &PhysicalPosition<i32>,
    monitor_size: &tauri::PhysicalSize<u32>,
    width_px: f64,
    height_px: f64,
    gap: i32,
) -> Option<PhysicalPosition<i32>> {
    candidates
        .iter()
        .map(|position| {
            clamp_position(
                *position,
                monitor_position,
                monitor_size,
                width_px,
                height_px,
            )
        })
        .find(|position| {
            !overlaps_visible_peer_window(app, label, *position, width_px, height_px, gap)
        })
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
    Ok(directory.join("window-positions-v6.json"))
}

fn client_status_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join("client-status-v1.json"))
}

fn snapshot_windows(app: &tauri::AppHandle) -> Vec<WindowStatus> {
    ["main", "paw", "lyrics"]
        .iter()
        .map(|label| {
            if let Some(window) = app.get_webview_window(label) {
                let visible = window.is_visible().unwrap_or(false);
                let rect = current_window_rect(&window);
                WindowStatus {
                    label: (*label).to_string(),
                    visible,
                    x: rect.map(|value| value.x),
                    y: rect.map(|value| value.y),
                    width: rect.map(|value| value.width),
                    height: rect.map(|value| value.height),
                }
            } else {
                WindowStatus {
                    label: (*label).to_string(),
                    visible: false,
                    x: None,
                    y: None,
                    width: None,
                    height: None,
                }
            }
        })
        .collect()
}

fn visible_window_overlaps(app: &tauri::AppHandle) -> Vec<String> {
    let mut items = Vec::new();
    let labels = ["main", "paw", "lyrics"];
    for (index, left_label) in labels.iter().enumerate() {
        let Some(left) = app.get_webview_window(left_label) else {
            continue;
        };
        if !left.is_visible().unwrap_or(false) {
            continue;
        }
        let Some(left_rect) = current_window_rect(&left) else {
            continue;
        };
        for right_label in labels.iter().skip(index + 1) {
            let Some(right) = app.get_webview_window(right_label) else {
                continue;
            };
            if !right.is_visible().unwrap_or(false) {
                continue;
            }
            let Some(right_rect) = current_window_rect(&right) else {
                continue;
            };
            if rectangles_touch_or_overlap(left_rect, right_rect, 12) {
                items.push(format!("{left_label}:{right_label}"));
            }
        }
    }
    items
}

#[tauri::command]
fn report_client_status(
    app: tauri::AppHandle,
    view: String,
    stage: String,
    authenticated: bool,
    text: String,
) -> Result<(), String> {
    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let status = ClientStatus {
        view,
        stage,
        authenticated,
        text,
        timestamp_ms,
        windows: snapshot_windows(&app),
        overlaps: visible_window_overlaps(&app),
    };
    let path = client_status_path(&app)?;
    let raw = serde_json::to_string_pretty(&status).map_err(|error| error.to_string())?;
    fs::write(path, raw).map_err(|error| error.to_string())
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
            let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
            let app_handle = app.handle().clone();
            if let Ok(main) = get_or_create_main_window(&app_handle) {
                let _ = main.show();
                let _ = main.set_visible_on_all_workspaces(true);
                restore_window_position(&app_handle, &main, "main", 380.0, 720.0);
                let _ = main.set_focus();
            }
            if let Some(paw) = app.get_webview_window("paw") {
                let _ = paw.hide();
            }
            if let Some(lyrics) = app.get_webview_window("lyrics") {
                let _ = lyrics.hide();
            }
            ensure_main_window_after_launch(app_handle.clone());
            reconcile_child_window_positions_after_launch(app_handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_lyrics_visible,
            set_paw_visible,
            sync_paw_lyric_context,
            get_current_lyric_context,
            save_current_window_position,
            report_client_status,
            exit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lyric_overlay_grows_for_long_lines() {
        let (short_width, short_height) = estimate_lyrics_window_size("Green, green", "");
        let (long_width, long_height) = estimate_lyrics_window_size(
            "You should come mess with the team and keep moving all night long",
            "팀이랑 부딪히러 와도 돼, 밤새 계속 움직여도 돼",
        );

        assert!(short_width >= 360.0);
        assert!(short_height >= 76.0);
        assert!(long_width > short_width);
        assert!(long_height > short_height);
    }

    #[test]
    fn lyric_overlay_wraps_extreme_lines_instead_of_clipping() {
        let repeated = "really ".repeat(220);
        let (width, height) = estimate_lyrics_window_size(&repeated, "");

        assert_eq!(width, 1280.0);
        assert!(height > 76.0);
        assert!(height <= 240.0);
    }
}
