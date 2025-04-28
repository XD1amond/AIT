'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';
import { getSystemInfoPrompt } from '../../../prompts/sections/system-info';
import { getWalkthroughModePrompt } from '@/prompts/modes/walkthrough-mode';
import { saveChat, generateChatId, SavedChat } from '../../../lib/chat-storage';
import { ToolApproval } from '@/components/ui/tool-approval';
import { ToolUse, ToolResponse, ToolProgressStatus } from '@/prompts/tools/types';
import { parseToolUse, containsToolUse, extractTextAroundToolUse } from '@/prompts/tools/tool-parser';
import { executeTool, isToolEnabled, shouldAutoApprove, isCommandWhitelisted, isCommandBlacklisted, ToolSettings } from '@/prompts/tools';

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

export interface ChatMessage {
    id: string; // Add ID for better key management and consistency
    sender: 'user' | 'ai';
    content: string;
    toolUse?: ToolUse; // For tool-related messages
    type?: 'user' | 'ai' | 'error' | 'tool-request' | 'tool-response' | 'status'; // Add type for styling
}

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
      return `Error: API request failed with status ${response.status}. Check console for details. Ensure the correct API key is set.`;
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
      // Add a system message indicating the mode switch
      const modeSwitchMessage: ChatMessage = {
        id: `msg_${Date.now()}_mode_switch`,
        sender: 'ai',
        content: 'Mode switched to Walkthrough Mode. I will now guide you through tasks step-by-step without executing commands for you.',
        type: 'status'
      };
      
      // Update messages with the mode switch notification
      const updatedMessages = [...initialMessages, modeSwitchMessage];
      
      // Save the updated messages directly
      if (internalChatId) {
        onMessagesUpdate(updatedMessages, internalChatId);
      }
      
      // Notify parent that mode switch is complete
      if (onModeSwitchComplete) {
        onModeSwitchComplete();
      }
    }
  }, [isModeSwitching, previousMode, internalChatId, initialMessages, onMessagesUpdate, onModeSwitchComplete]);

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
        // Add rejection message
        const rejectionMessage: ChatMessage = {
            id: `msg_${Date.now()}_reject`, // Add ID
            sender: 'ai',
            content: 'Tool use rejected by user.',
            type: 'error' // Add type
        };
        onMessagesUpdate([...initialMessages, rejectionMessage], internalChatId);
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
            const errorMessage: ChatMessage = {
                id: `msg_${Date.now()}_tool_disabled`, // Add ID
                sender: 'ai',
                content: `Tool '${toolUse.name}' is not enabled for walkthrough mode.`,
                type: 'error' // Add type
            };
            onMessagesUpdate([...initialMessages, errorMessage], internalChatId);
            setIsLoading(false);
            setToolProgress(null);
        return;
      }
      
      // Special handling for command tool
      if (toolUse.name === 'command' && toolUse.params.command && typeof toolUse.params.command === 'string') {
        const command = toolUse.params.command;
        
            // Check blacklist first (blacklist overrides whitelist)
            if (isCommandBlacklisted(command, getToolSettings())) {
                const errorMessage: ChatMessage = {
                    id: `msg_${Date.now()}_cmd_blacklisted`, // Add ID
                    sender: 'ai',
                    content: `Command '${command}' is blacklisted and cannot be executed.`,
                    type: 'error' // Add type
                };
                onMessagesUpdate([...initialMessages, errorMessage], internalChatId);
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
        // Add error message
        const errorContent = `Error executing tool: ${error instanceof Error ? error.message : String(error)}`;
        const errorMessage: ChatMessage = {
            id: `msg_${Date.now()}_tool_exec_err`, // Add ID
            sender: 'ai',
            content: errorContent,
            type: 'error' // Add type
        };
        onMessagesUpdate([...initialMessages, errorMessage], internalChatId);
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
        const errorMsg = `API key for selected provider (${provider}) is missing. Please check Settings.`;
        const errorAiMessage: ChatMessage = {
            id: `msg_${Date.now()}_api_key_err`, // Add ID
            sender: 'ai',
            content: errorMsg,
            type: 'error' // Add type
        };
        onMessagesUpdate([...currentMessages, errorAiMessage], internalChatId);
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
                // Regular text response
                const newAiMessage: ChatMessage = {
                    id: `msg_${Date.now()}_ai`, // Add ID
                    sender: 'ai',
                    content: aiResponse,
                    type: 'ai' // Add type
                };
                onMessagesUpdate([...currentMessages, newAiMessage], internalChatId);
                setIsLoading(false);
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
        const errorContent = `Sorry, I encountered an error trying to respond. (${error instanceof Error ? error.message : String(error)})`;
        const errorAiMessage: ChatMessage = {
            id: `msg_${Date.now()}_llm_err`, // Add ID
            sender: 'ai',
            content: errorContent,
            type: 'error' // Add type
        };
        onMessagesUpdate([...currentMessages, errorAiMessage], internalChatId);
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
        const errorMessage: ChatMessage = {
            id: `msg_${Date.now()}_settings_err1`, // Add ID
            sender: 'ai',
            content: 'Settings not loaded. Please try again.',
            type: 'error' // Add type
        };
        onMessagesUpdate([...initialMessages, errorMessage], internalChatId);
        return;
    }

    if (settingsError) {
        const errorMessage: ChatMessage = {
            id: `msg_${Date.now()}_settings_err2`, // Add ID
            sender: 'ai',
            content: `Error with settings: ${settingsError}. Please check your settings.`,
            type: 'error' // Add type
        };
        onMessagesUpdate([...initialMessages, errorMessage], internalChatId);
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
    <motion.div
      // Use key to force re-mount when chat ID changes, ensuring state reset
      key={internalChatId || 'new'}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full h-full flex flex-col p-4"
    >
      {/* Message Area */}
      <ScrollArea className="flex-grow mb-4 pr-4 -mr-4">
        <div ref={viewportRef} className="space-y-4">
          {/* Render messages from initialMessages prop */}
          {initialMessages.map((msg, index) => (
            <div
                // Use message ID for key
                key={msg.id}
                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    // Apply styling based on sender and type, matching ActionMode
                    className={`max-w-[80%] p-3 rounded-lg text-sm ${ // Added text-sm for consistency
                        msg.sender === 'user'
                            ? 'bg-blue-600 text-white' // User message style
                            : msg.type === 'error' // Check type for specific styling
                            ? 'bg-red-100 dark:bg-red-900/50 text-red-900 dark:text-red-200' // Error style
                            : msg.type === 'tool-request'
                            ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200' // Tool request style
                            : msg.type === 'tool-response'
                            ? 'bg-green-100 dark:bg-green-900/50 text-green-900 dark:text-green-200' // Tool response style
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100' // Default AI/Status style
                    }`}
                >
                    {/* Render newlines correctly */}
                    {msg.content.split('\n').map((line, i) => (
                  <p key={i} style={{ minHeight: '1em' }}>{line || '\u00A0'}</p>
                ))}
              </motion.div>
            </div>
          ))}
           {isLoading && !toolProgress && (
             <div className="flex justify-start">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="max-w-[80%] p-3 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 animate-pulse"
                >
                    Thinking...
                </motion.div>
             </div>
           )}
           {toolProgress && (
             <div className="flex justify-start">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="max-w-[80%] p-3 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-900 dark:text-blue-200"
                >
                  <div className="flex items-center">
                    <div className="mr-2 h-4 w-4 rounded-full bg-blue-500 animate-pulse"></div>
                    <p>{toolProgress.message || 'Executing tool...'}</p>
                  </div>
                  {toolProgress.progress !== undefined && (
                    <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                      <div 
                        className="bg-blue-600 h-2.5 rounded-full" 
                        style={{ width: `${toolProgress.progress}%` }}
                      ></div>
                    </div>
                  )}
                </motion.div>
             </div>
           )}
        </div>
      </ScrollArea>

      {/* Tool Approval Dialog */}
      {pendingToolUse && (
        <ToolApproval
          toolUse={pendingToolUse}
          onApprove={() => handleToolApproval(true)}
          onReject={() => handleToolApproval(false)}
          isOpen={!!pendingToolUse}
        />
      )}

      {/* Input Bar */}
      <div className="flex space-x-2 items-center border-t pt-4">
        <Input
          placeholder="Type your problem..."
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          disabled={isLoading} // Only disable if loading
          className="flex-1 h-12"
          aria-label="Chat input"
        />
        <Button
            onClick={handleSendMessage}
            disabled={isLoading || !userInput.trim()} // Only disable if loading or no input
            className="h-12 w-12"
            aria-label="Send message"
        >
          <Send className="h-5 w-5" />
        </Button>
      </div>
    </motion.div>
  );
}