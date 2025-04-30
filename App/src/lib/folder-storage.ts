import { invoke, isTauri } from '@tauri-apps/api/core';
import { Folder } from '@/shared/models';

// Local storage key for chat-folder mappings (keeping this in localStorage for now)
const CHAT_FOLDERS_STORAGE_KEY = 'ait-chat-folders';

// Type matching the Rust backend's RustFolder for invoke calls
interface RustFolderPayload {
  id: string;
  name: string;
  timestamp: number; // Send number, Rust expects u64
  parent_id: string | null; // Matches Rust's Option<String>
  is_expanded: boolean;
}

// Interface matching the Rust backend's RustFolder structure
export interface FolderWithTimestamp {
  id: string;
  name: string;
  timestamp: number;
  parent_id: string | null;
  is_expanded: boolean;
}

/**
 * Retrieves all saved folders from the Tauri store.
 * @returns A promise resolving to an array of Folder objects, or an empty array if none found or error occurs.
 */
export async function getAllFolders(): Promise<Folder[]> {
  if (!(await isTauri())) {
    console.warn("Tauri context not found. Cannot load folders.");
    return []; // Return empty array if not in Tauri context
  }
  try {
    console.log("Invoking get_all_folders...");
    const folders = await invoke<FolderWithTimestamp[]>('get_all_folders');
    console.log("Folders received from backend:", folders);
    
    // Convert from Rust naming convention to TypeScript naming convention
    return folders
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(folder => ({
        id: folder.id,
        name: folder.name,
        parentId: folder.parent_id,
        isExpanded: folder.is_expanded
      }));
  } catch (error) {
    console.error("Error loading folders via invoke:", error);
    return []; // Return empty array on error
  }
}

/**
 * Saves a folder to the Tauri store. If a folder with the same ID exists, it's updated.
 * @param folder The Folder object to save.
 * @returns A promise that resolves when saving is complete or rejects on error.
 */
export async function saveFolder(folder: Folder): Promise<void> {
  if (!(await isTauri())) {
    console.warn("Tauri context not found. Cannot save folder.");
    return Promise.reject("Tauri context not found");
  }
  try {
    console.log("Invoking save_folder with:", folder);
    // Ensure the payload matches Rust struct expectations
    const payload: RustFolderPayload = {
      id: folder.id,
      name: folder.name,
      timestamp: Date.now(),
      parent_id: folder.parentId,
      is_expanded: folder.isExpanded || false
    };
    
    console.log("Sending folder payload to backend:", payload);
    await invoke('save_folder', { folder: payload }); // Pass folder object wrapped in { folder: ... }
    console.log("Folder saved successfully via invoke.");
  } catch (error) {
    console.error("Error saving folder via invoke:", error);
    return Promise.reject(error); // Propagate the error
  }
}

/**
 * Deletes a folder from the Tauri store by its ID.
 * @param folderId The ID of the folder to delete.
 * @returns A promise that resolves when deletion is complete or rejects on error.
 */
export async function deleteFolder(folderId: string): Promise<void> {
  if (!(await isTauri())) {
    console.warn("Tauri context not found. Cannot delete folder.");
    return Promise.reject("Tauri context not found");
  }
  try {
    console.log(`Invoking delete_folder with ID: ${folderId}`);
    await invoke('delete_folder', { folderId }); // Pass folderId wrapped in { folderId: ... }
    console.log("Folder deleted successfully via invoke.");
  } catch (error) {
    console.error("Error deleting folder via invoke:", error);
    return Promise.reject(error); // Propagate the error
  }
}

/**
 * Save chat-folder mappings to local storage
 * Note: This still uses localStorage as it's not critical persistence data
 */
export function saveChatFolders(chatFolders: Record<string, string>): void {
  try {
    localStorage.setItem(CHAT_FOLDERS_STORAGE_KEY, JSON.stringify(chatFolders));
  } catch (error) {
    console.error('Error saving chat folders to local storage:', error);
  }
}

/**
 * Load chat-folder mappings from local storage
 * Note: This still uses localStorage as it's not critical persistence data
 */
export function loadChatFolders(): Record<string, string> {
  try {
    const chatFoldersJson = localStorage.getItem(CHAT_FOLDERS_STORAGE_KEY);
    if (!chatFoldersJson) return {};
    return JSON.parse(chatFoldersJson);
  } catch (error) {
    console.error('Error loading chat folders from local storage:', error);
    return {};
  }
}

/**
 * Generate a unique folder ID
 */
export function generateFolderId(): string {
  return `folder_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}