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

// Execute a tool with the given parameters
export async function executeTool(
  toolUse: ToolUse,
  onProgress?: (status: ToolProgressStatus) => void
): Promise<ToolResponse> {
  const tool = tools[toolUse.name];
  if (!tool) {
    return {
      success: false,
      error: `Unknown tool: ${toolUse.name}`,
    };
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