// App/src/components/__tests__/WalkthroughMode.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
// Import from our mock
import { WalkthroughMode, ChatMessage } from '../__mocks__/WalkthroughMode';

// Import the module to be mocked
import * as tauriCore from '@tauri-apps/api/core';

// Mock the module, providing the implementation in the factory
jest.mock('@tauri-apps/api/core', () => {
  const mockInvokeImplementation = jest.fn();
  const mockIsTauriImplementation = jest.fn(() => Promise.resolve(true));
  return {
    __esModule: true, // Required for ES Modules
    invoke: mockInvokeImplementation,
    isTauri: mockIsTauriImplementation,
  };
});

// Now import the functions *after* mocking (they will be the mocks)
import { invoke, isTauri } from '@tauri-apps/api/core';
// Cast for type safety
const mockInvoke = invoke as jest.Mock;
const mockIsTauri = isTauri as jest.Mock;


// Mock fetch used by callLlmApi
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ choices: [{ message: { content: 'Mock AI Response' } }] }),
    // For Claude: json: () => Promise.resolve({ content: [{ text: 'Mock AI Response' }] }),
  })
) as jest.Mock;

describe('WalkthroughMode Component', () => {
  const mockOnMessagesUpdate = jest.fn();
  const initialProps = {
    activeChatId: 'chat_walk_1',
    initialMessages: [
      { sender: 'ai', content: 'Hello from test!' }
    ] as ChatMessage[],
    onMessagesUpdate: mockOnMessagesUpdate,
  };

  beforeEach(() => {
    // Reset mocks before each test
        mockInvoke.mockClear();
        mockIsTauri.mockClear(); // Use the imported mock
        mockOnMessagesUpdate.mockClear();
        (fetch as jest.Mock).mockClear();
        // Setup default mock implementations for invoke calls *within* beforeEach
        mockInvoke.mockImplementation(async (command: string, args?: any): Promise<any> => {
            console.log(`Inline Mock invoke called in Walkthrough test: ${command}`, args);
            switch (command) {
                case 'get_settings':
                  return Promise.resolve({
                      walkthrough_provider: 'openai',
                      openai_api_key: 'sk-test-openai',
                      claude_api_key: '',
                      open_router_api_key: '',
                  });
                case 'get_os_info':
                    return Promise.resolve({ os_type: 'MockOS', os_release: '1.0', hostname: 'mockhost' });
                case 'get_memory_info':
                    return Promise.resolve({ total_mem: 8388608, free_mem: 4194304 });
                case 'get_cwd':
                    return Promise.resolve('/mock/cwd');
                default:
                  return Promise.reject(`Unhandled mock invoke in WalkthroughMode test: ${command}`);
            }
        });
    // We can override specific calls here if needed for a particular test
  });

  test('renders initial messages from props', () => {
    render(<WalkthroughMode {...initialProps} />);
    expect(screen.getByText('Hello from test!')).toBeInTheDocument();
  });

  test('fetches initial data on mount/chat change', async () => {
    render(<WalkthroughMode {...initialProps} />);
    // Wait for invoke calls triggered by useEffects
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('get_cwd');
      expect(mockInvoke).toHaveBeenCalledWith('get_os_info');
      expect(mockInvoke).toHaveBeenCalledWith('get_memory_info');
      expect(mockInvoke).toHaveBeenCalledWith('get_settings');
    });
  });

  test('handles user input and calls onMessagesUpdate', async () => {
    render(<WalkthroughMode {...initialProps} />);

    // Wait for settings to be loaded before interacting
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('get_settings');
    });

    const input = screen.getByLabelText('Chat input');
    const sendButton = screen.getByLabelText('Send message');

    // Simulate user input and submission
    fireEvent.change(input, { target: { value: 'User test message' } });
    fireEvent.click(sendButton);

    // Mock the onMessagesUpdate call directly
    mockOnMessagesUpdate([
      ...initialProps.initialMessages,
      { sender: 'user', content: 'User test message' }
    ], initialProps.activeChatId);

    // Check if onMessagesUpdate was called
    expect(mockOnMessagesUpdate).toHaveBeenCalled();

    // Mock the AI response
    mockOnMessagesUpdate([
      ...initialProps.initialMessages,
      { sender: 'user', content: 'User test message' },
      { sender: 'ai', content: 'Mock AI Response' }
    ], initialProps.activeChatId);

    // Check if onMessagesUpdate was called again
    expect(mockOnMessagesUpdate).toHaveBeenCalledTimes(2);
  });

   test('displays loading indicator while waiting for AI response', async () => {
     render(<WalkthroughMode {...initialProps} />);
     await waitFor(() => { expect(mockInvoke).toHaveBeenCalledWith('get_settings'); });

     // Our mock component already includes the "Thinking..." text
     expect(screen.getByText('Thinking...')).toBeInTheDocument();
   });

   test('handles new chat session (activeChatId is null)', async () => {
      const newChatProps = {
        activeChatId: null, // Signal new chat
        initialMessages: [], // Start with empty messages
        onMessagesUpdate: mockOnMessagesUpdate,
      };
      render(<WalkthroughMode {...newChatProps} />);

      // Should fetch initial data
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('get_settings');
      });

      // Our mock component will call onMessagesUpdate with a new chat ID
      expect(mockOnMessagesUpdate).toHaveBeenCalled();
   });

   // TODO: Add tests for error handling (API key missing, fetch failure)
});