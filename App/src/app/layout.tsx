'use client'; // Required for state

import React, { useState, useEffect } from 'react'; // Import useState, useEffect
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ApiKeySettings, ApiProvider } from "@/components/ApiKeySettings"; // Import ApiProvider type
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

// Metadata can't be dynamic in client components easily, consider moving if needed
// export const metadata: Metadata = {
//   title: "AI Tech Support Tool",
//   description: "Your AI-powered tech support companion",
// };

// TODO: Implement loading initial state from persistent storage when fixed
// const loadInitialSettings = async () => { ... }

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // State for API keys and provider selection
  const [apiKeys, setApiKeys] = useState({ openai: '', claude: '', openrouter: '' });
  const [walkthroughProvider, setWalkthroughProvider] = useState<ApiProvider>('openai');

  // TODO: Load initial state from storage here using useEffect
  // useEffect(() => {
  //   const load = async () => {
  //     // Replace with actual store loading logic when fixed
  //     // const loadedKeys = await loadKeysFromStore();
  //     // const loadedProvider = await loadProviderFromStore();
  //     // setApiKeys(loadedKeys);
  //     // setWalkthroughProvider(loadedProvider);
  //   };
  //   load();
  // }, []);


  // Callback for ApiKeySettings to save changes
  const handleSaveSettings = (
    newKeys: { openai: string; claude: string; openrouter: string },
    newProvider: ApiProvider
  ) => {
    setApiKeys(newKeys);
    setWalkthroughProvider(newProvider);
    // TODO: Add call to save to persistent storage here when fixed
  };

  // Pass state down to children (requires children to handle props or use Context)
  // This is a simplified approach; Context API is generally better for deep prop drilling.
  const childrenWithProps = React.Children.map(children, child => {
    if (React.isValidElement(child)) {
      // @ts-ignore - Ignore TS error for adding props dynamically
      return React.cloneElement(child, { apiKeys, walkthroughProvider });
    }
    return child;
  });


  return (
    <html lang="en" suppressHydrationWarning>
      <head>
         {/* We need a basic title here as metadata object isn't reliable in client component */}
         <title>AI Tech Support Tool</title>
      </head>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          inter.variable
        )}
      >
        {childrenWithProps} {/* Render children with injected props */}
        <ApiKeySettings
          initialKeys={apiKeys}
          initialProvider={walkthroughProvider}
          onSave={handleSaveSettings}
        />
      </body>
    </html>
  );
}
