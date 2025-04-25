use std::process::Command;
use std::path::Path;
use tauri::command;
use serde::{Deserialize, Serialize};
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, AUTHORIZATION};

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

#[derive(Debug, Serialize, Deserialize)]
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

// Get settings
#[command]
pub fn get_settings() -> AppSettings {
    // In a real app, you would load this from a config file or database
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
        theme: "system".to_string(),
    }
}

// Save settings
#[command]
pub fn save_settings(_settings: AppSettings) -> Result<(), String> {
    // In a real app, you would save this to a config file or database
    // For now, we'll just return success
    Ok(())
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