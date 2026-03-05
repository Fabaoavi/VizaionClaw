// ─── Gravity Claw — Command Router ──────────────────────────────
// Intercepts /commands before they hit the agent loop.

import { handleStatus } from "./status.js";
import { handleModel } from "./model.js";
import { handleUsage } from "./usage.js";
import { handleThink } from "./think.js";
import type { Config } from "../config.js";
import { newSession } from "../agent.js";

// Helper for generating paginated model keyboard

// Hardcoded specific models requested by the admin
export function generateModelKeyboard(page: number) {
    const models = [
        { name: "🦙 Llama 3.3 70B", id: "meta-llama/llama-3.3-70b-instruct" },
        { name: "🐋 DeepSeek V3", id: "deepseek/deepseek-chat" },
        { name: "✨ Gemini 2.5 Pro", id: "google/gemini-2.5-pro" },
        { name: "⚡ Gemini 2.5 Flash", id: "google/gemini-2.5-flash" },
        { name: "🧠 Claude 3.7 Sonnet", id: "anthropic/claude-3.7-sonnet" },
        { name: "🎻 Claude 3 Opus", id: "anthropic/claude-3-opus" }
    ];

    const PAGE_SIZE = 5;
    const startIdx = page * PAGE_SIZE;
    const pageModels = models.slice(startIdx, startIdx + PAGE_SIZE);

    const kb = pageModels.map(m => [{
        text: m.name,
        callback_data: `model:${m.id}`
    }]);

    const navRow = [];
    if (page > 0) navRow.push({ text: "◀️ Prev", callback_data: `modelpage:${page - 1}` });
    if (startIdx + PAGE_SIZE < models.length) navRow.push({ text: "Next ▶️", callback_data: `modelpage:${page + 1}` });

    if (navRow.length > 0) kb.push(navRow);
    return { inline_keyboard: kb };
}

export interface CommandContext {
    command: string;
    args: string;
    config: Config;
    userId: number;
    reply: (text: string, options?: Record<string, unknown>) => Promise<void>;
    setModel: (model: string) => void;
    getModel: () => string;
}

type CommandHandler = (ctx: CommandContext) => Promise<void>;

const commands: Record<string, CommandHandler> = {
    status: handleStatus,
    model: handleModel,
    usage: handleUsage,
    think: handleThink,
    new: async (ctx) => {
        newSession(ctx.userId);
        await ctx.reply("🔄 *New conversation started.* Memory and context cleared.");
    },
    start: async (ctx) => {
        newSession(ctx.userId);
        await ctx.reply(
            "👋 *Welcome to Gravity Claw!*\n\nLet's start a new conversation. Which LLM provider would you like to use for the best experience?",
            {
                parse_mode: "Markdown",
                reply_markup: generateModelKeyboard(0)
            }
        );
    },
    compact: async (ctx) => {
        await ctx.reply("📦 *Context will be compacted on next message.* Older messages will be summarized.");
    },
    help: async (ctx) => {
        await ctx.reply(
            `🦞 *Gravity Claw Commands*\n\n` +
            `/status — Bot status & uptime\n` +
            `/start — Restart conversation and pick LLM\n` +
            `/model [name] — View or switch LLM model\n` +
            `/think [level] — Set reasoning depth\n` +
            `/usage — Token & cost statistics\n` +
            `/new — Start fresh conversation\n` +
            `/compact — Compress context window\n` +
            `/help — Show this help`
        );
    },
};

export function isCommand(text: string): boolean {
    return text.startsWith("/");
}

export async function handleCommand(
    text: string,
    config: Config,
    userId: number,
    reply: (text: string, options?: Record<string, unknown>) => Promise<void>,
    setModel: (model: string) => void,
    getModel: () => string
): Promise<boolean> {
    if (!text.startsWith("/")) return false;

    const [rawCmd, ...argParts] = text.slice(1).split(" ");
    const command = (rawCmd ?? "").toLowerCase().replace(/@\w+$/, "");
    const args = argParts.join(" ").trim();

    const handler = commands[command];
    if (!handler) return false;

    await handler({ command, args, config, userId, reply, setModel, getModel });
    return true;
}
