// Tool definitions and interfaces
import { ToolType, ToolUse, ToolResponse, ToolProgressStatus, Tool } from './types';
import { commandTool } from './command-tool';
import { webSearchTool } from './web-search-tool';

// Export all tool-related types and functions
export * from './types';

// Map of all available tools
export const tools: Record<string, Tool> = {
  command: commandTool,
  web_search: webSearchTool,
};

// Get tool description for a specific tool
export function getToolDescription(toolType: string): string {
  const tool = tools[toolType];
  if (!tool) {
    throw new Error(`Unknown tool: ${toolType}`);
  }
  return tool.getDescription();
}

// Interface for settings related to tools
export interface ToolSettings {
  auto_approve_tools?: boolean;
  walkthrough_tools?: Record<string, boolean>;
  action_tools?: Record<string, boolean>;
  auto_approve_walkthrough?: Record<string, boolean>;
  auto_approve_action?: Record<string, boolean>;
  whitelisted_commands?: string[];
  blacklisted_commands?: string[];
}

// Check if a tool is enabled for a specific mode
export function isToolEnabled(toolType: string, mode: 'walkthrough' | 'action', settings?: ToolSettings): boolean {
  if (!settings) return true; // Default to enabled if no settings provided
  
  const toolsForMode = mode === 'walkthrough' ? settings.walkthrough_tools : settings.action_tools;
  
  // If the tool settings for this mode don't exist, default to enabled
  if (!toolsForMode) return true;
  
  // Check if the tool is explicitly enabled or disabled
  return toolsForMode[toolType] !== false;
}

// Check if a tool should be auto-approved
export function shouldAutoApprove(toolType: string, mode: 'walkthrough' | 'action', settings?: ToolSettings): boolean {
  if (!settings) return false; // Default to not auto-approving if no settings provided
  
  // If global auto-approve is enabled, return true
  if (settings.auto_approve_tools) return true;
  
  // Check mode-specific auto-approve settings
  const autoApproveForMode = mode === 'walkthrough' ? settings.auto_approve_walkthrough : settings.auto_approve_action;
  
  // If no mode-specific settings, default to false
  if (!autoApproveForMode) return false;
  
  // Return the setting for this specific tool
  return !!autoApproveForMode[toolType];
}

// Check if a command is whitelisted
export function isCommandWhitelisted(command: string, settings?: ToolSettings): boolean {
  if (!settings || !settings.whitelisted_commands || settings.whitelisted_commands.length === 0) return false;
  
  // Check if the command starts with any whitelisted command
  return settings.whitelisted_commands.some(whitelisted =>
    command.trim().startsWith(whitelisted.trim())
  );
}

// Check if a command is blacklisted
export function isCommandBlacklisted(command: string, settings?: ToolSettings): boolean {
  if (!settings || !settings.blacklisted_commands || settings.blacklisted_commands.length === 0) return false;
  
  // Check if the command starts with any blacklisted command
  return settings.blacklisted_commands.some(blacklisted =>
    command.trim().startsWith(blacklisted.trim())
  );
}

// Execute a tool with the given parameters
export async function executeTool(
  toolUse: ToolUse,
  onProgress?: (status: ToolProgressStatus) => void,
  mode?: 'walkthrough' | 'action',
  settings?: ToolSettings
): Promise<ToolResponse> {
  const tool = tools[toolUse.name];
  if (!tool) {
    return {
      success: false,
      error: `Unknown tool: ${toolUse.name}`,
    };
  }

  // Check if the tool is enabled for this mode
  if (mode && settings && !isToolEnabled(toolUse.name, mode, settings)) {
    return {
      success: false,
      error: `Tool '${toolUse.name}' is not enabled for ${mode} mode.`,
    };
  }

  // Special handling for command tool
  if (toolUse.name === 'command' && toolUse.params.command && typeof toolUse.params.command === 'string') {
    const command = toolUse.params.command;
    
    // Check blacklist first (blacklist overrides whitelist)
    if (settings && isCommandBlacklisted(command, settings)) {
      return {
        success: false,
        error: `Command '${command}' is blacklisted and cannot be executed.`,
      };
    }
  }

  try {
    return await tool.execute(toolUse.params, onProgress);
  } catch (error) {
    console.error(`Error executing tool ${toolUse.name}:`, error);
    return {
      success: false,
      error: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}