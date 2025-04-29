'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getSystemInfoPrompt } from '@/prompts/sections/system-info';
import { ToolUse, ToolResponse, ToolProgressStatus } from '@/prompts/tools/types';
import { parseToolUse, containsToolUse, extractTextAroundToolUse } from '@/prompts/tools/tool-parser';
import { executeTool, isToolEnabled, shouldAutoApprove, isCommandWhitelisted, isCommandBlacklisted, ToolSettings } from '@/prompts/tools';
import { ChatComponent, ChatMessage, showErrorToast } from '@/components/shared/ChatComponent';
import { getActionModePrompt } from '@/prompts/modes/action-mode';

// Props for Action Mode, similar to WalkthroughMode
interface ActionModeProps {
    activeChatId: string | null;
    initialMessages: ChatMessage[]; // Use ChatMessage from Walkthrough
    onMessagesUpdate: (updatedMessages: ChatMessage[], chatId: string) => void;
    // Pass settings down as a prop instead of loading internally
    settings: AppSettings | null;
    isLoadingSettings: boolean; // Indicate if settings are still loading
    cwd: string | null; // Pass CWD as prop
    // Mode switching props
    isModeSwitching?: boolean; // Flag indicating if mode is being switched
    previousMode?: 'action' | 'walkthrough' | null; // Previous mode before switching
    onModeSwitchComplete?: () => void; // Callback to notify when mode switch is complete
}


// Define the interface for settings
interface AppSettings {
  openai_api_key: string;
  claude_api_key: string;
  open_router_api_key: string;
  brave_search_api_key: string;
  gemini_api_key: string;
  deepseek_api_key: string;
  action_provider: string;
  action_model: string;
  auto_approve_tools: boolean;
  walkthrough_tools: Record<string, boolean>;
  action_tools: Record<string, boolean>;
  auto_approve_walkthrough: Record<string, boolean>;
  auto_approve_action: Record<string, boolean>;
  whitelisted_commands: string[];
  blacklisted_commands: string[];
  [key: string]: any;
}


// Accept props
export function ActionMode({
    activeChatId,
    initialMessages,
    onMessagesUpdate,
    settings, // Receive settings as prop
    isLoadingSettings, // Receive loading status as prop
    cwd, // Receive CWD as prop
    isModeSwitching, // Receive mode switching flag
    previousMode, // Receive previous mode
    onModeSwitchComplete // Receive callback for mode switch completion
}: ActionModeProps) {
  const [task, setTask] = useState('');
  // Use initialMessages prop to initialize state
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  // Remove internal CWD and settings state/fetching
  // const [cwd, setCwd] = useState<string | null>(null);
  // const [settings, setSettings] = useState<AppSettings | null>(null);
  // const [isFetchingSettings, setIsFetchingSettings] = useState(true);
  const [pendingToolUse, setPendingToolUse] = useState<ToolUse | null>(null);
  const [toolProgress, setToolProgress] = useState<ToolProgressStatus | null>(null);

  // Use activeChatId to reset messages when chat changes
  useEffect(() => {
      // Always update messages from initialMessages
      setMessages(initialMessages);
      
      // Reset other relevant state if needed when chat switches
      setIsLoading(false);
      setPendingToolUse(null);
      setToolProgress(null);
      setTask(''); // Clear input when chat changes
      
      // If activeChatId is null, this is a new chat
      if (!activeChatId) {
          console.log("ActionMode: New chat detected");
      } else {
          console.log(`ActionMode: Switched to chat ID: ${activeChatId}`);
      }
  }, [activeChatId, initialMessages]);

  // Effect to handle mode switching
  useEffect(() => {
      if (isModeSwitching && previousMode !== 'action') {
          // Notify parent that mode switch is complete without adding a message
          if (onModeSwitchComplete) {
              onModeSwitchComplete();
          }
      }
  }, [isModeSwitching, previousMode, onModeSwitchComplete]);

  // Remove internal ID generation if ChatMessage provides it
  // const nextId = useRef(0);
  // No need for viewportRef as it's handled by ChatComponent

  // Remove internal settings/CWD fetching useEffect

  // Scroll to bottom is now handled by ChatComponent

  // Get tool settings from app settings
  const getToolSettings = (): ToolSettings => {
    if (!settings) return {};
    
    return {
      auto_approve_tools: settings.auto_approve_tools,
      walkthrough_tools: settings.walkthrough_tools,
      action_tools: settings.action_tools,
      auto_approve_walkthrough: settings.auto_approve_walkthrough,
      auto_approve_action: settings.auto_approve_action,
      whitelisted_commands: settings.whitelisted_commands,
      blacklisted_commands: settings.blacklisted_commands,
    };
  };

  // Handle tool approval
  const handleToolApproval = async (approved: boolean) => {
    if (!pendingToolUse) return;
    
    const toolUse = pendingToolUse;
    setPendingToolUse(null);
    
    if (!approved) {
        // Add rejection message using ChatMessage structure
        const updatedMessages: ChatMessage[] = [
            ...messages,
            {
                id: `msg_${Date.now()}`, // Generate unique ID
                sender: 'ai', // Or system?
                content: 'Tool use rejected by user.',
                type: 'error', // Add type if needed for styling
            }
        ];
        setMessages(updatedMessages);
        if (activeChatId) {
            onMessagesUpdate(updatedMessages, activeChatId);
        }
        setIsLoading(false);
        return;
    }
    
    // Execute the tool
    await executeToolAndUpdateMessages(toolUse);
  };

  // Execute a tool and update messages with the result
  const executeToolAndUpdateMessages = async (toolUse: ToolUse) => {
    setToolProgress({
      status: 'running',
      message: `Executing ${toolUse.name} tool...`,
    });
    
    try {
      // Check if the tool is enabled for action mode
      if (!isToolEnabled(toolUse.name, 'action', getToolSettings())) {
        showErrorToast({
            title: 'Tool Not Enabled',
            description: `Tool '${toolUse.name}' is not enabled for action mode.`
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
        'action',
        getToolSettings()
      );
      
        // Add tool response message using ChatMessage structure
        const toolResponseMessage: ChatMessage = {
            id: `msg_${Date.now()}`,
            sender: 'ai', // Tool responses come from the AI's action
            content: result.success
                ? result.result || 'Tool executed successfully.'
                : `Error: ${result.error || 'Unknown error'}`,
            type: result.success ? 'tool-response' : 'error', // Use type for styling
        };

        const updatedMessages = [...messages, toolResponseMessage];
        setMessages(updatedMessages);
        // Don't call onMessagesUpdate yet, wait for AI's final response

        // Continue with AI response after tool execution
        await continueConversation(updatedMessages); // Pass the messages including the tool response

    } catch (error) {
        // Add error message
        showErrorToast({
            title: 'Tool Execution Error',
            description: error instanceof Error ? error.message : String(error)
        });
        setIsLoading(false);
    } finally {
      setToolProgress(null);
    }
  };

  // Continue the conversation with the AI after a tool execution or initial prompt
  const continueConversation = async (currentMessages: ChatMessage[]) => {
    // Use settings prop
    if (!settings) {
        console.error("Settings not available for continueConversation");
        // Show an error message to the user
        showErrorToast({
            title: 'Settings Error',
            description: 'Settings not loaded.'
        });
        // No final save here as the operation failed before completion
        setIsLoading(false);
        return;
    }
    
    // If activeChatId is null, we can still continue the conversation
    // The parent component will handle creating a new chat when we call onMessagesUpdate


    setIsLoading(true);

    // Prepare messages for the API using ChatMessage structure
    const apiMessages = currentMessages.map(msg => ({
        // Map sender to role ('user' or 'assistant')
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.content
    }));

    // Get enabled tools from settings
    const enabledTools = settings?.action_tools ?
      Object.entries(settings.action_tools)
        .filter(([_, enabled]) => enabled)
        .map(([tool, _]) => tool)
      : [];
    
    // Add system message (use cwd prop)
    const systemInfoPrompt = getSystemInfoPrompt(cwd || 'unknown', 'action', undefined);
    const actionModePrompt = getActionModePrompt(enabledTools);
    const systemMessage = {
      role: 'system',
      content: `${actionModePrompt}\n\n${systemInfoPrompt}`
    };
    
    try {
      // Get API key based on provider
      const provider = settings.action_provider;
      // Access API key from settings prop
      const apiKey = settings[`${provider}_api_key` as keyof AppSettings] as string | undefined;

      if (!apiKey) {
          showErrorToast({
              title: 'API Key Missing',
              description: `API key for ${provider} is not set. Please check Settings.`
          });
          setIsLoading(false);
          return;
      }

      // Call the appropriate API
      let aiResponse: string;
      
      if (provider === 'openai' || provider === 'openrouter' || provider === 'deepseek') {
        const endpoint = provider === 'openai'
          ? 'https://api.openai.com/v1/chat/completions'
          : provider === 'openrouter'
          ? 'https://openrouter.ai/api/v1/chat/completions'
          : 'https://api.deepseek.com/v1/chat/completions';
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: settings.action_model,
            messages: [systemMessage, ...apiMessages],
          }),
        });
        
        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }
        
        const data = await response.json();
        aiResponse = data.choices[0].message.content;
      } else if (provider === 'claude') {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: settings.action_model,
            system: systemMessage.content,
            messages: apiMessages,
            max_tokens: 1024,
          }),
        });
        
        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }
        
        const data = await response.json();
        aiResponse = data.content[0].text;
      } else if (provider === 'gemini') {
        const modelName = settings.action_model.replace('gemini-', '');
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify({
            contents: [
              { role: 'user', parts: [{ text: systemMessage.content }] },
              ...apiMessages.map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
              }))
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 1024,
            }
          }),
        });
        
        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }
        
        const data = await response.json();
        aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!aiResponse) {
          throw new Error('Failed to parse response from Gemini API');
        }
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }
      
      // Check if the response contains a tool use
      if (containsToolUse(aiResponse)) {
        const toolUse = parseToolUse(aiResponse);
        const { before, after } = extractTextAroundToolUse(aiResponse);
        let intermediateMessages: ChatMessage[] = [...currentMessages];

        // Add AI's explanation before the tool use
        if (before) {
            intermediateMessages.push({
                id: `msg_${Date.now()}_pre`,
                sender: 'ai',
                content: before,
                type: 'ai', // Using 'ai' type for consistency with ChatMessage
            });
        }

        if (toolUse) {
            // Add tool request message
            intermediateMessages.push({
                id: `msg_${Date.now()}_req`,
                sender: 'ai', // AI requests the tool
                content: `Requesting to use ${toolUse.name} tool`,
                type: 'tool-request',
                toolUse: toolUse, // Attach toolUse data
            });
            setMessages(intermediateMessages); // Update UI to show request

            // Check if the tool is enabled for action mode
            if (!isToolEnabled(toolUse.name, 'action', getToolSettings())) {
                showErrorToast({
                    title: 'Tool Not Enabled',
                    description: `Tool '${toolUse.name}' is not enabled for action mode.`
                });
                setIsLoading(false);
                return;
            }

            // Special handling for command tool
            if (toolUse.name === 'command' && toolUse.params.command && typeof toolUse.params.command === 'string') {
                const command = toolUse.params.command;

                // Check blacklist first
                if (isCommandBlacklisted(command, getToolSettings())) {
                    showErrorToast({
                        title: 'Command Blacklisted',
                        description: `Command '${command}' is blacklisted and cannot be executed.`
                    });
                    setIsLoading(false);
                    return;
                }

                // If command is whitelisted, execute without approval
                if (isCommandWhitelisted(command, getToolSettings())) {
                    // Don't add 'after' text yet, execute tool first
                    await executeToolAndUpdateMessages(toolUse); // This will call continueConversation again
                    return; // Exit this continueConversation call
                }
            }

            // Check if auto-approve is enabled
            if (settings.auto_approve_tools || shouldAutoApprove(toolUse.name, 'action', getToolSettings())) {
                // Auto-approve the tool use
                // Don't add 'after' text yet, execute tool first
                await executeToolAndUpdateMessages(toolUse); // This will call continueConversation again
                return; // Exit this continueConversation call
            } else {
                // Request approval - Store intermediate messages for when approval happens
                setPendingToolUse(toolUse);
                // Don't add 'after' text yet
                // Don't call onMessagesUpdate yet, wait for approval/rejection
                setIsLoading(false); // Stop loading while waiting for user
                return; // Exit this continueConversation call
            }
        }

        // If we reach here, it means there was no tool use or it was handled above
        // Add AI's explanation after the tool use (if any)
        let finalMessages: ChatMessage[] = [...intermediateMessages];
        if (after) {
            finalMessages.push({
                id: `msg_${Date.now()}_post`,
                sender: 'ai',
                content: after,
                type: 'ai', // Using 'ai' type for consistency with ChatMessage
            });
        }
        setMessages(finalMessages);
        if (activeChatId) onMessagesUpdate(finalMessages, activeChatId);
        setIsLoading(false);

      } else {
        // Add regular AI response
        const finalMessages: ChatMessage[] = [
            ...currentMessages,
            {
                id: `msg_${Date.now()}`,
                sender: 'ai',
                content: aiResponse,
                type: 'ai', // Use 'ai' type
            }
        ];
        setMessages(finalMessages);
        if (activeChatId) onMessagesUpdate(finalMessages, activeChatId);
        setIsLoading(false);
      }
    } catch (error) {
      // Add error message
      // Parse the error message for title and description
      let title = 'API Error';
      let description = 'An unknown error occurred.';
      if (error instanceof Error) {
          const message = error.message;
          // Basic parsing assuming "Error: Title. Description." or "Error: Title"
          if (message.startsWith('API request failed')) {
              title = message.split('.')[0] || 'API Request Failed';
              description = message.split('.').slice(1).join('.').trim() || 'Ensure the correct API key is set.'
          } else if (message.startsWith('Failed to parse response')) {
              title = 'API Response Error';
              description = message;
          } else if (message.startsWith('Unsupported provider')) {
              title = 'Configuration Error';
              description = message;
          } else {
              // Generic error
              title = 'Error';
              description = message;
          }
      } else {
          description = String(error);
      }
      showErrorToast({ title, description });
      setIsLoading(false);
    }
  };


  const handleSubmit = async () => {
    if (!task.trim() || isLoading) return;

    // Use isLoadingSettings prop
    if (isLoadingSettings) {
        // Optionally show a message that settings are still loading
        console.warn("Attempted to submit task while settings are loading.");
        return;
    }

    // Use settings prop
    if (!settings) {
        showErrorToast({
            title: 'Settings Error',
            description: 'Settings not loaded. Cannot process task. Please check Settings or restart.'
        });
        // Don't save this temporary error state
        return;
    }

    const currentTask = task; // Capture task before clearing
    setTask(''); // Clear input immediately

    const userMessage: ChatMessage = {
        id: `msg_${Date.now()}`, // Generate unique ID
        sender: 'user',
        content: currentTask,
        type: 'user', // Use 'user' type
    };

    // Add user message to state immediately for responsiveness
    const messagesWithUserTask = [...messages, userMessage];
    setMessages(messagesWithUserTask);
    setIsLoading(true);

    // No need for separate status message, isLoading handles the indicator

    // Start the conversation with the AI, passing the updated messages list
    await continueConversation(messagesWithUserTask);
    
    // Save the messages to the parent component
    if (activeChatId) {
        onMessagesUpdate(messagesWithUserTask, activeChatId);
    } else {
        // If activeChatId is null, this is a new chat
        // Generate a temporary ID for the parent to handle
        const tempId = `new_${Date.now()}`;
        onMessagesUpdate(messagesWithUserTask, tempId);
    }
  };


  return (
    <div className="h-full flex flex-col">
      {/* Add a visually hidden heading for accessibility and testing */}
      <h2 className="sr-only">Action Mode</h2>
      
      <ChatComponent
        messages={messages}
        isLoading={isLoading}
        userInput={task}
        setUserInput={setTask}
        handleSendMessage={handleSubmit}
        pendingToolUse={pendingToolUse}
        handleToolApproval={handleToolApproval}
        toolProgress={toolProgress}
        inputPlaceholder="Type your problem..."
      />
    </div>
  );
}