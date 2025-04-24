use serde::{Serialize, Deserialize}; // Import Deserialize
use tauri::{AppHandle, Manager};
use tauri_plugin_store::{StoreBuilder, Error as StoreError}; // Import StoreError
use std::io::ErrorKind; // Import ErrorKind for specific error checking

// Remove unused PathBuf import

const SETTINGS_FILE: &str = "settings.store"; // Use .store extension convention

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

// Define types matching frontend
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
enum ApiProvider {
    #[serde(rename = "openai")]
    OpenAI,
    #[serde(rename = "claude")]
    Claude,
    #[serde(rename = "openrouter")]
    OpenRouter,
}

// Default implementation for ApiProvider
impl Default for ApiProvider {
    fn default() -> Self {
        ApiProvider::OpenAI
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
enum Theme {
    #[serde(rename = "light")]
    Light,
    #[serde(rename = "dark")]
    Dark,
    #[serde(rename = "system")]
    System,
}

// Default implementation for Theme
impl Default for Theme {
    fn default() -> Self {
        Theme::System
    }
}


// Define struct for settings stored - matching frontend structure
#[derive(Serialize, Deserialize, Debug, Default, Clone)]
struct AppSettings {
    #[serde(default)]
    openai_api_key: String,
    #[serde(default)]
    claude_api_key: String,
    #[serde(default)]
    open_router_api_key: String,

    // Models
    #[serde(default)] // Defaults to ApiProvider::default() -> OpenAI
    walkthrough_provider: ApiProvider,
    #[serde(default = "default_walkthrough_model")] // Use default function
    walkthrough_model: String,
    #[serde(default)] // Defaults to ApiProvider::default() -> OpenAI
    action_provider: ApiProvider,
    #[serde(default = "default_action_model")] // Use default function
    action_model: String,

    // Appearance
    #[serde(default)] // Defaults to Theme::default() -> System
    theme: Theme,
}

// Default model functions (adjust models as needed)
fn default_walkthrough_model() -> String {
    "gpt-4o".to_string() // Example default
}
fn default_action_model() -> String {
    "gpt-4o".to_string() // Example default
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
    // Resolve the path relative to the app's data directory
    let store_path = app.path().resolve(SETTINGS_FILE, tauri::path::BaseDirectory::AppData)
        .map_err(|e| format!("Failed to resolve store path: {}", e))?;

    // Build the store instance, passing the app handle to `new` and handling the Result from `build`
    let store = StoreBuilder::new(app.app_handle(), store_path).build() // Use app_handle(), remove mut
        .map_err(|e| format!("Failed to build store: {}", e))?; // Map error for ?

    // Reload the store from disk, handling NotFound error
    match store.reload() {
        Ok(_) => {} // Reload successful, continue
        Err(StoreError::Io(e)) if e.kind() == ErrorKind::NotFound => {
            // File not found is okay on first load, defaults will be used
        }
        Err(e) => return Err(format!("Failed to reload store: {}", e)), // Propagate other errors
    }

    // Get the settings value
    match store.get("app_settings") {
        Some(settings_value) => {
            // Deserialize the value into AppSettings
            serde_json::from_value(settings_value.clone())
                .map_err(|e| format!("Failed to deserialize settings: {}", e))
        },
        None => {
            // No settings found, return default
            Ok(AppSettings::default())
        }
    }
}


// Tauri command to save settings to store
#[tauri::command]
fn save_settings(settings: AppSettings, app: AppHandle) -> Result<(), String> {
    // Resolve the path relative to the app's data directory
    let store_path = app.path().resolve(SETTINGS_FILE, tauri::path::BaseDirectory::AppData)
        .map_err(|e| format!("Failed to resolve store path: {}", e))?;

    // Build the store instance, passing the app handle to `new` and handling the Result from `build`
    let store = StoreBuilder::new(app.app_handle(), store_path).build() // Use app_handle(), remove mut
        .map_err(|e| format!("Failed to build store: {}", e))?; // Map error for ?

    // Reload existing store data first, handling NotFound error
    match store.reload() {
        Ok(_) => {} // Reload successful, continue
        Err(StoreError::Io(e)) if e.kind() == ErrorKind::NotFound => {
            // File not found is okay before saving, .save() will create it
        }
        Err(e) => return Err(format!("Failed to reload store before saving: {}", e)), // Propagate other errors
    }

    // Serialize the settings struct to a JSON value
    let settings_value = serde_json::to_value(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    // Set (insert or update) the value in the store
    store.set("app_settings".to_string(), settings_value); // Use set(), returns () so no ? needed

    // Persist changes to disk
    store.save().map_err(|e| format!("Failed to save store: {}", e))
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_store::Builder::new().build()) // Simplified plugin init
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
