import React from 'react';
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

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
        {children} {/* Render children directly */}
      </body>
    </html>
  );
}
