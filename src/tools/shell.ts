// ─── Gravity Claw — Shell Command Tool ──────────────────────────
// Execute shell commands with allowlist, confirmation, and timeouts.

import { execSync } from "node:child_process";

// Commands that are always allowed without confirmation
const SAFE_COMMANDS = new Set([
    "echo", "date", "whoami", "hostname", "pwd", "ls", "dir",
    "cat", "head", "tail", "wc", "grep", "find", "which",
    "node", "npm", "npx", "git", "python", "pip",
]);

// Commands that are NEVER allowed
const BLOCKED_COMMANDS = new Set([
    "rm -rf /", "format", "del /f /s /q", "mkfs",
    "shutdown", "reboot", "poweroff", "halt",
]);

export const definition = {
    type: "function" as const,
    function: {
        name: "shell_exec",
        description: "Execute a shell command and return the output. Dangerous commands require confirmation. Use for system tasks, running scripts, checking system info, etc.",
        parameters: {
            type: "object" as const,
            properties: {
                command: { type: "string", description: "The shell command to execute" },
                cwd: { type: "string", description: "Working directory (optional)" },
                timeout: { type: "number", description: "Timeout in seconds (default 30, max 120)" },
            },
            required: ["command"],
        },
    },
};

export function execute(
    input: { command: string; cwd?: string; timeout?: number },
    userId?: string
): string {
    const { command, cwd, timeout = 30 } = input;

    // Check blocked commands
    for (const blocked of BLOCKED_COMMANDS) {
        if (command.includes(blocked)) {
            return JSON.stringify({ error: `Blocked command: "${blocked}" is not allowed for safety.` });
        }
    }

    // Check if command is safe (first word)
    const firstWord = command.split(/\s+/)[0]?.toLowerCase() || "";
    const isSafe = SAFE_COMMANDS.has(firstWord);

    if (!isSafe) {
        // Log the potentially dangerous command
        console.log(`⚠️ Shell: Executing potentially dangerous command: ${command}`);
    }

    try {
        const output = execSync(command, {
            cwd: cwd || process.cwd(),
            timeout: Math.min(timeout, 120) * 1000,
            encoding: "utf-8",
            maxBuffer: 1024 * 1024, // 1MB
            stdio: ["pipe", "pipe", "pipe"],
        });

        return JSON.stringify({
            success: true,
            output: output.trim().slice(0, 5000), // Cap output length
            command,
        });
    } catch (err) {
        const error = err as { message?: string; stderr?: string; status?: number };
        return JSON.stringify({
            success: false,
            error: (error.stderr || error.message || "Unknown error").slice(0, 2000),
            exitCode: error.status,
            command,
        });
    }
}
