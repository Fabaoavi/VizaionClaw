// ─── Gravity Claw — /usage Command ──────────────────────────────

import type { CommandContext } from "./index.js";
import { getUsageStats } from "../usage.js";

export async function handleUsage(ctx: CommandContext): Promise<void> {
    const stats = getUsageStats();

    if (stats.totalCalls === 0) {
        await ctx.reply("📊 *No usage yet this session.* Send a message to get started!");
        return;
    }

    const lines = [
        "📊 *Usage Statistics*",
        "",
        `Total calls: ${stats.totalCalls}`,
        `Total tokens: ${stats.totalTokens.toLocaleString()}`,
        `Est. total cost: $${stats.totalCost.toFixed(4)}`,
        `Avg latency: ${stats.avgLatencyMs}ms`,
        "",
    ];

    // Per-model breakdown
    const modelEntries = Object.entries(stats.byModel);
    if (modelEntries.length > 0) {
        lines.push("*By Model:*");
        for (const [model, data] of modelEntries) {
            lines.push(
                `  \`${model}\` — ${data.calls} calls, ${data.tokens.toLocaleString()} tokens, $${data.cost.toFixed(4)}`
            );
        }
        lines.push("");
    }

    // Recent calls
    if (stats.recentCalls.length > 0) {
        lines.push("*Recent Calls:*");
        for (const call of stats.recentCalls) {
            const time = new Date(call.timestamp).toLocaleTimeString();
            lines.push(
                `  ${time} — ${call.totalTokens} tokens, ${call.latencyMs}ms`
            );
        }
    }

    await ctx.reply(lines.join("\n"));
}
