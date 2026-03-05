// ─── Gravity Claw — Config ──────────────────────────────────────
// Typed environment loader. Fails fast if required secrets are missing.

import "dotenv/config";

export interface Config {
    telegramBotToken: string;
    openRouterApiKey: string;
    allowedUserIds: number[];
    llmModel: string;
    maxAgentIterations: number;
    thinkingLevel: string;
    // Optional provider keys (auto-discovered in providers.ts)
    openaiApiKey?: string;
    anthropicApiKey?: string;
    groqApiKey?: string;
    deepseekApiKey?: string;
    googleApiKey?: string;
    ollamaUrl?: string;
    // Voice (Phase 4)
    openaiWhisperKey?: string;
    elevenlabsApiKey?: string;
    elevenlabsVoiceId?: string;
}

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`❌ Missing required env var: ${name} — check your .env file`);
    }
    return value;
}

export function loadConfig(): Config {
    const config: Config = {
        telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
        openRouterApiKey: requireEnv("OPENROUTER_API_KEY"),
        allowedUserIds: requireEnv("ALLOWED_USER_IDS")
            .split(",")
            .map((id) => {
                const parsed = parseInt(id.trim(), 10);
                if (isNaN(parsed)) {
                    throw new Error(`❌ Invalid user ID in ALLOWED_USER_IDS: "${id}"`);
                }
                return parsed;
            }),
        llmModel: process.env["LLM_MODEL"] || "llama-3.3-70b-versatile",
        maxAgentIterations: parseInt(process.env["MAX_AGENT_ITERATIONS"] || "10", 10),
        thinkingLevel: process.env["THINKING_LEVEL"] || "off",
        // Optional keys
        openaiApiKey: process.env["OPENAI_API_KEY"],
        anthropicApiKey: process.env["ANTHROPIC_API_KEY"],
        groqApiKey: process.env["GROQ_API_KEY"],
        deepseekApiKey: process.env["DEEPSEEK_API_KEY"],
        googleApiKey: process.env["GOOGLE_API_KEY"],
        ollamaUrl: process.env["OLLAMA_URL"],
        openaiWhisperKey: process.env["OPENAI_API_KEY"],
        elevenlabsApiKey: process.env["ELEVENLABS_API_KEY"],
        elevenlabsVoiceId: process.env["ELEVENLABS_VOICE_ID"],
    };

    console.log("✅ Config loaded");
    console.log(`   Model: ${config.llmModel}`);
    console.log(`   Allowed users: ${config.allowedUserIds.join(", ")}`);

    return config;
}
