use serde::Serialize;
use tauri::{Emitter, Manager};

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
fn set_paw_visible(app: tauri::AppHandle, visible: bool, reload: Option<bool>) -> Result<(), String> {
    let paw = app
        .get_webview_window("paw")
        .ok_or_else(|| "paw window not found".to_string())?;

    let is_visible = paw.is_visible().map_err(|error| error.to_string())?;

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
