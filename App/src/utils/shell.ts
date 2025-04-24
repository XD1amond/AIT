import defaultShell from 'default-shell';

/**
 * Attempts to detect the default shell.
 * Uses the 'default-shell' package.
 * @returns The detected shell path or name, or null if detection fails.
 */
export function getShell(): string | null {
  try {
    // default-shell might return undefined or empty string in some cases
    const shell = defaultShell;
    return shell || null; // Return null if defaultShell is falsy
  } catch (error) {
    console.error("Error detecting default shell:", error);
    return null; // Return null on error
  }
}