# Tool Integration for AIT

This document describes the tool integration implemented for the AIT application, which allows the AI to use tools to execute commands and perform web searches.

## Features Implemented

1. **Command Tool**: Allows the AI to execute commands in the operating system's terminal.
2. **Web Search Tool**: Allows the AI to perform web searches using the Brave Search API.
3. **Tool Approval System**: Requires user approval before executing tools (can be disabled in settings).
4. **Auto-approve Setting**: Option in settings to automatically approve tool usage without confirmation.

## Architecture

The tool integration consists of the following components:

### Frontend Components

- **Tool Types and Interfaces** (`App/src/prompts/tools/types.ts`): Defines the types and interfaces for tools.
- **Tool Parser** (`App/src/prompts/tools/tool-parser.ts`): Parses tool use from AI responses.
- **Command Tool** (`App/src/prompts/tools/command-tool.ts`): Implements the command execution tool.
- **Web Search Tool** (`App/src/prompts/tools/web-search-tool.ts`): Implements the web search tool.
- **Tool Approval Dialog** (`App/src/components/ui/tool-approval.tsx`): UI component for tool approval.

### Backend Components

- **Command Execution** (`App/src-tauri/src/commands.rs`): Rust implementation of command execution.
- **Web Search** (`App/src-tauri/src/commands.rs`): Rust implementation of web search using Brave Search API.

## How It Works

1. The AI generates a response that includes a tool use in XML format.
2. The tool parser extracts the tool use from the response.
3. The application shows a tool approval dialog to the user (unless auto-approve is enabled).
4. If approved, the tool is executed and the result is shown to the user.
5. The AI continues the conversation based on the tool result.

## Tool Format

Tools are used in the following XML format:

### Command Tool

```
<command>
<command>ls -la</command>
</command>
```

### Web Search Tool

```
<web_search>
<query>latest AI developments</query>
<limit>3</limit>
</web_search>
```

## Settings

The tool integration adds the following settings:

- **Brave Search API Key**: Required for the web search tool.
- **Auto-approve Tools**: When enabled, tools are executed without user confirmation.

## Testing

Tests for the tool integration are available in `App/src/components/__tests__/ToolIntegration.test.tsx`.

To run the tests:

```bash
npm test -- --testPathPattern=ToolIntegration.test.tsx
```

## Future Improvements

Potential future improvements include:

1. Adding more tools (e.g., file operations, image generation).
2. Implementing tool-specific permissions.
3. Adding a tool usage history.
4. Improving error handling and recovery.

## Documentation

For more information on how to add new tools to the application, see the [Adding New Tools](./docs/adding-new-tools.md) guide.