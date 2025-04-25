'use client';

import React, { useState, useEffect, useRef } from 'react'; // Import useState, useEffect, useRef
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area"; // Import ScrollArea
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';

// Define a type for messages in Action Mode
interface ActionMessage {
  id: number; // For key prop
  type: 'task' | 'status' | 'result' | 'error';
  content: string;
}

export function ActionMode() {
  const [task, setTask] = useState('');
  // Store a list of messages instead of a single result
  const [messages, setMessages] = useState<ActionMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const nextId = useRef(0); // To generate unique keys for messages
  const viewportRef = useRef<HTMLDivElement>(null); // For scrolling

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


  const handleSubmit = async () => {
    if (!task.trim() || isLoading) return;

    const currentTask = task; // Capture task before clearing
    setTask(''); // Clear input immediately

    const taskId = nextId.current++;
    const statusId = nextId.current++;
    const resultId = nextId.current++;

    // Add task message (user input style)
    setMessages(prev => [...prev, { id: taskId, type: 'task', content: currentTask }]);
    setIsLoading(true);

    // Add status message (AI thinking style)
    setMessages(prev => [...prev, { id: statusId, type: 'status', content: `Attempting task: "${currentTask}"...` }]);

    // TODO: Integrate with Agent S2 API
    try {
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 1500));
        // Add result message on success (AI response style)
        setMessages(prev => [...prev, { id: resultId, type: 'result', content: `Simulated completion for: "${currentTask}"` }]);
    } catch (error) {
        // Add error message on failure (AI error style)
        setMessages(prev => [...prev, { id: resultId, type: 'error', content: `Failed to execute task: "${currentTask}". Error: ${error instanceof Error ? error.message : String(error)}` }]);
    } finally {
        setIsLoading(false);
    }
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
                    : 'mr-auto bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100' // Status/Result aligned left
                }`}
              >
                {/* Render newlines correctly */}
                {msg.content.split('\n').map((line, i) => (
                  <p key={i} style={{ minHeight: '1em' }}>{line || '\u00A0'}</p>
                ))}
              </motion.div>
            ))}
             {isLoading && ( // Show thinking indicator consistent with Walkthrough
                 <motion.div
                   initial={{ opacity: 0, y: 10 }}
                   animate={{ opacity: 1, y: 0 }}
                   transition={{ duration: 0.3 }}
                   className="max-w-[80%] p-3 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 animate-pulse text-sm mr-auto"
                 >
                    Processing...
                 </motion.div>
             )}
         </div>
      </ScrollArea>


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
        <Button onClick={handleSubmit} disabled={isLoading || !task.trim()} className="h-12 w-12" aria-label="Submit task">
          <Send className="h-5 w-5" /> {/* Adjusted icon size */}
        </Button>
      </div>
    </motion.div>
  );
}