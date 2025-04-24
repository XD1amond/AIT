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

// Mock child components
// Corrected mock path
jest.mock('@/components/modes/action-mode/ActionMode', () => ({
  ActionMode: jest.fn(() => <div data-testid="action-mode">Action Mode Mock</div>),
}));
// Corrected mock path
jest.mock('@/components/modes/walkthrough-mode/WalkthroughMode', () => ({
  WalkthroughMode: jest.fn(({ initialMessages }) => ( // Mock receives props
    <div data-testid="walkthrough-mode">
      {initialMessages.map((msg: any, index: number) => (
        <p key={index}>{msg.content}</p>
      ))}
    </div>
  )),
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


describe('Home Component (page.tsx)', () => {
  beforeEach(() => {
    // Reset mocks before each test
                mockInvoke.mockClear();
                mockIsTauri.mockClear(); // Clear the imported mock function
                // Setup default mock implementations for invoke calls *within* beforeEach
                mockInvoke.mockImplementation(async (command: string, args?: any): Promise<any> => {
                    // console.log(`Mock invoke called in page test: ${command}`, args); // Optional: reduce noise
                    switch (command) {
                        case 'get_all_chats':
                          return Promise.resolve([ // Consistent mock data
                             { id: 'chat_test_1', timestamp: Date.now() - 10000, mode: 'walkthrough', messages: [{sender: 'ai', content: 'Old message'}] },
                             { id: 'chat_test_2', timestamp: Date.now(), mode: 'action', messages: [{sender: 'user', content: 'Action request'}] },
                          ]);
                        case 'save_chat':
                          return Promise.resolve(); // Simple resolve for page test
                        default:
                          return Promise.reject(`Unhandled mock invoke in page test: ${command}`);
                     }
                });
  });

  test('renders correctly and loads chats on mount', async () => {
    render(<Home />);

    expect(screen.getByText('AIT')).toBeInTheDocument();
    expect(screen.getByLabelText('New Chat')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('get_all_chats');
    });

    // Check if loaded chats are displayed (using data from manual mock)
    await waitFor(() => {
        expect(screen.getByText(/Action request/)).toBeInTheDocument();
        expect(screen.getByText(/Old message/)).toBeInTheDocument();
    });
  });

  test('clicking "New Chat" button clears active chat', async () => {
    render(<Home />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('get_all_chats');
    });
    // Ensure initial message is shown in mock component
    await waitFor(() => {
        expect(screen.getByTestId('walkthrough-mode')).toHaveTextContent('Action request');
    });


        const newChatButton = screen.getByLabelText('New Chat');
        await userEvent.click(newChatButton);

    await waitFor(() => {
        const walkthroughMode = screen.getByTestId('walkthrough-mode');
        expect(walkthroughMode).not.toHaveTextContent('Action request');
        expect(walkthroughMode).not.toHaveTextContent('Old message');
        // Check if it renders empty (or initial AI message if WalkthroughMode mock added it)
        expect(walkthroughMode.innerHTML).toBe(''); // Assuming empty messages passed
    });
  });

  test('clicking a chat in the sidebar loads its messages', async () => {
    render(<Home />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('get_all_chats');
        });
    
        // Wait for the button corresponding to the chat text to appear
        const olderChatButton = await screen.findByRole('button', { name: /Old message/i });
        // expect(olderChatButton).toBeInTheDocument(); // findByRole includes this check
    
                // No need for if check, findByRole throws error if not found
                await userEvent.click(olderChatButton);
            // Remove extra brace below

    await waitFor(() => {
        const walkthroughMode = screen.getByTestId('walkthrough-mode');
        expect(walkthroughMode).toHaveTextContent('Old message');
        expect(walkthroughMode).not.toHaveTextContent('Action request');
    });
  });

   test('filtering chats works', async () => {
    render(<Home />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('get_all_chats');
    });

        // Wait for list items to be present
        await screen.findByText(/Old message/);
        await screen.findByText(/Action request/);
    
            // Use combobox role for shadcn Select trigger
            const filterSelectTrigger = screen.getByRole('combobox', { name: 'Filter chats by mode' });
            await userEvent.click(filterSelectTrigger); // Use userEvent for more realistic click
        
            // Find and click the 'Action' option
            const actionOption = await screen.findByRole('option', { name: 'Action' });
            await userEvent.click(actionOption);

    await waitFor(() => {
        expect(screen.queryByText(/Old message/)).not.toBeInTheDocument();
        expect(screen.getByText(/Action request/)).toBeInTheDocument();
    });

            // Filter by 'Walkthrough'
            await userEvent.click(filterSelectTrigger); // Re-open dropdown
            // Wait for options again
            const walkthroughOption = await screen.findByRole('option', { name: 'Walkthrough' });
            await userEvent.click(walkthroughOption);

     await waitFor(() => {
        expect(screen.getByText(/Old message/)).toBeInTheDocument();
        expect(screen.queryByText(/Action request/)).not.toBeInTheDocument();
    });
  });

   test('sorting chats works', async () => {
    render(<Home />);
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('get_all_chats');
    });

        const chatList = screen.getByTestId('chat-list');
    
        // Initial: Newest first - wait for buttons to be rendered
        await screen.findByText(/Action request/);
        const buttonsInitial = screen.getAllByRole('button', { name: /Chat/i });
        expect(buttonsInitial[0]).toHaveTextContent(/Action request/);
        expect(buttonsInitial[1]).toHaveTextContent(/Old message/);

        // Sort by 'Oldest'
        const sortSelectTrigger = screen.getByRole('combobox', { name: 'Sort chats by date' });
        await userEvent.click(sortSelectTrigger);
        // Wait for options
        const oldestOption = await screen.findByRole('option', { name: 'Oldest First' });
        await userEvent.click(oldestOption);


    await waitFor(() => {
        // Re-query buttons within the updated list
        const buttonsSorted = screen.getAllByRole('button', { name: /Chat/i });
        expect(buttonsSorted[0]).toHaveTextContent(/Old message/);
        expect(buttonsSorted[1]).toHaveTextContent(/Action request/);
    });
  });

  // TODO: Test handleMessagesUpdate callback
});