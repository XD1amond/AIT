// AI Provider and Model Schema Definitions

/**
 * Represents an AI model's capabilities and pricing information
 */
export interface ModelInfo {
  maxTokens?: number;
  contextWindow: number;
  supportsImages: boolean;
  supportsComputerUse?: boolean;
  supportsPromptCache?: boolean;
  isPromptCacheOptional?: boolean;
  inputPrice: number;
  outputPrice: number;
  cacheWritesPrice?: number;
  cacheReadsPrice?: number;
  minTokensPerCachePoint?: number;
  maxCachePoints?: number;
  cachableFields?: string[];
  description?: string;
  thinking?: boolean;
  maxThinkingTokens?: number;
  reasoningEffort?: "low" | "medium" | "high";
  tiers?: {
    contextWindow: number;
    inputPrice: number;
    outputPrice: number;
    cacheReadsPrice?: number;
  }[];
  family?: string;
  version?: string;
  name?: string;
  supportsToolCalling?: boolean;
  maxInputTokens?: number;
}

/**
 * Available AI provider names
 */
export type ProviderName = 
  | 'openai' 
  | 'claude' 
  | 'openrouter'
  | 'bedrock'
  | 'glama'
  | 'requesty'
  | 'vertex'
  | 'gemini'
  | 'deepseek'
  | 'azure'
  | 'mistral'
  | 'unbound'
  | 'xai'
  | 'vscode';

/**
 * Provider settings configuration
 */
export interface ProviderSettings {
  id: string;
  apiProvider: ProviderName;
  apiKey?: string;
  apiEndpoint?: string;
  apiVersion?: string;
  apiRegion?: string;
  apiModel?: string;
  apiOrganization?: string;
  apiProjectId?: string;
}