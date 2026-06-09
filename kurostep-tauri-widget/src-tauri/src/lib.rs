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

    if visible {
        lyrics.show().map_err(|error| error.to_string())?;
    } else {
        lyrics.hide().map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![set_lyrics_visible])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
