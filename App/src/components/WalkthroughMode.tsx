'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from 'framer-motion';
import { invoke, isTauri } from '@tauri-apps/api/core'; // Import isTauri
import { Send } from 'lucide-react';
// Removed import { ApiProvider } from './ApiKeySettings';

// Define ApiProvider type locally
export type ApiProvider = 'openai' | 'claude' | 'openrouter';

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
    walkthrough_provider: ApiProvider;
}

interface ChatMessage {
  sender: 'user' | 'ai';
  content: string;
}

// --- Actual LLM API Call Implementation (remains the same) ---
async function callLlmApi(
    messages: ChatMessage[],
    systemPrompt: string,
    provider: ApiProvider,
    apiKey: string | undefined
): Promise<string> {
  console.log(`Calling LLM API for provider: ${provider}...`);

  if (!apiKey) {
    return "Error: API key for the selected provider is not set or loaded. Please check Settings.";
  }

  let endpoint = '';
  let headers: HeadersInit = { 'Content-Type': 'application/json' };
  let body: any = {};

  // --- Provider-Specific Configuration ---
  try {
    switch (provider) {
      case 'openai':
        endpoint = 'https://api.openai.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        body = {
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages.map(msg => ({ role: msg.sender === 'ai' ? 'assistant' : 'user', content: msg.content })) // Map sender correctly
          ],
        };
        break;

      case 'claude':
        endpoint = 'https://api.anthropic.com/v1/messages';
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        body = {
          model: "claude-3-opus-20240229",
          system: systemPrompt,
          messages: messages.map(msg => ({ role: msg.sender === 'ai' ? 'assistant' : 'user', content: msg.content })), // Map sender correctly
          max_tokens: 1024,
        };
        break;

      case 'openrouter':
        endpoint = 'https://openrouter.ai/api/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        body = {
          model: "openai/gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages.map(msg => ({ role: msg.sender === 'ai' ? 'assistant' : 'user', content: msg.content })) // Map sender correctly
          ],
        };
        break;

      default:
        return `Error: Provider "${provider}" not implemented.`;
    }

    // --- Make the API Call ---
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

    // --- Parse the Response (Provider-Specific) ---
    let aiContent = '';
    if (provider === 'openai' || provider === 'openrouter') {
      aiContent = data.choices?.[0]?.message?.content;
    } else if (provider === 'claude') {
      aiContent = data.content?.[0]?.text;
    }

    if (!aiContent) {
        console.error("Could not parse AI content from response:", data);
        return "Error: Received an unexpected response format from the AI.";
    }

    return aiContent.trim();

  } catch (error) {
    console.error("Network or other error calling LLM API:", error);
    return `Error: Failed to connect to the AI service. Check your internet connection and console logs. (${error instanceof Error ? error.message : String(error)})`;
  }
}
// --- End LLM API Call Implementation ---

// Removed WalkthroughModeProps interface

export function WalkthroughMode() { // Removed props
  const [systemInfo, setSystemInfo] = useState<SystemInfo>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false); // For LLM responses
  const [isFetchingSysInfo, setIsFetchingSysInfo] = useState(true);
  const [isFetchingSettings, setIsFetchingSettings] = useState(true); // New state for settings loading
  const [settingsError, setSettingsError] = useState<string | null>(null); // New state for settings error
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null); // State to hold fetched settings

  const viewportRef = useRef<HTMLDivElement>(null);

  // Fetch system info and settings on mount
  useEffect(() => {
    const fetchInitialData = async () => {
      setIsFetchingSysInfo(true);
      setIsFetchingSettings(true);
      setSettingsError(null);

      let sysInfoError: string | undefined;
      let initialMsgContent = 'Hello! How can I help you today?';

      // Use isTauri() for a more robust check
      if (await isTauri()) {
        // Fetch System Info
        try {
          const os = await invoke<OsInfo>('get_os_info');
          const memory = await invoke<MemoryInfo>('get_memory_info');
          setSystemInfo({ os, memory });
          initialMsgContent += ' I have some basic info about your system.';
        } catch (error) {
          console.error("Failed to fetch system info via invoke:", error);
          sysInfoError = 'Could not load system information via Tauri.';
          setSystemInfo({ error: sysInfoError });
          initialMsgContent += ' (Note: I could not retrieve system info).';
        } finally {
          setIsFetchingSysInfo(false);
        }

        // Fetch Settings
        try {
          console.log("Invoking get_settings in WalkthroughMode...");
          const loadedSettings = await invoke<AppSettings>('get_settings');
          console.log("Settings received in WalkthroughMode:", loadedSettings);
          setAppSettings(loadedSettings);
          if (!loadedSettings.openai_api_key && !loadedSettings.claude_api_key && !loadedSettings.open_router_api_key) {
            initialMsgContent += ' Please set an API key in Settings to enable AI responses.';
            setSettingsError('No API key found. Please configure in Settings.');
        } else if (!loadedSettings[`${loadedSettings.walkthrough_provider}_api_key` as keyof AppSettings]) {
             initialMsgContent += ` The API key for the selected provider (${loadedSettings.walkthrough_provider}) is missing. Please check Settings.`;
             setSettingsError(`API key for ${loadedSettings.walkthrough_provider} is missing.`);
        }
        } catch (err) {
          console.error("Failed to load settings via invoke:", err);
          const errorMsg = `Failed to load settings via Tauri: ${err instanceof Error ? err.message : String(err)}`;
          setSettingsError(errorMsg);
          initialMsgContent += ' Could not load API settings via Tauri.';
        } finally {
          setIsFetchingSettings(false);
        }
      } else { // This block might be less likely to be hit now, but keep for safety
        // Handle case where Tauri is not available
        console.warn("Tauri API not available (isTauri check failed). Skipping system info and settings fetch.");
        sysInfoError = 'Tauri context not found. System info unavailable.';
        setSystemInfo({ error: sysInfoError });
        setSettingsError('Tauri context not found. Cannot load settings.');
        initialMsgContent += ' (Note: Tauri features are unavailable).';
        setIsFetchingSysInfo(false);
        setIsFetchingSettings(false);
      }


      // Set initial message after all fetching attempts
      setMessages([{ sender: 'ai', content: initialMsgContent }]);
    };

    // Introduce a small delay before fetching initial data
    const timer = setTimeout(() => {
      (async () => {
        await fetchInitialData();
      })();
    }, 100); // 100ms delay

    // Cleanup function to clear the timer if the component unmounts
    return () => clearTimeout(timer);
  }, []); // Empty dependency array ensures this runs only once on mount

  // Scroll to bottom when messages change
  useEffect(() => {
    const element = viewportRef.current;
    if (element) {
      requestAnimationFrame(() => {
        element.scrollTop = element.scrollHeight;
      });
    }
  }, [messages]);


  const handleSendMessage = useCallback(async () => {
    // Ensure settings are loaded and valid before sending
    if (!userInput.trim() || isLoading || isFetchingSysInfo || isFetchingSettings || settingsError || !appSettings) {
        if (settingsError) {
            console.warn("Cannot send message due to settings error:", settingsError);
            // Optionally show a more prominent error to the user
        }
        return;
    }

    const newUserMessage: ChatMessage = { sender: 'user', content: userInput };
    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setUserInput('');
    setIsLoading(true);

    // Construct system prompt (same as before)
    let systemPrompt = "You are a helpful AI tech support assistant.";
    if (systemInfo.os) {
      systemPrompt += ` The user is on ${systemInfo.os.os_type} ${systemInfo.os.os_release}.`;
    }
    if (systemInfo.memory) {
      const totalGb = (systemInfo.memory.total_mem / 1024 / 1024).toFixed(1);
      systemPrompt += ` They have approximately ${totalGb} GB RAM.`;
    }
    if (systemInfo.error) {
        systemPrompt += ` (Error fetching system details: ${systemInfo.error})`;
    }

    // Get the correct API key and provider from state
    const provider = appSettings.walkthrough_provider;
    let apiKey: string | undefined;
    switch (provider) {
        case 'openai':
            apiKey = appSettings.openai_api_key;
            break;
        case 'claude':
            apiKey = appSettings.claude_api_key;
            break;
        case 'openrouter':
            apiKey = appSettings.open_router_api_key;
            break;
        default:
            apiKey = undefined;
    }

    try {
      const aiResponseContent = await callLlmApi(updatedMessages, systemPrompt, provider, apiKey);
      const newAiMessage: ChatMessage = { sender: 'ai', content: aiResponseContent };
      setMessages(prev => [...prev, newAiMessage]);
    } catch (error) { // This catch might be redundant if callLlmApi handles errors internally
      console.error("LLM API call failed:", error);
      const errorAiMessage: ChatMessage = { sender: 'ai', content: `Sorry, I encountered an error trying to respond. (${error instanceof Error ? error.message : String(error)})` };
      setMessages(prev => [...prev, errorAiMessage]);
    } finally {
      setIsLoading(false);
    }
    // Update dependencies for useCallback
  }, [userInput, isLoading, messages, systemInfo, isFetchingSysInfo, isFetchingSettings, settingsError, appSettings]);


  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      // Use flex-col, h-full to fill space, remove max-width, add padding
      className="w-full h-full flex flex-col p-4"
    >
      {/* Message Area */}
      {/* Use flex-grow to take up space above input, add padding for scrollbar */}
      <ScrollArea className="flex-grow mb-4 pr-4 -mr-4">
        {/* Removed extra div, use viewportRef directly on ScrollArea if possible, or keep simple div */}
        <div ref={viewportRef} className="space-y-4">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                // Slightly increased padding, removed shadow for cleaner look
                className={`max-w-[80%] p-3 rounded-lg ${
                  msg.sender === 'user'
                    ? 'bg-blue-600 text-white' // Keep user message style distinct
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100' // Use neutral background for AI
                }`}
              >
                {/* Render newlines correctly */}
                {msg.content.split('\n').map((line, i) => (
                  <p key={i} style={{ minHeight: '1em' }}>{line || '\u00A0'}</p> // Ensure empty lines take space
                ))}
              </motion.div>
            </div>
          ))}
           {isLoading && (
             <div className="flex justify-start">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  // Consistent styling with AI messages
                  className="max-w-[80%] p-3 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 animate-pulse"
                >
                    Thinking...
                </motion.div>
             </div>
           )}
        </div>
      </ScrollArea>

      {/* Input Bar - Consistent with ActionMode */}
      <div className="flex space-x-2 items-center border-t pt-4">
        <Input
          placeholder="Type your question..."
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          disabled={isLoading} // Keep simplified disabled logic for now
          className="flex-1" // Input takes remaining width
          aria-label="Chat input"
        />
        <Button
            onClick={handleSendMessage}
            disabled={isLoading || !userInput.trim()} // Keep simplified disabled logic
            size="icon"
            aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  );
}