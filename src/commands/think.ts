// ─── Gravity Claw — /think Command ──────────────────────────────

import type { CommandContext } from "./index.js";
import { setThinking, getThinking } from "../llm.js";

const LEVELS = ["off", "low", "medium", "high"] as const;
type Level = (typeof LEVELS)[number];

export async function handleThink(ctx: CommandContext): Promise<void> {
    if (!ctx.args) {
        const current = getThinking();
        const levelList = LEVELS.map((l) =>
            l === current ? `  ✅ \`${l}\` ← current` : `  • \`${l}\``
        ).join("\n");

        await ctx.reply(
            `🧠 *Thinking Level*\n\`${current}\`\n\n` +
            `*Available levels:*\n${levelList}\n\n` +
            `Switch with: \`/think <level>\`\n\n` +
            `• \`off\` — Fast, direct answers\n` +
            `• \`low\` — Brief reasoning\n` +
            `• \`medium\` — Step-by-step thinking\n` +
            `• \`high\` — Deep analysis with alternatives`
        );
        return;
    }

    const level = ctx.args.trim().toLowerCase();
    if (!LEVELS.includes(level as Level)) {
        await ctx.reply(`❌ Invalid level. Use: ${LEVELS.join(", ")}`);
        return;
    }

    setThinking(level as Level);
    await ctx.reply(`🧠 Thinking level set to: *${level}*`);
}
