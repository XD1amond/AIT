use std::process::Command;
use std::path::Path;
use std::fs::{self, create_dir_all}; // Added create_dir_all
use std::path::PathBuf; // Added PathBuf
use std::sync::Mutex;
use tauri::{command, AppHandle, Manager}; // Added AppHandle, Manager
use serde::{Deserialize, Serialize};
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, AUTHORIZATION};
use once_cell::sync::Lazy;

// Global settings storage
static SETTINGS: Lazy<Mutex<Option<AppSettings>>> = Lazy::new(|| Mutex::new(None));
// Global chats storage
static CHATS: Lazy<Mutex<Vec<RustSavedChat>>> = Lazy::new(|| Mutex::new(Vec::new()));

#[derive(Debug, Serialize, Deserialize)]
pub struct OsInfo {
    pub os_type: String,
    pub os_release: String,
    pub hostname: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MemoryInfo {
    pub total_mem: u64,
    pub free_mem: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub openai_api_key: String,
    pub claude_api_key: String,
    pub open_router_api_key: String,
    pub brave_search_api_key: String,
    pub walkthrough_provider: String,
    pub walkthrough_model: String,
    pub action_provider: String,
    pub action_model: String,
    pub auto_approve_tools: bool,
    // Tool availability settings
    pub walkthrough_tools: std::collections::HashMap<String, bool>,
    pub action_tools: std::collections::HashMap<String, bool>,
    // Auto approve settings
    pub auto_approve_walkthrough: std::collections::HashMap<String, bool>,
    pub auto_approve_action: std::collections::HashMap<String, bool>,
    // Command whitelist and blacklist
    pub whitelisted_commands: Vec<String>,
    pub blacklisted_commands: Vec<String>,
    pub theme: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WebSearchResult {
    pub title: String,
    pub url: String,
    pub description: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WebSearchResponse {
    pub web: WebSearchWeb,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WebSearchWeb {
    pub results: Vec<WebSearchResult>,
}

// Chat message structure
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub sender: String, // "user" or "assistant"
    pub content: String,
}

// Saved chat structure
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RustSavedChat {
    pub id: String,
    pub timestamp: u64,
    pub mode: String, // "action" or "walkthrough"
    pub messages: Vec<ChatMessage>,
    pub title: Option<String>,
}

// Get current working directory
#[command]
pub fn get_cwd() -> String {
    std::env::current_dir()
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|_| "Unknown".to_string())
}

// Get OS information
#[command]
pub fn get_os_info() -> OsInfo {
    let os_type = std::env::consts::OS.to_string();
    
    // Get OS release info (platform-specific)
    let os_release = match std::env::consts::OS {
        "windows" => {
            std::env::var("OS").unwrap_or_else(|_| "Windows".to_string())
        },
        "macos" => {
            Command::new("sw_vers")
                .arg("-productVersion")
                .output()
                .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
                .unwrap_or_else(|_| "macOS".to_string())
        },
        "linux" => {
            Command::new("cat")
                .arg("/etc/os-release")
                .output()
                .map(|output| {
                    let output_str = String::from_utf8_lossy(&output.stdout);
                    output_str
                        .lines()
                        .find(|line| line.starts_with("PRETTY_NAME="))
                        .and_then(|line| line.split('=').nth(1))
                        .map(|name| name.trim_matches('"').to_string())
                        .unwrap_or_else(|| "Linux".to_string())
                })
                .unwrap_or_else(|_| "Linux".to_string())
        },
        _ => "Unknown".to_string(),
    };
    
    // Get hostname
    let hostname = Command::new(if cfg!(target_os = "windows") { "hostname" } else { "hostname" })
        .output()
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .unwrap_or_else(|_| "Unknown".to_string());
    
    OsInfo {
        os_type,
        os_release,
        hostname,
    }
}

// Get memory information
#[command]
pub fn get_memory_info() -> MemoryInfo {
    // This is a simplified implementation
    // For a real app, you might want to use a crate like sysinfo
    MemoryInfo {
        total_mem: 16 * 1024 * 1024, // 16 GB in KB (placeholder)
        free_mem: 8 * 1024 * 1024,   // 8 GB in KB (placeholder)
    }
}

// Create default settings
fn create_default_settings() -> AppSettings {
    let mut walkthrough_tools = std::collections::HashMap::new();
    walkthrough_tools.insert("command".to_string(), true);
    walkthrough_tools.insert("web_search".to_string(), true);
    
    let mut action_tools = std::collections::HashMap::new();
    action_tools.insert("command".to_string(), true);
    action_tools.insert("web_search".to_string(), true);
    
    let mut auto_approve_walkthrough = std::collections::HashMap::new();
    auto_approve_walkthrough.insert("command".to_string(), false);
    auto_approve_walkthrough.insert("web_search".to_string(), false);
    
    let mut auto_approve_action = std::collections::HashMap::new();
    auto_approve_action.insert("command".to_string(), false);
    auto_approve_action.insert("web_search".to_string(), false);
    
    AppSettings {
        openai_api_key: "".to_string(),
        claude_api_key: "".to_string(),
        open_router_api_key: "".to_string(),
        brave_search_api_key: "".to_string(),
        walkthrough_provider: "openai".to_string(),
        walkthrough_model: "gpt-4o".to_string(),
        action_provider: "openai".to_string(),
        action_model: "gpt-4o".to_string(),
        auto_approve_tools: false,
        walkthrough_tools,
        action_tools,
        auto_approve_walkthrough,
        auto_approve_action,
        whitelisted_commands: Vec::new(),
        blacklisted_commands: Vec::new(),
        theme: "system".to_string(),
    }
}

// Helper function to get the settings file path
fn get_settings_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    // Use ok_or_else to convert Option<PathBuf> to Result<PathBuf, String>
    let data_dir = app_handle.path().app_data_dir()
        .or_else(|_| Err("Failed to get app data directory".to_string()))?;
    
    // Ensure the directory exists
    create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;
        
    Ok(data_dir.join("settings.json"))
}

// Helper function to get the chats file path
fn get_chats_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    // Use ok_or_else to convert Option<PathBuf> to Result<PathBuf, String>
    let data_dir = app_handle.path().app_data_dir()
        .or_else(|_| Err("Failed to get app data directory".to_string()))?;
    
    // Ensure the directory exists
    create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;
        
    Ok(data_dir.join("chats.json"))
}

// Get settings
#[command]
pub fn get_settings(app_handle: AppHandle) -> AppSettings {
    // Try to get settings from memory first
    let mut settings_guard = SETTINGS.lock().unwrap();

    if let Some(settings) = settings_guard.as_ref() {
        // Return a clone of the settings
        println!("Returning settings from memory cache.");
        return settings.clone();
    }

    // If not in memory, try to load from file
    let settings_path = match get_settings_path(&app_handle) {
        Ok(path) => path,
        Err(e) => {
            eprintln!("Error getting settings path: {}", e);
            // Fallback to default if path resolution fails
            let default_settings = create_default_settings();
            *settings_guard = Some(default_settings.clone());
            return default_settings;
        }
    };

    println!("Attempting to load settings from: {:?}", settings_path);
    let settings = if settings_path.exists() {
        match fs::read_to_string(&settings_path) {
            Ok(json) => match serde_json::from_str::<AppSettings>(&json) {
                Ok(loaded_settings) => {
                    println!("Successfully loaded settings from file.");
                    loaded_settings
                },
                Err(e) => {
                    eprintln!("Failed to parse settings file: {}. Using defaults.", e);
                    create_default_settings()
                },
            },
            Err(e) => {
                eprintln!("Failed to read settings file: {}. Using defaults.", e);
                create_default_settings()
            },
        }
    } else {
        println!("Settings file not found. Using defaults.");
        create_default_settings()
    };

    // Store in memory for future use
    *settings_guard = Some(settings.clone());

    settings
}

// Save settings
#[command]
pub fn save_settings(app_handle: AppHandle, settings: AppSettings) -> Result<(), String> {
    // Save to memory
    let mut settings_guard = SETTINGS.lock().unwrap();
    *settings_guard = Some(settings.clone());

    // Save to file
    let settings_path = get_settings_path(&app_handle)?; // Use helper function

    match serde_json::to_string_pretty(&settings) {
        Ok(json) => match fs::write(&settings_path, json) { // Use the full path
            Ok(_) => {
                println!("Settings saved successfully to {:?}", settings_path);
                Ok(())
            },
            Err(e) => Err(format!("Failed to write settings file: {}", e)),
        },
        Err(e) => Err(format!("Failed to serialize settings: {}", e)),
    }
}

// Get all chats
#[command]
pub fn get_all_chats(app_handle: AppHandle) -> Vec<RustSavedChat> {
    // Try to get chats from memory first
    let mut chats_guard = CHATS.lock().unwrap();

    // If chats are already loaded in memory, return them
    if !chats_guard.is_empty() {
        println!("Returning chats from memory cache.");
        return chats_guard.clone();
    }

    // If not in memory, try to load from file
    let chats_path = match get_chats_path(&app_handle) {
        Ok(path) => path,
        Err(e) => {
            eprintln!("Error getting chats path: {}", e);
            return Vec::new(); // Return empty vector if path resolution fails
        }
    };

    println!("Attempting to load chats from: {:?}", chats_path);
    let chats = if chats_path.exists() {
        match fs::read_to_string(&chats_path) {
            Ok(json) => match serde_json::from_str::<Vec<RustSavedChat>>(&json) {
                Ok(loaded_chats) => {
                    println!("Successfully loaded {} chats from file.", loaded_chats.len());
                    loaded_chats
                },
                Err(e) => {
                    eprintln!("Failed to parse chats file: {}. Using empty list.", e);
                    Vec::new()
                },
            },
            Err(e) => {
                eprintln!("Failed to read chats file: {}. Using empty list.", e);
                Vec::new()
            },
        }
    } else {
        println!("Chats file not found. Using empty list.");
        Vec::new()
    };

    // Store in memory for future use
    *chats_guard = chats.clone();

    // Sort by timestamp (newest first) before returning
    let mut sorted_chats = chats.clone();
    sorted_chats.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    sorted_chats
}

// Save a chat
#[command]
pub fn save_chat(app_handle: AppHandle, chat: RustSavedChat) -> Result<(), String> {
    println!("Saving chat with ID: {}", chat.id);
    
    // Get the current chats
    let mut chats_guard = CHATS.lock().unwrap();
    
    // Check if this chat already exists
    let existing_index = chats_guard.iter().position(|c| c.id == chat.id);
    
    // Update or add the chat
    if let Some(index) = existing_index {
        // Update existing chat
        chats_guard[index] = chat.clone();
    } else {
        // Add new chat
        chats_guard.push(chat.clone());
    }
    
    // Sort by timestamp (newest first)
    chats_guard.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    
    // Save to file
    let chats_path = get_chats_path(&app_handle)?;
    
    match serde_json::to_string_pretty(&*chats_guard) {
        Ok(json) => match fs::write(&chats_path, json) {
            Ok(_) => {
                println!("Chats saved successfully to {:?}", chats_path);
                Ok(())
            },
            Err(e) => Err(format!("Failed to write chats file: {}", e)),
        },
        Err(e) => Err(format!("Failed to serialize chats: {}", e)),
    }
}

// Delete a chat
#[command]
pub fn delete_chat(app_handle: AppHandle, chat_id: String) -> Result<(), String> {
    println!("Deleting chat with ID: {}", chat_id);
    
    // Get the current chats
    let mut chats_guard = CHATS.lock().unwrap();
    
    // Remove the chat with the given ID
    let initial_len = chats_guard.len();
    chats_guard.retain(|c| c.id != chat_id);
    
    // Check if a chat was actually removed
    if chats_guard.len() == initial_len {
        return Err(format!("Chat with ID {} not found", chat_id));
    }
    
    // Save to file
    let chats_path = get_chats_path(&app_handle)?;
    
    match serde_json::to_string_pretty(&*chats_guard) {
        Ok(json) => match fs::write(&chats_path, json) {
            Ok(_) => {
                println!("Chats saved successfully after deletion to {:?}", chats_path);
                Ok(())
            },
            Err(e) => Err(format!("Failed to write chats file after deletion: {}", e)),
        },
        Err(e) => Err(format!("Failed to serialize chats after deletion: {}", e)),
    }
}

// Execute a command
#[command]
pub async fn execute_command(command: String, cwd: Option<String>) -> Result<String, String> {
    let cwd = cwd.unwrap_or_else(|| get_cwd());
    
    // Split the command into program and arguments
    let mut parts = command.split_whitespace();
    let program = parts.next().ok_or_else(|| "Empty command".to_string())?;
    let args: Vec<&str> = parts.collect();
    
    // Create the command
    let mut cmd = Command::new(program);
    cmd.args(args);
    
    // Set the working directory if it exists
    if Path::new(&cwd).exists() {
        cmd.current_dir(cwd);
    }
    
    // Execute the command
    match cmd.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            
            if !stderr.is_empty() {
                if output.status.success() {
                    Ok(format!("{}\n\nWarnings:\n{}", stdout, stderr))
                } else {
                    Err(format!("Command failed with error:\n{}", stderr))
                }
            } else {
                Ok(stdout)
            }
        },
        Err(e) => Err(format!("Failed to execute command: {}", e)),
    }
}

// Web search using Brave Search API
#[command]
pub async fn web_search(query: String, limit: Option<u32>, api_key: String) -> Result<WebSearchResponse, String> {
    if api_key.is_empty() {
        return Err("Brave Search API key is not set".to_string());
    }
    
    let limit = limit.unwrap_or(5);
    let url = format!("https://api.search.brave.com/res/v1/web/search?q={}&count={}", 
        urlencoding::encode(&query), limit);
    
    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {}", api_key))
        .map_err(|e| format!("Invalid API key: {}", e))?);
    
    let response = client.get(&url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("API request failed with status: {}", response.status()));
    }
    
    let search_response = response.json::<WebSearchResponse>()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;
    
    Ok(search_response)
}