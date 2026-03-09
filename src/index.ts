// ─── Gravity Claw — Entry Point ─────────────────────────────────
// Init all subsystems: config → memory → LLM → voice → MCP → skills → scheduler → bot.

import { loadConfig } from "./config.js";
import { initLLM } from "./llm.js";
import { createBot } from "./bot.js";
import { fetchOpenRouterModels } from "./llm/openrouter.js";
import { initMemoryDB, closeMemoryDB, decayMemories, mergeDuplicates, initPinecone } from "./memory/index.js";
import { initWhisper } from "./voice/whisper.js";
import { initElevenLabs } from "./voice/elevenlabs.js";
import { loadMCPServers, closeMCPServers } from "./mcp/bridge.js";
import { loadSkills } from "./skills/loader.js";
import { initScheduler, setupHeartbeat, setupAgenticHeartbeat, startReminderLoop, stopAllTasks } from "./proactive/scheduler.js";
import { getHealthStatus } from "./health.js";
import { runAgentLoop } from "./agent.js";
import { initUserDB, closeUserDB } from "./users/identity.js";
import { initAuthStore, closeAuthStore } from "./auth/store.js";
import { initConnectionsStore, closeConnectionsStore } from "./connections/store.js";

async function main(): Promise<void> {
    console.log(`
   ╔══════════════════════════════════════╗
   ║        🦞  GRAVITY CLAW  🦞         ║
   ║   Lean • Secure • Fully Understood  ║
   ╚══════════════════════════════════════╝
  `);

    // 1. Load & validate config
    const config = loadConfig();

    // 2. Initialize subsystems
    initMemoryDB();
    initUserDB(); // User identity system (per-user memory isolation)
    initAuthStore(); // Auth tokens, 2FA codes, and sessions
    initConnectionsStore(); // OAuth connections per user
    await initPinecone(); // Vector memory (auto-creates index if needed)
    initLLM(config);
    await fetchOpenRouterModels(config.openRouterApiKey || process.env.OPENROUTER_API_KEY);
    initWhisper(config.openaiWhisperKey, config.groqApiKey);
    initElevenLabs(config.elevenlabsApiKey, config.elevenlabsVoiceId);

    // 3. Load MCP servers & skills
    await loadMCPServers();
    loadSkills();

    // 4. Create & start bot
    const bot = createBot(config);
    const me = await bot.api.getMe();

    // 5. Set up scheduler with Telegram message sender
    const userId = config.allowedUserIds[0];
    if (userId) {
        initScheduler(async (text: string) => {
            await bot.api.sendMessage(userId, text, { parse_mode: "Markdown" }).catch(async () => {
                await bot.api.sendMessage(userId, text);
            });
        });

        // Heartbeat: check system health every 60 minutes
        setupHeartbeat(60, async () => {
            const health = getHealthStatus();
            if (health.totalErrors > 0 && parseFloat(health.errorRate) > 10) {
                return `⚠️ *Health Alert*\nError rate: ${health.errorRate}\nRecent: ${health.recentErrors.map(e => e.error).join(", ")}`;
            }
            return null;
        });

        // Agentic Heartbeat: Bot wakes up every 30 minutes to check if it needs to ping user
        setupAgenticHeartbeat(30, async (prompt: string) => {
            const loopStatus = await runAgentLoop(prompt, config, userId, String(userId));
            return loopStatus.reply;
        });

        // Start reminder check loop (every 60 seconds)
        startReminderLoop();
    }

    // 6. Memory maintenance (run once at startup)
    const decayed = decayMemories(30, 3);
    const merged = mergeDuplicates();
    if (decayed > 0 || merged > 0) {
        console.log(`🧹 Memory cleanup: ${decayed} decayed, ${merged} merged`);
    }

    console.log(`\n🚀 Gravity Claw is online!`);
    console.log(`   Bot: @${me.username}`);
    console.log(`   Mode: long-polling (no exposed ports)`);
    console.log(`   Features: LLM, memory, voice, tools, MCP, skills, scheduler`);
    console.log(`   Send me a message on Telegram!\n`);

    // 7. Graceful shutdown
    const shutdown = () => {
        console.log("\n🛑 Shutting down Gravity Claw...");
        stopAllTasks();
        closeMCPServers();
        closeMemoryDB();
        closeUserDB();
        closeAuthStore();
        closeConnectionsStore();
        bot.stop();
        process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // 8. Start long-polling
    await bot.start({ onStart: () => { } });
}

main().catch((err) => {
    console.error("💀 Fatal error:", err);
    process.exit(1);
});
