'use client';

import React, { useState, useEffect } from 'react'; // Removed useCallback as it's not needed for local state version
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription as CardDesc, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Settings } from 'lucide-react';
// Removed all store imports

// Define keys used for state (can be used for store later)
const OPENAI_KEY = 'openaiApiKey';
const CLAUDE_KEY = 'claudeApiKey';
const OPENROUTER_KEY = 'openRouterApiKey';
const WALKTHROUGH_PROVIDER_KEY = 'walkthroughProvider';

export type ApiProvider = 'openai' | 'claude' | 'openrouter';

// Store keys and provider selection in a shared context or state management library later
// For now, we pass them down or retrieve them where needed.
// This component only manages the UI state temporarily.

export function ApiKeySettings({
    initialKeys,
    initialProvider,
    onSave,
}: {
    initialKeys: { openai: string; claude: string; openrouter: string };
    initialProvider: ApiProvider;
    onSave: (keys: { openai: string; claude: string; openrouter: string }, provider: ApiProvider) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [openaiKey, setOpenaiKey] = useState(initialKeys.openai);
  const [claudeKey, setClaudeKey] = useState(initialKeys.claude);
  const [openRouterKey, setOpenRouterKey] = useState(initialKeys.openrouter);
  const [walkthroughProvider, setWalkthroughProvider] = useState<ApiProvider>(initialProvider);

  // Update local state if initial props change (e.g., loaded from elsewhere later)
  useEffect(() => {
    setOpenaiKey(initialKeys.openai);
    setClaudeKey(initialKeys.claude);
    setOpenRouterKey(initialKeys.openrouter);
    setWalkthroughProvider(initialProvider);
  }, [initialKeys, initialProvider]);


  const handleSaveClick = () => {
    // TODO: Implement saving keys to persistent storage (e.g., tauri-plugin-store)
    // This requires resolving the plugin integration issues.
    console.log("Saving API Keys (Local State / Callback):");
    console.log("OpenAI:", openaiKey ? '******' : 'Not Set');
    console.log("Claude:", claudeKey ? '******' : 'Not Set');
    console.log("OpenRouter:", openRouterKey ? '******' : 'Not Set');
    console.log("Walkthrough Provider:", walkthroughProvider);

    // Call the onSave prop to update parent state (temporary solution)
    onSave({ openai: openaiKey, claude: claudeKey, openrouter: openRouterKey }, walkthroughProvider);

    setIsOpen(false); // Close dialog
  };

  // Reset local state to initial props when dialog is closed without saving
  const handleOpenChange = (open: boolean) => {
    if (!open) {
        setOpenaiKey(initialKeys.openai);
        setClaudeKey(initialKeys.claude);
        setOpenRouterKey(initialKeys.openrouter);
        setWalkthroughProvider(initialProvider);
    }
    setIsOpen(open);
  };


  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="fixed bottom-4 right-4 z-50">
          <Settings className="h-4 w-4" />
          <span className="sr-only">API Key Settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>API Key Settings</DialogTitle>
          <DialogDescription>
            Enter your API keys. (Persistence needs fixing later)
          </DialogDescription>
        </DialogHeader>
           <>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Provider Keys</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 py-4">
                {/* OpenAI Input */}
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="openai" className="text-right col-span-1">
                    OpenAI
                  </Label>
                  <Input
                    id="openai"
                    type="password"
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    placeholder="sk-..."
                    className="col-span-3"
                  />
                </div>
                {/* Claude Input */}
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="claude" className="text-right col-span-1">
                    Claude
                  </Label>
                  <Input
                    id="claude"
                    type="password"
                    value={claudeKey}
                    onChange={(e) => setClaudeKey(e.target.value)}
                    placeholder="sk-ant-..."
                    className="col-span-3"
                  />
                </div>
                {/* OpenRouter Input */}
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="openrouter" className="text-right col-span-1">
                    OpenRouter
                  </Label>
                  <Input
                    id="openrouter"
                    type="password"
                    value={openRouterKey}
                    onChange={(e) => setOpenRouterKey(e.target.value)}
                    placeholder="sk-or-..."
                    className="col-span-3"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Provider Selection Card */}
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-lg">Walkthrough Provider</CardTitle>
                <CardDesc className="text-sm text-muted-foreground">
                  Choose which AI to use for Walkthrough Mode.
                </CardDesc>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={walkthroughProvider}
                  onValueChange={(value) => setWalkthroughProvider(value as ApiProvider)}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="openai" id="r-openai" />
                    <Label htmlFor="r-openai">OpenAI</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="claude" id="r-claude" />
                    <Label htmlFor="r-claude">Claude (Anthropic)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="openrouter" id="r-openrouter" />
                    <Label htmlFor="r-openrouter">OpenRouter</Label>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>

            <DialogFooter className="mt-4">
              <Button type="button" onClick={handleSaveClick}>
                Save Settings
              </Button>
            </DialogFooter>
          </>
      </DialogContent>
    </Dialog>
  );
}