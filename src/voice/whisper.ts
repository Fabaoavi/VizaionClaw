// ─── Gravity Claw — Whisper Transcription ───────────────────────
// Transcribes audio files via OpenAI Whisper API.

import OpenAI from "openai";
import fs from "node:fs";

let whisperClient: OpenAI | null = null;
let activeModel = "whisper-1";

export function initWhisper(apiKey?: string, groqApiKey?: string): void {
    if (groqApiKey) {
        whisperClient = new OpenAI({
            apiKey: groqApiKey,
            baseURL: "https://api.groq.com/openai/v1"
        });
        activeModel = "whisper-large-v3-turbo"; // Groq's fast whisper model
        console.log("✅ Whisper transcription ready (via Groq)");
        return;
    }

    if (apiKey) {
        whisperClient = new OpenAI({ apiKey });
        activeModel = "whisper-1"; // OpenAI's default
        console.log("✅ Whisper transcription ready (via OpenAI)");
        return;
    }

    console.log("⏭️  Whisper: No GROQ_API_KEY or OPENAI_API_KEY set, voice transcription disabled");
}

export async function transcribeAudio(filePath: string): Promise<string> {
    if (!whisperClient) {
        throw new Error("Whisper not configured. Set GROQ_API_KEY or OPENAI_API_KEY in .env");
    }

    const file = fs.createReadStream(filePath);

    const response = await whisperClient.audio.transcriptions.create({
        model: activeModel,
        file,
        response_format: "text",
    });

    return typeof response === "string" ? response : String(response);
}

export function isWhisperReady(): boolean {
    return whisperClient !== null;
}
