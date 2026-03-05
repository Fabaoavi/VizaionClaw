// ─── Gravity Claw — MCP Tool Bridge ─────────────────────────────
// Connects to MCP servers via stdio, lists their tools, and exposes
// them to the LLM as callable functions.

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ChatCompletionTool } from "openai/resources/chat/completions.js";

interface MCPServerConfig {
    command: string;
    args?: string[];
    env?: Record<string, string>;
}

interface MCPConnection {
    name: string;
    process: ChildProcess;
    tools: ChatCompletionTool[];
    pending: Map<string, { resolve: (value: unknown) => void; reject: (err: Error) => void }>;
    nextId: number;
}

const connections = new Map<string, MCPConnection>();

/**
 * Load MCP server configs from a JSON file.
 * Format: { "servers": { "name": { "command": "...", "args": [...] } } }
 */
export async function loadMCPServers(configPath?: string): Promise<void> {
    const p = configPath || path.join(process.cwd(), "mcp-servers.json");

    if (!fs.existsSync(p)) {
        console.log("⏭️  MCP: No mcp-servers.json found, skipping");
        return;
    }

    try {
        const raw = fs.readFileSync(p, "utf-8");
        const config = JSON.parse(raw) as { servers: Record<string, MCPServerConfig> };

        for (const [name, serverConfig] of Object.entries(config.servers)) {
            await connectServer(name, serverConfig);
        }

        console.log(`✅ MCP: ${connections.size} server(s) connected`);
    } catch (err) {
        console.error(`❌ MCP config error: ${err instanceof Error ? err.message : err}`);
    }
}

async function connectServer(name: string, config: MCPServerConfig): Promise<void> {
    const child = spawn(config.command, config.args || [], {
        env: { ...process.env, ...config.env },
        stdio: ["pipe", "pipe", "pipe"],
    });

    const conn: MCPConnection = {
        name,
        process: child,
        tools: [],
        pending: new Map(),
        nextId: 1,
    };

    // Handle stdout (JSON-RPC responses)
    let buffer = "";
    child.stdout?.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const msg = JSON.parse(line);
                const pending = conn.pending.get(String(msg.id));
                if (pending) {
                    conn.pending.delete(String(msg.id));
                    if (msg.error) {
                        pending.reject(new Error(msg.error.message));
                    } else {
                        pending.resolve(msg.result);
                    }
                }
            } catch { /* ignore parse errors */ }
        }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
        console.warn(`MCP [${name}] stderr: ${chunk.toString().trim()}`);
    });

    child.on("exit", (code) => {
        console.log(`MCP [${name}] exited with code ${code}`);
        connections.delete(name);
    });

    connections.set(name, conn);

    // Initialize and list tools
    try {
        await sendRPC(conn, "initialize", {
            protocolVersion: "2024-11-05",
            clientInfo: { name: "gravity-claw", version: "1.0.0" },
            capabilities: {},
        });

        const toolsResult = await sendRPC(conn, "tools/list", {}) as {
            tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
        };

        if (toolsResult?.tools) {
            conn.tools = toolsResult.tools.map((t) => ({
                type: "function" as const,
                function: {
                    name: `mcp_${name}_${t.name}`,
                    description: `[MCP:${name}] ${t.description}`,
                    parameters: t.inputSchema as { type: "object"; properties: Record<string, unknown> },
                },
            }));
            console.log(`   MCP [${name}]: ${conn.tools.length} tools`);
        }
    } catch (err) {
        console.warn(`⚠️ MCP [${name}] init failed: ${err instanceof Error ? err.message : err}`);
    }
}

function sendRPC(conn: MCPConnection, method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const id = conn.nextId++;
        conn.pending.set(String(id), { resolve, reject });

        const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
        conn.process.stdin?.write(msg);

        setTimeout(() => {
            if (conn.pending.has(String(id))) {
                conn.pending.delete(String(id));
                reject(new Error(`MCP RPC timeout: ${method}`));
            }
        }, 10000);
    });
}

/**
 * Get all MCP tool definitions for the LLM.
 */
export function getMCPToolDefinitions(): ChatCompletionTool[] {
    const tools: ChatCompletionTool[] = [];
    for (const conn of connections.values()) {
        tools.push(...conn.tools);
    }
    return tools;
}

/**
 * Execute an MCP tool by its prefixed name (e.g. "mcp_serverName_toolName").
 */
export async function executeMCPTool(fullName: string, input: Record<string, unknown>): Promise<string> {
    const parts = fullName.replace("mcp_", "").split("_");
    const serverName = parts[0]!;
    const toolName = parts.slice(1).join("_");

    const conn = connections.get(serverName);
    if (!conn) {
        return JSON.stringify({ error: `MCP server '${serverName}' not connected` });
    }

    try {
        const result = await sendRPC(conn, "tools/call", { name: toolName, arguments: input });
        return JSON.stringify(result);
    } catch (err) {
        return JSON.stringify({ error: `MCP tool failed: ${err instanceof Error ? err.message : err}` });
    }
}

export function closeMCPServers(): void {
    for (const conn of connections.values()) {
        conn.process.kill();
    }
    connections.clear();
}
