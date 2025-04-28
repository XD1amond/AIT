// App/src/prompts/modes/action-mode.ts
// This file contains the base prompt for Action Mode
import { getToolPrompts } from '../sections/tool-use';

export const ACTION_MODE_BASE_PROMPT = `
You are now in Action Mode.

In Action Mode, you can help users by directly executing commands and using tools on their behalf.
You can interact with the system to perform tasks automatically.

If a tool is disallowed in this mode, you will be notified and must ask the user for permission to use that tool.
`;

// Function to get the action mode prompt
export function getActionModePrompt(enabledTools: string[]): string {
  // Combine the base prompt with tool-specific prompts
  return `${ACTION_MODE_BASE_PROMPT}\n\n${getToolPrompts(enabledTools)}`;
}