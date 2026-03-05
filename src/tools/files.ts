// ─── Gravity Claw — File Operations Tool ────────────────────────
// Read, write, create, delete, list, search files with path allowlisting.

import fs from "node:fs";
import path from "node:path";

import { isPathAllowedForUser, getSecurityConfig } from "../security/index.js";

function getPermissionError(filePath: string, userId: string, mode: 'read' | 'write'): string | null {
    if (!userId) return "Access denied: No user context provided.";
    const check = isPathAllowedForUser(filePath, userId, mode);
    if (!check.allowed) {
        let errorMsg = check.reason || "Access denied.";
        try {
            const config = getSecurityConfig();
            const rules = config.userPathRules[userId] || [];
            const allowedPaths = rules
                .filter(r => r.mode === 'read' || r.mode === 'write')
                .map(r => r.path);

            if (allowedPaths.length > 0) {
                errorMsg += `\nPaths you CURRENTLY have access to:\n- ${allowedPaths.join('\n- ')}`;
            } else {
                errorMsg += `\nYou CURRENTLY do not have access to ANY host paths. The admin must whitelist a path for you first.`;
            }
        } catch { /* Ignore if config fails */ }

        return errorMsg;
    }
    return null;
}

export const definitions = [
    {
        type: "function" as const,
        function: {
            name: "file_read",
            description: "Read the contents of a file. Returns text content.",
            parameters: {
                type: "object" as const,
                properties: {
                    path: { type: "string", description: "File path to read" },
                    maxLines: { type: "number", description: "Max lines to return (default: 200)" },
                },
                required: ["path"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "file_write",
            description: "Write content to a file. Creates the file if it doesn't exist.",
            parameters: {
                type: "object" as const,
                properties: {
                    path: { type: "string", description: "File path to write" },
                    content: { type: "string", description: "Content to write" },
                    append: { type: "boolean", description: "Append instead of overwrite (default: false)" },
                },
                required: ["path", "content"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "file_list",
            description: "List files and directories in a path.",
            parameters: {
                type: "object" as const,
                properties: {
                    path: { type: "string", description: "Directory path to list" },
                    recursive: { type: "boolean", description: "List recursively (default: false)" },
                },
                required: ["path"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "file_delete",
            description: "Delete a file.",
            parameters: {
                type: "object" as const,
                properties: {
                    path: { type: "string", description: "File path to delete" },
                },
                required: ["path"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "file_search",
            description: "Search for files matching a pattern in a directory.",
            parameters: {
                type: "object" as const,
                properties: {
                    directory: { type: "string", description: "Directory to search in" },
                    pattern: { type: "string", description: "Search pattern (glob or substring)" },
                    content: { type: "string", description: "Search file contents for this string (optional)" },
                },
                required: ["directory", "pattern"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "file_send_to_chat",
            description: "Send a file from the host system directly to the user's chat. Use this when the user explicitly asks to download or send a file.",
            parameters: {
                type: "object" as const,
                properties: {
                    path: { type: "string", description: "Absolute file path to send" },
                },
                required: ["path"],
            },
        },
    },
];

export const handlers: Record<string, (input: Record<string, unknown>, userId?: string) => string> = {
    file_read: (input, userId) => {
        const filePath = input["path"] as string;
        const denied = getPermissionError(filePath, userId!, "read");
        if (denied) return JSON.stringify({ error: denied });

        try {
            const content = fs.readFileSync(filePath, "utf-8");
            const lines = content.split("\n");
            const maxLines = (input["maxLines"] as number) || 200;
            const truncated = lines.length > maxLines;
            return JSON.stringify({
                content: lines.slice(0, maxLines).join("\n"),
                lines: lines.length,
                truncated,
            });
        } catch (err) {
            return JSON.stringify({ error: `Cannot read: ${err instanceof Error ? err.message : err}` });
        }
    },

    file_write: (input, userId) => {
        const filePath = input["path"] as string;
        const denied = getPermissionError(filePath, userId!, "write");
        if (denied) return JSON.stringify({ error: denied });

        try {
            const dir = path.dirname(filePath);
            fs.mkdirSync(dir, { recursive: true });

            if (input["append"]) {
                fs.appendFileSync(filePath, input["content"] as string, "utf-8");
            } else {
                fs.writeFileSync(filePath, input["content"] as string, "utf-8");
            }
            return JSON.stringify({ success: true, path: filePath });
        } catch (err) {
            return JSON.stringify({ error: `Cannot write: ${err instanceof Error ? err.message : err}` });
        }
    },

    file_list: (input, userId) => {
        const dirPath = input["path"] as string;
        const denied = getPermissionError(dirPath, userId!, "read");
        if (denied) return JSON.stringify({ error: denied });

        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            const items = entries.map((e) => ({
                name: e.name,
                type: e.isDirectory() ? "directory" : "file",
                size: e.isFile() ? fs.statSync(path.join(dirPath, e.name)).size : undefined,
            }));
            return JSON.stringify({ items, count: items.length });
        } catch (err) {
            return JSON.stringify({ error: `Cannot list: ${err instanceof Error ? err.message : err}` });
        }
    },

    file_delete: (input, userId) => {
        const filePath = input["path"] as string;
        const denied = getPermissionError(filePath, userId!, "write");
        if (denied) return JSON.stringify({ error: denied });

        try {
            fs.unlinkSync(filePath);
            return JSON.stringify({ success: true });
        } catch (err) {
            return JSON.stringify({ error: `Cannot delete: ${err instanceof Error ? err.message : err}` });
        }
    },

    file_search: (input, userId) => {
        const denied = getPermissionError(input["directory"] as string, userId!, "read");
        if (denied) return JSON.stringify({ error: denied });

        const dir = path.resolve(input["directory"] as string);
        const pattern = input["pattern"] as string;
        const content = input["content"] as string | undefined;

        if (!fs.existsSync(dir)) return JSON.stringify({ error: "Directory not found" });

        const results: string[] = [];
        // simple recursive search
        function searchDir(currentPath: string) {
            if (results.length > 50) return; // limit
            const entries = fs.readdirSync(currentPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);
                if (entry.isDirectory()) {
                    searchDir(fullPath);
                } else if (entry.isFile()) {
                    if (entry.name.includes(pattern)) {
                        if (content) {
                            try {
                                const text = fs.readFileSync(fullPath, "utf-8");
                                if (text.includes(content)) results.push(fullPath);
                            } catch { /* ignore read errors */ }
                        } else {
                            results.push(fullPath);
                        }
                    }
                }
            }
        }
        searchDir(dir);
        return JSON.stringify({ results: results.slice(0, 50) });
    },
    file_send_to_chat: (input, userId) => {
        const filePath = input["path"] as string;
        const denied = getPermissionError(filePath, userId!, "read");
        if (denied) return JSON.stringify({ error: denied });

        const resolved = path.resolve(filePath);
        if (!fs.existsSync(resolved)) return JSON.stringify({ error: "File not found" });
        if (fs.statSync(resolved).isDirectory()) return JSON.stringify({ error: "Cannot send a directory. Please zip it or send individual files." });

        return JSON.stringify({ __ACTION__: "SEND_FILE", path: resolved });
    },
};
