import { tools } from '../tools';

// Get the shared tool use instructions (formatting, etc.)
export function getSharedToolUseSection(): string {
	return `====

TOOL USE

You have access to a set of tools that are executed upon the user's approval. You can use one tool per message, and will receive the result of that tool use in the user's response. You use tools step-by-step to accomplish a given task, with each tool use informed by the result of the previous tool use.

# Tool Use Formatting

Tool use is formatted using XML-style tags. The tool name is enclosed in opening and closing tags, and each parameter is similarly enclosed within its own set of tags. Here's the structure:

<tool_name>
<parameter1_name>value1</parameter1_name>
<parameter2_name>value2</parameter2_name>
...
</tool_name>

For example:

<read_file>
<path>src/main.js</path>
</read_file>

Always adhere to this format for the tool use to ensure proper parsing and execution.`
}

// Get tool-specific prompts based on enabled tools
export function getToolPrompts(enabledTools: string[]): string {
  if (!enabledTools || enabledTools.length === 0) {
    return '';
  }

  let toolPromptsText = 'You have access to the following tools:\n\n';
  
  // Add each enabled tool's prompt
  enabledTools.forEach(toolName => {
    if (tools[toolName]) {
      toolPromptsText += tools[toolName].getDescription() + '\n';
    }
  });
  
  toolPromptsText += '\nWhen you need to use a tool, format your response using the XML-style tags shown in the examples above.\n';
  toolPromptsText += 'Wait for the result of the tool execution before proceeding with further actions.\n';
  
  return toolPromptsText;
}