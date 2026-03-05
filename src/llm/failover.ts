// ─── Gravity Claw — LLM Failover ────────────────────────────────
// Tries providers in priority order. Retries on failure/timeout/rate-limit.

import type { Provider } from "./providers.js";
import { listProviders, getProvider, resolveProvider } from "./providers.js";

export interface FailoverConfig {
    /** Ordered list of provider names to try */
    priorities: string[];
    /** Max time per attempt in ms (default 30s) */
    timeoutMs: number;
    /** Max total retries across all providers */
    maxRetries: number;
}

const DEFAULT_FAILOVER: FailoverConfig = {
    priorities: [], // Set at init
    timeoutMs: 30_000,
    maxRetries: 3,
};

let failoverConfig = { ...DEFAULT_FAILOVER };

export function initFailover(priorities?: string[]): void {
    failoverConfig.priorities = priorities || listProviders();
}

/**
 * Run an LLM call with failover. Tries the primary provider first,
 * then falls back through the priority list.
 */
export async function withFailover<T>(
    primaryModel: string,
    callFn: (provider: Provider, model: string) => Promise<T>
): Promise<T> {
    const errors: string[] = [];

    // Try the primary provider first
    try {
        const { provider, model } = resolveProvider(primaryModel);
        return await withTimeout(callFn(provider, model), failoverConfig.timeoutMs);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${primaryModel}: ${msg}`);
        console.warn(`⚠️ Primary model failed (${primaryModel}): ${msg}`);
    }

    // If primary failed and it was a specific Llama, try a robust fallback cascade on OpenRouter
    const llamaCascade = [
        "meta-llama/llama-3.3-70b-instruct",
        "meta-llama/llama-3.1-8b-instruct",
        "meta-llama/llama-3-70b-instruct"
    ];

    if (primaryModel.includes("llama")) {
        for (const fbModel of llamaCascade) {
            if (fbModel === primaryModel) continue; // Skip if we just tried it

            try {
                // Assuming openrouter is available for the cascade
                const { provider } = resolveProvider(fbModel);
                console.log(`🔄 Llama Fallback cascade to: ${fbModel}`);
                return await withTimeout(
                    callFn(provider, fbModel),
                    failoverConfig.timeoutMs
                );
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                errors.push(`Fallback ${fbModel}: ${msg}`);
                console.warn(`⚠️ Fallback ${fbModel} failed: ${msg}`);
            }
        }
    }

    // Try normal provider failovers (Anthropic, OpenAI, etc)
    for (const providerName of failoverConfig.priorities) {
        if (errors.length >= failoverConfig.maxRetries + llamaCascade.length) break;

        const provider = getProvider(providerName);
        if (!provider) continue;

        try {
            console.log(`🔄 Failing over to Provider: ${providerName} (${provider.defaultModel})`);
            return await withTimeout(
                callFn(provider, provider.defaultModel),
                failoverConfig.timeoutMs
            );
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`${providerName}: ${msg}`);
            console.warn(`⚠️ Provider Failover failed (${providerName}): ${msg}`);
        }
    }

    throw new Error(
        `All LLM providers failed after ${errors.length} attempts:\n${errors.map((e) => `  • ${e}`).join("\n")}`
    );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
        promise
            .then((val) => {
                clearTimeout(timer);
                resolve(val);
            })
            .catch((err) => {
                clearTimeout(timer);
                reject(err);
            });
    });
}
