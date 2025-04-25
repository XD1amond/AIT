use serde::{Serialize, Deserialize};
use tauri::Builder;

// Import the commands module
mod commands;

// Define API provider enum
#[derive(Serialize, Deserialize, Debug, Default, Clone)]
pub enum ApiProvider {
    #[default]
    OpenAI,
    Claude,
    OpenRouter,
}

// Define Theme enum
#[derive(Serialize, Deserialize, Debug, Default, Clone)]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}

// Default functions for model settings
fn default_walkthrough_model() -> String {
    "gpt-4o".to_string()
}

fn default_action_model() -> String {
    "gpt-4o".to_string()
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

    // Tool settings
    #[serde(default)] // Defaults to false
    auto_approve_tools: bool,
    
    // Tool availability settings
    #[serde(default)] // Defaults to empty map
    walkthrough_tools: std::collections::HashMap<String, bool>,
    #[serde(default)] // Defaults to empty map
    action_tools: std::collections::HashMap<String, bool>,
    
    // Auto approve settings
    #[serde(default)] // Defaults to empty map
    auto_approve_walkthrough: std::collections::HashMap<String, bool>,
    #[serde(default)] // Defaults to empty map
    auto_approve_action: std::collections::HashMap<String, bool>,
    
    // Command whitelist and blacklist
    #[serde(default)] // Defaults to empty vector
    whitelisted_commands: Vec<String>,
    #[serde(default)] // Defaults to empty vector
    blacklisted_commands: Vec<String>,

    // Appearance
    #[serde(default)] // Defaults to Theme::default() -> System
    theme: Theme,
}

// Add the run function that's called from main.rs
pub fn run() {
    Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            crate::commands::get_cwd,
            crate::commands::get_os_info,
            crate::commands::get_memory_info,
            crate::commands::get_settings,
            crate::commands::save_settings,
            crate::commands::execute_command,
            crate::commands::web_search,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
