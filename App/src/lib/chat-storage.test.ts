// App/src/lib/chat-storage.test.ts
// Import the actual types if needed, but functions will be mocked
import { getAllSavedChats, saveChat, deleteChat, generateChatId, SavedChat } from './chat-storage';
// Import the module to be mocked
// Import the module to be mocked
import * as tauriCore from '@tauri-apps/api/core';

// Mock the module, defining implementations *inside* the factory
jest.mock('@tauri-apps/api/core', () => {
  const mockInvokeImplementation = jest.fn(); // Define inside
  const mockIsTauriImplementation = jest.fn(() => Promise.resolve(true)); // Define inside
  return {
    __esModule: true,
    invoke: mockInvokeImplementation,
    isTauri: mockIsTauriImplementation,
  };
});

// Now import the functions *after* mocking (they will be the mocks)
import { invoke, isTauri } from '@tauri-apps/api/core';
// Cast for type safety
const mockInvoke = invoke as jest.Mock;
const mockIsTauri = isTauri as jest.Mock; // Cast if needed later

// Mock data store (simpler than importing from manual mock)
let mockChatStore: SavedChat[] = [];

describe('Chat Storage Utilities', () => {
  beforeEach(() => {
    // Reset mock store and mock function calls
    mockChatStore = [
        { id: 'chat_1', timestamp: Date.now() - 10000, mode: 'walkthrough', messages: [{sender: 'ai', content: 'Old message'}] },
        { id: 'chat_2', timestamp: Date.now(), mode: 'action', messages: [{sender: 'user', content: 'Action request'}] },
    ];
                mockInvoke.mockClear();
                mockIsTauri.mockClear(); // Clear the imported mock function
                // Setup default mock implementations for invoke calls *within* beforeEach
                mockInvoke.mockImplementation(async (command: string, args?: any): Promise<any> => {
                    // console.log(`Mock invoke called in test: ${command}`, args); // Optional: reduce noise
                    switch (command) {
                        case 'get_all_chats':
                          return Promise.resolve([...mockChatStore]); // Return copy
                        case 'save_chat':
                          const chatToSave = args?.chat;
                          if (!chatToSave) return Promise.reject('No chat data provided');
                          const index = mockChatStore.findIndex(c => c.id === chatToSave.id);
                          if (index > -1) mockChatStore[index] = chatToSave;
                          else mockChatStore.push(chatToSave);
                          mockChatStore.sort((a, b) => b.timestamp - a.timestamp);
                          return Promise.resolve();
                        case 'delete_chat':
                           const chatIdToDelete = args?.chatId;
                           if (!chatIdToDelete) return Promise.reject('No chatId provided');
                           mockChatStore = mockChatStore.filter(c => c.id !== chatIdToDelete);
                           return Promise.resolve();
                        default:
                          return Promise.reject(`Unhandled mock invoke: ${command}`);
                     }
                });
  });

  test('getAllSavedChats should invoke get_all_chats', async () => {
    await getAllSavedChats();
    expect(invoke).toHaveBeenCalledWith('get_all_chats');
  });

  test('getAllSavedChats should return chats from mock implementation', async () => {
    const chats = await getAllSavedChats();
    // Sort the mock store copy for comparison as getAllSavedChats also sorts
    const expectedChats = [...mockChatStore].sort((a, b) => b.timestamp - a.timestamp);
    expect(chats).toEqual(expectedChats);
  });

  test('saveChat should invoke save_chat with correct payload', async () => {
    const newChat: SavedChat = {
      id: generateChatId(),
      timestamp: Date.now(),
      mode: 'walkthrough',
      messages: [{ sender: 'user', content: 'Test save' }],
      title: 'Save Test',
    };
    await saveChat(newChat);
    expect(invoke).toHaveBeenCalledWith('save_chat', { chat: newChat });
  });

   test('saveChat should update existing chat in mock store', async () => {
     const existingChatId = mockChatStore[0].id; // Use local mock store
     const updatedChat: SavedChat = {
       id: existingChatId,
       timestamp: Date.now() + 5000,
       mode: 'walkthrough',
       messages: [{ sender: 'user', content: 'Updated message' }],
       title: 'Updated Title',
     };
     await saveChat(updatedChat);
     expect(invoke).toHaveBeenCalledWith('save_chat', { chat: updatedChat });
   
     // Verify local mock store state
     const saved = mockChatStore.find(c => c.id === existingChatId);
     expect(saved).toBeDefined();
     expect(saved?.title).toBe('Updated Title');
     expect(saved?.timestamp).toBe(updatedChat.timestamp);
   });


  test('deleteChat should invoke delete_chat with correct chatId', async () => {
    const chatIdToDelete = 'chat_1'; // Assuming this ID exists in the mock
    await deleteChat(chatIdToDelete);
    expect(invoke).toHaveBeenCalledWith('delete_chat', { chatId: chatIdToDelete });
  });

   test('deleteChat should remove chat from mock store', async () => {
     const initialLength = mockChatStore.length;
     const chatIdToDelete = mockChatStore[0].id; // Use local mock store
   
     await deleteChat(chatIdToDelete);
     expect(invoke).toHaveBeenCalledWith('delete_chat', { chatId: chatIdToDelete });
   
     // Verify local mock store state
     expect(mockChatStore.length).toBe(initialLength - 1);
     expect(mockChatStore.find(c => c.id === chatIdToDelete)).toBeUndefined();
   });

  test('generateChatId should return a string', () => {
    const id = generateChatId();
    expect(typeof id).toBe('string');
    expect(id.startsWith('chat_')).toBe(true);
  });
});