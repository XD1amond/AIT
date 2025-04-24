'use client';

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { ActionMode } from '@/components/ActionMode'; // Import Action Mode component
import { WalkthroughMode } from '@/components/WalkthroughMode'; // Import Walkthrough Mode component
import { ArrowLeft } from 'lucide-react'; // Icon for back button
// Removed ApiProvider import as it's not needed here anymore

type Mode = 'select' | 'action' | 'walkthrough';

// Removed HomeProps interface

export default function Home() { // Removed props
  const [currentMode, setCurrentMode] = useState<Mode>('select');

  const handleModeSelect = (mode: Mode) => {
    setCurrentMode(mode);
  };

  const renderContent = () => {
    switch (currentMode) {
      case 'action':
        return <ActionMode />;
      case 'walkthrough':
        // Removed props passed to WalkthroughMode
        return <WalkthroughMode />;
      case 'select':
      default:
        return (
          <>
            <motion.h1
              className="text-4xl font-bold mb-12 text-gray-800 dark:text-gray-200"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              Choose Your Mode
            </motion.h1>
            <motion.div
              className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-6"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  onClick={() => handleModeSelect('action')}
                  className="w-full sm:w-auto px-8 py-6 text-lg font-semibold bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white rounded-lg shadow-md transition-all duration-300"
                >
                  Action Mode
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  onClick={() => handleModeSelect('walkthrough')}
                  variant="outline"
                  className="w-full sm:w-auto px-8 py-6 text-lg font-semibold border-blue-600 text-blue-600 hover:bg-blue-100 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-900/50 rounded-lg shadow-md transition-all duration-300"
                >
                  Walkthrough Mode
                </Button>
              </motion.div>
            </motion.div>
          </>
        );
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900 dark:to-gray-800 p-8">
      {currentMode !== 'select' && (
         <motion.div
           initial={{ opacity: 0, x: -20 }}
           animate={{ opacity: 1, x: 0 }}
           exit={{ opacity: 0, x: -20 }}
           transition={{ duration: 0.3 }}
           className="absolute top-6 left-6"
         >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleModeSelect('select')}
            aria-label="Go back to mode selection"
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>
         </motion.div>
      )}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentMode} // Key change triggers animation
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center w-full" // Ensure content takes width
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>
      {/* ApiKeySettings is likely rendered in layout.tsx or needs to be added here if not */}
    </div>
  );
}
