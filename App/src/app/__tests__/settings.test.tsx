import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SettingsPage from '../settings/page';

// Mock the Tauri API
jest.mock('@tauri-apps/api/core', () => ({
  invoke: jest.fn(),
  isTauri: jest.fn().mockResolvedValue(true),
}));

describe('Settings Page', () => {
  const mockSettings = {
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

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock the invoke function to return settings
    const { invoke } = require('@tauri-apps/api/core');
    invoke.mockImplementation((command, args) => {
      if (command === 'get_settings') {
        return Promise.resolve(mockSettings);
      }
      if (command === 'save_settings') {
        return Promise.resolve({ success: true });
      }
      return Promise.reject(new Error(`Unknown command: ${command}`));
    });
  });

  it('renders the settings page with tabs', async () => {
    render(<SettingsPage />);
    
    // Wait for settings to load
    await waitFor(() => {
      expect(screen.getByText('API Keys')).toBeInTheDocument();
      expect(screen.getByText('Models')).toBeInTheDocument();
      expect(screen.getByText('Tools')).toBeInTheDocument();
      expect(screen.getByText('Appearance')).toBeInTheDocument();
    });
  });

  it('loads and displays settings correctly', async () => {
    render(<SettingsPage />);
    
    // Wait for settings to load
    await waitFor(() => {
      // Check API keys tab
      const openaiInput = screen.getByLabelText('OpenAI') as HTMLInputElement;
      expect(openaiInput.value).toBe('test-openai-key');
      
      // Switch to Tools tab and check values
      fireEvent.click(screen.getByText('Tools'));
      
      // Check tool settings
      expect(screen.getByText('Tools')).toBeInTheDocument();
      expect(screen.getByText('Auto Approve')).toBeInTheDocument();
      
      // Check command whitelist/blacklist
      expect(screen.getByText('Command Whitelist')).toBeInTheDocument();
      expect(screen.getByText('Command Blacklist')).toBeInTheDocument();
    });
  });

  it('saves settings correctly', async () => {
    render(<SettingsPage />);
    
    // Wait for settings to load
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'API Keys' })).toBeInTheDocument();
    });
    
    // Save settings
    fireEvent.click(screen.getByText('Save All Settings'));
    
    // Verify invoke was called with the expected settings
    await waitFor(() => {
      const { invoke } = require('@tauri-apps/api/core');
      expect(invoke).toHaveBeenCalledWith('save_settings', {
        settings: expect.objectContaining({
          openai_api_key: 'test-openai-key',
          claude_api_key: 'test-claude-key',
          open_router_api_key: 'test-openrouter-key',
          brave_search_api_key: 'test-brave-key',
          walkthrough_provider: 'openai',
          walkthrough_model: 'gpt-4o',
          action_provider: 'claude',
          action_model: 'claude-3-opus-20240229',
          auto_approve_tools: false,
          walkthrough_tools: expect.objectContaining({
            command: true,
            web_search: true
          }),
          action_tools: expect.objectContaining({
            command: true,
            web_search: true
          }),
          auto_approve_walkthrough: expect.objectContaining({
            command: false,
            web_search: false
          }),
          auto_approve_action: expect.objectContaining({
            command: false,
            web_search: false
          }),
          whitelisted_commands: ['ls', 'echo'],
          blacklisted_commands: ['rm -rf', 'sudo'],
          theme: 'dark'
        })
      });
    });
  });
});