/**
 * Converts Windows-style paths to POSIX-style paths (using forward slashes).
 * Handles potential mixed slashes.
 * @param path The input path string.
 * @returns The POSIX-style path string.
 */
export function toPosix(path: string): string {
  if (!path) {
    return '';
  }
  return path.replace(/\\/g, '/');
}

// Add other path-related utilities here if needed