// ─── Gravity Claw — LLM Client ──────────────────────────────────
// Unified LLM interface with multi-provider support and failover.

import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions.js";
import type { Config } from "./config.js";
import { initProviders, resolveProvider } from "./llm/providers.js";
import { initFailover, withFailover } from "./llm/failover.js";
import { trackUsage } from "./usage.js";

let currentModel: string;
let thinkingLevel: "off" | "low" | "medium" | "high" = "off";

export function initLLM(config: Config): void {
    initProviders(process.env as Record<string, string>);
    initFailover();
    currentModel = config.llmModel;
    thinkingLevel = (config.thinkingLevel as typeof thinkingLevel) || "off";
    console.log(`✅ LLM ready | Model: ${currentModel} | Thinking: ${thinkingLevel}`);
}

export function setModel(model: string): void {
    // If the user tries to set just "llama-...", prefix with meta-llama if they use OpenRouter primarily
    if (model.startsWith("llama-") && !model.includes("/")) {
        currentModel = `meta-llama/${model}`;
    } else {
        currentModel = model;
    }
    console.log(`🔄 Model switched to: ${currentModel}`);
}

export function getModel(): string {
    return currentModel;
}

export function setThinking(level: "off" | "low" | "medium" | "high"): void {
    thinkingLevel = level;
    console.log(`🧠 Thinking level: ${level}`);
}

export function getThinking(): string {
    return thinkingLevel;
}

export interface LLMResponse {
    role: "assistant";
    content: string | null;
    toolCalls: ToolCall[];
    modelUsed: string;
    usage?: { prompt: number; completion: number };
}

export interface ToolCall {
    id: string;
    name: string;
    arguments: string;
}

function buildThinkingPrefix(): string {
    switch (thinkingLevel) {
        case "high":
            return "\n\nIMPORTANT: Think very carefully and deeply. Break down the problem step by step. Consider edge cases and alternatives. Show your reasoning.";
        case "medium":
            return "\n\nThink through this step by step before answering.";
        case "low":
            return "\n\nBe concise but think briefly before answering.";
        default:
            return "";
    }
}

export async function callLLM(
    messages: ChatCompletionMessageParam[],
    tools?: ChatCompletionTool[],
    systemPrompt?: string
): Promise<LLMResponse & { reasoning?: string }> {
    const fullMessages: ChatCompletionMessageParam[] = [];

    const thinkingSuffix = buildThinkingPrefix();
    if (systemPrompt) {
        fullMessages.push({ role: "system", content: systemPrompt + thinkingSuffix });
    } else if (thinkingSuffix) {
        fullMessages.push({ role: "system", content: thinkingSuffix.trim() });
    }
    fullMessages.push(...messages);

    return withFailover(currentModel, async (provider, model) => {
        const startMs = Date.now();

        const response = await provider.client.chat.completions.create({
            model,
            messages: fullMessages,
            tools: tools && tools.length > 0 ? tools : undefined,
            max_tokens: 4096,
        });

        const latencyMs = Date.now() - startMs;

        const choice = response.choices[0];
        if (!choice) {
            throw new Error("LLM returned no choices");
        }

        // Track usage
        const usage = response.usage;
        if (usage) {
            trackUsage(
                response.model ?? model,
                usage.prompt_tokens ?? 0,
                usage.completion_tokens ?? 0,
                latencyMs
            );
        }

        const message = choice.message;

        const toolCalls: ToolCall[] = (message.tool_calls ?? []).map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
        }));

        let content = message.content;
        let reasoning = "";

        // OpenRouter often returns reasoning in a non-standard field for DeepSeek R1
        const anyMessage = message as any;
        if (anyMessage.reasoning) {
            reasoning = anyMessage.reasoning;
        }

        return {
            role: "assistant" as const,
            content,
            reasoning,
            toolCalls,
            modelUsed: response.model ?? model,
            usage: usage ? { prompt: usage.prompt_tokens ?? 0, completion: usage.completion_tokens ?? 0 } : undefined,
        };
    });
}
