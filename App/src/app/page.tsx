'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { invoke, isTauri } from '@tauri-apps/api/core'; // Import invoke and isTauri
import { ActionMode } from '@/components/modes/action-mode/ActionMode';
import { WalkthroughMode, ChatMessage, ApiProvider } from '@/components/modes/walkthrough-mode/WalkthroughMode';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Settings, PlusCircle, Filter, SortAsc, SortDesc, Search, Trash2 } from 'lucide-react'; // Added Search and Trash2 icons
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { saveChat, deleteChat, SavedChat, generateChatId } from '@/lib/chat-storage'; // Removed unused getAllSavedChats
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Added Select imports
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils"; // Import cn utility

// Define the modes available in the chat interface
type Mode = 'action' | 'walkthrough';
const modes: { id: Mode; label: string }[] = [
    { id: 'action', label: 'Action' },
    { id: 'walkthrough', label: 'Walkthrough' },
];

// Define AppSettings interface (can be moved to a shared types file later)
interface AppSettings {
    openai_api_key: string;
    claude_api_key: string;
    open_router_api_key: string;
    brave_search_api_key: string;
    gemini_api_key: string;
    deepseek_api_key: string;
    action_provider: ApiProvider;
    action_model: string;
    walkthrough_provider: ApiProvider;
    walkthrough_model: string;
    auto_approve_tools: boolean;
    walkthrough_tools: Record<string, boolean>;
    action_tools: Record<string, boolean>;
    auto_approve_walkthrough: Record<string, boolean>;
    auto_approve_action: Record<string, boolean>;
    whitelisted_commands: string[];
    blacklisted_commands: string[];
    theme: string;
    [key: string]: any; // Allow other settings keys
}


export default function Home() {
  // State for the UI
  const [currentMode, setCurrentMode] = useState<Mode>('walkthrough');
  const [savedChats, setSavedChats] = useState<SavedChat[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeChatMessages, setActiveChatMessages] = useState<ChatMessage[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'action' | 'walkthrough'>('all'); // Filter state
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest'); // Sort state
  const [searchQuery, setSearchQuery] = useState<string>(''); // Search state

  // State for settings and CWD
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [cwd, setCwd] = useState<string | null>(null);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);


  // Load chats, settings, and CWD on initial mount
  useEffect(() => {
    const loadInitialData = async () => {
        setIsLoadingChats(true);
        setIsLoadingSettings(true);
        setInitialLoadError(null);

        if (!(await isTauri())) {
            console.warn("Tauri context not found. Cannot load initial data.");
            setInitialLoadError("Tauri context not found. Features requiring backend interaction will be unavailable.");
            setIsLoadingChats(false);
            setIsLoadingSettings(false);
            setCwd('browser-environment'); // Set a default CWD for non-Tauri env
            return;
        }

        try {
            // Load chats, settings, and CWD in parallel
            const [chats, loadedSettings, fetchedCwd] = await Promise.all([
                invoke<SavedChat[]>('get_all_chats').catch(err => {
                    console.error("Failed to load chats:", err);
                    setInitialLoadError(`Failed to load chats: ${err instanceof Error ? err.message : String(err)}`);
                    return []; // Return empty array on error
                }),
                invoke<AppSettings>('get_settings').catch(err => {
                    console.error("Failed to load settings:", err);
                    setInitialLoadError(`Failed to load settings: ${err instanceof Error ? err.message : String(err)}`);
                    return null; // Return null on error
                }),
                invoke<string>('get_cwd').catch(err => {
                    console.error("Failed to load CWD:", err);
                    setInitialLoadError(`Failed to load CWD: ${err instanceof Error ? err.message : String(err)}`);
                    return 'unknown'; // Return default on error
                })
            ]);

            // Process chats
            const sortedChats = chats.sort((a, b) => b.timestamp - a.timestamp); // Sort immediately
            setSavedChats(sortedChats);
            if (sortedChats.length > 0) {
                // Select the most recent chat initially
                setActiveChatId(sortedChats[0].id);
                setActiveChatMessages(sortedChats[0].messages);
                // Set mode based on the loaded chat? Or keep default? Let's keep default for now.
                // setCurrentMode(sortedChats[0].mode);
            } else {
                setActiveChatId(null);
                setActiveChatMessages([]);
            }

            // Process settings
            setSettings(loadedSettings);

            // Process CWD
            setCwd(fetchedCwd);

        } catch (error) {
            // This catch block might be redundant due to individual catches, but kept for safety
            console.error("Error during initial data load:", error);
            setInitialLoadError(`An unexpected error occurred during initial load: ${error instanceof Error ? error.message : String(error)}`);
            // Ensure states reflect error
            setSavedChats([]);
            setActiveChatId(null);
            setActiveChatMessages([]);
            setSettings(null);
            setCwd('unknown');
        } finally {
            setIsLoadingChats(false);
            setIsLoadingSettings(false);
        }
    };

    // Delay slightly to ensure Tauri API is ready (might not be strictly necessary with isTauri check)
    const timer = setTimeout(loadInitialData, 50);
    return () => clearTimeout(timer); // Cleanup timer

  }, []); // Empty dependency array ensures this runs only once on mount


  // --- Commented out old useEffect removed ---

  // Function to handle selecting a chat from the sidebar
  const handleSelectChat = useCallback((chatId: string) => {
    const selectedChat = savedChats.find(chat => chat.id === chatId);
    if (selectedChat && selectedChat.id !== activeChatId) {
      setActiveChatId(selectedChat.id);
      setActiveChatMessages(selectedChat.messages);
      // setCurrentMode(selectedChat.mode); // Optionally set mode based on chat
    }
  }, [savedChats, activeChatId]);

  // Function to handle starting a new chat
  const handleNewChat = useCallback(() => {
    // Generate a temporary ID for the new chat placeholder
    const tempNewChatId = `new_${Date.now()}`;

    // Create a placeholder chat object
    const placeholderChat: SavedChat = {
      id: tempNewChatId,
      timestamp: Date.now(), // Use current time for sorting
      mode: currentMode, // Use the currently selected mode
      messages: [], // Start with empty messages
      title: "New Chat", // Placeholder title
    };

    // Add the placeholder to the beginning of the list (or based on sort order)
    // Ensure it doesn't duplicate if clicked rapidly
    setSavedChats(prevChats => {
        if (prevChats.some(chat => chat.id.startsWith('new_'))) {
            // Avoid adding multiple "New Chat" placeholders if one exists
            // Select the existing one instead
            const existingNew = prevChats.find(chat => chat.id.startsWith('new_'));
            if (existingNew) {
                setActiveChatId(existingNew.id);
                setActiveChatMessages(existingNew.messages);
            }
            return prevChats;
        }
        // Add the new placeholder based on sort order
        // Always add to the top for visibility when creating a new chat
        return [placeholderChat, ...prevChats];
    });

    // Set the new chat as active
    setActiveChatId(tempNewChatId);
    setActiveChatMessages([]); // Clear messages for the new chat view

    // Optionally reset mode, or keep the current one
    // setCurrentMode('walkthrough');

  }, [currentMode, sortOrder]); // Add dependencies

  // Function to handle deleting a chat
  const handleDeleteChat = useCallback((e: React.MouseEvent, chatId: string) => {
    e.stopPropagation(); // Prevent triggering the chat selection
    deleteChat(chatId)
      .then(() => {
        // Use the state updater function to ensure we work with the latest state
        setSavedChats(prevChats => {
            const remainingChats = prevChats.filter(chat => chat.id !== chatId);

            // If the deleted chat was active, select another chat or clear the active chat
            if (chatId === activeChatId) {
                if (remainingChats.length > 0) {
                    // Sort remaining chats according to current sort order and select the first one
                    const sortedRemaining = remainingChats.sort((a, b) => sortOrder === 'newest' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp);
                    const nextActiveChat = sortedRemaining[0];
                    setActiveChatId(nextActiveChat.id);
                    setActiveChatMessages(nextActiveChat.messages);
                    // Optionally set mode: setCurrentMode(nextActiveChat.mode);
                } else {
                    setActiveChatId(null);
                    setActiveChatMessages([]);
                }
            }
            // Return the filtered list for the state update
            return remainingChats;
        });
      })
      .catch(err => console.error(`Failed to delete chat ${chatId}:`, err));
  }, [activeChatId, handleSelectChat, sortOrder]); // Removed savedChats dependency as it's accessed via updater function

  // Callback function for WalkthroughMode to update messages and trigger save
  const handleMessagesUpdate = useCallback((updatedMessages: ChatMessage[], chatIdToSave: string) => {
    // If the chat ID starts with 'new_', generate a real ID now
    const isNewChat = chatIdToSave.startsWith('new_');
    const finalChatId = isNewChat ? generateChatId() : chatIdToSave;

    setActiveChatMessages(updatedMessages);

    // Find the current chat to get its title
    const currentChat = savedChats.find(c => c.id === chatIdToSave);
    
    // Determine the title
    let title = currentChat?.title || "Untitled Chat";
    if (!title || title === "New Chat" || title === "Untitled Chat") {
      const firstUserMessage = updatedMessages.find(m => m.sender === 'user');
      title = firstUserMessage?.content.substring(0, 30) || `Chat ${finalChatId.substring(0, 8)}`;
    }

    // Create the chat object to save
    const chatToSave: SavedChat = {
      id: finalChatId,
      timestamp: Date.now(),
      mode: currentMode,
      messages: updatedMessages,
      title: title,
    };

    // Save the chat
    saveChat(chatToSave)
      .then(() => {
        // Update the state after successful save
        setSavedChats(prev => {
          // Remove the placeholder if it exists
          const chatsWithoutPlaceholder = prev.filter(c => c.id !== chatIdToSave);

          // Add or update the actual chat
          const existingIndex = chatsWithoutPlaceholder.findIndex(c => c.id === finalChatId);
          let newChats;
          if (existingIndex > -1) {
            // Update existing chat
            newChats = [...chatsWithoutPlaceholder];
            newChats[existingIndex] = chatToSave;
          } else {
            // Add new chat
            newChats = [chatToSave, ...chatsWithoutPlaceholder];
          }

          // Re-sort based on current sort order
          return newChats.sort((a, b) => {
            if (sortOrder === 'newest') {
              return b.timestamp - a.timestamp;
            } else {
              return a.timestamp - b.timestamp;
            }
          });
        });

        // If this was a new chat, update the activeChatId to the real ID
        if (isNewChat) {
          setActiveChatId(finalChatId);
        } else if (activeChatId === null) { // Handle case where app starts with no chats
          setActiveChatId(finalChatId);
        }
      })
      .catch(err => console.error(`Failed to save chat ${finalChatId}:`, err));
  }, [currentMode, activeChatId, sortOrder, savedChats]); // Added savedChats dependency

  // Memoize the filtered, sorted, and searched chat list
  const displayedChats = useMemo(() => {
    let chats = [...savedChats];

    // Apply mode filter
    if (filterMode !== 'all') {
      chats = chats.filter(chat => chat.mode === filterMode);
    }

    // Apply search filter if search query exists
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      chats = chats.filter(chat => {
        // Search in title if it exists
        if (chat.title && chat.title.toLowerCase().includes(query)) {
          return true;
        }
        // Search in first user message content
        const firstUserMessage = chat.messages.find(m => m.sender === 'user');
        if (firstUserMessage?.content.toLowerCase().includes(query)) {
          return true;
        }
        // Search in first assistant message content (optional)
        // const firstAssistantMessage = chat.messages.find(m => m.sender === 'assistant');
        // if (firstAssistantMessage?.content.toLowerCase().includes(query)) {
        //   return true;
        // }
        return false;
      });
    }

    // Apply sort
    chats.sort((a, b) => {
      if (sortOrder === 'newest') {
        return b.timestamp - a.timestamp;
      } else {
        return a.timestamp - b.timestamp;
      }
    });

    return chats;
  }, [savedChats, filterMode, sortOrder, searchQuery]);


  // Ensure the return statement is inside the Home component function
  return (
    // Main flex container
    <div className="flex h-screen w-screen overflow-hidden bg-gray-100 dark:bg-gray-900">

      {/* Sidebar */}
      <aside className="w-80 flex flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h1 className="text-xl font-semibold">AIT</h1>
            <Button variant="ghost" size="sm" onClick={handleNewChat} aria-label="New Chat">
                <PlusCircle className="h-5 w-5" />
            </Button>
        </div>
        {/* Removed erroneous ScrollArea tag */}
        <ScrollArea className="flex-1">
          {/* Add data-testid for easier selection in tests */}
          <div data-testid="chat-list" className="p-4 space-y-2">
            {/* Search Bar */}
                    <div className="relative mb-3">
                      <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        type="text"
                        placeholder="Search chats..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8 h-8 text-sm"
                      />
                    </div>

                    {/* Filter and Sort Controls */}
                    <div className="flex justify-between items-center mb-3 gap-2">
               <Select value={filterMode} onValueChange={(value: string) => setFilterMode(value as 'all' | 'action' | 'walkthrough')}>
                 <SelectTrigger className="h-8 text-xs flex-1" aria-label="Filter chats by mode">
                    <Filter className="h-3 w-3 mr-1 inline-block" />
                    <SelectValue placeholder="Filter" />
                 </SelectTrigger>
                 <SelectContent>
                    <SelectItem value="all">All Modes</SelectItem>
                    <SelectItem value="walkthrough">Walkthrough</SelectItem>
                    <SelectItem value="action">Action</SelectItem>
                 </SelectContent>
               </Select>
               <Select value={sortOrder} onValueChange={(value: string) => setSortOrder(value as 'newest' | 'oldest')}>
                 <SelectTrigger className="h-8 text-xs flex-1" aria-label="Sort chats by date">
                    {sortOrder === 'newest' ? <SortDesc className="h-3 w-3 mr-1 inline-block" /> : <SortAsc className="h-3 w-3 mr-1 inline-block" />}
                    <SelectValue placeholder="Sort" />
                 </SelectTrigger>
                 <SelectContent>
                    <SelectItem value="newest">Newest First</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                 </SelectContent>
               </Select>
            </div>

            {/* Chat List */}
            {isLoadingChats ? (
              <div className="text-sm text-gray-400 dark:text-gray-500">Loading chats...</div>
            ) : displayedChats.length === 0 ? (
              <div className="text-sm text-gray-400 dark:text-gray-500">
                {searchQuery ? 'No matching chats found.' : (filterMode === 'all' ? 'No past chats found.' : `No ${filterMode} chats found.`)}
              </div>
            ) : (
              displayedChats.map((chat) => (
                <div key={chat.id} className="group">
                  <div className="flex items-center">
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-[calc(100%-24px)] justify-start text-sm h-auto py-2 px-2 text-left", // Added px-2 and text-left
                        chat.id === activeChatId ? 'bg-gray-200 dark:bg-gray-700' : ''
                      )}
                      onClick={() => handleSelectChat(chat.id)}
                      data-testid={`chat-button-${chat.id}`} // Add data-testid using chat ID
                    >
                      <span className="font-medium truncate block"> {/* Use block for better truncation */}
                        {chat.title || (chat.id.startsWith('new_') ? 'New Chat' : `Chat ${chat.id.substring(0, 8)}`)} {/* Ensure placeholder shows 'New Chat' */}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 ml-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" // Added flex-shrink-0
                      onClick={(e) => handleDeleteChat(e, chat.id)}
                      aria-label="Delete chat"
                    >
                      <Trash2 className="h-4 w-4 text-gray-500 hover:text-red-500" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
         {/* Settings Link */}
         <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <Link href="/settings">
              <Button variant="ghost" className="w-full justify-start text-sm">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
              </Button>
            </Link>
         </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">

        {/* Floating Mode Switcher */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
             <RadioGroup
                value={currentMode}
                onValueChange={(value: string) => setCurrentMode(value as Mode)}
                className="relative flex space-x-1 bg-gray-200 dark:bg-gray-700 p-1 rounded-full shadow-md"
             >
                {modes.map((mode) => (
                    <div key={mode.id} className="relative z-10">
                        <RadioGroupItem value={mode.id} id={`${mode.id}-mode`} className="sr-only" />
                        <Label
                            htmlFor={`${mode.id}-mode`}
                            className={cn(
                                "relative block px-5 py-1.5 rounded-full cursor-pointer transition-colors text-sm font-medium",
                                currentMode === mode.id
                                    ? 'text-gray-900 dark:text-gray-100'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                            )}
                        >
                            {currentMode === mode.id && (
                                <motion.div
                                    layoutId="modeHighlight"
                                    className="absolute inset-0 h-full bg-white dark:bg-black rounded-full -z-10"
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                />
                            )}
                            {mode.label}
                        </Label>
                    </div>
                ))}
             </RadioGroup>
        </div>


        {/* Chat Interface Area */}
        <div className="flex-1 overflow-hidden flex p-4 md:p-6 lg:p-8 pt-20"> {/* Added padding-top */}
           <AnimatePresence mode="wait">
             <motion.div
               key={`${currentMode}-${activeChatId || 'new-chat'}`}
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               transition={{ duration: 0.15 }}
               className="w-full h-full flex" // Ensure the motion div takes full space
             >
                {currentMode === 'action' ? (
                   <ActionMode
                       activeChatId={activeChatId}
                       initialMessages={activeChatMessages}
                       onMessagesUpdate={handleMessagesUpdate}
                       settings={settings} // Pass settings
                       isLoadingSettings={isLoadingSettings} // Pass loading status
                       cwd={cwd} // Pass CWD
                   />
                ) : (
                   <WalkthroughMode
                       activeChatId={activeChatId}
                       initialMessages={activeChatMessages}
                       onMessagesUpdate={handleMessagesUpdate}
                       settings={settings}
                       isLoadingSettings={isLoadingSettings}
                       cwd={cwd}
                   />
                )}
             </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
