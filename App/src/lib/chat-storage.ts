import { invoke, isTauri } from '@tauri-apps/api/core';
import { ChatMessage } from '@/components/modes/walkthrough-mode/WalkthroughMode'; // Keep this import

// Define the structure for a saved chat session - MUST match RustSavedChat
export interface SavedChat {
  id: string; // Unique ID for the chat
  timestamp: number; // Timestamp (use number for JS Date compatibility)
  mode: 'action' | 'walkthrough'; // Mode the chat was in
  messages: ChatMessage[]; // The actual chat messages
  title?: string; // Optional title
}

// Type matching the Rust backend's RustSavedChat for invoke calls
// Note: Rust uses u64 for timestamp, JS uses number. Serde handles conversion.
// Note: Rust uses enum for sender, TS uses literal types. Serde handles conversion.
// Note: Rust uses String for mode, TS uses literal types. Serde handles conversion.
interface RustSavedChatPayload {
    id: string;
    timestamp: number; // Send number, Rust expects u64
    mode: string; // Send 'action' or 'walkthrough' string
    messages: ChatMessage[]; // Assumes ChatMessage structure is compatible
    title?: string;
}


/**
 * Retrieves all saved chats from the Tauri store.
 * @returns A promise resolving to an array of SavedChat objects, or an empty array if none found or error occurs.
 */
export async function getAllSavedChats(): Promise<SavedChat[]> {
  if (!(await isTauri())) {
    console.warn("Tauri context not found. Cannot load chats.");
    return []; // Return empty array if not in Tauri context
  }
  try {
    console.log("Invoking get_all_chats...");
    const chats = await invoke<SavedChat[]>('get_all_chats');
    console.log("Chats received from backend:", chats);
    // Optional: Add validation here if needed
    // Already sorted by backend, but can re-sort if necessary
    return chats.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error("Error loading chats via invoke:", error);
    return []; // Return empty array on error
  }
}

/**
 * Saves a chat session to the Tauri store. If a chat with the same ID exists, it's updated.
 * @param chat The SavedChat object to save.
 * @returns A promise that resolves when saving is complete or rejects on error.
 */
export async function saveChat(chat: SavedChat): Promise<void> {
    if (!(await isTauri())) {
        console.warn("Tauri context not found. Cannot save chat.");
        return Promise.reject("Tauri context not found");
    }
    try {
        console.log("Invoking save_chat with:", chat);
        // Ensure the payload matches Rust struct expectations if necessary
        const payload: RustSavedChatPayload = {
            ...chat,
            mode: chat.mode, // Ensure mode is a string
            timestamp: chat.timestamp // Ensure timestamp is a number
        };
        await invoke('save_chat', { chat: payload }); // Pass chat object wrapped in { chat: ... }
        console.log("Chat saved successfully via invoke.");
    } catch (error) {
        console.error("Error saving chat via invoke:", error);
        return Promise.reject(error); // Propagate the error
    }
}


/**
 * Deletes a chat session from the Tauri store by its ID.
 * @param chatId The ID of the chat to delete.
 * @returns A promise that resolves when deletion is complete or rejects on error.
 */
export async function deleteChat(chatId: string): Promise<void> {
    if (!(await isTauri())) {
        console.warn("Tauri context not found. Cannot delete chat.");
        return Promise.reject("Tauri context not found");
    }
    try {
        console.log(`Invoking delete_chat with ID: ${chatId}`);
        await invoke('delete_chat', { chatId }); // Pass chatId wrapped in { chatId: ... }
        console.log("Chat deleted successfully via invoke.");
    } catch (error) {
        console.error("Error deleting chat via invoke:", error);
        return Promise.reject(error); // Propagate the error
    }
}

/**
 * Generates a simple unique ID (e.g., based on timestamp).
 * Replace with a more robust UUID generator if needed.
 */
export function generateChatId(): string {
  // Using a more standard timestamp-based ID format
  return `chat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

// Example usage (for testing purposes, remove later):
// async function testChatStorage() {
//   console.log("Testing chat storage...");
//   const newId = generateChatId();
//   const testChat: SavedChat = {
//     id: newId,
//     timestamp: Date.now(),
//     mode: 'walkthrough',
//     messages: [{ sender: 'user', content: 'Hello' }, { sender: 'ai', content: 'Hi there!' }],
//     title: "Test Chat"
//   };
//   await saveChat(testChat);
//   let chats = await getAllSavedChats();
//   console.log("Chats after save:", chats);
//   // await deleteChat(newId);
//   // chats = await getAllSavedChats();
//   // console.log("Chats after delete:", chats);
// }
// // Uncomment to run test on load (only in development)
// // if (typeof window !== 'undefined') { // Ensure it runs only in browser context
// //    setTimeout(testChatStorage, 2000);
// // }