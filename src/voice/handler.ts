// ─── Gravity Claw — Voice Handler ───────────────────────────────
// Full voice pipeline: receive voice → transcribe → LLM → TTS → reply.

import fs from "node:fs";
import path from "node:path";
import { transcribeAudio, isWhisperReady } from "./whisper.js";
import { textToSpeech, isElevenLabsReady } from "./elevenlabs.js";
import { runAgentLoop } from "../agent.js";
import type { Config } from "../config.js";

const VOICE_DIR = path.join(process.cwd(), "data", "voice");

/**
 * Process a voice message: download → transcribe → LLM → TTS → return audio path
 */
export async function handleVoiceMessage(
    fileBuffer: Buffer,
    config: Config,
    userId: number
): Promise<{ transcript: string; reply: string; audioPath?: string }> {
    // Ensure voice directory exists
    fs.mkdirSync(VOICE_DIR, { recursive: true });

    // Save incoming audio to temp file
    const inputPath = path.join(VOICE_DIR, `input_${Date.now()}.ogg`);
    fs.writeFileSync(inputPath, fileBuffer);

    let transcript: string;

    // Step 1: Transcribe
    if (isWhisperReady()) {
        transcript = await transcribeAudio(inputPath);
        console.log(`🎙️ Transcribed: "${transcript}"`);
    } else {
        // Clean up
        fs.unlinkSync(inputPath);
        throw new Error("Voice transcription not available. Set OPENAI_API_KEY.");
    }

    // Clean up input file
    try { fs.unlinkSync(inputPath); } catch { /* ignore */ }

    // Step 2: Process with LLM (prepend context that this was a voice message)
    // We explicitly tell it to reply in Portuguese so the ElevenLabs TTS (multilingual v2) reads it naturally.
    const { reply, modelUsed, totalTokens } = await runAgentLoop(
        `[Voice message transcription]: ${transcript}\n\n[System note: The user sent this as a voice message. Please reply in Portuguese (pt-BR) so that the Text-to-Speech system can read your response naturally. Keep your response conversational, engaging, and relatively concise (under 2 minutes of spoken audio).]`,
        config,
        userId
    );

    const finalReply = `${reply}\n\n_⚡ ${modelUsed} • 🪙 ${totalTokens} tokens_`;

    // Step 3: TTS (if available)
    let audioPath: string | undefined;
    if (isElevenLabsReady()) {
        try {
            audioPath = await textToSpeech(reply);
            console.log(`🔊 TTS generated: ${audioPath}`);
        } catch (err) {
            console.warn(`⚠️ TTS failed: ${err instanceof Error ? err.message : err}`);
        }
    }

    return { transcript, reply: finalReply, audioPath };
}

// ── Talk Mode State ──────────────────────────────────────────────
// Toggle per-user: when enabled, always reply with voice

const talkModeUsers = new Set<number>();

export function enableTalkMode(userId: number): void {
    talkModeUsers.add(userId);
}

export function disableTalkMode(userId: number): void {
    talkModeUsers.delete(userId);
}

export function isTalkMode(userId: number): boolean {
    return talkModeUsers.has(userId);
}

export function toggleTalkMode(userId: number): boolean {
    if (talkModeUsers.has(userId)) {
        talkModeUsers.delete(userId);
        return false;
    }
    talkModeUsers.add(userId);
    return true;
}
