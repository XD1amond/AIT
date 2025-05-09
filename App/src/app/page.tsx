'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { invoke, isTauri } from '@tauri-apps/api/core'; // Import invoke and isTauri
import { ActionMode } from '@/components/modes/action-mode/ActionMode';
import { WalkthroughMode, ChatMessage, ApiProvider } from '@/components/modes/walkthrough-mode/WalkthroughMode';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Settings, PlusCircle, Filter, SortAsc, SortDesc, Search, Trash2, Edit2, Folder as FolderIcon, ChevronDown, ChevronRight, Plus } from 'lucide-react'; // Added more icons
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { saveChat, deleteChat, SavedChat, generateChatId, getAllSavedChats } from '@/lib/chat-storage';
import { saveFolder, getAllFolders, deleteFolder, saveChatFolders, loadChatFolders, generateFolderId } from '@/lib/folder-storage';
import { Folder } from '@/shared/models';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Added Select imports
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils"; // Import cn utility
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove // Import arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
  const [editingChatId, setEditingChatId] = useState<string | null>(null); // State for tracking which chat is being edited
  const [editingChatName, setEditingChatName] = useState<string>(''); // State for the edited chat name
  
  // Folder state
  interface Folder {
    id: string;
    name: string;
    parentId: string | null;
    isExpanded: boolean;
    order?: number;
  }
  
  const [folders, setFolders] = useState<Folder[]>([]);
  const [chatFolders, setChatFolders] = useState<Record<string, string>>({});
  const [isHoveringNewOptions, setIsHoveringNewOptions] = useState(false); // State for hover dropdown
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState<string>('');
  
  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'chat' | 'folder' | null>(null);
  const [overFolderId, setOverFolderId] = useState<string | null>(null); // Tracks if hovering OVER a folder for nesting visual cue
  
  // State for mode switching
  const [previousMode, setPreviousMode] = useState<Mode | null>(null);
  const [isModeSwitching, setIsModeSwitching] = useState(false);

  // State for settings and CWD
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [cwd, setCwd] = useState<string | null>(null);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);


  // Load folders and chat-folder mappings
  const loadFolderData = async () => {
    try {
      console.log("Loading folders from backend...");
      const savedFolders = await getAllFolders();
      console.log("Folders loaded:", savedFolders);
      const savedChatFolders = loadChatFolders();
      console.log("Chat-folder mappings loaded:", savedChatFolders);
      setFolders(savedFolders);
      setChatFolders(savedChatFolders);
    } catch (error) {
      console.error("Error loading folders:", error);
      setFolders([]);
    }
  };

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
                getAllSavedChats().catch(err => {
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
            
            // Load folders after other data is loaded
            await loadFolderData();
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
    // Generate a real ID for the new chat (not a temporary one)
    const newChatId = generateChatId();

    // Create a new chat object
    const newChat: SavedChat = {
      id: newChatId,
      timestamp: Date.now(), // Use current time for sorting
      mode: currentMode, // Use the currently selected mode
      messages: [], // Start with empty messages
      title: "New Chat", // Default title
    };

    // Save the new chat to the backend
    saveChat(newChat)
      .then(() => {
        // Add the new chat to the state
        setSavedChats(prevChats => {
          // Always add to the top for visibility when creating a new chat
          return [newChat, ...prevChats];
        });

        // Set the new chat as active
        setActiveChatId(newChatId);
        setActiveChatMessages([]);
      })
      .catch(err => console.error(`Failed to save new chat:`, err));

  }, [currentMode]); // Dependencies

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
                    let sortedRemaining = [...remainingChats];
                    sortedRemaining = remainingChats.sort((a, b) =>
                      sortOrder === 'newest' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp
                    );
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

  // Function to handle editing a chat name
  const handleEditChat = useCallback((e: React.MouseEvent, chatId: string) => {
    e.stopPropagation(); // Prevent triggering the chat selection
    const chat = savedChats.find(c => c.id === chatId);
    if (chat) {
      setEditingChatId(chatId);
      setEditingChatName(chat.title || '');
    }
  }, [savedChats]);

  // Function to save the edited chat name
  const handleSaveChatName = useCallback((chatId: string) => {
    if (!editingChatName.trim()) {
      setEditingChatId(null);
      return;
    }

    const chatToUpdate = savedChats.find(c => c.id === chatId);
    if (chatToUpdate) {
      const updatedChat: SavedChat = {
        ...chatToUpdate,
        title: editingChatName.trim()
      };

      // Save the updated chat
      saveChat(updatedChat)
        .then(() => {
          // Update the state after successful save
          setSavedChats(prev => {
            const updatedChats = prev.map(c =>
              c.id === chatId ? { ...c, title: editingChatName.trim() } : c
            );
            return updatedChats;
          });
        })
        .catch(err => console.error(`Failed to update chat name for ${chatId}:`, err))
        .finally(() => {
          // Reset editing state
          setEditingChatId(null);
          setEditingChatName('');
        });
    }
  }, [savedChats, editingChatName]);

  // Function to handle key press in the edit input
  const handleEditKeyPress = useCallback((e: React.KeyboardEvent, chatId: string) => {
    if (e.key === 'Enter') {
      handleSaveChatName(chatId);
    } else if (e.key === 'Escape') {
      setEditingChatId(null);
      setEditingChatName('');
    }
  }, [handleSaveChatName]);
  
  // DnD sensors and handlers
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3, // Reduced distance to make dragging easier
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const id = active.id as string;
    const type = id.startsWith('folder_') ? 'folder' : 'chat';
    
    setActiveId(id);
    setActiveType(type);
    setOverFolderId(null); // Reset over folder state on new drag start
  }, []);

  // Update overFolderId for visual feedback (highlighting potential drop target)
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over, active } = event;
    const overId = over?.id?.toString();
    const activeId = active.id.toString();
    
    // Only set overFolderId if hovering over a different folder
    if (overId?.startsWith('folder_') && overId !== activeId) {
      setOverFolderId(overId);
    } else {
      setOverFolderId(null);
    }
  }, []);
  
  // Main drag end logic
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    // Reset active drag states
    setActiveId(null);
    setActiveType(null);
    
    if (!over || active.id === over.id) {
      setOverFolderId(null);
      return; // No movement or dropped on itself
    }

    const activeId = active.id.toString();
    const overId = over.id.toString();

    // --- Chat Drag Logic ---
    if (activeType === 'chat') {
      let targetFolderId: string | null = null;

      // Only nest if we're hovering over a folder and it's highlighted (overFolderId is set)
      if (overId.startsWith('folder_') && overId === overFolderId) {
        // Dropped onto a folder with intent to nest -> Nest
        targetFolderId = overId;
        console.log(`Chat ${activeId} dropped into folder ${targetFolderId} (nesting)`);
      } else {
        // Dropped onto root, another chat, or empty space -> Move to root
        targetFolderId = null;
        console.log(`Chat ${activeId} dropped into root or reordered`);
      }

      // Update chatFolders state if the folder changes
      if (chatFolders[activeId] !== targetFolderId) {
        setChatFolders(prev => {
          const newMapping = { ...prev };
          if (targetFolderId) {
            newMapping[activeId] = targetFolderId;
          } else {
            delete newMapping[activeId]; // Remove from mapping if moved to root
          }
          console.log("Updating chatFolders state:", newMapping);
          saveChatFolders(newMapping); // Save the updated mapping
          return newMapping;
        });
      } else {
        console.log(`Chat ${activeId} folder unchanged.`);
        // Note: Reordering chats within the same folder/root is handled visually by dnd-kit
        // We don't persist chat order within folders/root currently.
      }
    }
    // --- Folder Drag Logic ---
    else if (activeType === 'folder') {
      setFolders(prevFolders => {
        const oldIndex = prevFolders.findIndex(f => f.id === activeId);
        const newIndex = prevFolders.findIndex(f => f.id === overId);
        
        if (oldIndex === -1) {
          console.error(`Dragged folder ${activeId} not found!`);
          return prevFolders;
        }

        const activeFolder = prevFolders[oldIndex];
        
        // Simple case: nesting a folder inside another folder
        if (overId.startsWith('folder_') && overId !== activeId && overId === overFolderId) {
          // Prevent circular references
          let isDescendant = false;
          let currentId: string | null = overId;
          
          while (currentId) {
            if (currentId === activeId) {
              isDescendant = true;
              break;
            }
            
            const parent = prevFolders.find(f => f.id === currentId);
            currentId = parent?.parentId || null;
          }
          
          if (isDescendant) {
            console.warn(`Cannot nest folder ${activeId} inside its descendant ${overId}`);
            return prevFolders;
          }
          
          // Update the parent ID
          const updatedFolders = prevFolders.map(folder =>
            folder.id === activeId ? { ...folder, parentId: overId } : folder
          );
          
          // Save the updated folder
          const updatedFolder = updatedFolders.find(f => f.id === activeId);
          if (updatedFolder) {
            saveFolder(updatedFolder)
              .catch(err => console.error(`Error saving folder ${activeId}:`, err));
          }
          
          return updatedFolders;
        }
        // Simple case: reordering folders
        else if (newIndex !== -1 && oldIndex !== newIndex) {
          // Move the folder in the array
          const reorderedFolders = arrayMove(prevFolders, oldIndex, newIndex);
          
          // Update order for all siblings
          const parentId = activeFolder.parentId;
          const siblings = reorderedFolders.filter(f => f.parentId === parentId);
          
          const updatedFolders = reorderedFolders.map(folder => {
            if (folder.parentId === parentId) {
              const index = siblings.findIndex(s => s.id === folder.id);
              return { ...folder, order: index };
            }
            return folder;
          });
          
          // Save all affected folders
          updatedFolders
            .filter(folder => folder.parentId === parentId)
            .forEach(folder => {
              saveFolder(folder)
                .catch(err => console.error(`Error saving folder ${folder.id}:`, err));
            });
          
          return updatedFolders;
        }
        // Moving to root
        else if (overId === 'root' || overId.startsWith('chat_')) {
          // Only update if not already at root
          if (activeFolder.parentId !== null) {
            const updatedFolders = prevFolders.map(folder =>
              folder.id === activeId ? { ...folder, parentId: null } : folder
            );
            
            // Save the updated folder
            const updatedFolder = updatedFolders.find(f => f.id === activeId);
            if (updatedFolder) {
              saveFolder(updatedFolder)
                .catch(err => console.error(`Error saving folder ${activeId}:`, err));
            }
            
            return updatedFolders;
          }
        }
        
        // Default: no change
        return prevFolders;
      });
    }
    
    // Finally clear the states
    setOverFolderId(null);
  }, [activeType, folders, chatFolders]); // Dependencies


  // Removed useEffect that automatically saved chatFolders on change. Saving is now handled explicitly in handleDragEnd.
  
  // Removed useEffect that reloaded folder data on savedChats change to prevent overwriting state
  
  // Function to render a sortable folder
  const SortableFolder = ({ folder }: { folder: Folder }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging
    } = useSortable({ id: folder.id });
    
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
      zIndex: isDragging ? 999 : 'auto',
      // Fix for horizontal scrolling
      position: isDragging ? 'absolute' as const : 'static' as const,
      width: isDragging ? 'calc(100% - 16px)' : 'auto',
      left: 0,
      right: 0
    };
    
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "mb-2 relative",
          // Apply highlight when hovering over this folder
          overFolderId === folder.id && activeId !== folder.id
            ? 'ring-2 ring-blue-500 rounded-md bg-blue-50 dark:bg-blue-900/20 transition-all duration-200 scale-105' // Highlight when hovering
            : '',
          isDragging ? 'z-50' : 'z-auto' // Ensure dragging element is on top
        )}
      >
        {/* Overlay to improve drop target area */}
        {activeId && activeId !== folder.id && (
          <div className="absolute inset-0 z-10 pointer-events-none" />
        )}
        
        {/* Visual indicator for nesting */}
        {overFolderId === folder.id && activeId !== folder.id && (
          <div className="absolute inset-0 border-2 border-dashed border-blue-500 rounded-md z-20 pointer-events-none flex items-center justify-center">
            <div className="bg-blue-100 dark:bg-blue-900/50 px-2 py-1 rounded text-xs font-medium text-blue-800 dark:text-blue-200">
              Drop to nest
            </div>
          </div>
        )}
        <div className="group">
          {/* Folder header with expand/collapse */}
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 p-0"
              onClick={() => {
                const updatedFolder = {
                  ...folders.find(f => f.id === folder.id)!,
                  isExpanded: !folders.find(f => f.id === folder.id)!.isExpanded
                };
                
                // Update state immediately for responsive UI
                setFolders(folders.map(f =>
                  f.id === folder.id ? {...f, isExpanded: !f.isExpanded} : f
                ));
                
                // Save the updated folder to backend
                saveFolder(updatedFolder)
                  .then(() => {
                    console.log("Folder expansion state updated successfully");
                  })
                  .catch(err => {
                    console.error("Failed to update folder expansion state:", err);
                  });
              }}
            >
              {folder.isExpanded ?
                <ChevronDown className="h-4 w-4" /> :
                <ChevronRight className="h-4 w-4" />
              }
            </Button>
            
            {editingFolderId === folder.id ? (
              // Editing folder name
              <Input
                value={editingFolderName}
                onChange={(e) => setEditingFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const updatedFolder = {
                      ...folders.find(f => f.id === folder.id)!,
                      name: editingFolderName
                    };
                    
                    // Save the updated folder to backend
                    saveFolder(updatedFolder)
                      .then(() => {
                        console.log("Folder name updated successfully");
                        setFolders(folders.map(f =>
                          f.id === folder.id ? {...f, name: editingFolderName} : f
                        ));
                        setEditingFolderId(null);
                      })
                      .catch(err => {
                        console.error("Failed to update folder name:", err);
                        alert("Failed to update folder name. Please try again.");
                        setEditingFolderId(null);
                      });
                  } else if (e.key === 'Escape') {
                    setEditingFolderId(null);
                  }
                }}
                onBlur={() => {
                  const updatedFolder = {
                    ...folders.find(f => f.id === folder.id)!,
                    name: editingFolderName
                  };
                  
                  // Save the updated folder to backend
                  saveFolder(updatedFolder)
                    .then(() => {
                      console.log("Folder name updated successfully on blur");
                      setFolders(folders.map(f =>
                        f.id === folder.id ? {...f, name: editingFolderName} : f
                      ));
                      setEditingFolderId(null);
                    })
                    .catch(err => {
                      console.error("Failed to update folder name on blur:", err);
                      setEditingFolderId(null);
                    });
                }}
                autoFocus
                className="h-7 text-sm ml-1 flex-1"
              />
            ) : (
              <Button
                variant="ghost"
                className="h-7 flex-1 justify-start text-sm px-2"
                {...attributes}
                {...listeners}
                data-folder-id={folder.id}
                onClick={() => {
                  const updatedFolder = {
                    ...folders.find(f => f.id === folder.id)!,
                    isExpanded: !folders.find(f => f.id === folder.id)!.isExpanded
                  };
                  
                  // Update state immediately for responsive UI
                  setFolders(folders.map(f =>
                    f.id === folder.id ? {...f, isExpanded: !f.isExpanded} : f
                  ));
                  
                  // Save the updated folder to backend
                  saveFolder(updatedFolder)
                    .then(() => {
                      console.log("Folder expansion state updated successfully (from name click)");
                    })
                    .catch(err => {
                      console.error("Failed to update folder expansion state (from name click):", err);
                    });
                }}
              >
                <FolderIcon className="h-4 w-4 mr-2 text-gray-500" />
                <span className="font-medium">{folder.name}</span>
              </Button>
            )}
            
            {/* Folder action buttons */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 p-0 flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingFolderId(folder.id);
                  setEditingFolderName(folder.name);
                }}
              >
                <Edit2 className="h-3 w-3 text-gray-500 hover:text-blue-500" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 p-0 flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  // Delete folder and move all chats to root
                  const updatedChatFolders = {...chatFolders};
                  Object.keys(updatedChatFolders).forEach(chatId => {
                    if (updatedChatFolders[chatId] === folder.id) {
                      delete updatedChatFolders[chatId];
                    }
                  });
                  
                  // Delete folder from backend
                  deleteFolder(folder.id)
                    .then(() => {
                      setChatFolders(updatedChatFolders);
                      setFolders(folders.filter(f => f.id !== folder.id));
                    })
                    .catch(err => console.error(`Failed to delete folder ${folder.id}:`, err));
                }}
              >
                <Trash2 className="h-3 w-3 text-gray-500 hover:text-red-500" />
              </Button>
            </div>
          </div>
          
          {/* Folder contents */}
          {folder.isExpanded && (
            <div className="pl-8 mt-1 space-y-1 border-l-2 border-gray-100 dark:border-gray-700 ml-2">
              {/* Subfolders in this folder */}
              {folders
                .filter(f => f.parentId === folder.id)
                .map((subfolder) => (
                  <SortableFolder key={subfolder.id} folder={subfolder} />
                ))}
                
              {/* Chats in this folder */}
              <SortableContext
                items={displayedChats.filter(chat => chatFolders[chat.id] === folder.id).map(chat => chat.id)}
                strategy={verticalListSortingStrategy}
              >
                {displayedChats
                  .filter(chat => chatFolders[chat.id] === folder.id)
                  .map((chat) => (
                    <SortableChat key={chat.id} chat={chat} />
                  ))}
              </SortableContext>
            </div>
          )}
        </div>
      </div>
    );
  };
  
  // Function to render a sortable chat
  const SortableChat = ({ chat }: { chat: SavedChat }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging
    } = useSortable({ id: chat.id });
    
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
      zIndex: isDragging ? 999 : 'auto',
      // Fix for horizontal scrolling
      position: isDragging ? 'absolute' as const : 'static' as const,
      width: isDragging ? 'calc(100% - 16px)' : 'auto',
      left: 0,
      right: 0
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "group relative mb-1 flex items-center",
          isDragging ? 'z-50' : 'z-auto', // Ensure dragging element is on top
          overFolderId && activeId === chat.id ? 'ring-2 ring-green-500 rounded-md' : '' // Highlight when being dragged over a folder
        )}
      >
        {/* Visual indicator when being dragged over a folder */}
        {overFolderId && activeId === chat.id && (
          <div className="absolute right-2 top-0 bg-green-100 dark:bg-green-900/50 px-2 py-1 rounded text-xs font-medium text-green-800 dark:text-green-200 z-20">
            Will be moved to folder
          </div>
        )}
        {/* Chat content - main part */}
        <div className="flex-grow">
          {/* Chat content */}
          <div className="pt-1">
            {editingChatId === chat.id ? (
              // Editing mode
              <div className="w-full">
                <Input
                  value={editingChatName}
                  onChange={(e) => setEditingChatName(e.target.value)}
                  onKeyDown={(e) => handleEditKeyPress(e, chat.id)}
                  onBlur={() => handleSaveChatName(chat.id)}
                  autoFocus
                  className="h-7 text-sm"
                />
              </div>
            ) : (
              // Display mode
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start text-sm h-7 py-1 px-2 text-left",
                  chat.id === activeChatId ? 'bg-gray-200 dark:bg-gray-700' : ''
                )}
                onClick={() => handleSelectChat(chat.id)}
                data-testid={`chat-button-${chat.id}`}
                {...attributes}
                {...listeners}
              >
                <span className="font-medium truncate block">
                  {chat.title || (chat.id.startsWith('new_') ? 'New Chat' : `Chat ${chat.id.substring(0, 8)}`)}
                </span>
              </Button>
            )}
          </div>
        </div>
        
        {/* Action buttons on the right */}
        <div className="flex opacity-0 group-hover:opacity-100 transition-opacity z-10 gap-1 ml-1 mr-1 flex-shrink-0">
          {/* Edit button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 p-0"
            onClick={(e) => handleEditChat(e, chat.id)}
            aria-label="Edit chat name"
          >
            <Edit2 className="h-3 w-3 text-gray-500 hover:text-blue-500" />
          </Button>
          
          {/* Delete button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 p-0"
            onClick={(e) => handleDeleteChat(e, chat.id)}
            aria-label="Delete chat"
          >
            <Trash2 className="h-3 w-3 text-gray-500 hover:text-red-500" />
          </Button>
        </div>
      </div>
    );
  };

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

          // Always sort based on current sort order
          return newChats.sort((a, b) => {
            if (sortOrder === 'newest') {
              return b.timestamp - a.timestamp;
            } else {
              return a.timestamp - b.timestamp;
            }
          });
          return newChats;
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

    // Always apply sort
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
            {/* Container for Plus button and dropdown */}
            <div className="relative">
              {/* Plus button - toggles dropdown */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsHoveringNewOptions(!isHoveringNewOptions)}
                onMouseEnter={() => setIsHoveringNewOptions(true)}
                aria-label="New Chat or Folder"
              >
                <Plus className="h-5 w-5" />
              </Button>

              {/* Dropdown menu for new chat/folder */}
              {isHoveringNewOptions && (
                <div
                  className="absolute right-0 mt-1 w-40 bg-white dark:bg-gray-800 rounded-md shadow-lg z-50 border border-gray-200 dark:border-gray-700"
                  onMouseEnter={() => setIsHoveringNewOptions(true)}
                  onMouseLeave={() => setIsHoveringNewOptions(false)}
                >
                  {/* New Chat Option */}
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-sm px-3 py-2"
                    onClick={() => {
                      handleNewChat();
                      setIsHoveringNewOptions(false); // Hide dropdown after action
                    }}
                  >
                    <PlusCircle className="h-4 w-4 mr-2" />
                    New Chat
                  </Button>
                  {/* New Folder Option */}
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-sm px-3 py-2"
                    onClick={() => {
                      // Create a new folder
                      const newFolderId = generateFolderId();
                      const newFolder = {
                        id: newFolderId,
                        name: 'New Folder',
                        parentId: null,
                        isExpanded: false
                      };
                      
                      console.log("Creating new folder:", newFolder);
                      
                      // Save the new folder to backend
                      saveFolder(newFolder)
                        .then(() => {
                          console.log("Folder saved successfully, updating state");
                          setFolders(prevFolders => [...prevFolders, newFolder]);
                        })
                        .catch(err => {
                          console.error("Failed to save new folder:", err);
                          alert("Failed to save folder. Please try again.");
                        });
                      setEditingFolderId(newFolderId);
                      setEditingFolderName('New Folder');
                      setIsHoveringNewOptions(false); // Hide dropdown after action
                    }}
                  >
                    <FolderIcon className="h-4 w-4 mr-2" />
                    New Folder
                  </Button>
                </div>
              )}
            </div>
        </div>
        {/* Apply strict overflow control to prevent horizontal scrolling */}
        <ScrollArea className="flex-1 overflow-hidden">
          <div className="overflow-x-hidden overflow-y-auto h-full w-full">
          {/* Add data-testid for easier selection in tests */}
          {/* Ensure this inner div does not counteract the overflow setting */}
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
                    {sortOrder === 'newest' ? <SortDesc className="h-3 w-3 mr-1 inline-block" /> :
                     <SortAsc className="h-3 w-3 mr-1 inline-block" />}
                    <SelectValue placeholder="Sort" />
                 </SelectTrigger>
                 <SelectContent>
                    <SelectItem value="newest">Newest First</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                 </SelectContent>
               </Select>
            </div>

            {/* Chat List */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              modifiers={[]}
            >
              {/* Root folders */}
              <SortableContext
                items={folders.filter(folder => folder.parentId === null).map(folder => folder.id)}
                strategy={verticalListSortingStrategy}
              >
                {folders.filter(folder => folder.parentId === null).map((folder) => (
                  <SortableFolder key={folder.id} folder={folder} />
                ))}
              </SortableContext>
              
              {/* Chats not in folders */}
              {isLoadingChats ? (
                <div className="text-sm text-gray-400 dark:text-gray-500">Loading chats...</div>
              ) : displayedChats.length === 0 ? (
                <div className="text-sm text-gray-400 dark:text-gray-500">
                  {searchQuery ? 'No matching chats found.' : (filterMode === 'all' ? 'No past chats found.' : `No ${filterMode} chats found.`)}
                </div>
              ) : (
                <div
                  id="root"
                  className="mt-4"
                >
                  <SortableContext
                    items={displayedChats.filter(chat => !chatFolders[chat.id]).map(chat => chat.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {displayedChats
                      .filter(chat => !chatFolders[chat.id]) // Only show chats not in folders
                      .map((chat) => (
                        <SortableChat key={chat.id} chat={chat} />
                      ))}
                  </SortableContext>
                </div>
              )}
            </DndContext>
          </div>
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
                onValueChange={(value: string) => {
                  // Store the previous mode before switching
                  setPreviousMode(currentMode);
                  // Set the new mode
                  setCurrentMode(value as Mode);
                  // Set the mode switching flag to true
                  setIsModeSwitching(true);
                }}
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
                                <div
                                    className="absolute inset-0 h-full bg-white dark:bg-black rounded-full -z-10"
                                />
                            )}
                            {mode.label}
                        </Label>
                    </div>
                ))}
             </RadioGroup>
        </div>


        {/* Chat Interface Area */}
        <div className="flex-1 overflow-hidden flex p-4 md:p-6 lg:p-8 pt-20 pb-4"> {/* Added padding-top and bottom */}
           <div className="w-full h-full flex flex-col justify-between">
              {currentMode === 'action' ? (
                 <ActionMode
                     activeChatId={activeChatId}
                     initialMessages={activeChatMessages}
                     onMessagesUpdate={handleMessagesUpdate}
                     settings={settings} // Pass settings
                     isLoadingSettings={isLoadingSettings} // Pass loading status
                     cwd={cwd} // Pass CWD
                     isModeSwitching={isModeSwitching} // Pass mode switching flag
                     previousMode={previousMode} // Pass previous mode
                     onModeSwitchComplete={() => setIsModeSwitching(false)} // Callback to reset mode switching flag
                 />
              ) : (
                 <WalkthroughMode
                     activeChatId={activeChatId}
                     initialMessages={activeChatMessages}
                     onMessagesUpdate={handleMessagesUpdate}
                     settings={settings}
                     isLoadingSettings={isLoadingSettings}
                     cwd={cwd}
                     isModeSwitching={isModeSwitching} // Pass mode switching flag
                     previousMode={previousMode} // Pass previous mode
                     onModeSwitchComplete={() => setIsModeSwitching(false)} // Callback to reset mode switching flag
                 />
              )}
           </div>
        </div>
      </main>
    </div>
  );
}
