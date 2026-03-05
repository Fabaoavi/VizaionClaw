// ─── Gravity Claw — /model Command ──────────────────────────────

import type { CommandContext } from "./index.js";
import { generateModelKeyboard } from "./index.js";

export async function handleModel(ctx: CommandContext): Promise<void> {
    if (!ctx.args) {
        const current = ctx.getModel();
        await ctx.reply(
            `🤖 *Current Model*\n\`${current}\`\n\n` +
            `Select a new model from the live OpenRouter directory, or type \`/model <id>\` directly:`,
            {
                parse_mode: "Markdown",
                reply_markup: generateModelKeyboard(0)
            }
        );
        return;
    }

    const newModel = ctx.args.trim();
    const oldModel = ctx.getModel();
    ctx.setModel(newModel);

    await ctx.reply(
        `🔄 *Model switched*\n` +
        `From: \`${oldModel}\`\n` +
        `To: \`${newModel}\`\n\n` +
        `Next message will use the new model.`
    );
}
