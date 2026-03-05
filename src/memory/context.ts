// ─── Gravity Claw — Context Pruning ─────────────────────────────
// Auto-summarizes older messages when approaching token limits.

import { callLLM } from "../llm.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";

const MAX_CONTEXT_TOKENS = 8000; // Conservative limit
const SUMMARIZE_THRESHOLD = 6000;

/**
 * Prune conversation messages to stay within token limits.
 * Uses a rough 4-chars-per-token estimate.
 */
export async function pruneContext(
    messages: ChatCompletionMessageParam[]
): Promise<ChatCompletionMessageParam[]> {
    const estimatedTokens = estimateTokens(messages);

    if (estimatedTokens < SUMMARIZE_THRESHOLD) {
        return messages;
    }

    console.log(`📦 Context pruning: ~${estimatedTokens} tokens → summarizing older messages`);

    // Keep the most recent messages, summarize the rest
    const keepCount = Math.min(6, Math.ceil(messages.length / 3));
    const oldMessages = messages.slice(0, -keepCount);
    const recentMessages = messages.slice(-keepCount);

    // Build summary of old messages
    const oldText = oldMessages
        .map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : "[complex]"}`)
        .join("\n");

    const summaryResponse = await callLLM(
        [{ role: "user", content: `Summarize this conversation so far in 2-3 concise bullet points. Focus on key facts, decisions, and context:\n\n${oldText}` }],
        undefined,
        "You are a conversation summarizer. Be extremely concise."
    );

    const summary = summaryResponse.content || "Previous conversation context.";

    return [
        { role: "system", content: `[Previous conversation summary]\n${summary}` },
        ...recentMessages,
    ];
}

function estimateTokens(messages: ChatCompletionMessageParam[]): number {
    let chars = 0;
    for (const msg of messages) {
        if (typeof msg.content === "string") {
            chars += msg.content.length;
        }
    }
    return Math.ceil(chars / 4); // Rough estimate
}

export { MAX_CONTEXT_TOKENS, SUMMARIZE_THRESHOLD };
