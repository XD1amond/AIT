// Mock for system-info.ts
export function getSystemInfoPrompt(cwd: string, currentModeSlug: string, customModes?: any[]): string {
  return `====

SYSTEM INFORMATION

Operating System: Mock OS
Default Shell: /mock/shell
Home Directory: /mock/home
Current Workspace Directory: ${cwd}

The Current Workspace Directory is the active VS Code project directory.`;
}