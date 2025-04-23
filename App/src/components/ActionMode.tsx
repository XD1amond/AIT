'use client';

import React from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from 'framer-motion';

export function ActionMode() {
  const [task, setTask] = React.useState('');
  const [result, setResult] = React.useState(''); // To display AI response/status

  const handleSubmit = () => {
    console.log("Action Mode Task Submitted:", task);
    setResult(`Attempting task: "${task}"... (Simulation)`);
    // TODO: Integrate with Agent S2 API
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-2xl"
    >
      <Card>
        <CardHeader>
          <CardTitle>Action Mode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Enter the computer problem or task you want the AI to perform.
          </p>
          <div className="flex space-x-2">
            <Input
              placeholder="e.g., change my wallpaper, clear browser cache"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
            />
            <Button onClick={handleSubmit}>Go</Button>
          </div>
          {result && (
            <div className="mt-4 p-4 bg-secondary/50 rounded-md text-sm">
              <p>{result}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}