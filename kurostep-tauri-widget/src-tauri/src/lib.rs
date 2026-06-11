use serde::Serialize;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[derive(Clone, Serialize)]
struct LyricPayload {
    line: String,
    translation: String,
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

    lyrics
        .emit("lyrics:update", LyricPayload { line, translation })
        .map_err(|error| error.to_string())?;

    let is_visible = lyrics.is_visible().map_err(|error| error.to_string())?;

    if visible && !is_visible {
        lyrics.show().map_err(|error| error.to_string())?;
    } else if !visible && is_visible {
        lyrics.hide().map_err(|error| error.to_string())?;
    }

    Ok(())
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
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            set_lyrics_visible,
            set_paw_visible,
            exit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
