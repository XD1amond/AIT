'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';
import { ToolApproval } from '@/components/ui/tool-approval';
import { getSystemInfoPrompt } from '@/prompts/system-info';
import { ToolUse, ToolResponse, ToolProgressStatus } from '@/prompts/tools/types';
import { parseToolUse, containsToolUse, extractTextAroundToolUse } from '@/prompts/tools/tool-parser';
import { executeTool, isToolEnabled, shouldAutoApprove, isCommandWhitelisted, isCommandBlacklisted, ToolSettings } from '@/prompts/tools';

// Re-use ChatMessage type from WalkthroughMode for consistency
import { ChatMessage } from '@/components/modes/walkthrough-mode/WalkthroughMode';

// Define a type for messages in Action Mode (can potentially reuse ChatMessage if structure aligns)
// For now, let's keep ActionMessage specific if needed, but aim for consolidation
interface ActionMessage {
    id: string; // Use string ID like ChatMessage
    type: 'task' | 'status' | 'result' | 'error' | 'tool-request' | 'tool-response' | 'user' | 'ai'; // Align types?
    content: string;
    toolUse?: ToolUse; // For tool-request messages
    // Add sender if consolidating with ChatMessage
    sender?: 'user' | 'ai';
}


// Props for Action Mode, similar to WalkthroughMode
interface ActionModeProps {
    activeChatId: string | null;
    initialMessages: ChatMessage[]; // Use ChatMessage from Walkthrough
    onMessagesUpdate: (updatedMessages: ChatMessage[], chatId: string) => void;
    // Pass settings down as a prop instead of loading internally
    settings: AppSettings | null;
    isLoadingSettings: boolean; // Indicate if settings are still loading
    cwd: string | null; // Pass CWD as prop
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

// Action mode system prompt
const ACTION_MODE_PROMPT = `
You are an AI assistant that can help users with various tasks by using tools.
You have access to the following tools:

## command
Description: Execute a command in the system's terminal
Parameters:
- command: (required) The command to execute
- cwd: (optional) The working directory to execute the command in

Example:
<command>
<command>ls -la</command>
</command>

## web_search
Description: Search the web using Brave Search API
Parameters:
- query: (required) The search query
- limit: (optional) Maximum number of results to return (default: 5)

Example:
<web_search>
<query>latest AI developments</query>
<limit>3</limit>
</web_search>

When you need to use a tool, format your response using the XML-style tags shown in the examples above.
Wait for the result of the tool execution before proceeding with further actions.
`;

// Accept props
export function ActionMode({
    activeChatId,
    initialMessages,
    onMessagesUpdate,
    settings, // Receive settings as prop
    isLoadingSettings, // Receive loading status as prop
    cwd // Receive CWD as prop
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
      setMessages(initialMessages);
      // Reset other relevant state if needed when chat switches
      setIsLoading(false);
      setPendingToolUse(null);
      setToolProgress(null);
      setTask(''); // Clear input when chat changes
  }, [activeChatId, initialMessages]);


  // Remove internal ID generation if ChatMessage provides it
  // const nextId = useRef(0);
  const viewportRef = useRef<HTMLDivElement>(null); // For scrolling

  // Remove internal settings/CWD fetching useEffect

  // Scroll to bottom when messages change
  useEffect(() => {
    const element = viewportRef.current;
    if (element) {
      // Use requestAnimationFrame for smoother scrolling after render
      requestAnimationFrame(() => {
        element.scrollTop = element.scrollHeight;
      });
    }
  }, [messages]);

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
        const errorMessage = `Tool '${toolUse.name}' is not enabled for action mode.`;
        const updatedMessages: ChatMessage[] = [
            ...messages,
            {
                id: `msg_${Date.now()}`,
                sender: 'ai',
                content: errorMessage,
                type: 'error',
            }
        ];
        setMessages(updatedMessages);
        if (activeChatId) {
            onMessagesUpdate(updatedMessages, activeChatId);
        }
        setIsLoading(false);
        setToolProgress(null);
        return;
      }
      
      // Special handling for command tool
      if (toolUse.name === 'command' && toolUse.params.command && typeof toolUse.params.command === 'string') {
        const command = toolUse.params.command;
        
        // Check blacklist first (blacklist overrides whitelist)
        if (isCommandBlacklisted(command, getToolSettings())) {
          const errorMessage = `Command '${command}' is blacklisted and cannot be executed.`;
          const updatedMessages: ChatMessage[] = [
              ...messages,
              {
                  id: `msg_${Date.now()}`,
                  sender: 'ai',
                  content: errorMessage,
                  type: 'error',
              }
          ];
          setMessages(updatedMessages);
          if (activeChatId) {
              onMessagesUpdate(updatedMessages, activeChatId);
          }
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
        const errorContent = `Error executing tool: ${error instanceof Error ? error.message : String(error)}`;
        const updatedMessages: ChatMessage[] = [
            ...messages,
            {
                id: `msg_${Date.now()}`,
                sender: 'ai',
                content: errorContent,
                type: 'error',
            }
        ];
        setMessages(updatedMessages);
        if (activeChatId) {
            onMessagesUpdate(updatedMessages, activeChatId);
        }
        setIsLoading(false);
    } finally {
      setToolProgress(null);
    }
  };

  // Continue the conversation with the AI after a tool execution or initial prompt
  const continueConversation = async (currentMessages: ChatMessage[]) => {
    // Use settings prop
    if (!settings || !activeChatId) {
        console.error("Settings or activeChatId not available for continueConversation");
        // Optionally show an error message to the user
        const errorMsg = !settings ? 'Settings not loaded.' : 'No active chat selected.';
        const updatedMessages: ChatMessage[] = [
            ...currentMessages, // Use currentMessages passed to the function
            { id: `msg_${Date.now()}`, sender: 'ai', content: `Error: ${errorMsg}`, type: 'error' }
        ];
        setMessages(updatedMessages); // Update local state to show error
        // No final save here as the operation failed before completion
        setIsLoading(false);
        return;
    }


    setIsLoading(true);

    // Prepare messages for the API using ChatMessage structure
    const apiMessages = currentMessages.map(msg => ({
        // Map sender to role ('user' or 'assistant')
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.content
    }));

    // Add system message (use cwd prop)
    const systemInfoPrompt = getSystemInfoPrompt(cwd || 'unknown', 'action', undefined);
    const systemMessage = {
      role: 'system',
      content: `${ACTION_MODE_PROMPT}\n\n${systemInfoPrompt}`
    };
    
    try {
      // Get API key based on provider
      const provider = settings.action_provider;
      // Access API key from settings prop
      const apiKey = settings[`${provider}_api_key` as keyof AppSettings] as string | undefined;

      if (!apiKey) {
          const errorContent = `API key for ${provider} is not set. Please check Settings.`;
          const updatedMessages: ChatMessage[] = [
              ...currentMessages,
              { id: `msg_${Date.now()}`, sender: 'ai', content: errorContent, type: 'error' }
          ];
          setMessages(updatedMessages);
          if (activeChatId) { // Ensure activeChatId is available
              onMessagesUpdate(updatedMessages, activeChatId);
          }
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
                const errorContent = `Tool '${toolUse.name}' is not enabled for action mode.`;
                const finalMessages: ChatMessage[] = [
                    ...intermediateMessages,
                    { id: `msg_${Date.now()}_err`, sender: 'ai', content: errorContent, type: 'error' }
                ];
                setMessages(finalMessages);
                if (activeChatId) onMessagesUpdate(finalMessages, activeChatId);
                setIsLoading(false);
                return;
            }

            // Special handling for command tool
            if (toolUse.name === 'command' && toolUse.params.command && typeof toolUse.params.command === 'string') {
                const command = toolUse.params.command;

                // Check blacklist first
                if (isCommandBlacklisted(command, getToolSettings())) {
                    const errorContent = `Command '${command}' is blacklisted and cannot be executed.`;
                    const finalMessages: ChatMessage[] = [
                        ...intermediateMessages,
                        { id: `msg_${Date.now()}_blk`, sender: 'ai', content: errorContent, type: 'error' }
                    ];
                    setMessages(finalMessages);
                    if (activeChatId) onMessagesUpdate(finalMessages, activeChatId);
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
      const errorContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
      const finalMessages: ChatMessage[] = [
          ...currentMessages,
          { id: `msg_${Date.now()}_err`, sender: 'ai', content: errorContent, type: 'error' }
      ];
      setMessages(finalMessages);
      if (activeChatId) onMessagesUpdate(finalMessages, activeChatId);
      setIsLoading(false);
    }
  };


  const handleSubmit = async () => {
    if (!task.trim() || isLoading || !activeChatId) return;

    // Use isLoadingSettings prop
    if (isLoadingSettings) {
        // Optionally show a message that settings are still loading
        console.warn("Attempted to submit task while settings are loading.");
        return;
    }

    // Use settings prop
    if (!settings) {
        const errorMsg: ChatMessage = {
            id: `msg_${Date.now()}_err`,
            sender: 'ai', // System/error message
            content: 'Settings not loaded. Cannot process task. Please check Settings or restart.',
            type: 'error',
        };
        const updatedMessages = [...messages, errorMsg];
        setMessages(updatedMessages);
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
    // onMessagesUpdate is called within continueConversation or executeToolAndUpdateMessages
  };


  return (
    // Use flex column, h-full to fill space
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      // Consistent padding and structure with WalkthroughMode
      className="flex flex-col h-full w-full p-4" // Removed max-w-3xl mx-auto
    >
      {/* Add a visually hidden heading for accessibility and testing */}
      <h2 className="sr-only">Action Mode</h2>

      {/* Message Area using ScrollArea */}
      <ScrollArea className="flex-grow mb-4 pr-4 -mr-4">
         <div ref={viewportRef} className="space-y-2"> {/* Reduced space-y */}
            {/* Map over ChatMessage[] */}
            {messages.map((msg) => (
                <motion.div
                    key={msg.id} // Use msg.id from ChatMessage
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    // Use sender for alignment, type for styling
                    className={`max-w-[80%] p-3 rounded-lg text-sm ${
                        msg.sender === 'user'
                            ? 'ml-auto bg-blue-600 text-white' // User message aligned right
                            : msg.type === 'error' // Check type for specific styling
                            ? 'mr-auto bg-red-100 dark:bg-red-900/50 text-red-900 dark:text-red-200' // Error aligned left
                            : msg.type === 'tool-request'
                            ? 'mr-auto bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200' // Tool request aligned left
                            : msg.type === 'tool-response'
                            ? 'mr-auto bg-green-100 dark:bg-green-900/50 text-green-900 dark:text-green-200' // Tool response aligned left
                            : 'mr-auto bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100' // AI/Status aligned left
                    }`}
                >
                    {/* Render newlines correctly */}
                    {msg.content.split('\n').map((line, i) => (
                        <p key={i} style={{ minHeight: '1em' }}>{line || '\u00A0'}</p>
                    ))}
                    {/* Optionally display tool info if present */}
                    {msg.type === 'tool-request' && msg.toolUse && (
                        <div className="mt-2 text-xs opacity-80 border-t border-amber-300 dark:border-amber-700 pt-1">
                            Tool: {msg.toolUse.name} | Params: {JSON.stringify(msg.toolUse.params)}
                        </div>
                    )}
                </motion.div>
            ))}
             {isLoading && !toolProgress && !pendingToolUse && ( // Show thinking indicator only if not waiting for tool/approval
                 <motion.div
                   initial={{ opacity: 0, y: 10 }}
                   animate={{ opacity: 1, y: 0 }}
                   transition={{ duration: 0.3 }}
                   className="max-w-[80%] p-3 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 animate-pulse text-sm mr-auto"
                 >
                    Processing...
                 </motion.div>
             )}
             {toolProgress && ( // Show tool progress
                 <motion.div
                   initial={{ opacity: 0, y: 10 }}
                   animate={{ opacity: 1, y: 0 }}
                   transition={{ duration: 0.3 }}
                   className="max-w-[80%] p-3 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-900 dark:text-blue-200 text-sm mr-auto"
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

      {/* Input Bar at the bottom - Consistent with WalkthroughMode */}
      <div className="flex space-x-2 items-center border-t pt-4"> {/* Reverted py-4 to pt-4 */}
        <Input
          placeholder="Type your problem..."
          value={task}
          onChange={(e) => setTask(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
          disabled={isLoading}
          className="flex-1 h-12" // Reduced height to h-12
          aria-label="Task input"
        />
        {/* Adjusted button size to match input */}
        <Button 
          onClick={handleSubmit} 
          disabled={isLoading || !task.trim()}
          className="h-12 w-12" 
          aria-label="Submit task"
        >
          <Send className="h-5 w-5" /> {/* Adjusted icon size */}
        </Button>
      </div>
    </motion.div>
  );
}