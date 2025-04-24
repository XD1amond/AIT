// App/src/components/__tests__/WalkthroughMode.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
// Import from the correct location
import { WalkthroughMode, ChatMessage } from '../modes/walkthrough-mode/WalkthroughMode';

// Import the module to be mocked
import * as tauriCore from '@tauri-apps/api/core';

// Define mock functions *before* calling jest.mock
const mockInvokeImplementation = jest.fn();
const mockIsTauriImplementation = jest.fn(() => Promise.resolve(true));

// Mock the module, providing the implementation in the factory
jest.mock('@tauri-apps/api/core', () => ({
  __esModule: true, // Required for ES Modules
  invoke: mockInvokeImplementation,
  isTauri: mockIsTauriImplementation,
}));

// Now import the functions *after* mocking (they will be the mocks)
import { invoke, isTauri } from '@tauri-apps/api/core';
// Cast for type safety
const mockInvoke = invoke as jest.Mock;


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
        mockIsTauriImplementation.mockClear(); // Clear this mock too
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

    // Ensure button is enabled before clicking
    await waitFor(() => expect(sendButton).toBeEnabled());

    fireEvent.change(input, { target: { value: 'User test message' } });
    fireEvent.click(sendButton);

    // Check if onMessagesUpdate was called with the user message
    await waitFor(() => {
      expect(mockOnMessagesUpdate).toHaveBeenCalledWith(
        expect.arrayContaining([
          ...initialProps.initialMessages,
          expect.objectContaining({ sender: 'user', content: 'User test message' }),
        ]),
        initialProps.activeChatId // Expect the active chat ID
      );
    });

    // Check if fetch (for LLM API) was called
    expect(fetch).toHaveBeenCalled();

    // Check if onMessagesUpdate was called again with the AI response
    await waitFor(() => {
       expect(mockOnMessagesUpdate).toHaveBeenCalledWith(
         expect.arrayContaining([
           ...initialProps.initialMessages,
           expect.objectContaining({ sender: 'user', content: 'User test message' }),
           expect.objectContaining({ sender: 'ai', content: 'Mock AI Response' }),
         ]),
         initialProps.activeChatId
       );
    });

     // Check if input is cleared
     expect(input).toHaveValue('');
  });

   test('displays loading indicator while waiting for AI response', async () => {
     // Make fetch promise hang
     let resolveFetch: any;
     (fetch as jest.Mock).mockImplementationOnce(() =>
        new Promise((resolve) => { resolveFetch = resolve; })
     );

     render(<WalkthroughMode {...initialProps} />);
     await waitFor(() => { expect(mockInvoke).toHaveBeenCalledWith('get_settings'); });

     const input = screen.getByLabelText('Chat input');
     const sendButton = screen.getByLabelText('Send message');

     await waitFor(() => expect(sendButton).toBeEnabled());
     fireEvent.change(input, { target: { value: 'Test loading' } });
     fireEvent.click(sendButton);

     // Check for loading indicator
     await waitFor(() => {
        expect(screen.getByText('Thinking...')).toBeInTheDocument();
     });

     // Resolve the fetch and check if loading disappears
     resolveFetch({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: 'Done loading' } }] }) });

     await waitFor(() => {
        expect(screen.queryByText('Thinking...')).not.toBeInTheDocument();
     });
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

      // Should call onMessagesUpdate with the initial AI message and a generated ID
      await waitFor(() => {
        expect(mockOnMessagesUpdate).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ sender: 'ai', content: expect.stringContaining("Hello! I'm AIT") })
          ]),
          expect.stringMatching(/^chat_/) // Check for a generated chat ID
        );
      });
   });

   // TODO: Add tests for error handling (API key missing, fetch failure)
});