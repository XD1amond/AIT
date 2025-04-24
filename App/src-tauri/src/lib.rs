use serde::{Serialize, Deserialize}; // Import Deserialize
use tauri::{AppHandle, Manager};
use tauri_plugin_store::{StoreBuilder, Error as StoreError}; // Import StoreError
use std::io::ErrorKind; // Import ErrorKind for specific error checking
use std::fs; // Import fs for directory creation
use std::path::Path; // Import Path for parent directory access

const SETTINGS_FILE: &str = "settings.store"; // Use .store extension convention
const CHAT_HISTORY_FILE: &str = "chats.store"; // Store file for chat history

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
    #[serde(default)] // Added for Brave Search
    brave_search_api_key: String,

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

// --- Chat Storage Structs ---

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
enum MessageSender {
    #[serde(rename = "user")]
    User,
    #[serde(rename = "ai")]
    Ai,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct RustChatMessage {
    sender: MessageSender,
    content: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct RustSavedChat {
    id: String,
    timestamp: u64, // Using u64 for timestamp consistency
    mode: String, // Keep simple string for mode ('action' | 'walkthrough')
    messages: Vec<RustChatMessage>,
    #[serde(default)] // Optional title
    title: Option<String>,
}

// --- End Chat Storage Structs ---


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
    
    // Tauri command to get the current working directory
    #[tauri::command]
    fn get_cwd() -> Result<String, String> {
        std::env::current_dir()
            .map_err(|e| format!("Failed to get current working directory: {}", e))
            .map(|path| path.to_string_lossy().to_string()) // Convert PathBuf to String
    }

// Tauri command to get settings from store
#[tauri::command]
fn get_settings(app: AppHandle) -> Result<AppSettings, String> {
    // Resolve the path relative to the app's data directory
    let store_path = app.path().resolve(SETTINGS_FILE, tauri::path::BaseDirectory::AppData)
        .map_err(|e| format!("Failed to resolve store path: {}", e))?;

    // Ensure the parent directory exists
    if let Some(parent_dir) = Path::new(&store_path).parent() {
        fs::create_dir_all(parent_dir)
            .map_err(|e| format!("Failed to create settings directory: {}", e))?;
    } else {
        return Err("Failed to get parent directory for settings file".to_string());
    }

    // Build the store instance, passing the app handle to `new` and handling the Result from `build`
    let store = StoreBuilder::new(app.app_handle(), store_path.clone()).build() // Use app_handle(), remove mut, clone path
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

    // Ensure the parent directory exists
    if let Some(parent_dir) = Path::new(&store_path).parent() {
        fs::create_dir_all(parent_dir)
            .map_err(|e| format!("Failed to create settings directory: {}", e))?;
    } else {
        return Err("Failed to get parent directory for settings file".to_string());
    }

    // Build the store instance, passing the app handle to `new` and handling the Result from `build`
    let store = StoreBuilder::new(app.app_handle(), store_path.clone()).build() // Use app_handle(), remove mut, clone path
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
    
    // --- Chat Storage Commands ---
    
    // Helper function to get the chat store instance
    use std::sync::Arc; // Import Arc
    
    // Helper function to get the chat store instance
    fn get_chat_store(app: &AppHandle) -> Result<Arc<tauri_plugin_store::Store<tauri::Wry>>, String> { // Changed return type to Arc<Store>
        let store_path = app.path().resolve(CHAT_HISTORY_FILE, tauri::path::BaseDirectory::AppData)
            .map_err(|e| format!("Failed to resolve chat store path: {}", e))?;
    
        // Ensure the parent directory exists
        if let Some(parent_dir) = Path::new(&store_path).parent() {
            fs::create_dir_all(parent_dir)
                .map_err(|e| format!("Failed to create chat store directory: {}", e))?;
        } else {
            return Err("Failed to get parent directory for chat store file".to_string());
        }
    
        let store = StoreBuilder::new(app.app_handle(), store_path.clone()).build()
            .map_err(|e| format!("Failed to build chat store: {}", e))?;
    
        // Reload the store from disk, handling NotFound error
        match store.reload() {
            Ok(_) => {} // Reload successful, continue
            Err(StoreError::Io(e)) if e.kind() == ErrorKind::NotFound => {
                // File not found is okay on first load or if no chats saved yet
            }
            Err(e) => return Err(format!("Failed to reload chat store: {}", e)), // Propagate other errors
        }
        Ok(store)
    }
    
    
    // Tauri command to get all saved chats
    #[tauri::command]
    fn get_all_chats(app: AppHandle) -> Result<Vec<RustSavedChat>, String> {
        let store = get_chat_store(&app)?;
    
        match store.get("chat_history") {
            Some(chats_value) => {
                serde_json::from_value(chats_value.clone())
                    .map_err(|e| format!("Failed to deserialize chat history: {}", e))
            },
            None => {
                // No chats found, return empty vector
                Ok(Vec::new())
            }
        }
    }
    
    // Tauri command to save a chat (add or update)
    #[tauri::command]
    fn save_chat(chat: RustSavedChat, app: AppHandle) -> Result<(), String> {
        let store = get_chat_store(&app)?;
    
        // Get current chats or default to empty vec
        let mut chats: Vec<RustSavedChat> = match store.get("chat_history") {
            Some(chats_value) => serde_json::from_value(chats_value.clone())
                .map_err(|e| format!("Failed to deserialize chat history before saving: {}", e))?,
            None => Vec::new(),
        };
    
        // Find if chat exists and update, otherwise add
        if let Some(index) = chats.iter().position(|c| c.id == chat.id) {
            chats[index] = chat; // Update existing
        } else {
            chats.push(chat); // Add new
        }
    
        // Sort by timestamp descending (optional, but keeps it ordered)
        chats.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    
        // Serialize the updated chat list
        let chats_value = serde_json::to_value(&chats)
            .map_err(|e| format!("Failed to serialize chat history: {}", e))?;
    
        // Set the value in the store
        store.set("chat_history".to_string(), chats_value); // Use set()
    
        // Persist changes
        store.save().map_err(|e| format!("Failed to save chat store: {}", e))
    }
    
    // Tauri command to delete a chat by ID
    #[tauri::command]
    fn delete_chat(chat_id: String, app: AppHandle) -> Result<(), String> {
        let store = get_chat_store(&app)?;
    
        // Get current chats or return early if none
        let mut chats: Vec<RustSavedChat> = match store.get("chat_history") {
            Some(chats_value) => serde_json::from_value(chats_value.clone())
                .map_err(|e| format!("Failed to deserialize chat history before deleting: {}", e))?,
            None => return Ok(()), // Nothing to delete
        };
    
        // Remove the chat with the matching ID
        chats.retain(|c| c.id != chat_id);
    
        // Serialize the updated chat list
        let chats_value = serde_json::to_value(&chats)
            .map_err(|e| format!("Failed to serialize chat history after delete: {}", e))?;
    
        // Set the value in the store
        store.set("chat_history".to_string(), chats_value); // Use set()
    
        // Persist changes
        store.save().map_err(|e| format!("Failed to save chat store after delete: {}", e))
    }
    
    
    // --- Unit Tests ---
    #[cfg(test)]
    mod tests {
        use super::*; // Import items from parent module
    
        // Helper to create a dummy chat message
        fn create_dummy_message(sender: MessageSender, content: &str) -> RustChatMessage {
            RustChatMessage {
                sender,
                content: content.to_string(),
            }
        }
    
        // Helper to create a dummy saved chat
        fn create_dummy_saved_chat(id: &str, timestamp: u64, mode: &str) -> RustSavedChat {
            RustSavedChat {
                id: id.to_string(),
                timestamp,
                mode: mode.to_string(),
                messages: vec![
                    create_dummy_message(MessageSender::User, "Hello"),
                    create_dummy_message(MessageSender::Ai, "Hi"),
                ],
                title: Some(format!("Test Chat {}", id)),
            }
        }
    
        #[test]
        fn test_add_new_chat_and_sort() {
            let mut chats: Vec<RustSavedChat> = vec![
                create_dummy_saved_chat("chat2", 200, "walkthrough"),
            ];
            let new_chat = create_dummy_saved_chat("chat1", 100, "action"); // Older chat
    
            // Simulate adding new chat
            if !chats.iter().any(|c| c.id == new_chat.id) {
                chats.push(new_chat.clone());
            }
    
            // Simulate sorting (descending timestamp)
            chats.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    
            assert_eq!(chats.len(), 2);
            assert_eq!(chats[0].id, "chat2"); // Newest first
            assert_eq!(chats[1].id, "chat1");
    
            // Add another chat, newer than chat2
            let newer_chat = create_dummy_saved_chat("chat3", 300, "walkthrough");
             if !chats.iter().any(|c| c.id == newer_chat.id) {
                chats.push(newer_chat.clone());
            }
            chats.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    
            assert_eq!(chats.len(), 3);
            assert_eq!(chats[0].id, "chat3"); // Newest
            assert_eq!(chats[1].id, "chat2");
            assert_eq!(chats[2].id, "chat1"); // Oldest
        }
    
        #[test]
        fn test_update_existing_chat() {
             let mut chats: Vec<RustSavedChat> = vec![
                create_dummy_saved_chat("chat1", 100, "walkthrough"),
                create_dummy_saved_chat("chat2", 200, "action"),
            ];
    
            // Create an updated version of chat1
            let mut updated_chat1 = create_dummy_saved_chat("chat1", 250, "walkthrough"); // New timestamp
            updated_chat1.messages.push(create_dummy_message(MessageSender::User, "Update"));
    
            // Simulate updating
            if let Some(index) = chats.iter().position(|c| c.id == updated_chat1.id) {
                chats[index] = updated_chat1.clone();
            } else {
                 panic!("Chat should have existed for update"); // Fail test if not found
            }
    
            // Simulate sorting
            chats.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    
            assert_eq!(chats.len(), 2);
            assert_eq!(chats[0].id, "chat1"); // chat1 is now newest due to updated timestamp
            assert_eq!(chats[0].messages.len(), 3); // Check message was added
            assert_eq!(chats[1].id, "chat2");
        }
    
         #[test]
        fn test_delete_chat_logic() {
            let mut chats: Vec<RustSavedChat> = vec![
                create_dummy_saved_chat("chat1", 100, "walkthrough"),
                create_dummy_saved_chat("chat2", 200, "action"),
                create_dummy_saved_chat("chat3", 300, "walkthrough"),
            ];
            let chat_id_to_delete = "chat2".to_string();
    
            // Simulate deletion using retain
            chats.retain(|c| c.id != chat_id_to_delete);
    
            assert_eq!(chats.len(), 2);
            assert!(!chats.iter().any(|c| c.id == chat_id_to_delete)); // Ensure chat2 is gone
            assert!(chats.iter().any(|c| c.id == "chat1"));
            assert!(chats.iter().any(|c| c.id == "chat3"));
        }
    }
    // --- End Unit Tests ---
    
    // --- End Chat Storage Commands ---
    
    
    #[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_store::Builder::new().build()) // Simplified plugin init
    .invoke_handler(tauri::generate_handler![
        get_os_info,
        get_memory_info,
        get_settings, // Add new command
                save_settings, // Add new command
                // Add chat commands
                get_all_chats,
                save_chat,
                        delete_chat,
                        get_cwd // Add the new command
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
