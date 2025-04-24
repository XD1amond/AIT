'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react'; // Added useMemo
import { motion, AnimatePresence } from "framer-motion";
import { ActionMode } from '@/components/modes/action-mode/ActionMode';
import { WalkthroughMode, ChatMessage } from '@/components/modes/walkthrough-mode/WalkthroughMode';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Settings, PlusCircle, Filter, SortAsc, SortDesc } from 'lucide-react'; // Added icons
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { getAllSavedChats, saveChat, SavedChat } from '@/lib/chat-storage';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Added Select imports

// Define the modes available in the chat interface
type Mode = 'action' | 'walkthrough';
const modes: { id: Mode; label: string }[] = [
    { id: 'action', label: 'Action' },
    { id: 'walkthrough', label: 'Walkthrough' },
];

export default function Home() {
  // State for the UI
  const [currentMode, setCurrentMode] = useState<Mode>('walkthrough');
  const [savedChats, setSavedChats] = useState<SavedChat[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeChatMessages, setActiveChatMessages] = useState<ChatMessage[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'action' | 'walkthrough'>('all'); // Filter state
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest'); // Sort state

  // Load chats on initial mount
  useEffect(() => {
    const loadChats = async () => {
      setIsLoadingChats(true);
      try {
        const chats = await getAllSavedChats();
        setSavedChats(chats);
        if (chats.length > 0) {
          setActiveChatId(chats[0].id);
          setActiveChatMessages(chats[0].messages);
        } else {
          setActiveChatId(null);
          setActiveChatMessages([]);
        }
      } catch (error) {
        console.error("Failed to load chats in sidebar:", error);
        setActiveChatId(null);
        setActiveChatMessages([]);
      } finally {
        setIsLoadingChats(false);
      }
    };
    loadChats();
  }, []);

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
    if (activeChatId !== null) {
        setActiveChatId(null);
        setActiveChatMessages([]);
        // setCurrentMode('walkthrough'); // Optionally reset mode
    }
  }, [activeChatId]);

  // Callback function for WalkthroughMode to update messages and trigger save
  const handleMessagesUpdate = useCallback((updatedMessages: ChatMessage[], chatId: string) => {
    setActiveChatMessages(updatedMessages);

    const chatToSave: SavedChat = {
      id: chatId,
      timestamp: Date.now(),
      mode: currentMode,
      messages: updatedMessages,
    };

    saveChat(chatToSave)
      .then(() => {
        setSavedChats(prevChats => {
          const existingIndex = prevChats.findIndex(c => c.id === chatId);
          let newChats;
          if (existingIndex > -1) {
            newChats = [...prevChats];
            newChats[existingIndex] = chatToSave;
          } else {
            newChats = [chatToSave, ...prevChats];
          }
          return newChats.sort((a, b) => b.timestamp - a.timestamp);
        });
        if (activeChatId === null) {
            setActiveChatId(chatId);
        }
      })
      .catch(err => console.error(`Failed to save chat ${chatId}:`, err));

  }, [currentMode, activeChatId]);

  // Memoize the filtered and sorted chat list
  const displayedChats = useMemo(() => {
    let chats = [...savedChats];

    if (filterMode !== 'all') {
      chats = chats.filter(chat => chat.mode === filterMode);
    }

    chats.sort((a, b) => {
      if (sortOrder === 'newest') {
        return b.timestamp - a.timestamp;
      } else {
        return a.timestamp - b.timestamp;
      }
    });

    return chats;
  }, [savedChats, filterMode, sortOrder]);


  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-100 dark:bg-gray-900">

      {/* Sidebar */}
      <aside className="w-64 flex flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h1 className="text-xl font-semibold">AIT</h1>
            <Button variant="ghost" size="sm" onClick={handleNewChat} aria-label="New Chat">
                <PlusCircle className="h-5 w-5" />
            </Button>
        </div>
                <ScrollArea className="flex-1">
                  {/* Add data-testid for easier selection in tests */}
                  <div data-testid="chat-list" className="p-4 space-y-2">
                    {/* Filter and Sort Controls */}
                    <div className="flex justify-between items-center mb-3 gap-2">
               <Select value={filterMode} onValueChange={(value) => setFilterMode(value as any)}>
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
               <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as any)}>
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
                {filterMode === 'all' ? 'No past chats found.' : `No ${filterMode} chats found.`}
              </div>
            ) : (
              displayedChats.map((chat) => (
                <Button
                  key={chat.id}
                  variant="ghost"
                  className={`w-full justify-start text-sm truncate h-auto py-2 ${
                    chat.id === activeChatId ? 'bg-gray-200 dark:bg-gray-700' : ''
                  }`}
                  onClick={() => handleSelectChat(chat.id)}
                >
                  <div className="flex flex-col items-start">
                     <span className="font-medium truncate max-w-[180px]">
                        {chat.title || chat.messages[0]?.content.substring(0, 25) || `Chat ${chat.id.substring(5, 10)}`}
                     </span>
                     <span className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(chat.timestamp).toLocaleString()} - {chat.mode}
                     </span>
                  </div>
                </Button>
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
                            className={`relative block px-5 py-1.5 rounded-full cursor-pointer transition-colors text-sm font-medium ${
                                currentMode === mode.id ? 'text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                            }`}
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
        <div className="flex-1 overflow-hidden flex p-4 md:p-6 lg:p-8">
           <AnimatePresence mode="wait">
             <motion.div
               key={`${currentMode}-${activeChatId || 'new-chat'}`}
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               transition={{ duration: 0.15 }}
               className="w-full h-full flex"
             >
                {currentMode === 'action'
                  ? <ActionMode /> /* TODO: Update ActionMode similarly */
                  : <WalkthroughMode
                      activeChatId={activeChatId}
                      initialMessages={activeChatMessages}
                      onMessagesUpdate={handleMessagesUpdate}
                    />
                 }
             </motion.div>
           </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
