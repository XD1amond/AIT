// App/src/__mocks__/tauri.ts

// Store mock data or responses here
let mockStore: Record<string, any> = {
  settings: {
    openai_api_key: 'sk-test-openai',
    claude_api_key: '',
    open_router_api_key: '',
    brave_search_api_key: '',
    walkthrough_provider: 'openai',
    walkthrough_model: 'gpt-4o',
    action_provider: 'openai',
    action_model: 'gpt-4o',
    theme: 'system',
  },
  chats: [
    { id: 'chat_1', timestamp: Date.now() - 10000, mode: 'walkthrough', messages: [{sender: 'ai', content: 'Old message'}] },
    { id: 'chat_2', timestamp: Date.now(), mode: 'action', messages: [{sender: 'user', content: 'Action request'}] },
  ],
};

// Create the mock functions
const mockInvoke = jest.fn(async (command: string, args?: any): Promise<any> => {
  console.log(`MANUAL Mock invoke called: ${command}`, args);
  switch (command) {
    case 'get_settings':
      return Promise.resolve(mockStore.settings);
    case 'save_settings':
      mockStore.settings = { ...mockStore.settings, ...args?.settings };
      return Promise.resolve();
    case 'get_all_chats':
      return Promise.resolve([...mockStore.chats]); // Return copy
    case 'save_chat':
      const chatToSave = args?.chat;
      if (!chatToSave) return Promise.reject('No chat data provided');
      const index = mockStore.chats.findIndex((c: any) => c.id === chatToSave.id);
      if (index > -1) mockStore.chats[index] = chatToSave;
      else mockStore.chats.push(chatToSave);
      mockStore.chats.sort((a: any, b: any) => b.timestamp - a.timestamp);
      return Promise.resolve();
    case 'delete_chat':
       const chatIdToDelete = args?.chatId;
       if (!chatIdToDelete) return Promise.reject('No chatId provided');
       mockStore.chats = mockStore.chats.filter((c: any) => c.id !== chatIdToDelete);
       return Promise.resolve();
    case 'get_os_info':
        return Promise.resolve({ os_type: 'MockOS', os_release: '1.0', hostname: 'mockhost' });
    case 'get_memory_info':
        return Promise.resolve({ total_mem: 8388608, free_mem: 4194304 });
    case 'get_cwd':
        return Promise.resolve('/mock/workspace/dir');
    default:
      return Promise.reject(`Unhandled MANUAL mock invoke command: ${command}`);
  }
});

const mockIsTauri = jest.fn(async (): Promise<boolean> => {
    console.log("MANUAL Mock isTauri called");
    return Promise.resolve(true);
});

// Export the mocked functions with the names expected by the original module
export const invoke = mockInvoke;
export const isTauri = mockIsTauri;

// Helper functions (keep them if tests use them, otherwise remove)
export const resetMockStore = () => {
    mockStore = {
        settings: { /* default settings */ },
        chats: [ /* default chats */ ],
    };
    mockInvoke.mockClear();
    mockIsTauri.mockClear();
};
export const getMockStore = () => mockStore;

// Log to confirm the mock file is loaded by Jest
console.log("Executing manual mock for @tauri-apps/api/core");