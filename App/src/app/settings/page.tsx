'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { invoke, isTauri } from '@tauri-apps/api/core'; // Import isTauri
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

// Types (copied from ApiKeySettings.tsx)
type ApiProvider = 'openai' | 'claude' | 'openrouter';

// Define available themes
type Theme = 'light' | 'dark' | 'system';

interface AppSettings {
    openai_api_key: string;
    claude_api_key: string;
    open_router_api_key: string;
    brave_search_api_key: string; // Added for Brave Search
    // Provider/Model settings (example structure, adjust as needed)
    walkthrough_provider: ApiProvider;
    walkthrough_model: string; // Store the specific model string
    action_provider: ApiProvider;
    action_model: string;
    // Appearance settings
    theme: Theme;
}

// Example model lists (replace with actual valid models)
const OPENAI_MODELS = ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"];
const CLAUDE_MODELS = ["claude-3-opus-20240229", "claude-3-sonnet-20240229", "claude-3-haiku-20240307"];
const OPENROUTER_MODELS = ["openai/gpt-4o", "anthropic/claude-3-opus", "google/gemini-pro-1.5"]; // Example format

const PROVIDER_MODELS: Record<ApiProvider, string[]> = {
    openai: OPENAI_MODELS,
    claude: CLAUDE_MODELS,
    openrouter: OPENROUTER_MODELS,
};


export default function SettingsPage() {
  // State for API Keys Tab
  const [openaiKey, setOpenaiKey] = useState('');
  const [claudeKey, setClaudeKey] = useState('');
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [braveSearchKey, setBraveSearchKey] = useState(''); // Added for Brave Search

  // State for Models Tab
  const [walkthroughProvider, setWalkthroughProvider] = useState<ApiProvider>('openai');
  const [walkthroughModel, setWalkthroughModel] = useState<string>(PROVIDER_MODELS.openai[0]); // Default to first model of default provider
  const [actionProvider, setActionProvider] = useState<ApiProvider>('openai');
  const [actionModel, setActionModel] = useState<string>(PROVIDER_MODELS.openai[0]);

  // State for Appearance Tab
  const [theme, setTheme] = useState<Theme>('system');

  // General state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load settings using invoke on mount
  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    // Use isTauri() for a more robust check
    if (await isTauri()) {
        try {
          console.log("Invoking get_settings on Settings Page...");
          // Assuming get_settings returns the full AppSettings structure
          const loadedSettings = await invoke<AppSettings>('get_settings');
          console.log("Settings received on Settings Page:", loadedSettings);
          setOpenaiKey(loadedSettings.openai_api_key || '');
          setClaudeKey(loadedSettings.claude_api_key || '');
          setOpenRouterKey(loadedSettings.open_router_api_key || '');
          setBraveSearchKey(loadedSettings.brave_search_api_key || ''); // Load Brave key

          // Load Models settings
          const wtProvider = loadedSettings.walkthrough_provider || 'openai';
          const actProvider = loadedSettings.action_provider || 'openai';
          setWalkthroughProvider(wtProvider);
          setWalkthroughModel(loadedSettings.walkthrough_model || PROVIDER_MODELS[wtProvider][0]);
          setActionProvider(actProvider);
          setActionModel(loadedSettings.action_model || PROVIDER_MODELS[actProvider][0]);

          // Load Appearance settings
          setTheme(loadedSettings.theme || 'system');

        } catch (err) {
          console.error("Failed to load settings via invoke:", err);
          setError(`Failed to load settings via Tauri: ${err instanceof Error ? err.message : String(err)}`);
          // Set defaults in UI if loading fails
          setOpenaiKey('');
          setClaudeKey('');
          setOpenRouterKey('');
          setBraveSearchKey(''); // Reset Brave key on error
          // Reset models/theme state on error too
          setWalkthroughProvider('openai');
          setWalkthroughModel(PROVIDER_MODELS.openai[0]);
          setActionProvider('openai');
          setActionModel(PROVIDER_MODELS.openai[0]);
          setTheme('system');
        } finally {
          setIsLoading(false);
        }
    } else { // This block might be less likely to be hit now, but keep for safety
        console.warn("Tauri API not available on Settings page (isTauri check failed).");
        setError('Tauri context not found. Cannot load or save settings.');
        // Set defaults
        setOpenaiKey('');
        setClaudeKey('');
        setOpenRouterKey('');
        setBraveSearchKey(''); // Reset Brave key on error
        // Reset models/theme state on error too
        setWalkthroughProvider('openai');
        setWalkthroughModel(PROVIDER_MODELS.openai[0]);
        setActionProvider('openai');
        setActionModel(PROVIDER_MODELS.openai[0]);
        setTheme('system');
        setIsLoading(false);
    }
  }, []); // useCallback with empty dependency array

  useEffect(() => {
    // Introduce a small delay before loading settings
    const timer = setTimeout(() => {
      (async () => {
        await loadSettings();
      })();
    }, 100); // 100ms delay

    // Cleanup function to clear the timer if the component unmounts
    return () => clearTimeout(timer);
  }, [loadSettings]); // Load on mount

  const handleSaveSettings = async () => {
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true); // Indicate saving process

    // Ensure a complete AppSettings object is sent, matching the Rust struct
    const currentSettings: AppSettings = {
      openai_api_key: openaiKey || '', // Ensure strings are not undefined
      claude_api_key: claudeKey || '',
      open_router_api_key: openRouterKey || '',
      brave_search_api_key: braveSearchKey || '', // Save Brave key
      // Models
      walkthrough_provider: walkthroughProvider,
      walkthrough_model: walkthroughModel,
      action_provider: actionProvider,
      action_model: actionModel,
      // Appearance
      theme: theme,
    };

    // Use isTauri() for a more robust check
    if (await isTauri()) {
        try {
          console.log("Invoking save_settings with:", currentSettings);
          // Assuming save_settings takes the whole object or handles partial updates
          await invoke('save_settings', { settings: currentSettings });
          console.log("Settings saved successfully.");
          setSuccessMessage("Settings saved successfully!");
          // Optionally reload settings to confirm, or just assume success
      // loadSettings();
        } catch (err) {
          console.error("Failed to save settings via invoke:", err);
          setError(`Failed to save settings via Tauri: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsLoading(false);
            // Clear success message after a delay
            if (successMessage) { // Check current successMessage, not the state which might not have updated yet
                setTimeout(() => setSuccessMessage(null), 3000);
            }
        }
    } else { // This block might be less likely to be hit now, but keep for safety
        console.warn("Tauri API not available on Settings page (isTauri check failed). Cannot save.");
        setError('Tauri context not found. Cannot save settings.');
        setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
       {/* Header */}
       <header className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center bg-white dark:bg-gray-800">
         <Link href="/">
            <Button variant="ghost" size="icon" aria-label="Back to Chat">
                <ArrowLeft className="h-5 w-5" />
            </Button>
         </Link>
         <h1 className="text-xl font-semibold ml-4">Settings</h1>
       </header>

       {/* Main Settings Area */}
       <main className="flex-1 overflow-y-auto p-6">
         <Tabs defaultValue="api-keys" className="w-full max-w-3xl mx-auto">
           <TabsList className="grid w-full grid-cols-3 mb-6">
             <TabsTrigger value="api-keys">API Keys</TabsTrigger>
             <TabsTrigger value="models">Models</TabsTrigger>
             <TabsTrigger value="appearance">Appearance</TabsTrigger>
           </TabsList>

           {/* API Keys Tab */}
           <TabsContent value="api-keys">
             <Card>
               <CardHeader>
                 <CardTitle>API Keys</CardTitle> {/* Updated Title */}
                 <CardDescription>
                   Enter API keys for AI models and external tools. {/* Updated Description */}
                 </CardDescription>
               </CardHeader>
               <CardContent className="space-y-8"> {/* Increased spacing */}

                 {/* AI Keys Subsection */}
                 <div className="space-y-4">
                   <h3 className="text-lg font-medium border-b pb-2 mb-4">AI Providers</h3> {/* Subsection Title */}
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
                 </div>

                 {/* Tools Keys Subsection */}
                 <div className="space-y-4">
                    <h3 className="text-lg font-medium border-b pb-2 mb-4">Tools</h3> {/* Subsection Title */}
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="brave-search" className="text-right col-span-1">
                        Brave Search
                      </Label>
                      <Input
                        id="brave-search"
                        type="password"
                        value={braveSearchKey}
                        onChange={(e) => setBraveSearchKey(e.target.value)}
                        placeholder="Enter Brave Search API Key"
                        className="col-span-3"
                        disabled={isLoading}
                      />
                    </div>
                    {/* Add other tool keys here as needed */}
                 </div>

                 {/* Removed redundant divider and comments */}
               </CardContent>
             </Card>
           </TabsContent>

           {/* Models Tab */}
           <TabsContent value="models">
             <Card>
               <CardHeader>
                 <CardTitle>Model Selection</CardTitle>
                 <CardDescription>
                   Choose the AI provider and specific model to use for each mode.
                 </CardDescription>
               </CardHeader>
               <CardContent className="space-y-6">
                 {/* Walkthrough Mode Model Selection */}
                 <div className="space-y-3">
                   <Label className="text-base font-medium">Walkthrough Mode</Label>
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="walkthrough-provider" className="text-sm font-medium">Provider</Label>
                        <Select
                           value={walkthroughProvider}
                           onValueChange={(value: string) => {
                               const newProvider = value as ApiProvider;
                               setWalkthroughProvider(newProvider);
                               // Reset model to the first available for the new provider
                               setWalkthroughModel(PROVIDER_MODELS[newProvider][0]);
                           }}
                           disabled={isLoading}
                        >
                           <SelectTrigger id="walkthrough-provider">
                               <SelectValue placeholder="Select provider" />
                           </SelectTrigger>
                           <SelectContent>
                               <SelectItem value="openai">OpenAI</SelectItem>
                               <SelectItem value="claude">Claude</SelectItem>
                               <SelectItem value="openrouter">OpenRouter</SelectItem>
                           </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="walkthrough-model" className="text-sm font-medium">Model</Label>
                        <Select
                           value={walkthroughModel}
                           onValueChange={(value: string) => setWalkthroughModel(value)}
                           disabled={isLoading || !PROVIDER_MODELS[walkthroughProvider]?.length}
                        >
                           <SelectTrigger id="walkthrough-model">
                               <SelectValue placeholder="Select model" />
                           </SelectTrigger>
                           <SelectContent>
                               {PROVIDER_MODELS[walkthroughProvider]?.map(model => (
                                   <SelectItem key={model} value={model}>{model}</SelectItem>
                               ))}
                               {!PROVIDER_MODELS[walkthroughProvider]?.length && <SelectItem value="none" disabled>No models available</SelectItem>}
                           </SelectContent>
                        </Select>
                      </div>
                   </div>
                 </div>

                 {/* Divider */}
                 <hr className="border-gray-200 dark:border-gray-700" />

                 {/* Action Mode Model Selection */}
                  <div className="space-y-3">
                   <Label className="text-base font-medium">Action Mode</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="action-provider" className="text-sm font-medium">Provider</Label>
                        <Select
                           value={actionProvider}
                           onValueChange={(value: string) => {
                               const newProvider = value as ApiProvider;
                               setActionProvider(newProvider);
                               // Reset model to the first available for the new provider
                               setActionModel(PROVIDER_MODELS[newProvider][0]);
                           }}
                           disabled={isLoading}
                        >
                           <SelectTrigger id="action-provider">
                               <SelectValue placeholder="Select provider" />
                           </SelectTrigger>
                           <SelectContent>
                               <SelectItem value="openai">OpenAI</SelectItem>
                               <SelectItem value="claude">Claude</SelectItem>
                               <SelectItem value="openrouter">OpenRouter</SelectItem>
                           </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="action-model" className="text-sm font-medium">Model</Label>
                        <Select
                           value={actionModel}
                           onValueChange={(value: string) => setActionModel(value)}
                           disabled={isLoading || !PROVIDER_MODELS[actionProvider]?.length}
                        >
                           <SelectTrigger id="action-model">
                               <SelectValue placeholder="Select model" />
                           </SelectTrigger>
                           <SelectContent>
                               {PROVIDER_MODELS[actionProvider]?.map(model => (
                                   <SelectItem key={model} value={model}>{model}</SelectItem>
                               ))}
                               {!PROVIDER_MODELS[actionProvider]?.length && <SelectItem value="none" disabled>No models available</SelectItem>}
                           </SelectContent>
                        </Select>
                      </div>
                   </div>
                 </div>

               </CardContent>
             </Card>
           </TabsContent>

           {/* Appearance Tab */}
           <TabsContent value="appearance">
             <Card>
               <CardHeader>
                 <CardTitle>Appearance</CardTitle>
                 <CardDescription>
                   Choose the application theme.
                 </CardDescription>
               </CardHeader>
               <CardContent className="space-y-4">
                  <div>
                   <Label className="text-base font-medium">Theme</Label>
                   <RadioGroup
                     value={theme}
                     onValueChange={(value) => setTheme(value as Theme)}
                     disabled={isLoading}
                     className="mt-2 space-y-1"
                   >
                     <div className="flex items-center space-x-2">
                       <RadioGroupItem value="light" id="theme-light" />
                       <Label htmlFor="theme-light">Light</Label>
                     </div>
                     <div className="flex items-center space-x-2">
                       <RadioGroupItem value="dark" id="theme-dark" />
                       <Label htmlFor="theme-dark">Dark</Label>
                     </div>
                     <div className="flex items-center space-x-2">
                       <RadioGroupItem value="system" id="theme-system" />
                       <Label htmlFor="theme-system">System Default</Label>
                     </div>
                   </RadioGroup>
                   <CardDescription className="text-xs text-muted-foreground mt-2">
                       Selecting 'System Default' will follow your operating system's theme preference.
                   </CardDescription>
                  </div>
                  {/* TODO: Add logic to apply theme change immediately if desired,
                      e.g., using next-themes or similar library */}
               </CardContent>
             </Card>
           </TabsContent>
         </Tabs>

         {/* Save Button and Status */}
         <div className="w-full max-w-3xl mx-auto mt-6 flex justify-end items-center space-x-4">
            {error && <p className="text-sm text-red-600 mr-auto">Error: {error}</p>}
            {successMessage && <p className="text-sm text-green-600 mr-auto">{successMessage}</p>}
            <Button onClick={handleSaveSettings} disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save All Settings'}
            </Button>
         </div>
       </main>
    </div>
  );
}