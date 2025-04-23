use serde::Serialize; // Import Serialize

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


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_store::Builder::new().build()) // Add the store plugin
    .invoke_handler(tauri::generate_handler![get_os_info, get_memory_info]) // Add invoke handler for our commands
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
