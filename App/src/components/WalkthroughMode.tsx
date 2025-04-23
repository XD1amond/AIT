'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area"; // Import ScrollArea
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core'; // Import invoke
import { Send } from 'lucide-react'; // Send icon
import { ApiProvider } from './ApiKeySettings'; // Import ApiProvider type

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

interface ChatMessage {
  sender: 'user' | 'ai';
  content: string;
}

// --- Actual LLM API Call Implementation ---
async function callLlmApi(
    messages: ChatMessage[],
    systemPrompt: string,
    provider: ApiProvider,
    apiKey: string | undefined
): Promise<string> {
  console.log(`Calling LLM API for provider: ${provider}...`);

  if (!apiKey) {
    return "Error: API key for the selected provider is not set in Settings.";
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
          model: "gpt-4o", // Or another suitable model
          messages: [
            { role: "system", content: systemPrompt },
            ...messages.map(msg => ({ role: msg.sender, content: msg.content }))
          ],
          // max_tokens: 1000, // Optional: Limit response length
        };
        break;

      case 'claude':
        endpoint = 'https://api.anthropic.com/v1/messages';
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01'; // Required header
        // Claude API expects system prompt differently
        body = {
          model: "claude-3-opus-20240229", // Or another suitable model
          system: systemPrompt,
          messages: messages.map(msg => ({ role: msg.sender, content: msg.content })),
          max_tokens: 1024, // Required for Claude
        };
        break;

      case 'openrouter':
        endpoint = 'https://openrouter.ai/api/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        // OpenRouter uses OpenAI format but needs model specified
        // We'll default to a known good model, could be made configurable later
        body = {
          model: "openai/gpt-4o", // Example: Specify model via provider/model_name
          messages: [
            { role: "system", content: systemPrompt },
            ...messages.map(msg => ({ role: msg.sender, content: msg.content }))
          ],
          // Add site header for identification (optional but recommended by OpenRouter)
          // headers['HTTP-Referer'] = $YOUR_SITE_URL;
          // headers['X-Title'] = $YOUR_SITE_NAME;
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
      // Claude's response structure is different
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

// Define props for the component
interface WalkthroughModeProps {
  apiKeys: { openai: string; claude: string; openrouter: string };
  provider: ApiProvider;
}

export function WalkthroughMode({ apiKeys, provider }: WalkthroughModeProps) { // Accept props
  const [systemInfo, setSystemInfo] = useState<SystemInfo>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false); // For LLM responses
  const [isFetchingSysInfo, setIsFetchingSysInfo] = useState(true);
  // No longer need scrollAreaRef if we target the viewport directly or wrap content
  const viewportRef = useRef<HTMLDivElement>(null); // Ref for the scrollable content wrapper

  // Fetch system info on mount
  useEffect(() => {
    const fetchSystemInfo = async () => {
      setIsFetchingSysInfo(true);
      try {
        const os = await invoke<OsInfo>('get_os_info');
        const memory = await invoke<MemoryInfo>('get_memory_info');
        setSystemInfo({ os, memory });
        // Add initial AI message after fetching info
        setMessages([{ sender: 'ai', content: 'Hello! How can I help you today? I have some basic info about your system.' }]);
      } catch (error) {
        console.error("Failed to fetch system info:", error);
        setSystemInfo({ error: 'Could not load system information.' });
        setMessages([{ sender: 'ai', content: 'Hello! How can I help you today? (Note: I could not retrieve system info).' }]);
      } finally {
        setIsFetchingSysInfo(false);
      }
    };
    fetchSystemInfo();
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


  const handleSendMessage = useCallback(async () => {
    if (!userInput.trim() || isLoading || isFetchingSysInfo) return;

    const newUserMessage: ChatMessage = { sender: 'user', content: userInput };
    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setUserInput('');
    setIsLoading(true);

    // Construct system prompt
    let systemPrompt = "You are a helpful AI tech support assistant.";
    if (systemInfo.os) {
      systemPrompt += ` The user is on ${systemInfo.os.os_type} ${systemInfo.os.os_release}.`;
    }
    if (systemInfo.memory) {
      // Convert KB to GB for readability
      const totalGb = (systemInfo.memory.total_mem / 1024 / 1024).toFixed(1);
      systemPrompt += ` They have approximately ${totalGb} GB RAM.`;
    }
    if (systemInfo.error) {
        systemPrompt += ` (Error fetching system details: ${systemInfo.error})`;
    }

    // Get the correct API key based on the selected provider
    let apiKey: string | undefined;
    switch (provider) {
        case 'openai':
            apiKey = apiKeys.openai;
            break;
        case 'claude':
            apiKey = apiKeys.claude;
            break;
        case 'openrouter':
            apiKey = apiKeys.openrouter;
            break;
        default:
            apiKey = undefined;
    }


    try {
      const aiResponseContent = await callLlmApi(updatedMessages, systemPrompt, provider, apiKey);
      const newAiMessage: ChatMessage = { sender: 'ai', content: aiResponseContent };
      setMessages(prev => [...prev, newAiMessage]);
    } catch (error) {
      console.error("LLM API call failed:", error);
      const errorAiMessage: ChatMessage = { sender: 'ai', content: "Sorry, I encountered an error trying to respond." };
      setMessages(prev => [...prev, errorAiMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [userInput, isLoading, messages, systemInfo, isFetchingSysInfo, apiKeys, provider]); // Add apiKeys and provider to dependency array


  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-3xl h-[80vh] flex flex-col" // Increased height
    >
      <Card className="flex-grow flex flex-col overflow-hidden"> {/* Added overflow-hidden */}
        <CardHeader>
          <CardTitle>Walkthrough Mode</CardTitle>
          <CardDescription>
            Ask your tech support questions below.
            {isFetchingSysInfo && <span className="text-xs text-muted-foreground ml-2">(Loading system info...)</span>}
            {systemInfo.error && <span className="text-xs text-red-500 ml-2">({systemInfo.error})</span>}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-grow flex flex-col space-y-4 overflow-hidden"> {/* Added overflow-hidden */}
          {/* Apply ref to the direct child div inside ScrollArea */}
          <ScrollArea className="flex-grow pr-4 -mr-4">
            <div ref={viewportRef} className="h-full space-y-4 pb-4"> {/* Apply ref here and ensure height */}
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`max-w-[75%] p-3 rounded-lg shadow-sm ${ // Added shadow
                      msg.sender === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-secondary text-secondary-foreground'
                    }`}
                  >
                    {/* Basic rendering, consider markdown later */}
                    {msg.content.split('\n').map((line, i) => <p key={i}>{line || '\u00A0'}</p>)} {/* Render empty lines */}
                  </motion.div>
                </div>
              ))}
               {isLoading && (
                 <div className="flex justify-start">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className="max-w-[75%] p-3 rounded-lg bg-secondary text-secondary-foreground animate-pulse shadow-sm"
                    >
                        Thinking...
                    </motion.div>
                 </div>
               )}
            </div>
          </ScrollArea>
          <div className="flex space-x-2 pt-4 border-t"> {/* Input area */}
            <Input
              placeholder="Type your question..."
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              disabled={isLoading || isFetchingSysInfo}
              aria-label="Chat input"
            />
            <Button onClick={handleSendMessage} disabled={isLoading || isFetchingSysInfo || !userInput.trim()} size="icon" aria-label="Send message">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}