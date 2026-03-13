// ─── Gravity Claw — Agentic Loop ────────────────────────────────
// ReAct pattern with memory, context pruning, skills, and dynamic tools.

import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import { callLLM } from "./llm.js";
import { getToolDefinitions, executeTool } from "./tools/index.js";
import type { Config } from "./config.js";
import { loadRelevantMemories, storeConversation, getConversationHistory, clearConversation, extractAndStore } from "./memory/index.js";
import { pruneContext } from "./memory/context.js";
import { getSkillsContext, findSkillByTrigger } from "./skills/loader.js";

const SYSTEM_PROMPT = `You are Gravity Claw 🦞 — a powerful personal AI assistant running on Telegram.

Your personality:
- Helpful, concise, and direct
- Use tools proactively when they'd help
- Keep responses conversational and Telegram-friendly
- Use emoji sparingly but naturally

You are running locally on your owner's machine. You value security and privacy.

Available tools:
- get_current_time — check the time in any timezone
- memory_store/search/list/delete — persistent memory (remember facts, preferences, etc.)
- knowledge_graph_add/query — connect entities and concepts
- note_save/read/list — save and read markdown notes
- shell_exec — run shell commands (with safety limits)
- file_read/write/list/delete/search — file operations
- web_search — search the web
- switch_model — change to a stronger/faster/cheaper LLM mid-conversation
- task_create/list/update/delete/link — manage tasks and your visual node topology
- project_create/list — logically group tasks into projects
- google_calendar_list/create — access and manage your Google Calendar events
- google_gmail_search/read — check and summarize your Gmail messages
- google_drive_search — search your Google Drive documents
- meta_get_page_profile — check your connected Meta page status
- ionos_get_datacenters — view your cloud infrastructure on IONOS
- reminder_set/list — schedule proactive notifications

Always use memory_store to remember important things the user tells you.
Always search your memory before answering questions about the user.

CRITICAL INSTRUCTIONS FOR TOOLS:
- When executing tools that require IDs (like reading an email or file), you MUST first use a search tool to get the IDs. 
- NEVER attempt to search and read in the exact same step, as you will hallucinate the ID.
- Do NOT output raw JSON blocks. Use the native tool call API.
- For task_list, you will receive a field 'related_to' which tells you the topology of the user's projects. Use task_link to connect related tasks.`;

const sessions = new Map<number, string>();

function getSessionId(userId: number): string {
    if (!sessions.has(userId)) {
        sessions.set(userId, `session_${userId}_${Date.now()}`);
    }
    return sessions.get(userId)!;
}

export function newSession(userId: number): void {
    const oldSession = sessions.get(userId);
    if (oldSession) clearConversation(oldSession);
    sessions.set(userId, `session_${userId}_${Date.now()}`);
}

export async function runAgentLoop(
    userMessage: string,
    config: Config,
    userId = 0,
    canonicalUserId?: string
): Promise<{ reply: string; modelUsed: string; totalTokens: number; pendingAction?: any }> {
    const memoryUserId = canonicalUserId || String(userId); // Canonical ID for memory isolation
    const sessionId = getSessionId(userId);
    storeConversation(sessionId, "user", userMessage);

    const history = getConversationHistory(sessionId, 30);
    let messages: ChatCompletionMessageParam[] = history.map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
    }));

    messages = await pruneContext(messages);

    // Build context: memories + skills
    const memoryContext = await loadRelevantMemories(userMessage, memoryUserId, 5);
    const skillsContext = getSkillsContext();
    const matchedSkill = findSkillByTrigger(userMessage);
    const skillInstructions = matchedSkill
        ? `\n\n[Active Skill: ${matchedSkill.name}]\n${matchedSkill.instructions}`
        : "";
    const fullSystemPrompt = SYSTEM_PROMPT + memoryContext + skillsContext + skillInstructions;

    // Get all tools including MCP
    const tools = getToolDefinitions();
    // Default config values might be too restrictive (e.g., 5). Bumping ceiling to prevent rapid limit hits.
    const maxIterations = config.maxAgentIterations || 15;

    let finalModelUsed = "unknown";
    let totalTokens = 0;

    for (let i = 0; i < maxIterations; i++) {
        const response = await callLLM(messages, tools, fullSystemPrompt);

        finalModelUsed = response.modelUsed;
        if (response.usage) {
            totalTokens += response.usage.prompt + response.usage.completion;
        }

        if (response.toolCalls.length === 0) {
            let reply = response.content ?? "(no response)";

            // Intercept Groq/LLaMA JSON hallucination bug
            if (reply.includes('{"type":') && reply.includes('"function"')) {
                const lines = reply.split('\n');
                let foundHiddenToolCalls = false;

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine.startsWith('{"type":') && trimmedLine.endsWith('}')) {
                        try {
                            const parsed = JSON.parse(trimmedLine);
                            if (parsed.type === "function" && parsed.name && parsed.parameters) {
                                response.toolCalls.push({
                                    id: `call_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                                    name: parsed.name,
                                    arguments: JSON.stringify(parsed.parameters)
                                });
                                foundHiddenToolCalls = true;
                                reply = reply.replace(trimmedLine, '').trim();
                            }
                        } catch { /* ignore JSON parse failures */ }
                    }
                }

                if (foundHiddenToolCalls) {
                    response.content = reply; // Strip out the JSON strings so it looks clean in memory
                }
            }

            // If it's truly a regular message after attempting to intercept hidden tool calls
            if (response.toolCalls.length === 0) {
                // Re-inject reasoning into the reply explicitly so it logs properly
                if (response.reasoning && !reply.includes('<think>')) {
                    reply = `<think>\n${response.reasoning}\n</think>\n\n${reply}`;
                }

                storeConversation(sessionId, "assistant", reply);

                // Fire auto fact extraction asynchronously (don't block response)
                extractAndStore(userMessage, reply, memoryUserId).catch(() => { });

                return { reply, modelUsed: finalModelUsed, totalTokens };
            }
        }

        messages.push({
            role: "assistant",
            content: response.content,
            tool_calls: response.toolCalls.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: { name: tc.name, arguments: tc.arguments },
            })),
        });

        for (const toolCall of response.toolCalls) {
            let input: Record<string, unknown> = {};
            try { input = JSON.parse(toolCall.arguments); } catch { /* */ }

            console.log(`   🔧 Tool: ${toolCall.name}(${JSON.stringify(input)})`);
            const result = await executeTool(toolCall.name, input, memoryUserId);
            console.log(`   ✅ Result: ${result.slice(0, 200)}`);

            messages.push({ role: "tool", tool_call_id: toolCall.id, content: result });

            // Check if tool returned a special action for the frontend
            if (result.includes('"IMAGE_MENU"') || result.includes('"SEND_FILE"')) {
                try {
                    const parsed = JSON.parse(result);
                    if (parsed.__ACTION__ === "IMAGE_MENU") {
                        storeConversation(sessionId, "assistant", "I will show you the image model options now.");
                        return {
                            reply: "🎨 I'm ready to generate your image! Please choose a model:",
                            modelUsed: finalModelUsed,
                            totalTokens,
                            pendingAction: parsed
                        };
                    } else if (parsed.__ACTION__ === "SEND_FILE") {
                        storeConversation(sessionId, "assistant", `Sending the requested file...`);
                        return {
                            reply: `📄 Sending file to your chat...`,
                            modelUsed: finalModelUsed,
                            totalTokens,
                            pendingAction: parsed
                        };
                    }
                } catch { /* ignore JSON error */ }
            }
        }
    }

    const reply = "⚠️ I hit my thinking limit for this request. Could you try rephrasing or breaking it into smaller steps?";
    storeConversation(sessionId, "assistant", reply);
    return { reply, modelUsed: finalModelUsed, totalTokens };
}
