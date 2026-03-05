// ─── Gravity Claw — Switch Model Tool ───────────────────────────
// Allows the LLM Agent to switch its own core model dynamically mid-conversation.

import type { ChatCompletionTool } from "openai/resources/chat/completions.js";
import { setModel } from "../llm.js";

export const definition: ChatCompletionTool = {
    type: "function",
    function: {
        name: "switch_model",
        description: "Switches the active LLM to a new model. Use this if the user asks you to switch models or use a different AI, e.g., 'anthropic/claude-sonnet-4.5', 'meta-llama/llama-3.3-70b-instruct'.",
        parameters: {
            type: "object",
            properties: {
                modelName: {
                    type: "string",
                    description: "The full OpenRouter model ID of the model to switch to (e.g., 'anthropic/claude-sonnet-4.5', 'deepseek/deepseek-chat', 'openai/gpt-4o').",
                },
            },
            required: ["modelName"],
            additionalProperties: false,
        },
    },
};

export function execute(args: { modelName: string }): string {
    const { modelName } = args;

    if (!modelName || typeof modelName !== 'string') {
        return "Error: modelName is required and must be a string.";
    }

    try {
        setModel(modelName);
        return `Successfully switched the active model to: ${modelName}. The next prompt will use this new model. Please inform the user of the switch.`;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return `Failed to switch model: ${message}`;
    }
}
