use serde::{Serialize, Deserialize}; // Import Deserialize
use tauri::{AppHandle, State, Manager}; // Add Manager for app_handle
use tauri_plugin_store::{StoreCollection, StoreBuilder}; // Use StoreBuilder
use std::path::PathBuf; // For store path

const SETTINGS_FILE: &str = "settings.dat";

// Define structs for the data we want to return
#[derive(Serialize, Clone)]
struct OsInfo {
    os_type: String,
    os_release: String,
    hostname: String,
}

#[derive(Serialize, Clone)]
struct MemoryInfo {
    total_mem: u64, // in KB
    free_mem: u64,  // in KB
}

// Define struct for settings stored
#[derive(Serialize, Deserialize, Debug, Default, Clone)] // Add Deserialize, Debug, Default
struct AppSettings {
    #[serde(default)] // Use default value ("") if missing
    openai_api_key: String,
    #[serde(default)]
    claude_api_key: String,
    #[serde(default)]
    open_router_api_key: String,
    #[serde(default = "default_provider")] // Use default function
    walkthrough_provider: String,
}

// Function to provide default provider value
fn default_provider() -> String {
    "openai".to_string()
}


// Tauri command to get OS information
#[tauri::command]
fn get_os_info() -> Result<OsInfo, String> {
    let os_type = sys_info::os_type().map_err(|e| e.to_string())?;
    let os_release = sys_info::os_release().map_err(|e| e.to_string())?;
    let hostname = sys_info::hostname().map_err(|e| e.to_string())?;
    Ok(OsInfo { os_type, os_release, hostname })
}

// Tauri command to get memory information
#[tauri::command]
fn get_memory_info() -> Result<MemoryInfo, String> {
    let mem_info = sys_info::mem_info().map_err(|e| e.to_string())?;
    Ok(MemoryInfo {
        total_mem: mem_info.total,
        free_mem: mem_info.free,
    })
}

// Tauri command to get settings from store
#[tauri::command]
fn get_settings(app: AppHandle) -> Result<AppSettings, String> {
    let stores = app.state::<StoreCollection<tauri::Wry>>();
    let path = PathBuf::from(SETTINGS_FILE);

    // Lock the store collection to access the specific store
    match stores.get(path) {
        Some(store) => {
            // Attempt to load the settings struct
            match store.get("app_settings") {
                Ok(Some(settings_value)) => {
                    // Deserialize the value into AppSettings
                    serde_json::from_value(settings_value.clone())
                        .map_err(|e| format!("Failed to deserialize settings: {}", e))
                },
                Ok(None) => {
                    // No settings found, return default
                    Ok(AppSettings::default())
                },
                Err(e) => Err(format!("Failed to get settings from store: {}", e)),
            }
        },
        None => Err("Store not found.".to_string()),
    }
}


// Tauri command to save settings to store
#[tauri::command]
fn save_settings(settings: AppSettings, app: AppHandle) -> Result<(), String> {
    let stores = app.state::<StoreCollection<tauri::Wry>>();
    let path = PathBuf::from(SETTINGS_FILE);

    // Lock the store collection to access the specific store
    match stores.get(path) {
        Some(store) => {
            // Serialize the settings struct to a JSON value
            let settings_value = serde_json::to_value(&settings)
                .map_err(|e| format!("Failed to serialize settings: {}", e))?;

            // Save the value to the store
            store.insert("app_settings".to_string(), settings_value)
                .map_err(|e| format!("Failed to insert settings into store: {}", e))?;

            // Persist changes to disk
            store.save().map_err(|e| format!("Failed to save store: {}", e))
        },
        None => Err("Store not found.".to_string()),
    }
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(
        tauri_plugin_store::Builder::default()
            .store(StoreBuilder::new(SETTINGS_FILE.parse().unwrap()).default("app_settings".to_string(), serde_json::to_value(AppSettings::default()).unwrap())) // Initialize with default if needed
            .build()
    )
    .invoke_handler(tauri::generate_handler![
        get_os_info,
        get_memory_info,
        get_settings, // Add new command
        save_settings // Add new command
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
