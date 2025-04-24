'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { ActionMode } from '@/components/modes/action-mode/ActionMode';
import { WalkthroughMode } from '@/components/modes/walkthrough-mode/WalkthroughMode';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"; // Added import
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link'; // Import Link for navigation

// Define the modes available in the chat interface
type Mode = 'action' | 'walkthrough';
const modes: { id: Mode; label: string }[] = [
    { id: 'action', label: 'Action' },
    { id: 'walkthrough', label: 'Walkthrough' },
];

export default function Home() {
  // Default to Walkthrough mode
  const [currentMode, setCurrentMode] = useState<Mode>('walkthrough');

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-100 dark:bg-gray-900">

      {/* Sidebar */}
      <aside className="w-64 flex flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h1 className="text-xl font-semibold">AIT</h1> {/* App Title */}
        </div>
        <ScrollArea className="flex-1 p-4">
          <h2 className="text-sm font-semibold mb-2 text-gray-500 dark:text-gray-400 uppercase">Chats</h2>
          {/* Placeholder for chat history items */}
          <div className="text-sm text-gray-400 dark:text-gray-500">
            (Chat history will appear here)
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
                // Use flex, padding, background, rounded, shadow
                className="relative flex space-x-1 bg-gray-200 dark:bg-gray-700 p-1 rounded-full shadow-md"
             >
                {/* Map over modes to create options */}
                {modes.map((mode) => (
                    <div key={mode.id} className="relative z-10"> {/* Container for label + potential highlight */}
                        <RadioGroupItem value={mode.id} id={`${mode.id}-mode`} className="sr-only" />
                        <Label
                            htmlFor={`${mode.id}-mode`}
                            // Base styling for label: padding, rounded, cursor, transition
                            className={`relative block px-5 py-1.5 rounded-full cursor-pointer transition-colors text-sm font-medium ${
                                // Text color based on selection
                                currentMode === mode.id ? 'text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                            }`}
                        >
                            {/* Render the highlight *inside* the selected label's container */}
                            {currentMode === mode.id && (
                                <motion.div
                                    layoutId="modeHighlight" // Shared layout ID
                                    // Style the highlight: absolute, covers container, background, rounded
                                    className="absolute inset-0 h-full bg-white dark:bg-black rounded-full -z-10" // Use -z-10 to place behind text
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                />
                            )}
                            {/* Label Text */}
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
               key={currentMode}
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               transition={{ duration: 0.15 }}
               className="w-full h-full flex"
             >
                {currentMode === 'action' ? <ActionMode /> : <WalkthroughMode />}
             </motion.div>
           </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
