import React from 'react';
// import type { Metadata } from "next"; // Removed unused import
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from 'sonner';

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

// Metadata can't be dynamic in client components easily, consider moving if needed
// export const metadata: Metadata = {
//   title: "AI Tech Support Tool",
//   description: "Your AI-powered tech support companion",
// };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
        <Toaster
          richColors
          position="top-center"
          expand={false}
          toastOptions={{
            error: {
              style: {
                background: 'rgb(220, 38, 38)',
                color: 'white',
                border: '1px solid rgb(248, 113, 113)',
                boxShadow: '0 4px 6px -1px rgba(220, 38, 38, 0.2), 0 2px 4px -1px rgba(220, 38, 38, 0.1)',
                fontWeight: '500',
              },
              icon: '🚫',
            },
          }}
        />
        {children} {/* Render children directly */}
      </body>
    </html>
  );
}
