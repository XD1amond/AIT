'use client';

import React from 'react';
import { Button } from './button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';
import { ToolUse } from '@/prompts/tools/types';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './dialog';

interface ToolApprovalProps {
  toolUse: ToolUse;
  onApprove: () => void;
  onReject: () => void;
  isOpen: boolean;
}

export function ToolApproval({ toolUse, onApprove, onReject, isOpen }: ToolApprovalProps) {
  // Format tool parameters for display
  const formatParams = (params: any): string => {
    return JSON.stringify(params, null, 2);
  };

  // Get a human-readable name for the tool
  const getToolDisplayName = (toolName: string): string => {
    const displayNames: Record<string, string> = {
      command: 'Execute Command',
      web_search: 'Web Search',
    };
    return displayNames[toolName] || toolName;
  };

  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tool Use Approval</DialogTitle>
          <DialogDescription>
            The AI wants to use a tool. Please review and approve or reject.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{getToolDisplayName(toolUse.name)}</CardTitle>
              <CardDescription>
                {toolUse.name === 'command' 
                  ? 'This will execute a command on your system' 
                  : 'This will perform a web search'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-100 dark:bg-gray-800 p-2 rounded text-sm overflow-auto max-h-60">
                {formatParams(toolUse.params)}
              </pre>
            </CardContent>
          </Card>
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button variant="outline" onClick={onReject}>
            Reject
          </Button>
          <Button onClick={onApprove}>
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}