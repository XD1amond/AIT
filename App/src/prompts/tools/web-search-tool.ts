import { Tool, WebSearchToolParams, ToolResponse, ToolProgressStatus } from './types';

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

// Web search tool implementation
export const webSearchTool: Tool = {
  getDescription(): string {
    return `
## web_search
Description: Search the web using Brave Search API
Parameters:
- query: (required) The search query
- limit: (optional) Maximum number of results to return (default: 5)

Example:
\`\`\`
{
  "query": "latest AI developments",
  "limit": 3
}
\`\`\`
`;
  },

  async execute(
    params: WebSearchToolParams,
    onProgress?: (status: ToolProgressStatus) => void
  ): Promise<ToolResponse> {
    if (!this.validateParams(params)) {
      return {
        success: false,
        error: 'Invalid parameters. Query is required.',
      };
    }

    // Update progress status
    onProgress?.({
      status: 'running',
      message: `Searching for: ${params.query}`,
    });

    try {
      // Dynamically import Tauri API
      const { invoke, isTauri } = await getTauriApi();
      
      // Check if Tauri API is available
      if (!invoke || !isTauri || !(await isTauri())) {
        return {
          success: false,
          error: 'Web search is only available in the desktop app.',
        };
      }

      // Get API key from settings
      const settings = await invoke<any>('get_settings');
      const apiKey = settings.brave_search_api_key;

      if (!apiKey) {
        return {
          success: false,
          error: 'Brave Search API key is not set. Please add it in Settings.',
        };
      }

      // Execute the search using Tauri
      const searchResults = await invoke<any>('web_search', {
        query: params.query,
        limit: params.limit || 5,
        apiKey,
      });

      // Update progress status
      onProgress?.({
        status: 'completed',
        message: 'Search completed successfully',
        progress: 100,
      });

      // Format the results
      const formattedResults = this.formatSearchResults(searchResults);

      return {
        success: true,
        result: formattedResults,
        details: searchResults,
      };
    } catch (error) {
      // Update progress status
      onProgress?.({
        status: 'error',
        message: `Error performing web search: ${error instanceof Error ? error.message : String(error)}`,
      });

      return {
        success: false,
        error: `Error performing web search: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },

  validateParams(params: any): params is WebSearchToolParams {
    return params && typeof params.query === 'string' && params.query.trim() !== '';
  },

  formatSearchResults(results: any): string {
    if (!results || !results.web || !results.web.results) {
      return 'No results found.';
    }

    const webResults = results.web.results;
    let formattedText = `# Search Results\n\n`;

    webResults.forEach((result: any, index: number) => {
      formattedText += `## ${index + 1}. ${result.title}\n`;
      formattedText += `URL: ${result.url}\n\n`;
      formattedText += `${result.description}\n\n`;
    });

    return formattedText;
  },
};