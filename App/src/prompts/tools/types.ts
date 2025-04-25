// Tool types and interfaces

// Available tool types
export type ToolType = 'command' | 'web_search';

// Tool parameter types
export interface CommandToolParams {
  command: string;
  cwd?: string;
}

export interface WebSearchToolParams {
  query: string;
  limit?: number;
}

// Union type for all tool parameters
export type ToolParams = CommandToolParams | WebSearchToolParams;

// Tool use representation
export interface ToolUse {
  name: ToolType;
  params: any; // Will be typed based on the specific tool
}

// Tool response status
export interface ToolProgressStatus {
  status: 'pending' | 'running' | 'completed' | 'error';
  message?: string;
  progress?: number; // 0-100
}

// Tool response
export interface ToolResponse {
  success: boolean;
  result?: string;
  error?: string;
  details?: any;
}

// Base tool interface
export interface Tool {
  getDescription(): string;
  execute(params: any, onProgress?: (status: ToolProgressStatus) => void): Promise<ToolResponse>;
  validateParams(params: any): boolean;
  [key: string]: any; // Allow additional methods
}

// Tool approval status
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

// Tool approval request
export interface ToolApprovalRequest {
  toolUse: ToolUse;
  status: ApprovalStatus;
  timestamp: number;
}