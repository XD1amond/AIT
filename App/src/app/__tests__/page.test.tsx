// App/src/app/__tests__/page.test.tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event'; // Import user-event
import '@testing-library/jest-dom';
import Home from '../page'; // Import the main page component

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

// Mock child components with props and callback simulation
const mockOnMessagesUpdate = jest.fn(); // Make callback mock accessible

jest.mock('@/components/modes/action-mode/ActionMode', () => ({
    __esModule: true,
    ActionMode: jest.fn(({ activeChatId, initialMessages, onMessagesUpdate, settings, isLoadingSettings, cwd }) => (
        <div data-testid="action-mode">
            Action Mode Mock (Chat: {activeChatId})
            {/* Simulate sending a message */}
            <button onClick={() => {
                if (activeChatId) {
                    const newMessage = { id: `am_msg_${Date.now()}`, sender: 'user', content: 'Action message', type: 'user' };
                    onMessagesUpdate([...initialMessages, newMessage], activeChatId);
                }
            }}>
                Send Action Message
            </button>
            {/* Display initial messages for verification */}
            {initialMessages.map((msg: any) => <p key={msg.id || msg.content}>{msg.content}</p>)}
            {/* Display settings/cwd for verification */}
            <p>Settings Loaded: {!isLoadingSettings && !!settings ? 'Yes' : 'No'}</p>
            <p>CWD: {cwd || 'N/A'}</p>
        </div>
    )),
}));

jest.mock('@/components/modes/walkthrough-mode/WalkthroughMode', () => ({
    __esModule: true,
    WalkthroughMode: jest.fn(({ activeChatId, initialMessages, onMessagesUpdate }) => {
        // Assign the mock function passed down from the test scope
        mockOnMessagesUpdate.mockImplementation(onMessagesUpdate);

        return (
            <div data-testid="walkthrough-mode">
                Walkthrough Mode Mock (Chat: {activeChatId})
                {/* Simulate sending a message */}
                <button onClick={() => {
                    if (activeChatId) {
                        const newMessage = { id: `wt_msg_${Date.now()}`, sender: 'user', content: 'Walkthrough message', type: 'user' };
                        // Use the captured mock function to call the actual prop
                        mockOnMessagesUpdate([...initialMessages, newMessage], activeChatId);
                    }
                }}>
                    Send Walkthrough Message
                </button>
                {/* Display initial messages for verification */}
                {initialMessages.map((msg: any) => <p key={msg.id || msg.content}>{msg.content}</p>)}
            </div>
        );
    }),
}));


// Mock Next.js Link component
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode, href: string }) => {
    return <a href={href}>{children}</a>;
  };
});

// Mock fetch used by callLlmApi (if WalkthroughMode were not mocked)
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ choices: [{ message: { content: 'Mock AI Response' } }] }),
  })
) as jest.Mock;


// Mock settings data
const mockSettingsData = {
    openai_api_key: 'test-openai-key',
    claude_api_key: 'test-claude-key',
    open_router_api_key: 'test-openrouter-key',
    brave_search_api_key: 'test-brave-key',
    walkthrough_provider: 'openai',
    walkthrough_model: 'gpt-4o',
    action_provider: 'claude',
    action_model: 'claude-3-opus-20240229',
    auto_approve_tools: false,
    walkthrough_tools: { command: true, web_search: true },
    action_tools: { command: true, web_search: true },
    auto_approve_walkthrough: { command: false, web_search: false },
    auto_approve_action: { command: false, web_search: false },
    whitelisted_commands: ['ls', 'echo'],
    blacklisted_commands: ['rm -rf', 'sudo'],
    theme: 'dark',
};

// Mock chat data store (can be manipulated by save/delete mocks)
let mockChatStore: any[] = [];

describe('Home Component (page.tsx)', () => {
    beforeEach(() => {
        // Reset mocks and store before each test
        mockInvoke.mockClear();
        mockIsTauri.mockClear();
        mockOnMessagesUpdate.mockClear(); // Clear the callback mock

        // Reset mock chat store
        const baseTime = 1745539300000;
        mockChatStore = [
            { id: 'chat_test_1', timestamp: baseTime - 10000, mode: 'walkthrough', messages: [{ id: 'msg1', sender: 'ai', content: 'Old message', type: 'ai' }] },
            { id: 'chat_test_2', timestamp: baseTime, mode: 'action', messages: [{ id: 'msg2', sender: 'user', content: 'Action request', type: 'user' }] },
        ];

        // Setup default mock implementations for invoke calls
        mockInvoke.mockImplementation(async (command: string, args?: any): Promise<any> => {
            switch (command) {
                case 'get_all_chats':
                    return Promise.resolve([...mockChatStore]); // Return copy
                case 'get_settings':
                    return Promise.resolve(mockSettingsData);
                case 'get_cwd':
                    return Promise.resolve('/mock/cwd');
                case 'save_chat':
                    const chatToSave = args?.chat;
                    if (!chatToSave) return Promise.reject('No chat data provided to mock save_chat');
                    const index = mockChatStore.findIndex(c => c.id === chatToSave.id);
                    if (index > -1) {
                        mockChatStore[index] = chatToSave; // Update existing
                    } else {
                        mockChatStore.push(chatToSave); // Add new
                    }
                    mockChatStore.sort((a, b) => b.timestamp - a.timestamp); // Keep sorted
                    return Promise.resolve();
                case 'delete_chat':
                    const chatIdToDelete = args?.chatId;
                    if (!chatIdToDelete) return Promise.reject('No chatId provided to mock delete_chat');
                    const initialLength = mockChatStore.length;
                    mockChatStore = mockChatStore.filter(c => c.id !== chatIdToDelete);
                    if (mockChatStore.length === initialLength) {
                        console.warn(`Mock delete_chat: Chat ID ${chatIdToDelete} not found in mock store.`);
                    }
                    return Promise.resolve();
                default:
                    return Promise.reject(`Unhandled mock invoke in page test: ${command}`);
            }
        });
    });

  test('renders correctly and loads chats, settings, and CWD on mount', async () => {
        // Remove duplicate render call
        render(<Home />);

        expect(screen.getByText('AIT')).toBeInTheDocument();
        expect(screen.getByLabelText('New Chat')).toBeInTheDocument();
        expect(screen.getByText('Settings')).toBeInTheDocument();

        // Check that initial data fetching invokes occurred
        await waitFor(() => {
            expect(mockInvoke).toHaveBeenCalledWith('get_all_chats');
            expect(mockInvoke).toHaveBeenCalledWith('get_settings');
            expect(mockInvoke).toHaveBeenCalledWith('get_cwd');
        });

        // Check if loaded chats are displayed in the sidebar
        await waitFor(() => {
            // Use data-testid to find chat buttons
            expect(screen.getByTestId('chat-button-chat_test_2')).toBeInTheDocument(); // Newest chat (Action request)
            expect(screen.getByTestId('chat-button-chat_test_1')).toBeInTheDocument(); // Older chat (Old message)
        });

        // Check if the initially active chat's messages are passed to the correct mode component
        // By default, Walkthrough mode is active, and the latest chat (chat_test_2) should be loaded
        await waitFor(() => {
            // Check props passed to the *active* mode component (Walkthrough initially)
            const walkthroughMode = screen.getByTestId('walkthrough-mode');
            // It should display the message from the *latest* chat (chat_test_2)
            expect(walkthroughMode).toHaveTextContent('Action request');
            // Verify settings and CWD are passed (check text added in mock)
            // Note: WalkthroughMode mock doesn't display these, check ActionMode mock if switching modes
            // expect(walkthroughMode).toHaveTextContent('Settings Loaded: Yes'); // Not in WT mock
            // expect(walkthroughMode).toHaveTextContent('CWD: /mock/cwd'); // Not in WT mock
        });
    });

    test('clicking "New Chat" button creates placeholder and clears messages', async () => {
        const user = userEvent.setup();
        render(<Home />);
        await waitFor(() => {
            expect(mockInvoke).toHaveBeenCalledWith('get_all_chats');
        });
        // Ensure initial message is shown
        await waitFor(() => {
            expect(screen.getByTestId('walkthrough-mode')).toHaveTextContent('Action request');
        });

        const newChatButton = screen.getByLabelText('New Chat');
        await user.click(newChatButton);

        // Check for "New Chat" placeholder in the sidebar
        // Check for "New Chat" placeholder using data-testid (will start with 'new_')
        await waitFor(() => {
            // Find the button whose data-testid starts with 'chat-button-new_'
            const newChatPlaceholder = screen.getByTestId(/chat-button-new_/);
            expect(newChatPlaceholder).toBeInTheDocument();
            expect(newChatPlaceholder).toHaveTextContent('New Chat');
        });

        // Check that the active mode component shows no messages
        await waitFor(() => {
            const walkthroughMode = screen.getByTestId('walkthrough-mode');
            // Check the text content specifically within the message area if possible
            // For this mock, we check it doesn't contain the old messages
            expect(walkthroughMode).not.toHaveTextContent('Action request');
            expect(walkthroughMode).not.toHaveTextContent('Old message');
            // Check the specific text added to the mock for empty messages
            // (Adjust if mock changes)
            expect(walkthroughMode).toHaveTextContent('Walkthrough Mode Mock (Chat: new_'); // Check part of the temp ID
        });
    });

    test('clicking a chat in the sidebar loads its messages and passes props', async () => {
        const user = userEvent.setup();
        render(<Home />);
        await waitFor(() => {
            expect(mockInvoke).toHaveBeenCalledWith('get_all_chats');
        });

        // Wait for the button for the older chat using data-testid
        const olderChatButton = await screen.findByTestId('chat-button-chat_test_1');

        // Click the older chat
        await user.click(olderChatButton);

        // Verify the WalkthroughMode mock now displays the older message
        await waitFor(() => {
            const walkthroughMode = screen.getByTestId('walkthrough-mode');
            expect(walkthroughMode).toHaveTextContent('Old message');
            expect(walkthroughMode).not.toHaveTextContent('Action request');
            // Check the activeChatId prop passed to the mock
            expect(walkthroughMode).toHaveTextContent('Walkthrough Mode Mock (Chat: chat_test_1)');
            // Verify settings and CWD are still passed (check text added in mock)
            // Note: WalkthroughMode mock doesn't display these
            // expect(walkthroughMode).toHaveTextContent('Settings Loaded: Yes');
            // expect(walkthroughMode).toHaveTextContent('CWD: /mock/cwd');
        });
    });

    test('sending a message triggers onMessagesUpdate and invokes save_chat', async () => {
        const user = userEvent.setup();
        render(<Home />);

        // Wait for initial load and ensure the latest chat is active
        await waitFor(() => {
            expect(screen.getByTestId('walkthrough-mode')).toHaveTextContent('Action request');
        });

        // Find the "Send" button within the WalkthroughMode mock
        const sendMessageButton = screen.getByRole('button', { name: /Send Walkthrough Message/i });

        // Click the button to simulate sending a message
        await user.click(sendMessageButton);

        // Verify that the onMessagesUpdate mock (captured via mockOnMessagesUpdate) was called
        await waitFor(() => {
            expect(mockOnMessagesUpdate).toHaveBeenCalledTimes(1);
            // Check the arguments passed to onMessagesUpdate
            const [updatedMessages, chatId] = mockOnMessagesUpdate.mock.calls[0];
            expect(chatId).toBe('chat_test_2'); // Should be the active chat ID
            expect(updatedMessages).toHaveLength(2); // Initial message + new message
            expect(updatedMessages[1].content).toBe('Walkthrough message');
            expect(updatedMessages[1].sender).toBe('user');
        });

        // Verify that invoke('save_chat', ...) was called by handleMessagesUpdate in page.tsx
        await waitFor(() => {
            expect(mockInvoke).toHaveBeenCalledWith('save_chat', expect.objectContaining({
                chat: expect.objectContaining({
                    id: 'chat_test_2', // Saving the correct chat
                    messages: expect.arrayContaining([
                        expect.objectContaining({ content: 'Action request' }),
                        expect.objectContaining({ content: 'Walkthrough message' }),
                    ]),
                    mode: 'walkthrough', // Uses the current mode from page.tsx state
                })
            }));
        });
    });

    test('deleting a chat invokes delete_chat and removes it from UI', async () => {
        const user = userEvent.setup();
        render(<Home />);

        // Wait for the chat button to delete using data-testid
        const chatToDeleteButton = await screen.findByTestId('chat-button-chat_test_1');
        const chatToDeleteContainer = chatToDeleteButton.closest('div.group'); // Find the parent group div
        expect(chatToDeleteContainer).toBeInTheDocument();

        // Find the delete button within the specific chat's container
        // It might be initially hidden (opacity-0), so need careful selection
        const deleteButton = chatToDeleteContainer!.querySelector('button[aria-label="Delete chat"]');
        expect(deleteButton).toBeInTheDocument();

        // Simulate hover to make button visible if needed (userEvent handles this implicitly)
        // Click the delete button
        await user.click(deleteButton!);

        // Verify invoke('delete_chat') was called
        await waitFor(() => {
            expect(mockInvoke).toHaveBeenCalledWith('delete_chat', { chatId: 'chat_test_1' });
        });

        // Verify the chat is removed from the sidebar UI using data-testid
        await waitFor(() => {
            expect(screen.queryByTestId('chat-button-chat_test_1')).not.toBeInTheDocument();
        });

        // Verify the other chat still exists using data-testid
        expect(screen.getByTestId('chat-button-chat_test_2')).toBeInTheDocument();
    });


    // --- Tests for filtering/sorting are still skipped due to Select component issues ---
    test.skip('filtering chats works', async () => {
    render(<Home />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('get_all_chats');
    });

    // Wait for list items to be present
    await screen.findByText(/Old message/);
    await screen.findByText(/Action request/);
    
    // This test is skipped because the Select component interactions
    // are difficult to test in JSDOM environment
   });

   // Skip this test for now as it's having issues with the Select component in JSDOM
   test.skip('sorting chats works', async () => {
    render(<Home />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('get_all_chats');
    });

    const chatList = screen.getByTestId('chat-list');
    
    // Initial: Newest first - wait for buttons to be rendered
    await screen.findByText(/Action request/);
    
    // This test is skipped because the Select component interactions
    // are difficult to test in JSDOM environment
   });

  // TODO: Test handleMessagesUpdate callback
});