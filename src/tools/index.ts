// ─── Gravity Claw — Tool Registry ───────────────────────────────
// Central registry for all tools. Dynamically includes MCP tools.

import type { ChatCompletionTool } from "openai/resources/chat/completions.js";
import * as getCurrentTime from "./get_current_time.js";
import * as memoryTools from "./memory.js";
import * as shell from "./shell.js";
import * as fileTools from "./files.js";
import * as webSearch from "./web_search.js";
import * as imageGen from "./image_gen.js";
import * as switchModel from "./switch_model.js";
import { taskToolDefinitions, taskToolHandlers } from "./tasks.js";
import { getMCPToolDefinitions, executeMCPTool } from "../mcp/bridge.js";

// Connection Manager Tools
import * as googleTools from "./google.js";
import * as metaTools from "./meta.js";
import * as ionosTools from "./ionos.js";

// ── Static tool definitions ─────────────────────────────────────

const staticDefinitions: ChatCompletionTool[] = [
    getCurrentTime.definition,
    ...memoryTools.definitions,
    shell.definition,
    ...fileTools.definitions,
    webSearch.definition,
    imageGen.definition,
    switchModel.definition,
    ...taskToolDefinitions,
    ...googleTools.definitions,
    ...metaTools.definitions,
    ...ionosTools.definitions,
];

/**
 * Get all tool definitions including MCP tools.
 */
export function getToolDefinitions(): ChatCompletionTool[] {
    return [...staticDefinitions, ...getMCPToolDefinitions()];
}

// Keep backward compat export
export const toolDefinitions = staticDefinitions;

// ── Tool executor ───────────────────────────────────────────────

type ToolHandler = (input: Record<string, unknown>, userId?: string) => string | Promise<string>;

const handlers: Record<string, ToolHandler> = {
    get_current_time: (input) => getCurrentTime.execute(input as { timezone?: string }),
    ...memoryTools.handlers,
    shell_exec: (input, userId) => shell.execute(input as { command: string; cwd?: string; timeout?: number }, userId),
    ...fileTools.handlers,
    web_search: (input) => webSearch.execute(input as { query: string; maxResults?: number }),
    image_generate: (input) => imageGen.execute(input as { prompt: string; size?: string }),
    switch_model: (input) => switchModel.execute(input as { modelName: string }),
    ...taskToolHandlers,
    google_calendar_list_events: (input, userId) => googleTools.executeCalendarListEvents(input as { maxResults?: number }, userId),
    google_calendar_create_event: (input, userId) => googleTools.executeCalendarCreateEvent(input as any, userId),
    google_gmail_search: (input, userId) => googleTools.executeGmailSearch(input as any, userId),
    google_gmail_read: (input, userId) => googleTools.executeGmailRead(input as any, userId),
    google_drive_search: (input, userId) => googleTools.executeDriveSearch(input as any, userId),
    meta_get_page_profile: () => metaTools.executeGetPageProfile(),
    ionos_get_datacenters: () => ionosTools.executeGetDatacenters(),
};

export async function executeTool(
    name: string,
    input: Record<string, unknown>,
    userId?: string
): Promise<string> {
    // Check static handlers first
    const handler = handlers[name];
    if (handler) {
        try {
            return await handler(input, userId);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return JSON.stringify({ error: `Tool "${name}" failed: ${message}` });
        }
    }

    // Check MCP tools
    if (name.startsWith("mcp_")) {
        return executeMCPTool(name, input);
    }

    return JSON.stringify({ error: `Unknown tool: ${name}` });
}
