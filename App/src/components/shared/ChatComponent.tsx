'use client';

import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send } from 'lucide-react';
import { ToolApproval } from '@/components/ui/tool-approval';
import { ToolUse, ToolProgressStatus } from '@/prompts/tools/types';

// Define the ChatMessage type to be used by both modes
export interface ChatMessage {
    id: string;
    sender: 'user' | 'ai';
    content: string;
    toolUse?: ToolUse;
    type?: 'user' | 'ai' | 'error' | 'tool-request' | 'tool-response' | 'status';
}

// Props for the shared chat component
export interface ChatComponentProps {
    messages: ChatMessage[];
    isLoading: boolean;
    userInput: string;
    setUserInput: (input: string) => void;
    handleSendMessage: () => void;
    pendingToolUse: ToolUse | null;
    handleToolApproval: (approved: boolean) => void;
    toolProgress: ToolProgressStatus | null;
    inputPlaceholder?: string;
}

export function ChatComponent({
    messages,
    isLoading,
    userInput,
    setUserInput,
    handleSendMessage,
    pendingToolUse,
    handleToolApproval,
    toolProgress,
    inputPlaceholder = "Type your problem..."
}: ChatComponentProps) {
    const viewportRef = useRef<HTMLDivElement>(null);

    // Scroll to bottom when messages change
    useEffect(() => {
        const element = viewportRef.current;
        if (element) {
            // Use requestAnimationFrame for smoother scrolling
            requestAnimationFrame(() => {
                element.scrollTop = element.scrollHeight;
            });
        }
    }, [messages]);

    return (
        <div className="w-full h-full flex flex-col p-4">
            {/* Message Area */}
            <ScrollArea className="flex-grow mb-4 pr-4 -mr-4 w-full overflow-auto">
                <div ref={viewportRef} className="space-y-4">
                    {/* Render messages */}
                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-fit p-3 rounded-lg text-sm ${
                                    msg.sender === 'user'
                                        ? 'ml-auto bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                                        : msg.type === 'error'
                                        ? 'mr-auto bg-red-100 dark:bg-red-900/50 text-red-900 dark:text-red-200'
                                        : msg.type === 'tool-request'
                                        ? 'mr-auto bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200'
                                        : msg.type === 'tool-response'
                                        ? 'mr-auto bg-green-100 dark:bg-green-900/50 text-green-900 dark:text-green-200'
                                        : 'mr-auto bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                                }`}
                            >
                                {/* Render messages with basic formatting */}
                                <div className={msg.sender === 'ai' ? "markdown-content prose prose-sm dark:prose-invert max-w-none" : ""}>
                                    {msg.content.split('\n').map((line, i) => {
                                        // Basic markdown-like formatting for AI messages
                                        if (msg.sender === 'ai') {
                                            // Handle headers
                                            if (line.startsWith('# ')) {
                                                return <h1 key={i} className="text-xl font-bold mt-2 mb-1">{line.substring(2)}</h1>;
                                            } else if (line.startsWith('## ')) {
                                                return <h2 key={i} className="text-lg font-bold mt-2 mb-1">{line.substring(3)}</h2>;
                                            } else if (line.startsWith('### ')) {
                                                return <h3 key={i} className="text-md font-bold mt-2 mb-1">{line.substring(4)}</h3>;
                                            }
                                            
                                            // Handle code blocks (simple version)
                                            if (line.startsWith('```') || line.startsWith('`')) {
                                                return (
                                                    <pre key={i} className="bg-gray-800 dark:bg-gray-900 rounded p-2 overflow-x-auto my-2">
                                                        <code>{line.replace(/^```|```$/g, '')}</code>
                                                    </pre>
                                                );
                                            }
                                            
                                            // Handle bullet points
                                            if (line.startsWith('- ') || line.startsWith('* ')) {
                                                return <li key={i} className="ml-4">{line.substring(2)}</li>;
                                            }
                                            
                                            // Default paragraph
                                            return <p key={i} style={{ minHeight: '1em' }}>{line || '\u00A0'}</p>;
                                        } else {
                                            // User messages with simple newlines
                                            return <p key={i} style={{ minHeight: '1em' }}>{line || '\u00A0'}</p>;
                                        }
                                    })}
                                </div>
                                
                                {/* Optionally display tool info if present */}
                                {msg.type === 'tool-request' && msg.toolUse && (
                                    <div className="mt-2 text-xs opacity-80 border-t border-amber-300 dark:border-amber-700 pt-1">
                                        Tool: {msg.toolUse.name} | Params: {JSON.stringify(msg.toolUse.params)}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {isLoading && !toolProgress && (
                        <div className="flex justify-start">
                            <div className="max-w-[80%] p-3 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 animate-pulse">
                                Thinking...
                            </div>
                        </div>
                    )}
                    {toolProgress && (
                        <div className="flex justify-start">
                            <div className="max-w-[80%] p-3 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-900 dark:text-blue-200">
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
                            </div>
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
            <div className="flex space-x-2 items-center border-t pt-4 w-full">
                <Input
                    placeholder={inputPlaceholder}
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    disabled={isLoading}
                    className="flex-1 h-12"
                    aria-label="Chat input"
                />
                <Button
                    onClick={handleSendMessage}
                    disabled={isLoading || !userInput.trim()}
                    className="h-12 w-12"
                    aria-label="Send message"
                >
                    <Send className="h-5 w-5" />
                </Button>
            </div>
        </div>
    );
}

// Define the type for structured error messages
interface StructuredError {
    title: string;
    description: string;
}

// Helper function to show error toast, accepting string or structured object
export function showErrorToast(message: string | StructuredError) {
    if (typeof message === 'string') {
        toast.error(message);
    } else {
        toast.error(message.title, {
            description: message.description,
        });
    }
}