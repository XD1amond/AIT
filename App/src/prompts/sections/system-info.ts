// Browser-compatible version of system-info.ts
// Import only browser-compatible dependencies
import { ModeConfig, defaultModeSlug } from "@/shared/modes" // Use path alias
import { toPosix } from "@/utils/path" // Use path alias for path normalization
import { isBrowserEnvironment } from "@/utils/shell" // Import from shell.ts

// Note: Removed Node.js-specific imports (os, default-shell, os-name)
// and replaced with browser-compatible alternatives

export function getSystemInfoPrompt(cwd: string, currentModeSlug: string, customModes?: ModeConfig[]): string {
	// We don't need to use mode information for the system info prompt
	// so we can safely ignore these variables
	// const findModeBySlug = (slug: string, modes?: ModeConfig[]) => modes?.find((m) => m.slug === slug)
	// const currentModeConfig = findModeBySlug(currentModeSlug, customModes)
	// const codeModeConfig = findModeBySlug(defaultModeSlug, customModes)

	// Use browser-compatible values for system info
	// These will be replaced with actual values from Tauri when running in desktop mode
	const detectedShell = "browser-environment"
	const homeDir = "/user/home"
	const osInfo = "Browser Environment"

	const details = `====

SYSTEM INFORMATION

Operating System: ${osInfo}
Default Shell: ${detectedShell}
Home Directory: ${toPosix(homeDir)}
Current Workspace Directory: ${toPosix(cwd)}

The Current Workspace Directory is the active VS Code project directory, and is therefore the default directory for all tool operations. New terminals will be created in the current workspace directory, however if you change directories in a terminal it will then have a different working directory; changing directories in a terminal does not modify the workspace directory, because you do not have access to change the workspace directory. When the user initially gives you a task, a recursive list of all filepaths in the current workspace directory will be included in environment_details. This provides an overview of the project's file structure, offering key insights into the project from directory/file names (how developers conceptualize and organize their code) and file extensions (the language used). This can also guide decision-making on which files to explore further. If you need to further explore directories such as outside the current workspace directory, you can use the list_files tool. If you pass 'true' for the recursive parameter, it will list files recursively. Otherwise, it will list files at the top level, which is better suited for generic directories where you don't necessarily need the nested structure, like the Desktop.

IMPORTANT: You must provide commands and instructions that are specific to the user's operating system.
- For Windows: Use PowerShell or CMD syntax (e.g., 'dir', 'type', 'echo', etc.)
- For macOS/Linux: Use Bash/Shell syntax (e.g., 'ls', 'cat', 'echo', etc.)
- Do NOT use curly braces {} in commands as they are not valid command names
- Always check the Operating System value above before suggesting any commands
- Format commands as plain text without any special formatting or placeholders`

	return details
}