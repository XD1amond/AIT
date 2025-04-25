# Adding New Tools to AIT

This guide explains how to add new tools to the AIT application. Tools allow the AI to perform actions like executing commands or searching the web.

## Overview

The tool system consists of several components:

1. **Tool Definition**: TypeScript interface defining the tool's behavior
2. **Tool Implementation**: TypeScript class implementing the tool interface
3. **Backend Implementation**: Rust function implementing the tool's functionality
4. **Tool Registration**: Adding the tool to the tools registry
5. **System Prompt Update**: Updating the AI's system prompt to include the new tool

## Step 1: Define Tool Parameters

First, add your tool's parameter types to `App/src/prompts/tools/types.ts`:

```typescript
// Example for a hypothetical file tool
export interface FileToolParams {
  path: string;
  operation: 'read' | 'write' | 'delete';
  content?: string;
}

// Update the union type
export type ToolParams = CommandToolParams | WebSearchToolParams | FileToolParams;

// Update the ToolType
export type ToolType = 'command' | 'web_search' | 'file';
```

## Step 2: Implement the Tool

Create a new file for your tool in `App/src/prompts/tools/` (e.g., `file-tool.ts`):

```typescript
import { invoke, isTauri } from '@tauri-apps/api/core';
import { Tool, FileToolParams, ToolResponse, ToolProgressStatus } from './types';

// File tool implementation
export const fileTool: Tool = {
  getDescription(): string {
    return `
## file
Description: Perform operations on files
Parameters:
- path: (required) The path to the file
- operation: (required) The operation to perform ('read', 'write', or 'delete')
- content: (required for 'write' operation) The content to write to the file

Example:
\`\`\`
{
  "path": "/path/to/file.txt",
  "operation": "read"
}
\`\`\`
`;
  },

  async execute(
    params: FileToolParams,
    onProgress?: (status: ToolProgressStatus) => void
  ): Promise<ToolResponse> {
    if (!this.validateParams(params)) {
      return {
        success: false,
        error: 'Invalid parameters. Path and operation are required.',
      };
    }

    // Update progress status
    onProgress?.({
      status: 'running',
      message: `Performing ${params.operation} operation on file: ${params.path}`,
    });

    try {
      // Check if running in Tauri environment
      if (!(await isTauri())) {
        return {
          success: false,
          error: 'File operations are only available in the desktop app.',
        };
      }

      // Execute the file operation using Tauri
      const result = await invoke<string>('file_operation', {
        path: params.path,
        operation: params.operation,
        content: params.content || null,
      });

      // Update progress status
      onProgress?.({
        status: 'completed',
        message: 'File operation completed successfully',
        progress: 100,
      });

      return {
        success: true,
        result,
      };
    } catch (error) {
      // Update progress status
      onProgress?.({
        status: 'error',
        message: `Error performing file operation: ${error instanceof Error ? error.message : String(error)}`,
      });

      return {
        success: false,
        error: `Error performing file operation: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },

  validateParams(params: any): params is FileToolParams {
    if (!params || typeof params.path !== 'string' || params.path.trim() === '') {
      return false;
    }
    
    if (!['read', 'write', 'delete'].includes(params.operation)) {
      return false;
    }
    
    if (params.operation === 'write' && (!params.content || typeof params.content !== 'string')) {
      return false;
    }
    
    return true;
  },
};
```

## Step 3: Implement Backend Functionality

Add the Rust implementation in `App/src-tauri/src/commands.rs`:

```rust
// File operation command
#[command]
pub async fn file_operation(path: String, operation: String, content: Option<String>) -> Result<String, String> {
    let path = Path::new(&path);
    
    match operation.as_str() {
        "read" => {
            match fs::read_to_string(path) {
                Ok(content) => Ok(content),
                Err(e) => Err(format!("Failed to read file: {}", e)),
            }
        },
        "write" => {
            let content = content.ok_or_else(|| "Content is required for write operation".to_string())?;
            match fs::write(path, content) {
                Ok(_) => Ok("File written successfully".to_string()),
                Err(e) => Err(format!("Failed to write file: {}", e)),
            }
        },
        "delete" => {
            match fs::remove_file(path) {
                Ok(_) => Ok("File deleted successfully".to_string()),
                Err(e) => Err(format!("Failed to delete file: {}", e)),
            }
        },
        _ => Err(format!("Unsupported operation: {}", operation)),
    }
}
```

## Step 4: Register the Tool

Update `App/src/prompts/tools/index.ts` to include your new tool:

```typescript
import { ToolType, ToolUse, ToolResponse, ToolProgressStatus, Tool } from './types';
import { commandTool } from './command-tool';
import { webSearchTool } from './web-search-tool';
import { fileTool } from './file-tool'; // Import your new tool

// Export all tool-related types and functions
export * from './types';

// Map of all available tools
export const tools: Record<string, Tool> = {
  command: commandTool,
  web_search: webSearchTool,
  file: fileTool, // Add your new tool
};
```

## Step 5: Register the Backend Command

Update `App/src-tauri/src/lib.rs` to register the new command:

```rust
.invoke_handler(tauri::generate_handler![
    get_os_info,
    get_memory_info,
    get_settings,
    save_settings,
    get_all_chats,
    save_chat,
    delete_chat,
    get_cwd,
    commands::execute_command,
    commands::web_search,
    commands::file_operation, // Add your new command
])
```

## Step 6: Update System Prompts

Update the system prompts in both modes to include your new tool:

In `App/src/components/modes/action-mode/ActionMode.tsx`:

```typescript
const ACTION_MODE_PROMPT = `
You are an AI assistant that can help users with various tasks by using tools.
You have access to the following tools:

## command
Description: Execute a command in the system's terminal
Parameters:
- command: (required) The command to execute
- cwd: (optional) The working directory to execute the command in

Example:
<command>
<command>ls -la</command>
</command>

## web_search
Description: Search the web using Brave Search API
Parameters:
- query: (required) The search query
- limit: (optional) Maximum number of results to return (default: 5)

Example:
<web_search>
<query>latest AI developments</query>
<limit>3</limit>
</web_search>

## file
Description: Perform operations on files
Parameters:
- path: (required) The path to the file
- operation: (required) The operation to perform ('read', 'write', or 'delete')
- content: (required for 'write' operation) The content to write to the file

Example:
<file>
<path>/path/to/file.txt</path>
<operation>read</operation>
</file>

When you need to use a tool, format your response using the XML-style tags shown in the examples above.
Wait for the result of the tool execution before proceeding with further actions.
`;
```

Similarly, update the prompt in `App/src/components/modes/walkthrough-mode/WalkthroughMode.tsx`.

## Step 7: Update Tool Parser (if needed)

If your tool uses a different format than the existing tools, you may need to update the tool parser in `App/src/prompts/tools/tool-parser.ts`.

## Step 8: Write Tests

Create tests for your new tool in `App/src/components/__tests__/ToolIntegration.test.tsx`:

```typescript
it('should correctly parse a file tool use', () => {
  const text = `Let me read that file for you.

<file>
<path>/path/to/file.txt</path>
<operation>read</operation>
</file>

I'll analyze the contents for you.`;

  const result = parseToolUse(text);
  
  expect(result).not.toBeNull();
  expect(result?.name).toBe('file');
  expect(result?.params.path).toBe('/path/to/file.txt');
  expect(result?.params.operation).toBe('read');
});
```

## Step 9: Run Tests

Run the tests to make sure everything works:

```bash
npm test -- --testPathPattern=ToolIntegration.test.tsx
```

## Conclusion

By following these steps, you can add new tools to the AIT application. Remember to:

1. Define the tool's parameters
2. Implement the tool in TypeScript
3. Implement the backend functionality in Rust
4. Register the tool and backend command
5. Update the system prompts
6. Write tests for your new tool

This modular approach makes it easy to extend the application with new capabilities.