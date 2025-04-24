import defaultShell from "default-shell"
import os from "os"
import osName from "os-name"
// Assuming these paths are correct relative to this file's final location
// If the final structure changes, these imports might need adjustment.
import { Mode, ModeConfig, getModeBySlug, defaultModeSlug } from "@/shared/modes" // Use path alias
import { getShell } from "@/utils/shell" // Use path alias
import { toPosix } from "@/utils/path" // Use path alias // Assuming a utility for path normalization

// Note: The original example had isToolAllowedForMode, but it wasn't used. Removed for clarity.
// Note: Added toPosix utility assumption for cross-platform path consistency.

export function getSystemInfoPrompt(cwd: string, currentModeSlug: string, customModes?: ModeConfig[]): string {
	const findModeBySlug = (slug: string, modes?: ModeConfig[]) => modes?.find((m) => m.slug === slug)

	// Attempt to get the user-friendly name for the current mode
	const currentModeConfig = findModeBySlug(currentModeSlug, customModes)
	const currentModeName = currentModeConfig?.name || currentModeSlug // Fallback to slug if name not found

	// Get the name for the default 'code' mode
	const codeModeConfig = findModeBySlug(defaultModeSlug, customModes)
	const codeModeName = codeModeConfig?.name || "Code" // Fallback name

	// Use the utility function for shell detection if available, otherwise fallback
	const detectedShell = getShell() || defaultShell || "unknown"
	const homeDir = os.homedir()
	const osInfo = osName() || `${os.type()} ${os.release()}` // Provide fallback OS info

	let details = `====

SYSTEM INFORMATION

Operating System: ${osInfo}
Default Shell: ${detectedShell}
Home Directory: ${toPosix(homeDir)}
Current Workspace Directory: ${toPosix(cwd)}

The Current Workspace Directory is the active VS Code project directory, and is therefore the default directory for all tool operations. New terminals will be created in the current workspace directory, however if you change directories in a terminal it will then have a different working directory; changing directories in a terminal does not modify the workspace directory, because you do not have access to change the workspace directory. When the user initially gives you a task, a recursive list of all filepaths in the current workspace directory will be included in environment_details. This provides an overview of the project's file structure, offering key insights into the project from directory/file names (how developers conceptualize and organize their code) and file extensions (the language used). This can also guide decision-making on which files to explore further. If you need to further explore directories such as outside the current workspace directory, you can use the list_files tool. If you pass 'true' for the recursive parameter, it will list files recursively. Otherwise, it will list files at the top level, which is better suited for generic directories where you don't necessarily need the nested structure, like the Desktop.`

	// Note: Removed references to specific modes like 'Code' mode name directly in the prompt text
	// as the AI's persona/mode should be set by a separate system prompt (like tech-support.ts).
	// Also removed the isToolAllowedForMode logic as it's not relevant for the system info prompt itself.

	return details
}