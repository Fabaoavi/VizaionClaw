// ─── Gravity Claw — /status Command ─────────────────────────────

import type { CommandContext } from "./index.js";
import { getUptime } from "../usage.js";
import { getUsageStats } from "../usage.js";

export async function handleStatus(ctx: CommandContext): Promise<void> {
    const stats = getUsageStats();
    const uptime = getUptime();

    const lines = [
        "🦞 *Gravity Claw Status*",
        "",
        `⏱ Uptime: ${uptime}`,
        `🤖 Model: \`${ctx.getModel()}\``,
        `📊 Calls this session: ${stats.totalCalls}`,
        `🪙 Tokens used: ${stats.totalTokens.toLocaleString()}`,
        `💰 Est. cost: $${stats.totalCost.toFixed(4)}`,
        `⚡ Avg latency: ${stats.avgLatencyMs}ms`,
        "",
        `🔒 Security: Whitelist active (${ctx.config.allowedUserIds.length} user${ctx.config.allowedUserIds.length !== 1 ? "s" : ""})`,
        `🔄 Max iterations: ${ctx.config.maxAgentIterations}`,
    ];

    await ctx.reply(lines.join("\n"));
}
