/**
 * Browser-compatible version of shell detection.
 * @returns A default shell string for browser environments or null.
 */
export function getShell(): string | null {
  // In browser environments, return a placeholder value
  return '/bin/browser-shell';
}

/**
 * Checks if the code is running in a browser environment.
 * @returns true if in browser, false otherwise
 */
export function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined';
}