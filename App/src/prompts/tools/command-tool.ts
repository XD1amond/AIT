import { Tool, CommandToolParams, ToolResponse, ToolProgressStatus } from './types';

// Dynamically import Tauri API to avoid issues during build
const getTauriApi = async () => {
  if (typeof window === 'undefined') return { invoke: null, isTauri: null };
  try {
    const api = await import('@tauri-apps/api/core');
    return { invoke: api.invoke, isTauri: api.isTauri };
  } catch (e) {
    console.error('Failed to import Tauri API:', e);
    return { invoke: null, isTauri: null };
  }
};

// Command tool implementation
export const commandTool: Tool = {
  getDescription(): string {
    return `
## command
Description: Execute a command in the system's terminal
Parameters:
- command: (required) The command to execute
- cwd: (optional) The working directory to execute the command in

Example:
\`\`\`
{
  "command": "ls -la",
  "cwd": "/home/user/documents"
}
\`\`\`
`;
  },

  async execute(
    params: CommandToolParams,
    onProgress?: (status: ToolProgressStatus) => void
  ): Promise<ToolResponse> {
    if (!this.validateParams(params)) {
      return {
        success: false,
        error: 'Invalid parameters. Command is required.',
      };
    }

    // Update progress status
    onProgress?.({
      status: 'running',
      message: `Executing command: ${params.command}`,
    });

    try {
      // Dynamically import Tauri API
      const { invoke, isTauri } = await getTauriApi();
      
      // Check if Tauri API is available
      if (!invoke || !isTauri || !(await isTauri())) {
        return {
          success: false,
          error: 'Command execution is only available in the desktop app.',
        };
      }

      // Execute the command using Tauri
      const result = await invoke<string>('execute_command', {
        command: params.command,
        cwd: params.cwd || null,
      });

      // Update progress status
      onProgress?.({
        status: 'completed',
        message: 'Command executed successfully',
        progress: 100,
      });

      return {
        success: true,
        result: result as string,
      };
    } catch (error) {
      // Update progress status
      onProgress?.({
        status: 'error',
        message: `Error executing command: ${error instanceof Error ? error.message : String(error)}`,
      });

      return {
        success: false,
        error: `Error executing command: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },

  validateParams(params: any): params is CommandToolParams {
    return params && typeof params.command === 'string' && params.command.trim() !== '';
  },
};