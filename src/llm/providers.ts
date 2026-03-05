// ─── Gravity Claw — LLM Provider Registry ───────────────────────
// Supports OpenRouter (default), OpenAI, Anthropic, Groq, DeepSeek,
// Google, and Ollama. All use the OpenAI-compatible chat format.

import OpenAI from "openai";

export interface ProviderConfig {
    name: string;
    baseURL: string;
    apiKey: string;
    defaultModel: string;
    headers?: Record<string, string>;
}

export interface Provider {
    name: string;
    client: OpenAI;
    defaultModel: string;
}

const providers = new Map<string, Provider>();

export function registerProvider(config: ProviderConfig): void {
    const client = new OpenAI({
        baseURL: config.baseURL,
        apiKey: config.apiKey,
        defaultHeaders: config.headers,
    });
    providers.set(config.name, {
        name: config.name,
        client,
        defaultModel: config.defaultModel,
    });
}

export function getProvider(name: string): Provider | undefined {
    return providers.get(name);
}

export function listProviders(): string[] {
    return Array.from(providers.keys());
}

/**
 * Resolve a model string to a provider + model.
 * If model contains "/" (e.g. "anthropic/claude-sonnet-4.5"), route to OpenRouter.
 * If model starts with a provider prefix (e.g. "ollama:llama3"), route directly.
 * Otherwise, use the default provider.
 */
export function resolveProvider(modelStr: string): { provider: Provider; model: string } {
    // Explicit provider prefix: "ollama:llama3.2"
    if (modelStr.includes(":")) {
        const [providerName, ...modelParts] = modelStr.split(":");
        const model = modelParts.join(":");
        const provider = providers.get(providerName!);
        if (provider) {
            return { provider, model: model || provider.defaultModel };
        }
    }

    // OpenRouter-style model with "/" (e.g. "anthropic/claude-sonnet-4.5")
    if (modelStr.includes("/")) {
        const openrouter = providers.get("openrouter");
        if (openrouter) {
            return { provider: openrouter, model: modelStr };
        }
    }

    // If it's just "llama-...", assume OpenRouter but use a fallback cascade
    if (modelStr.startsWith("llama-")) {
        const openrouter = providers.get("openrouter");
        if (openrouter) {
            return { provider: openrouter, model: `meta-llama/${modelStr}` };
        }
    }

    // Fall back to default provider (first registered)
    const defaultProvider = providers.values().next().value;
    if (!defaultProvider) {
        throw new Error("No LLM providers registered");
    }
    return { provider: defaultProvider as Provider, model: modelStr };
}

/**
 * Initialize all providers from environment variables.
 */
export function initProviders(env: Record<string, string | undefined>): void {
    // ── OpenRouter (always available if key exists) ──
    if (env["OPENROUTER_API_KEY"]) {
        registerProvider({
            name: "openrouter",
            baseURL: "https://openrouter.ai/api/v1",
            apiKey: env["OPENROUTER_API_KEY"],
            defaultModel: "anthropic/claude-sonnet-4.5",
            headers: {
                "HTTP-Referer": "https://github.com/gravity-claw",
                "X-Title": "Gravity Claw",
            },
        });
    }

    // ── OpenAI Direct ──
    if (env["OPENAI_API_KEY"]) {
        registerProvider({
            name: "openai",
            baseURL: "https://api.openai.com/v1",
            apiKey: env["OPENAI_API_KEY"],
            defaultModel: "gpt-4o",
        });
    }

    // ── Anthropic Direct ──
    if (env["ANTHROPIC_API_KEY"]) {
        registerProvider({
            name: "anthropic",
            baseURL: "https://api.anthropic.com/v1",
            apiKey: env["ANTHROPIC_API_KEY"],
            defaultModel: "claude-sonnet-4-20250514",
        });
    }

    // ── Groq ──
    if (env["GROQ_API_KEY"]) {
        registerProvider({
            name: "groq",
            baseURL: "https://api.groq.com/openai/v1",
            apiKey: env["GROQ_API_KEY"],
            defaultModel: "llama-3.3-70b-versatile",
        });
    }

    // ── DeepSeek ──
    if (env["DEEPSEEK_API_KEY"]) {
        registerProvider({
            name: "deepseek",
            baseURL: "https://api.deepseek.com/v1",
            apiKey: env["DEEPSEEK_API_KEY"],
            defaultModel: "deepseek-chat",
        });
    }

    // ── Google Gemini ──
    if (env["GOOGLE_API_KEY"]) {
        registerProvider({
            name: "google",
            baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
            apiKey: env["GOOGLE_API_KEY"],
            defaultModel: "gemini-2.0-flash",
        });
    }

    // ── Ollama (local, no API key needed) ──
    const ollamaUrl = env["OLLAMA_URL"] || "http://localhost:11434";
    registerProvider({
        name: "ollama",
        baseURL: `${ollamaUrl}/v1`,
        apiKey: "ollama", // Ollama doesn't need a key
        defaultModel: "llama3.2",
    });

    const registered = listProviders();
    console.log(`✅ LLM providers: ${registered.join(", ")}`);
}
