'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { getSystemInfoPrompt } from '../../../prompts/sections/system-info';
import { getWalkthroughModePrompt } from '@/prompts/modes/walkthrough-mode';
import { generateChatId } from '../../../lib/chat-storage';
import { ToolUse, ToolResponse, ToolProgressStatus } from '@/prompts/tools/types';
import { parseToolUse, containsToolUse, extractTextAroundToolUse } from '@/prompts/tools/tool-parser';
import { executeTool, isToolEnabled, shouldAutoApprove, isCommandWhitelisted, isCommandBlacklisted, ToolSettings } from '@/prompts/tools';
import { ChatComponent, ChatMessage, showErrorToast } from '@/components/shared/ChatComponent';

// Define ApiProvider type locally
export type ApiProvider = 'openai' | 'claude' | 'openrouter' | 'gemini' | 'deepseek';

// Define types for system info (matching Rust structs)
interface OsInfo {
  os_type: string;
  os_release: string;
  hostname: string;
}

interface MemoryInfo {
  total_mem: number; // in KB
  free_mem: number;  // in KB
}

interface SystemInfo {
  os?: OsInfo;
  memory?: MemoryInfo;
  error?: string;
}

// Define the shape of the settings object matching Rust struct
interface AppSettings {
    openai_api_key: string;
    claude_api_key: string;
    open_router_api_key: string;
    brave_search_api_key: string;
    gemini_api_key: string;
    deepseek_api_key: string;
    walkthrough_provider: ApiProvider;
    walkthrough_model: string;
    action_provider: ApiProvider;
    action_model: string;
    auto_approve_tools: boolean;
    walkthrough_tools: Record<string, boolean>;
    action_tools: Record<string, boolean>;
    auto_approve_walkthrough: Record<string, boolean>;
    auto_approve_action: Record<string, boolean>;
    whitelisted_commands: string[];
    blacklisted_commands: string[];
    theme: string;
}

// Re-export ChatMessage for other components to use
export type { ChatMessage } from '@/components/shared/ChatComponent';

// Props definition
interface WalkthroughModeProps {
  activeChatId: string | null; // ID of the chat to load, or null for new chat
  initialMessages: ChatMessage[]; // Initial messages for the chat (controlled by parent)
  onMessagesUpdate: (messages: ChatMessage[], chatId: string) => void; // Callback when messages change
  settings?: AppSettings | null; // Settings passed from parent
  isLoadingSettings?: boolean; // Loading status passed from parent
  cwd?: string | null; // Current working directory passed from parent
  // Mode switching props
  isModeSwitching?: boolean; // Flag indicating if mode is being switched
  previousMode?: 'action' | 'walkthrough' | null; // Previous mode before switching
  onModeSwitchComplete?: () => void; // Callback to notify when mode switch is complete
}


// --- Actual LLM API Call Implementation (remains the same) ---
async function callLlmApi(
    messages: ChatMessage[],
    systemPrompt: string,
    provider: ApiProvider,
    apiKey: string | undefined,
    modelName: string,
    toolUseHandler?: (toolUse: ToolUse) => Promise<ToolResponse>
): Promise<string | { content: string; toolUse: ToolUse }> {
  console.log(`Calling LLM API for provider: ${provider}...`);

  if (!apiKey) {
    return "Error: API key for the selected provider is not set or loaded. Please check Settings.";
  }

  let endpoint = '';
  let headers: HeadersInit = { 'Content-Type': 'application/json' };
  let body: Record<string, unknown> = {};

  try {
    switch (provider) {
      case 'openai':
        endpoint = 'https://api.openai.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        body = {
          model: modelName || "gpt-4o", // Use configured model
          messages: [
            { role: "system", content: systemPrompt },
            ...messages.map(msg => ({ role: msg.sender === 'ai' ? 'assistant' : 'user', content: msg.content }))
          ],
        };
        break;

      case 'claude':
        endpoint = 'https://api.anthropic.com/v1/messages';
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        body = {
          model: modelName || "claude-3-opus-20240229", // Use configured model
          system: systemPrompt,
          messages: messages.map(msg => ({ role: msg.sender === 'ai' ? 'assistant' : 'user', content: msg.content })),
          max_tokens: 1024,
        };
        break;

      case 'openrouter':
        endpoint = 'https://openrouter.ai/api/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        body = {
          model: modelName || "openai/gpt-4o", // Use configured model
          messages: [
            { role: "system", content: systemPrompt },
            ...messages.map(msg => ({ role: msg.sender === 'ai' ? 'assistant' : 'user', content: msg.content }))
          ],
        };
        break;
        
      case 'gemini':
        endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' +
                  (modelName || 'gemini-pro') + ':generateContent';
        headers['x-goog-api-key'] = apiKey;
        body = {
          contents: [
            { role: 'user', parts: [{ text: systemPrompt }] },
            ...messages.map(msg => ({
              role: msg.sender === 'ai' ? 'model' : 'user',
              parts: [{ text: msg.content }]
            }))
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          }
        };
        break;
        
      case 'deepseek':
        endpoint = 'https://api.deepseek.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        body = {
          model: modelName || "deepseek-chat",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages.map(msg => ({ role: msg.sender === 'ai' ? 'assistant' : 'user', content: msg.content }))
          ],
          max_tokens: 1024,
        };
        break;

      default:
        return `Error: Provider "${provider}" not implemented.`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`API Error (${response.status}):`, errorBody);
      return `Error: API request failed with status ${response.status}. Ensure the correct API key is set.`;
    }

    const data = await response.json();

    let aiContent = '';
    if (provider === 'openai' || provider === 'openrouter' || provider === 'deepseek') {
      aiContent = data.choices?.[0]?.message?.content;
    } else if (provider === 'claude') {
      aiContent = data.content?.[0]?.text;
    } else if (provider === 'gemini') {
      aiContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    }

    if (!aiContent) {
        console.error("Could not parse AI content from response:", data);
        return "Error: Received an unexpected response format from the AI.";
    }

    // Check if the response contains a tool use
    if (containsToolUse(aiContent) && toolUseHandler) {
      const toolUse = parseToolUse(aiContent);
      if (toolUse) {
        const { before } = extractTextAroundToolUse(aiContent);
        return { content: before || aiContent, toolUse };
      }
    }

    return aiContent.trim();

  } catch (error) {
    console.error("Network or other error calling LLM API:", error);
    return `Error: Failed to connect to the AI service. Check your internet connection and console logs. (${error instanceof Error ? error.message : String(error)})`;
  }
}
// --- End LLM API Call Implementation ---

export function WalkthroughMode({
  activeChatId,
  initialMessages,
  onMessagesUpdate,
  settings: externalSettings,
  isLoadingSettings: externalIsLoadingSettings,
  cwd: externalCwd,
  isModeSwitching,
  previousMode,
  onModeSwitchComplete
}: WalkthroughModeProps) {
  // Internal state for this component
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false); // For LLM responses
  const [systemInfo, setSystemInfo] = useState<SystemInfo>({});
  const [isFetchingSysInfo, setIsFetchingSysInfo] = useState(true);
  
  // Use external settings if provided, otherwise use internal state
  const [appSettings, setAppSettings] = useState<AppSettings | null>(externalSettings || null);
  const [isFetchingSettings, setIsFetchingSettings] = useState(externalIsLoadingSettings !== undefined ? externalIsLoadingSettings : true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [cwd, setCwd] = useState<string | null>(externalCwd || null);
  const [internalChatId, setInternalChatId] = useState<string | null>(null); // Tracks the ID for the current session
  const [pendingToolUse, setPendingToolUse] = useState<ToolUse | null>(null);
  const [toolProgress, setToolProgress] = useState<ToolProgressStatus | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);

  // Effect to manage internalChatId based on activeChatId prop
  useEffect(() => {
    const newChatId = activeChatId ?? generateChatId(); // Use active or generate new
    setInternalChatId(newChatId);
    setUserInput(''); // Reset input when chat changes
    console.log(`WalkthroughMode: Switched/Started chat ID: ${newChatId}`);
  }, [activeChatId]);
  
  // Effect to handle mode switching
  useEffect(() => {
    if (isModeSwitching && previousMode !== 'walkthrough' && internalChatId) {
      // Notify parent that mode switch is complete without adding a message
      if (onModeSwitchComplete) {
        onModeSwitchComplete();
      }
    }
  }, [isModeSwitching, previousMode, internalChatId, onModeSwitchComplete]);

  // Effect to fetch system data and settings - runs when internalChatId is set/changes
  useEffect(() => {
    if (!internalChatId) return; // Don't run if ID isn't set yet

    // Helper function to fetch only system info
    const fetchSystemInfo = async () => {
      if (typeof window === 'undefined' || !('Tauri' in window)) {
        setIsFetchingSysInfo(false);
        return;
      }

      setIsFetchingSysInfo(true);
      try {
        const tauriApi = window as any;
        if (tauriApi.__TAURI__?.invoke) {
          const os = await tauriApi.__TAURI__.invoke('get_os_info');
          const memory = await tauriApi.__TAURI__.invoke('get_memory_info');
          setSystemInfo({ os, memory });
        }
      } catch (error) {
        console.error("Failed to fetch system info:", error);
        setSystemInfo({ error: 'Could not load system information via Tauri.' });
      } finally {
        setIsFetchingSysInfo(false);
      }
    };

    // If external settings are provided, use them instead of fetching
    if (externalSettings !== undefined && externalCwd !== undefined) {
      setAppSettings(externalSettings);
      setCwd(externalCwd);
      setIsFetchingSettings(false);
      
      // Only fetch system info if needed
      fetchSystemInfo();
      return;
    }

    const fetchInitialData = async () => {
      console.log(`WalkthroughMode: Fetching initial data for chat ID: ${internalChatId}`);
      setIsFetchingSysInfo(true);
      setIsFetchingSettings(true);
      setSettingsError(null);
      setCwd(null);

      let sysInfoError: string | undefined;
      let statusNotes: string[] = [];

      try {
        // Check if we're in a browser environment
        if (typeof window === 'undefined') {
          // Handle server-side rendering case
          setSystemInfo({ error: 'Server-side rendering context.' });
          setSettingsError('Server-side rendering context. Cannot load settings.');
          statusNotes.push('App features unavailable during server rendering.');
          setIsFetchingSysInfo(false);
          setIsFetchingSettings(false);
          return;
        }

        // Safely check for Tauri
        const tauriAvailable = 'Tauri' in window;
        if (!tauriAvailable) {
          // Handle non-Tauri environment
          console.warn("Tauri API not available.");
          setSystemInfo({ error: 'Tauri context not found.' });
          setSettingsError('Tauri context not found. Cannot load settings.');
          statusNotes.push('Tauri features unavailable.');
          setIsFetchingSysInfo(false);
          setIsFetchingSettings(false);
          return;
        }

        // Use a safer approach to check for Tauri API
        const tauriApi = window as any;
        
        // Fetch CWD
        try {
          if (tauriApi.__TAURI__?.invoke) {
            const fetchedCwd = await tauriApi.__TAURI__.invoke('get_cwd');
            setCwd(fetchedCwd);
          } else {
            setCwd('unknown');
            statusNotes.push('Could not determine current directory.');
          }
        } catch (error) {
          console.error("Failed to fetch CWD:", error);
          setCwd('unknown');
          statusNotes.push('Could not determine current directory.');
        }

        // Fetch System Info
        try {
          if (tauriApi.__TAURI__?.invoke) {
            const os = await tauriApi.__TAURI__.invoke('get_os_info');
            const memory = await tauriApi.__TAURI__.invoke('get_memory_info');
            setSystemInfo({ os, memory });
          } else {
            sysInfoError = 'Could not load system information via Tauri.';
            setSystemInfo({ error: sysInfoError });
          }
        } catch (error) {
          console.error("Failed to fetch system info:", error);
          sysInfoError = 'Could not load system information via Tauri.';
          setSystemInfo({ error: sysInfoError });
        } finally {
          setIsFetchingSysInfo(false);
        }

        // Fetch Settings
        try {
          if (tauriApi.__TAURI__?.invoke) {
            const loadedSettings = await tauriApi.__TAURI__.invoke('get_settings');
            setAppSettings(loadedSettings);
            // Check for missing keys relevant to this mode
            if (!loadedSettings[`${loadedSettings.walkthrough_provider}_api_key` as keyof AppSettings]) {
              statusNotes.push(`API key for ${loadedSettings.walkthrough_provider} is missing. Please check Settings.`);
              setSettingsError(`API key for ${loadedSettings.walkthrough_provider} is missing.`);
            } else if (!loadedSettings.openai_api_key && !loadedSettings.claude_api_key && !loadedSettings.open_router_api_key) {
              // Less critical if the selected provider *has* a key, but good to note
              statusNotes.push('Some API keys are missing. Please configure in Settings.');
              // Don't set settingsError here if the selected provider key exists
            }
          } else {
            setSettingsError('Tauri API not available. Cannot load settings.');
            statusNotes.push('Could not load API settings via Tauri.');
          }
        } catch (err) {
          console.error("Failed to load settings:", err);
          const errorMsg = `Failed to load settings via Tauri: ${err instanceof Error ? err.message : String(err)}`;
          setSettingsError(errorMsg);
          statusNotes.push('Could not load API settings via Tauri.');
        } finally {
          setIsFetchingSettings(false);
        }
      } catch (error) {
        console.error("Error in fetchInitialData:", error);
        setIsFetchingSysInfo(false);
        setIsFetchingSettings(false);
      }

      // If it's a new chat (activeChatId was null) and we have an internal ID, create initial message
      if (!activeChatId && internalChatId && initialMessages.length === 0) {
        let initialContent = "Hello! I'm AIT, your tech support assistant for walkthrough guidance. How can I help you today?";
        if (statusNotes.length > 0) {
          initialContent += `\n\n(Note: ${statusNotes.join(' ')})`;
        }
        const initialAiMessage: ChatMessage = {
            id: `msg_${Date.now()}_init`, // Add ID
            sender: 'ai',
            content: initialContent,
            type: 'ai' // Add type
        };
        // Use the callback to update parent state and trigger save
        onMessagesUpdate([initialAiMessage], internalChatId);
      }
    };

    // Debounce or delay fetch slightly? For now, run directly.
    fetchInitialData();

  }, [internalChatId, activeChatId, initialMessages.length, onMessagesUpdate, externalSettings, externalCwd]); // Rerun when internalChatId changes

  // Scroll to bottom when messages change
  useEffect(() => {
    const element = viewportRef.current;
    if (element) {
      // Use requestAnimationFrame for smoother scrolling
      requestAnimationFrame(() => {
        element.scrollTop = element.scrollHeight;
      });
    }
  }, [initialMessages]); // Depend on initialMessages prop from parent

  // Handle tool approval
  const handleToolApproval = async (approved: boolean) => {
    if (!pendingToolUse || !internalChatId || !appSettings) return;
    
    const toolUse = pendingToolUse;
    setPendingToolUse(null);
    
    if (!approved) {
        // Add rejection message as toast
        showErrorToast('Tool use rejected by user.');
        setIsLoading(false);
        return;
    }
    
    // Execute the tool
    await executeToolAndUpdateMessages(toolUse);
  };

  // Get tool settings from app settings
  const getToolSettings = (): ToolSettings => {
    if (!appSettings) return {};
    
    return {
      auto_approve_tools: appSettings.auto_approve_tools,
      walkthrough_tools: appSettings.walkthrough_tools,
      action_tools: appSettings.action_tools,
      auto_approve_walkthrough: appSettings.auto_approve_walkthrough,
      auto_approve_action: appSettings.auto_approve_action,
      whitelisted_commands: appSettings.whitelisted_commands,
      blacklisted_commands: appSettings.blacklisted_commands,
    };
  };

  // Execute a tool and update messages with the result
  const executeToolAndUpdateMessages = async (toolUse: ToolUse) => {
    if (!internalChatId || !appSettings) return;
    
    setToolProgress({
      status: 'running',
      message: `Executing ${toolUse.name} tool...`,
    });
    
    try {
        // Check if the tool is enabled for walkthrough mode
        if (!isToolEnabled(toolUse.name, 'walkthrough', getToolSettings())) {
            showErrorToast({
                title: 'Tool Not Enabled',
                description: `Tool '${toolUse.name}' is not enabled for walkthrough mode.`
            });
            setIsLoading(false);
            setToolProgress(null);
            return;
        }
      
      // Special handling for command tool
      if (toolUse.name === 'command' && toolUse.params.command && typeof toolUse.params.command === 'string') {
        const command = toolUse.params.command;
        
            // Check blacklist first (blacklist overrides whitelist)
            if (isCommandBlacklisted(command, getToolSettings())) {
                showErrorToast({
                    title: 'Command Blacklisted',
                    description: `Command '${command}' is blacklisted and cannot be executed.`
                });
                setIsLoading(false);
                setToolProgress(null);
                return;
            }
        }
      
      // Execute the tool
      const result = await executeTool(
        toolUse,
        (status) => {
          setToolProgress(status);
        },
        'walkthrough',
        getToolSettings()
      );
      
        // Add tool response message
        const toolResponseMessage: ChatMessage = {
            id: `msg_${Date.now()}_tool_resp`, // Add ID
            sender: 'ai',
            content: result.success
                ? result.result || 'Tool executed successfully.'
                : `Error: ${result.error || 'Unknown error'}`,
            type: result.success ? 'tool-response' : 'error' // Add type based on success
        };

        const updatedMessages = [...initialMessages, toolResponseMessage];
        // Don't call onMessagesUpdate yet, wait for AI's final response in continueConversation
        // onMessagesUpdate(updatedMessages, internalChatId);
      
      // Continue with AI response after tool execution
      await continueConversation(updatedMessages);
    } catch (error) {
        showErrorToast({
            title: 'Tool Execution Error',
            description: error instanceof Error ? error.message : String(error)
        });
        setIsLoading(false);
    } finally {
      setToolProgress(null);
    }
  };

  // Continue the conversation with the AI after a tool execution
  const continueConversation = async (currentMessages: ChatMessage[]) => {
    if (!internalChatId || !appSettings) return;
    
    setIsLoading(true);
    
    // Get enabled tools from settings
    const enabledTools = appSettings?.walkthrough_tools ?
      Object.entries(appSettings.walkthrough_tools)
        .filter(([_, enabled]) => enabled)
        .map(([tool, _]) => tool)
      : [];
    
    // Construct system prompt
    const systemInfoDetails = getSystemInfoPrompt(cwd || 'unknown', 'walkthrough', undefined);
    const walkthroughModePrompt = getWalkthroughModePrompt(enabledTools);
    const finalSystemPrompt = `${walkthroughModePrompt}\n\n${systemInfoDetails}`;
    
    // Get API key
    const provider = appSettings.walkthrough_provider;
    let apiKey: string | undefined;
    switch (provider) {
        case 'openai': apiKey = appSettings.openai_api_key; break;
        case 'claude': apiKey = appSettings.claude_api_key; break;
        case 'openrouter': apiKey = appSettings.open_router_api_key; break;
        case 'gemini': apiKey = appSettings.gemini_api_key; break;
        case 'deepseek': apiKey = appSettings.deepseek_api_key; break;
        default: apiKey = undefined;
    }
    
    if (!apiKey) {
        showErrorToast({
            title: 'API Key Missing',
            description: `API key for selected provider (${provider}) is missing. Please check Settings.`
        });
        setIsLoading(false);
        return;
    }
    
    try {
      // Pass the messages to the API with tool use handler
      const aiResponse = await callLlmApi(
        currentMessages,
        finalSystemPrompt,
        provider,
        apiKey,
        appSettings.walkthrough_model,
        async (toolUse) => {
          // This is called when the AI wants to use a tool
          
          // Check if the tool is enabled for walkthrough mode
          if (!isToolEnabled(toolUse.name, 'walkthrough', getToolSettings())) {
            return {
              success: false,
              error: `Tool '${toolUse.name}' is not enabled for walkthrough mode.`,
            };
          }
          
          // Special handling for command tool
          if (toolUse.name === 'command' && toolUse.params.command && typeof toolUse.params.command === 'string') {
            const command = toolUse.params.command;
            
            // Check blacklist first (blacklist overrides whitelist)
            if (isCommandBlacklisted(command, getToolSettings())) {
              // Don't show toast, just return the error for the message
              return {
                success: false,
                error: `Command '${command}' is blacklisted and cannot be executed.`,
              };
            }
            
            // If command is whitelisted, execute it without approval
            if (isCommandWhitelisted(command, getToolSettings())) {
              return await executeTool(toolUse, undefined, 'walkthrough', getToolSettings());
            }
          }
          
          // Check if the tool should be auto-approved
          if (appSettings.auto_approve_tools || shouldAutoApprove(toolUse.name, 'walkthrough', getToolSettings())) {
            // Auto-approve the tool use
            return await executeTool(toolUse, undefined, 'walkthrough', getToolSettings());
          } else {
            // Request approval
            setPendingToolUse(toolUse);
            // Return a placeholder response
            return {
              success: false,
              error: 'Waiting for user approval',
            };
          }
        }
      );
      
      if (typeof aiResponse === 'string') {
          // Check if the string response is actually an error message
          if (aiResponse.startsWith("Error:")) {
              // Parse the error string into title and description
              const errorParts = aiResponse.split('.');
              const title = errorParts[0]?.trim() || 'API Error';
              const description = errorParts.slice(1).join('.').trim() || 'An unknown API error occurred.';
              showErrorToast({ title, description });
              setIsLoading(false);
          } else {
              // Regular text response
              const newAiMessage: ChatMessage = {
                  id: `msg_${Date.now()}_ai`, // Add ID
                  sender: 'ai',
                  content: aiResponse,
                  type: 'ai' // Add type
              };
              onMessagesUpdate([...currentMessages, newAiMessage], internalChatId);
              setIsLoading(false);
          }
      } else {
          // Tool use response
          const { content, toolUse } = aiResponse;
                let intermediateMessages = [...currentMessages];

                // Add AI's explanation before the tool use
                if (content) {
                    const explanationMessage: ChatMessage = {
                        id: `msg_${Date.now()}_tool_pre`, // Add ID
                        sender: 'ai',
                        content,
                        type: 'ai' // Add type
                    };
                    intermediateMessages.push(explanationMessage);
                    // Update UI to show explanation before potential approval dialog
                    onMessagesUpdate(intermediateMessages, internalChatId);
                }

                // Add tool request message (for potential approval UI)
                const toolRequestMessage: ChatMessage = {
                    id: `msg_${Date.now()}_tool_req`, // Add ID
                    sender: 'ai', // AI requests the tool
                    content: `Requesting to use ${toolUse.name} tool`,
                    type: 'tool-request',
                    toolUse: toolUse, // Attach toolUse data
                };
                intermediateMessages.push(toolRequestMessage);
                onMessagesUpdate(intermediateMessages, internalChatId); // Show request

                // Handle the tool use
                // Special handling for command tool
        if (toolUse.name === 'command' && toolUse.params.command && typeof toolUse.params.command === 'string') {
          const command = toolUse.params.command;
          
          // If command is whitelisted, execute it without approval
          if (isCommandWhitelisted(command, getToolSettings())) {
            await executeToolAndUpdateMessages(toolUse);
            return;
          }
        }
        
        if (appSettings.auto_approve_tools || shouldAutoApprove(toolUse.name, 'walkthrough', getToolSettings())) {
          // Auto-approve the tool use
          await executeToolAndUpdateMessages(toolUse);
        } else {
          // Request approval
          setPendingToolUse(toolUse);
        }
      }
    } catch (error) {
        console.error("LLM API call failed in continueConversation:", error);
        showErrorToast({
            title: 'AI Response Error',
            description: `Sorry, I encountered an error trying to respond. (${error instanceof Error ? error.message : String(error)})`
        });
        setIsLoading(false);
    }
  };

  // Handle sending a message
  const handleSendMessage = useCallback(async () => {
    if (!userInput.trim() || isLoading || !internalChatId) {
      if (!internalChatId) console.warn("Chat ID not set, cannot send message.");
      return;
    }
    
    // Check if settings are available (either from props or internal state)
    const currentSettings = externalSettings || appSettings;
    
    // If settings are not loaded or there's an error, show error message
    if (!currentSettings) {
        showErrorToast({
            title: 'Settings Error',
            description: 'Settings not loaded. Please try again.'
        });
        return;
    }

    if (settingsError) {
        showErrorToast({
            title: 'Settings Error',
            description: `${settingsError}. Please check your settings.`
        });
        return;
    }

        const newUserMessage: ChatMessage = {
            id: `msg_${Date.now()}_user`, // Add ID
            sender: 'user',
            content: userInput,
            type: 'user' // Add type
        };
        const currentMessages = initialMessages; // Get current messages from props
        const updatedMessages = [...currentMessages, newUserMessage];

    // Update parent state immediately with user message
    onMessagesUpdate(updatedMessages, internalChatId);
    setUserInput('');
    setIsLoading(true);

    // Continue the conversation with the AI
    await continueConversation(updatedMessages);
  }, [
    userInput,
    isLoading,
    internalChatId,
    appSettings,
    externalSettings,
    settingsError,
    initialMessages,
    onMessagesUpdate,
    cwd,
    isFetchingSettings
  ]);

  // Render the component
  return (
    <div key={internalChatId || 'new'} className="h-full flex flex-col">
      <ChatComponent
        messages={initialMessages}
        isLoading={isLoading}
        userInput={userInput}
        setUserInput={setUserInput}
        handleSendMessage={handleSendMessage}
        pendingToolUse={pendingToolUse}
        handleToolApproval={handleToolApproval}
        toolProgress={toolProgress}
        inputPlaceholder="Type your problem..."
      />
    </div>
  );
}