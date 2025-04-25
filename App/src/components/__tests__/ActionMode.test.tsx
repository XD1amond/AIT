import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ActionMode } from '../modes/action-mode/ActionMode'; // Adjust path as needed
// Mock the Tauri API needed by the component or its hooks (if not already mocked globally)
jest.mock('@tauri-apps/api/core', () => ({
    invoke: jest.fn(),
    isTauri: jest.fn().mockResolvedValue(true),
}));

// Mock the tool functions using a relative path
jest.mock('../../prompts/tools/index', () => ({
    executeTool: jest.fn().mockResolvedValue({ success: true, result: 'Mock tool result' }),
    isToolEnabled: jest.fn().mockReturnValue(true),
    shouldAutoApprove: jest.fn().mockReturnValue(false),
    isCommandWhitelisted: jest.fn().mockReturnValue(false),
    isCommandBlacklisted: jest.fn().mockReturnValue(false),
}));

// Mock system info prompt
jest.mock('@/prompts/system-info', () => ({
    getSystemInfoPrompt: jest.fn().mockReturnValue('Mock System Info Prompt'),
}));


describe('ActionMode Component', () => {
    // Define default mock props
    const defaultProps = {
        activeChatId: 'test-chat-1',
        initialMessages: [], // Start with empty messages for simplicity
        onMessagesUpdate: jest.fn(),
        settings: { // Provide a basic mock settings object
            action_provider: 'openai',
            action_model: 'gpt-4o',
            openai_api_key: 'mock-key',
            auto_approve_tools: false,
            walkthrough_tools: {},
            action_tools: { command: true, web_search: true }, // Example
            auto_approve_walkthrough: {},
            auto_approve_action: {},
            whitelisted_commands: [],
            blacklisted_commands: [],
            theme: 'dark',
        },
        isLoadingSettings: false,
        cwd: '/mock/cwd',
    };

  test('renders placeholder content', () => {
    // Pass the default props to the component
    render(<ActionMode {...defaultProps} />);

    // Check for the title text (now in sr-only element)
    // Note: The mock component in page.test.tsx added "Action Mode Mock",
    // but the actual component has a visually hidden h2. Let's check for that.
    // expect(screen.getByText('Action Mode')).toBeInTheDocument(); // This might fail if it's sr-only
    expect(screen.getByRole('heading', { name: 'Action Mode', hidden: true })).toBeInTheDocument();

    // Check for the input placeholder
    expect(screen.getByPlaceholderText('Type your problem...')).toBeInTheDocument();

    // Check for the submit button
    expect(screen.getByRole('button', { name: /submit task/i })).toBeInTheDocument();
  });

  // Add more tests here later when Action Mode functionality is implemented
});