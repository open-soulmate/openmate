use serde::Serialize;
use std::process::Command;
use tauri::Manager;

#[derive(Serialize)]
struct SystemInfo {
    os: String,
    arch: String,
    home_dir: String,
}

#[tauri::command]
fn get_system_info() -> SystemInfo {
    SystemInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        home_dir: dirs::home_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
    }
}

#[tauri::command]
fn greet(name: String) -> String {
    format!("Hello, {}! Welcome to OpenMate.", name)
}

#[tauri::command]
fn execute_command(cmd: String) -> Result<String, String> {
    let output = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", &cmd])
            .output()
    } else {
        Command::new("sh")
            .args(["-c", &cmd])
            .output()
    };

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).to_string();
            if out.status.success() {
                Ok(stdout)
            } else {
                Err(format!("{}\n{}", stdout, stderr).trim().to_string())
            }
        }
        Err(e) => Err(format!("Failed to execute command: {}", e)),
    }
}

#[tauri::command]
fn read_local_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file '{}': {}", path, e))
}

#[tauri::command]
fn write_local_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    std::fs::write(&path, &content)
        .map_err(|e| format!("Failed to write file '{}': {}", path, e))
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<String>, String> {
    let entries = std::fs::read_dir(&path)
        .map_err(|e| format!("Failed to read directory '{}': {}", path, e))?;

    let mut result = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let file_name = entry.file_name().to_string_lossy().to_string();
        let file_type = entry.file_type()
            .map_err(|e| format!("Failed to read file type: {}", e))?;
        if file_type.is_dir() {
            result.push(format!("{}/", file_name));
        } else {
            result.push(file_name);
        }
    }
    result.sort();
    Ok(result)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            greet,
            execute_command,
            read_local_file,
            write_local_file,
            list_directory
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
