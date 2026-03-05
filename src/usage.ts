// ─── Gravity Claw — Usage Tracker ───────────────────────────────
// Logs model, tokens, cost, latency per LLM call.

export interface UsageEntry {
    timestamp: number;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
    estimatedCost: number; // USD
}

// In-memory log (persisted to SQLite in Phase 3)
const usageLog: UsageEntry[] = [];
const startTime = Date.now();

// Rough cost per 1M tokens (input/output avg) by provider prefix
const COST_PER_MILLION: Record<string, number> = {
    "anthropic/claude-sonnet": 9,
    "anthropic/claude-haiku": 1,
    "anthropic/claude-opus": 45,
    "openai/gpt-4o": 7.5,
    "openai/gpt-4o-mini": 0.6,
    "google/gemini-2": 2.5,
    "google/gemini-pro": 3.5,
    "deepseek/deepseek": 1.0,
    "meta-llama/": 0.6,
    "default": 5,
};

export function estimateCost(model: string, totalTokens: number): number {
    const key = Object.keys(COST_PER_MILLION).find((k) => model.startsWith(k));
    const rate = key ? COST_PER_MILLION[key]! : COST_PER_MILLION["default"]!;
    return (totalTokens / 1_000_000) * rate;
}

export function trackUsage(
    model: string,
    promptTokens: number,
    completionTokens: number,
    latencyMs: number
): void {
    const total = promptTokens + completionTokens;
    usageLog.push({
        timestamp: Date.now(),
        model,
        promptTokens,
        completionTokens,
        totalTokens: total,
        latencyMs,
        estimatedCost: estimateCost(model, total),
    });
}

export function getUsageStats(): {
    totalCalls: number;
    totalTokens: number;
    totalCost: number;
    avgLatencyMs: number;
    uptimeMs: number;
    byModel: Record<string, { calls: number; tokens: number; cost: number }>;
    recentCalls: UsageEntry[];
} {
    const totalCalls = usageLog.length;
    const totalTokens = usageLog.reduce((sum, e) => sum + e.totalTokens, 0);
    const totalCost = usageLog.reduce((sum, e) => sum + e.estimatedCost, 0);
    const avgLatencyMs =
        totalCalls > 0
            ? Math.round(usageLog.reduce((sum, e) => sum + e.latencyMs, 0) / totalCalls)
            : 0;

    const byModel: Record<string, { calls: number; tokens: number; cost: number }> = {};
    for (const entry of usageLog) {
        if (!byModel[entry.model]) {
            byModel[entry.model] = { calls: 0, tokens: 0, cost: 0 };
        }
        byModel[entry.model]!.calls++;
        byModel[entry.model]!.tokens += entry.totalTokens;
        byModel[entry.model]!.cost += entry.estimatedCost;
    }

    return {
        totalCalls,
        totalTokens,
        totalCost,
        avgLatencyMs,
        uptimeMs: Date.now() - startTime,
        byModel,
        recentCalls: usageLog.slice(-5),
    };
}

export function getUptime(): string {
    const ms = Date.now() - startTime;
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / 60000) % 60;
    const hours = Math.floor(ms / 3600000) % 24;
    const days = Math.floor(ms / 86400000);
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
    return parts.join(" ");
}
