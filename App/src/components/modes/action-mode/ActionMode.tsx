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
import { executeTool } from '@/prompts/tools';

// Define a type for messages in Action Mode
interface ActionMessage {
  id: number; // For key prop
  type: 'task' | 'status' | 'result' | 'error' | 'tool-request' | 'tool-response';
  content: string;
  toolUse?: ToolUse; // For tool-request messages
}

// Define the interface for settings
interface AppSettings {
  action_provider: string;
  action_model: string;
  auto_approve_tools: boolean;
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

export function ActionMode() {
  const [task, setTask] = useState('');
  // Store a list of messages instead of a single result
  const [messages, setMessages] = useState<ActionMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [cwd, setCwd] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isFetchingSettings, setIsFetchingSettings] = useState(true);
  const [pendingToolUse, setPendingToolUse] = useState<ToolUse | null>(null);
  const [toolProgress, setToolProgress] = useState<ToolProgressStatus | null>(null);
  
  const nextId = useRef(0); // To generate unique keys for messages
  const viewportRef = useRef<HTMLDivElement>(null); // For scrolling

  // Fetch settings and system info on mount
  useEffect(() => {
    const fetchInitialData = async () => {
      setIsFetchingSettings(true);
      
      let sysInfoError: string | undefined;
      let statusNotes: string[] = [];

      try {
        // In a test environment, we'll mock this
        if (typeof window !== 'undefined' && 'Tauri' in window) {
          // Fetch CWD
          try {
            // @ts-expect-error - Tauri invoke is available at runtime
            const fetchedCwd = await window.__TAURI__.invoke('get_cwd');
            setCwd(fetchedCwd);
          } catch (error) {
            console.error("Failed to fetch CWD:", error);
            setCwd('unknown');
          }
          
          // Fetch settings
          try {
            // @ts-expect-error - Tauri invoke is available at runtime
            const loadedSettings = await window.__TAURI__.invoke('get_settings');
            setSettings(loadedSettings);
          } catch (error) {
            console.error("Failed to fetch settings:", error);
          }
        } else {
          console.warn("Tauri API not available.");
          setCwd('browser-environment');
        }
      } catch (error) {
        console.error("Error in fetchInitialData:", error);
      } finally {
        setIsFetchingSettings(false);
      }
    };
    
    fetchInitialData();
  }, []);

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

  // Handle tool approval
  const handleToolApproval = async (approved: boolean) => {
    if (!pendingToolUse) return;
    
    const toolUse = pendingToolUse;
    setPendingToolUse(null);
    
    if (!approved) {
      // Add rejection message
      setMessages(prev => [...prev, { 
        id: nextId.current++, 
        type: 'error', 
        content: 'Tool use rejected by user.' 
      }]);
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
      // Execute the tool
      const result = await executeTool(toolUse, (status) => {
        setToolProgress(status);
      });
      
      // Add tool response message
      setMessages(prev => [...prev, { 
        id: nextId.current++, 
        type: 'tool-response', 
        content: result.success 
          ? result.result || 'Tool executed successfully.' 
          : `Error: ${result.error || 'Unknown error'}`
      }]);
      
      // Continue with AI response after tool execution
      await continueConversation([...messages, { 
        id: -1, // Temporary ID
        type: 'tool-response', 
        content: result.success 
          ? result.result || 'Tool executed successfully.' 
          : `Error: ${result.error || 'Unknown error'}`
      }]);
    } catch (error) {
      // Add error message
      setMessages(prev => [...prev, { 
        id: nextId.current++, 
        type: 'error', 
        content: `Error executing tool: ${error instanceof Error ? error.message : String(error)}` 
      }]);
      setIsLoading(false);
    } finally {
      setToolProgress(null);
    }
  };

  // Continue the conversation with the AI after a tool execution
  const continueConversation = async (currentMessages: ActionMessage[]) => {
    if (!settings) return;
    
    setIsLoading(true);
    
    // Prepare messages for the API
    const apiMessages = currentMessages.map(msg => ({
      role: msg.type === 'task' ? 'user' : 'assistant',
      content: msg.content
    }));
    
    // Add system message
    const systemInfoPrompt = getSystemInfoPrompt(cwd || 'unknown', 'action', undefined);
    const systemMessage = {
      role: 'system',
      content: `${ACTION_MODE_PROMPT}\n\n${systemInfoPrompt}`
    };
    
    try {
      // Get API key based on provider
      const provider = settings.action_provider;
      const apiKey = settings[`${provider}_api_key`];
      
      if (!apiKey) {
        setMessages(prev => [...prev, { 
          id: nextId.current++, 
          type: 'error', 
          content: `API key for ${provider} is not set. Please check Settings.` 
        }]);
        setIsLoading(false);
        return;
      }
      
      // Call the appropriate API
      let aiResponse: string;
      
      if (provider === 'openai' || provider === 'openrouter') {
        const endpoint = provider === 'openai' 
          ? 'https://api.openai.com/v1/chat/completions'
          : 'https://openrouter.ai/api/v1/chat/completions';
        
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
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }
      
      // Check if the response contains a tool use
      if (containsToolUse(aiResponse)) {
        const toolUse = parseToolUse(aiResponse);
        const { before, after } = extractTextAroundToolUse(aiResponse);
        
        // Add AI's explanation before the tool use
        if (before) {
          setMessages(prev => [...prev, { 
            id: nextId.current++, 
            type: 'result', 
            content: before 
          }]);
        }
        
        if (toolUse) {
          // Add tool request message
          setMessages(prev => [...prev, { 
            id: nextId.current++, 
            type: 'tool-request', 
            content: `Requesting to use ${toolUse.name} tool`, 
            toolUse 
          }]);
          
          // Check if auto-approve is enabled
          if (settings.auto_approve_tools) {
            // Auto-approve the tool use
            await executeToolAndUpdateMessages(toolUse);
          } else {
            // Request approval
            setPendingToolUse(toolUse);
          }
        }
        
        // Add AI's explanation after the tool use
        if (after) {
          setMessages(prev => [...prev, { 
            id: nextId.current++, 
            type: 'result', 
            content: after 
          }]);
        }
      } else {
        // Add regular AI response
        setMessages(prev => [...prev, { 
          id: nextId.current++, 
          type: 'result', 
          content: aiResponse 
        }]);
        setIsLoading(false);
      }
    } catch (error) {
      // Add error message
      setMessages(prev => [...prev, { 
        id: nextId.current++, 
        type: 'error', 
        content: `Error: ${error instanceof Error ? error.message : String(error)}` 
      }]);
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!task.trim() || isLoading || isFetchingSettings) return;
    if (!settings) {
      setMessages(prev => [...prev, { 
        id: nextId.current++, 
        type: 'error', 
        content: 'Settings not loaded. Please try again.' 
      }]);
      return;
    }

    const currentTask = task; // Capture task before clearing
    setTask(''); // Clear input immediately

    const taskId = nextId.current++;
    const statusId = nextId.current++;

    // Add task message (user input style)
    setMessages(prev => [...prev, { id: taskId, type: 'task', content: currentTask }]);
    setIsLoading(true);

    // Add status message (AI thinking style)
    setMessages(prev => [...prev, { id: statusId, type: 'status', content: `Thinking about: "${currentTask}"...` }]);

    // Start the conversation with the AI
    await continueConversation([...messages, { id: taskId, type: 'task', content: currentTask }]);
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
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                // Styling similar to WalkthroughMode messages
                className={`max-w-[80%] p-3 rounded-lg text-sm ${
                  msg.type === 'task'
                    ? 'ml-auto bg-blue-600 text-white' // User task aligned right
                    : msg.type === 'error'
                    ? 'mr-auto bg-red-100 dark:bg-red-900/50 text-red-900 dark:text-red-200' // Error aligned left
                    : msg.type === 'tool-request'
                    ? 'mr-auto bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200' // Tool request aligned left
                    : msg.type === 'tool-response'
                    ? 'mr-auto bg-green-100 dark:bg-green-900/50 text-green-900 dark:text-green-200' // Tool response aligned left
                    : 'mr-auto bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100' // Status/Result aligned left
                }`}
              >
                {/* Render newlines correctly */}
                {msg.content.split('\n').map((line, i) => (
                  <p key={i} style={{ minHeight: '1em' }}>{line || '\u00A0'}</p>
                ))}
              </motion.div>
            ))}
             {isLoading && !toolProgress && ( // Show thinking indicator
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
          disabled={isLoading || isFetchingSettings}
          className="flex-1 h-12" // Reduced height to h-12
          aria-label="Task input"
        />
        {/* Adjusted button size to match input */}
        <Button 
          onClick={handleSubmit} 
          disabled={isLoading || isFetchingSettings || !task.trim()} 
          className="h-12 w-12" 
          aria-label="Submit task"
        >
          <Send className="h-5 w-5" /> {/* Adjusted icon size */}
        </Button>
      </div>
    </motion.div>
  );
}