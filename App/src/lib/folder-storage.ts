import { Folder } from '@/shared/models';

// Local storage key for folders
const FOLDERS_STORAGE_KEY = 'ait-folders';

// Local storage key for chat-folder mappings
const CHAT_FOLDERS_STORAGE_KEY = 'ait-chat-folders';

/**
 * Save folders to local storage
 */
export function saveFolders(folders: Folder[]): void {
  try {
    localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(folders));
  } catch (error) {
    console.error('Error saving folders to local storage:', error);
  }
}

/**
 * Load folders from local storage
 */
export function loadFolders(): Folder[] {
  try {
    const foldersJson = localStorage.getItem(FOLDERS_STORAGE_KEY);
    if (!foldersJson) return [];
    return JSON.parse(foldersJson);
  } catch (error) {
    console.error('Error loading folders from local storage:', error);
    return [];
  }
}

/**
 * Save chat-folder mappings to local storage
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