'use client';

import React, { useState, useEffect } from 'react';
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
import { invoke } from '@tauri-apps/api/core'; // Import invoke

export type ApiProvider = 'openai' | 'claude' | 'openrouter';

// Define the shape of the settings object matching Rust struct
interface AppSettings {
    openai_api_key: string;
    claude_api_key: string;
    open_router_api_key: string;
    walkthrough_provider: ApiProvider; // Use ApiProvider type
}

export function ApiKeySettings() {
  const [isOpen, setIsOpen] = useState(false);
  // State to hold the form values temporarily
  const [openaiKey, setOpenaiKey] = useState('');
  const [claudeKey, setClaudeKey] = useState('');
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [walkthroughProvider, setWalkthroughProvider] = useState<ApiProvider>('openai');
  // State to hold the initially loaded settings (to reset on cancel)
  const [initialSettings, setInitialSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load settings using invoke on mount or when dialog opens
  const loadSettings = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log("Invoking get_settings...");
      const loadedSettings = await invoke<AppSettings>('get_settings');
      console.log("Settings received:", loadedSettings);
      setOpenaiKey(loadedSettings.openai_api_key);
      setClaudeKey(loadedSettings.claude_api_key);
      setOpenRouterKey(loadedSettings.open_router_api_key);
      setWalkthroughProvider(loadedSettings.walkthrough_provider);
      setInitialSettings(loadedSettings); // Store initial settings for reset
    } catch (err) {
      console.error("Failed to load settings via invoke:", err);
      setError(`Failed to load settings: ${err instanceof Error ? err.message : String(err)}`);
      // Set defaults in UI if loading fails
      setOpenaiKey('');
      setClaudeKey('');
      setOpenRouterKey('');
      setWalkthroughProvider('openai');
      setInitialSettings(null); // No initial settings if load failed
    } finally {
      setIsLoading(false);
    }
  };

  // Load settings when the dialog is triggered to open
  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]); // Re-load when isOpen changes to true

  const handleSaveClick = async () => {
    setError(null);
    const currentSettings: AppSettings = {
      openai_api_key: openaiKey,
      claude_api_key: claudeKey,
      open_router_api_key: openRouterKey,
      walkthrough_provider: walkthroughProvider,
    };

    try {
      console.log("Invoking save_settings with:", currentSettings);
      await invoke('save_settings', { settings: currentSettings });
      console.log("Settings saved successfully.");
      setInitialSettings(currentSettings); // Update initial settings after successful save
      setIsOpen(false); // Close dialog
    } catch (err) {
      console.error("Failed to save settings via invoke:", err);
      setError(`Failed to save settings: ${err instanceof Error ? err.message : String(err)}`);
      // Optionally: Keep dialog open and show error
    }
  };

  // Reset local state to initially loaded values when dialog is closed without saving
  const handleOpenChange = (open: boolean) => {
    if (!open && initialSettings) {
        // Reset to the state when the dialog was opened
        setOpenaiKey(initialSettings.openai_api_key);
        setClaudeKey(initialSettings.claude_api_key);
        setOpenRouterKey(initialSettings.open_router_api_key);
        setWalkthroughProvider(initialSettings.walkthrough_provider);
        setError(null); // Clear error on close
    } else if (!open && !initialSettings && !isLoading) {
        // If loading failed initially, reset to defaults on close
        setOpenaiKey('');
        setClaudeKey('');
        setOpenRouterKey('');
        setWalkthroughProvider('openai');
        setError(null);
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
            {isLoading ? "Loading settings..." : error ? `Error: ${error}` : "Enter your API keys. Settings are saved when you click Save."}
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
                    disabled={isLoading}
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
                    disabled={isLoading}
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
                    disabled={isLoading}
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
                  data-testid="provider-radio-group" // Add data-testid
                  value={walkthroughProvider}
                  onValueChange={(value) => setWalkthroughProvider(value as ApiProvider)}
                  disabled={isLoading}
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
              {error && <p className="text-sm text-red-600 mr-auto">{error}</p>}
              <Button type="button" onClick={handleSaveClick} disabled={isLoading}>
                Save Settings
              </Button>
            </DialogFooter>
          </>
      </DialogContent>
    </Dialog>
  );
}