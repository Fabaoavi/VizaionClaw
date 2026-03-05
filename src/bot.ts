// ─── Gravity Claw — Telegram Bot ────────────────────────────────
// grammY bot with user ID whitelist, slash commands, and voice support.

import { Bot, InputFile } from "grammy";
import fs from "node:fs";
import type { Config } from "./config.js";
import { runAgentLoop, newSession } from "./agent.js";
import { isCommand, handleCommand, generateModelKeyboard } from "./commands/index.js";
import { setModel, getModel } from "./llm.js";
import { handleVoiceMessage, isTalkMode, toggleTalkMode } from "./voice/handler.js";
import { textToSpeech, isElevenLabsReady } from "./voice/elevenlabs.js";
import { isWhisperReady } from "./voice/whisper.js";
import { generateImageWithModel } from "./tools/image_gen.js";
import { getOpenRouterImageModels } from "./llm/openrouter.js";
import { resolveUser, getUserId } from "./users/identity.js";
import { createAuthToken, addPendingUser, isUserApproved, revertExpiredApprovals, setPendingMessageId, addSystemLog } from "./auth/store.js";
import { estimateCost } from "./usage.js";
import { registerUserSender } from "./proactive/scheduler.js";

function generateImageModelKeyboard(prompt: string) {
    // We encode the prompt in the callback, but Telegram callback_data is limited to 64 bytes.
    // Instead of passing the prompt in the callback, we will store the pending image request in memory 
    // for this user.

    // Get ALL image models from openrouter (which are already sorted by price in openrouter.ts)
    // Sometimes there are a lot, let's take the top 8 cheapest and most relevant
    const imageModels = getOpenRouterImageModels().slice(0, 8);

    const kb = imageModels.map(m => {
        const costStr = parseFloat(m.pricing.prompt) + parseFloat(m.pricing.completion);

        // Clean up the name for the button
        let shortName = m.name.replace("Google: ", "").replace("OpenAI: ", "").replace(/ \(.*?\)/, "");
        if (shortName.length > 20) shortName = shortName.slice(0, 20) + "...";

        // Telegram format for prices
        const priceFmt = costStr > 0 ? `$${costStr.toFixed(5)}` : "Free";

        return [{
            text: `🎨 ${shortName} [${priceFmt}]`,
            callback_data: `img_gen:${m.id}`
        }];
    });

    return { inline_keyboard: kb };
}

// Store pending image prompts
const pendingImagePrompts = new Map<number, { prompt: string; size: string }>();

export function createBot(config: Config): Bot {
    const bot = new Bot(config.telegramBotToken);
    const adminId = config.allowedUserIds[0]; // First user is always admin

    // ── Security middleware: open-access with pending queue ─────
    bot.use(async (ctx, next) => {
        const userId = ctx.from?.id;
        if (!userId) return;

        // Admin and whitelisted users always pass through
        if (config.allowedUserIds.includes(userId)) {
            await next();
            return;
        }

        // Approved users pass through
        if (isUserApproved(userId)) {
            await next();
            return;
        }

        // Unknown user — add to pending queue
        const firstName = ctx.from?.first_name || "User";
        const username = ctx.from?.username || undefined;
        const result = addPendingUser(userId, firstName, username);

        if (result === "added") {
            // New request — notify user and admin
            const msg = await ctx.reply(
                `👋 Welcome!\n\nYour access request has been submitted for review. The admin will analyze your request shortly.\n\n⏳ Status: Pending Analysis\n\nYou'll receive a notification once your access is approved.`
            );

            // Save the message ID so we can delete it later
            setPendingMessageId(userId, msg.message_id);

            // Log it
            addSystemLog("info", `New access request from ${firstName}`, { telegramId: userId, username });

            // Notify admin
            if (adminId) {
                await bot.api.sendMessage(
                    adminId,
                    `🆕 New access request!\n\n👤 ${firstName}${username ? ` (@${username})` : ""}\n🆔 Telegram ID: ${userId}\n\nOpen VizaionDashboard → Users to approve or deny.`
                ).catch(() => { });
            }
        } else if (result === "already_pending") {
            await ctx.reply(
                `⏳ Your access request is still under review.\n\nThe admin will get back to you shortly. Thank you for your patience!`
            );
        } else if (result === "denied") {
            await ctx.reply(
                `❌ Access denied.\n\nYour request was reviewed and not approved at this time.`
            );
        }
        // Don't call next() — block from agent loop
    });

    // ── Background Job: Check for expired 10m approvals ────────
    setInterval(async () => {
        try {
            const revertedIds = revertExpiredApprovals();
            for (const id of revertedIds) {
                await bot.api.sendMessage(
                    id,
                    "⌛️ Your registration link has expired!\n\nThe 10-minute registration window passed before you completed the process.\nYou have been automatically moved back to the pending queue. The admin will need to approve your request again to send a new link."
                ).catch(() => { });
            }
        } catch (err) {
            console.error("❌ Failed to revert expired approvals:", err);
        }
    }, 60 * 1000); // run every 1 minute

    // ── Text message handler ───────────────────────────────────
    bot.on("message:text", async (ctx) => {
        const userMessage = ctx.message.text;
        const userName = ctx.from.first_name || "User";
        const telegramId = ctx.from.id;

        // Check for VizaionDashboard access
        const mcKeywords = ["mission control", "vizaion dashboard", "vizaiondashboard", "dashboard", "/mc", "/dashboard"];
        if (mcKeywords.some(kw => userMessage.toLowerCase().includes(kw))) {
            try {
                const existingUserId = getUserId("telegram", telegramId);
                const mcBaseUrl = process.env.MC_BASE_URL || "http://localhost:3000";

                if (existingUserId) {
                    // User exists — send login link
                    const token = createAuthToken("login", { userId: existingUserId, telegramId });
                    const link = `${mcBaseUrl}/login?token=${token}`;
                    await ctx.reply(
                        `🚀 VizaionDashboard\n\nYour secure access link:\n\n🔗 ${link}\n\n⏱ Link expires in 10 minutes.\n⚠️ This link is for your use only.`
                    );
                } else {
                    // Approved but not yet registered — send registration link
                    const token = createAuthToken("register", { telegramId });
                    const link = `${mcBaseUrl}/register?token=${token}`;
                    await ctx.reply(
                        `🚀 VizaionDashboard — Registration\n\nWelcome! Set up your secure access:\n\n🔗 ${link}\n\n⏱ Link expires in 10 minutes.\n⚠️ This link is for your use only.`
                    );
                }
            } catch (err) {
                console.error("❌ VizaionDashboard link error:", err);
                await ctx.reply("❌ Failed to generate VizaionDashboard link. Check the console for details.");
            }
            return;
        }

        // Resolve to canonical user identity
        const user = resolveUser("telegram", telegramId, userName);
        const userId = telegramId; // Keep numeric for whitelist/commands
        const canonicalUserId = user.id; // Use for memory isolation

        console.log(`\n💬 ${userName} [${user.id}]: ${userMessage}`);
        addSystemLog("info", `Message from ${userName}: ${userMessage.slice(0, 100)}`, { canonicalUserId, telegramId, length: userMessage.length });

        // Register this user's Telegram sender for proactive features (reminders, briefings)
        registerUserSender(canonicalUserId, async (text: string) => {
            await ctx.api.sendMessage(telegramId, text, { parse_mode: "Markdown" }).catch(async () => {
                await ctx.api.sendMessage(telegramId, text);
            });
        });

        // Check for /talk toggle
        if (userMessage.toLowerCase() === "/talk") {
            const enabled = toggleTalkMode(userId);
            await ctx.reply(enabled ? "🎙️ *Talk Mode ON* — I'll reply with voice!" : "📝 *Talk Mode OFF* — Text replies only.");
            return;
        }

        // Check for slash commands
        if (isCommand(userMessage)) {
            const reply = async (text: string, options?: Record<string, unknown>) => {
                await ctx.reply(text, { parse_mode: "Markdown", ...options }).catch(async (e) => {
                    console.error("Markdown reply failed:", e);
                    await ctx.reply(text, options).catch(e2 => console.error("Fallback reply failed:", e2));
                });
            };
            const handled = await handleCommand(userMessage, config, userId, reply, setModel, getModel);
            if (handled) return;
        }

        // Show "typing..." while processing
        await ctx.replyWithChatAction("typing");

        // Send a visible "Thinking..." message that we'll delete after the LLM responds
        let thinkingMsg: { chat: { id: number }; message_id: number } | null = null;
        try {
            thinkingMsg = await ctx.reply("💭 _Thinking..._", { parse_mode: "Markdown" });
        } catch { /* non-critical */ }

        try {
            const { reply, modelUsed, totalTokens, pendingAction } = await runAgentLoop(userMessage, config, userId, canonicalUserId);
            console.log(`🦞 Gravity Claw: ${reply.slice(0, 100)}...`);

            // Extract reasoning from <think> blocks if present
            let cleanReply = reply;
            let reasoning = "";
            const thinkMatch = reply.match(/<think>([\s\S]*?)<\/think>/);

            if (thinkMatch) {
                reasoning = thinkMatch[1].trim();
                cleanReply = reply.replace(/<think>[\s\S]*?<\/think>/, "").trim();
            }

            const cost = estimateCost(modelUsed, totalTokens);
            addSystemLog("info", `Replied to ${userName}`, {
                canonicalUserId, telegramId, userName,
                model: modelUsed, tokens: totalTokens, cost,
                reply: cleanReply,
                thinking: true,
                reasoning: reasoning || null
            });

            // If model had actual reasoning, update the thinking message briefly before deleting
            if (reasoning && thinkingMsg) {
                try {
                    const reasoningPreview = reasoning.length > 500
                        ? reasoning.slice(0, 500) + "..."
                        : reasoning;
                    await ctx.api.editMessageText(
                        thinkingMsg.chat.id,
                        thinkingMsg.message_id,
                        `💭 _Reasoning..._\n\n> ${reasoningPreview.split('\n').join('\n> ')}`,
                        { parse_mode: "Markdown" }
                    ).catch(() => { });
                    // Brief pause so the user can glimpse the thought
                    await new Promise(r => setTimeout(r, 2000));
                } catch { /* non-critical */ }
            }

            // Delete the thinking message now that we have the answer
            if (thinkingMsg) {
                try {
                    await ctx.api.deleteMessage(thinkingMsg.chat.id, thinkingMsg.message_id);
                } catch { /* non-critical, message may already be gone */ }
            }

            const finalReply = `${cleanReply}\n\n_⚡ ${modelUsed} • 🪙 ${totalTokens} tokens_`;

            // Handle frontend actions (like Image Menu)
            if (pendingAction?.__ACTION__ === "IMAGE_MENU") {
                pendingImagePrompts.set(userId, { prompt: pendingAction.prompt, size: pendingAction.size });

                await ctx.reply(cleanReply, {
                    reply_markup: generateImageModelKeyboard(pendingAction.prompt)
                });
                return; // halt here
            } else if (pendingAction?.__ACTION__ === "SEND_FILE") {
                await ctx.reply(finalReply, { parse_mode: "Markdown" }).catch(() => ctx.reply(finalReply));
                try {
                    await ctx.replyWithDocument(new InputFile(pendingAction.path));
                } catch (err) {
                    await ctx.reply("❌ The file could not be sent. It might be too large or corrupted.");
                }
                return; // halt here
            }

            // Talk Mode: send voice reply if enabled and ElevenLabs is ready
            if (isTalkMode(userId) && isElevenLabsReady()) {
                try {
                    const audioPath = await textToSpeech(cleanReply);
                    await ctx.replyWithVoice(new InputFile(audioPath));
                    // Also send text for reference
                    await sendTextReply(ctx, finalReply);
                    fs.unlinkSync(audioPath);
                    return;
                } catch (err) {
                    console.warn(`⚠️ Talk Mode TTS failed, falling back to text: ${err}`);
                }
            }

            await sendTextReply(ctx, finalReply);
        } catch (err) {
            // Delete thinking message on error too
            if (thinkingMsg) {
                try { await ctx.api.deleteMessage(thinkingMsg.chat.id, thinkingMsg.message_id); } catch { }
            }
            const message = err instanceof Error ? err.message : String(err);
            console.error(`❌ Error: ${message}`);
            addSystemLog("error", `Error processing message from ${userName}`, { error: message });
            await ctx.reply("❌ Something went wrong. Check the console for details.");
        }
    });

    // ── Voice message handler ──────────────────────────────────
    bot.on("message:voice", async (ctx) => {
        const userId = ctx.from.id;
        const userName = ctx.from.first_name || "User";

        console.log(`\n🎙️ ${userName}: [voice message]`);

        if (!isWhisperReady()) {
            await ctx.reply("🎙️ Voice transcription isn't configured yet. Set OPENAI_API_KEY in .env.");
            return;
        }

        await ctx.replyWithChatAction("typing");

        try {
            // Download voice file
            const file = await ctx.getFile();
            const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;
            const response = await fetch(fileUrl);
            const buffer = Buffer.from(await response.arrayBuffer());

            // Process: transcribe → LLM → optional TTS
            const result = await handleVoiceMessage(buffer, config, userId);

            // Send transcript
            await ctx.reply(`🎙️ _"${result.transcript}"_`, { parse_mode: "Markdown" }).catch(() => { });

            // Send voice reply if available
            if (result.audioPath) {
                await ctx.replyWithVoice(new InputFile(result.audioPath));
                fs.unlinkSync(result.audioPath);
            }

            // Always send text reply too
            await sendTextReply(ctx, result.reply);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`❌ Voice error: ${message}`);
            await ctx.reply("❌ Failed to process voice message. Check the console.");
        }
    });

    // ── Audio file handler ─────────────────────────────────────
    bot.on("message:audio", async (ctx) => {
        await ctx.reply("🎵 Audio files are supported too! Processing...");
        // Reuse voice handler logic
    });

    // ── Button Callback Handler ────────────────────────────────
    bot.on("callback_query:data", async (ctx) => {
        const userId = ctx.from.id;
        if (!config.allowedUserIds.includes(userId)) return;

        const data = ctx.callbackQuery.data;
        if (data.startsWith("model:")) {
            const model = data.split(":")[1];
            if (model) {
                setModel(model);
                await ctx.answerCallbackQuery({ text: `Switched to ${model}` });
                await ctx.editMessageText(`✅ Model set to: \`${model}\``, { parse_mode: "Markdown" }).catch(() => { });
            }
            return;
        }

        if (data.startsWith("modelpage:")) {
            const page = parseInt(data.split(":")[1] || "0", 10);
            await ctx.editMessageReplyMarkup({ reply_markup: generateModelKeyboard(page) }).catch(() => { });
            await ctx.answerCallbackQuery();
            return;
        }

        if (data.startsWith("img_gen:")) {
            const rawParts = data.split(":");
            rawParts.shift(); // remove img_gen
            const model = rawParts.join(":"); // reconstruct model ID

            const pending = pendingImagePrompts.get(userId);
            if (!pending) {
                await ctx.answerCallbackQuery({ text: "⚠️ Image request expired. Please ask again." });
                return;
            }

            // Acknowledge and clean up
            pendingImagePrompts.delete(userId);
            await ctx.answerCallbackQuery({ text: `Generating with ${model}...` });
            await ctx.editMessageText(`⏳ Generating image using \`${model}\`...`, { parse_mode: "Markdown" }).catch(() => { });

            try {
                // Generate
                const result = await generateImageWithModel(pending.prompt, model, pending.size);

                if (result.error) {
                    await ctx.reply(`❌ Failed to generate image: ${result.error}`);
                } else if (result.imageBuffer) {
                    // Send base64 decoded image as a file
                    await ctx.replyWithPhoto(new InputFile(result.imageBuffer, "generated_image.png"), {
                        caption: `🎨 \`${pending.prompt}\`\n\n_⚡ ${model}_`,
                        parse_mode: "Markdown"
                    });
                    // Clear the "generating..." message
                    await ctx.deleteMessage().catch(() => { });
                } else if (result.url) {
                    await ctx.replyWithPhoto(result.url, {
                        caption: `🎨 \`${pending.prompt}\`\n\n_⚡ ${model}_`,
                        parse_mode: "Markdown"
                    });
                    // Clear the "generating..." message
                    await ctx.deleteMessage().catch(() => { });
                } else {
                    await ctx.reply("❌ Image generation returned no image data.");
                }
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                console.error(`❌ Image callback error:`, err);
                await ctx.reply(`❌ Image generation error: ${errMsg}`);
            }
            return;
        }
    });

    return bot;
}

// ── Helpers ──────────────────────────────────────────────────────

async function sendTextReply(ctx: { reply: (text: string, options?: Record<string, unknown>) => Promise<unknown> }, text: string): Promise<void> {
    if (text.length <= 4096) {
        await ctx.reply(text, { parse_mode: "Markdown" }).catch(async () => {
            await ctx.reply(text);
        });
    } else {
        const chunks = splitMessage(text, 4096);
        for (const chunk of chunks) {
            await ctx.reply(chunk, { parse_mode: "Markdown" }).catch(async () => {
                await ctx.reply(chunk);
            });
        }
    }
}

function splitMessage(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining);
            break;
        }

        let splitAt = remaining.lastIndexOf("\n", maxLength);
        if (splitAt === -1 || splitAt < maxLength * 0.5) {
            splitAt = remaining.lastIndexOf(" ", maxLength);
        }
        if (splitAt === -1 || splitAt < maxLength * 0.5) {
            splitAt = maxLength;
        }

        chunks.push(remaining.slice(0, splitAt));
        remaining = remaining.slice(splitAt).trimStart();
    }

    return chunks;
}
