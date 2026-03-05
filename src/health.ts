// ─── Gravity Claw — Health Monitor ──────────────────────────────
// Tracks system health: uptime, memory usage, error rates.

const startTime = Date.now();
let totalRequests = 0;
let totalErrors = 0;
const errorLog: Array<{ time: string; error: string }> = [];

export function recordRequest(): void {
    totalRequests++;
}

export function recordError(error: string): void {
    totalErrors++;
    errorLog.push({
        time: new Date().toISOString(),
        error: error.slice(0, 200),
    });
    // Keep only last 50 errors
    if (errorLog.length > 50) errorLog.shift();
}

export function getHealthStatus(): {
    uptime: string;
    uptimeMs: number;
    totalRequests: number;
    totalErrors: number;
    errorRate: string;
    memoryUsage: { rss: string; heapUsed: string; heapTotal: string };
    recentErrors: Array<{ time: string; error: string }>;
} {
    const uptimeMs = Date.now() - startTime;
    const hours = Math.floor(uptimeMs / 3600000);
    const mins = Math.floor((uptimeMs % 3600000) / 60000);

    const mem = process.memoryUsage();

    return {
        uptime: `${hours}h ${mins}m`,
        uptimeMs,
        totalRequests,
        totalErrors,
        errorRate: totalRequests > 0 ? `${((totalErrors / totalRequests) * 100).toFixed(1)}%` : "0%",
        memoryUsage: {
            rss: `${(mem.rss / 1024 / 1024).toFixed(1)}MB`,
            heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB`,
            heapTotal: `${(mem.heapTotal / 1024 / 1024).toFixed(1)}MB`,
        },
        recentErrors: errorLog.slice(-5),
    };
}
