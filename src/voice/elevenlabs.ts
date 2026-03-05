// ─── Gravity Claw — ElevenLabs TTS ──────────────────────────────
// Text-to-speech via ElevenLabs API. Streams audio and saves to file.

import fs from "node:fs";
import path from "node:path";

let apiKey: string | null = null;
let voiceId = "21m00Tcm4TlvDq8ikWAM"; // Default: Rachel

export function initElevenLabs(key?: string, voice?: string): void {
    if (!key) {
        console.log("⏭️  ElevenLabs: No ELEVENLABS_API_KEY set, TTS disabled");
        return;
    }
    apiKey = key;
    if (voice) voiceId = voice;
    console.log(`✅ ElevenLabs TTS ready (voice: ${voiceId})`);
}

export async function textToSpeech(text: string, outputPath?: string): Promise<string> {
    if (!apiKey) {
        throw new Error("ElevenLabs not configured. Set ELEVENLABS_API_KEY in .env");
    }

    const outDir = path.join(process.cwd(), "data", "voice");
    fs.mkdirSync(outDir, { recursive: true });

    const filePath = outputPath || path.join(outDir, `tts_${Date.now()}.ogg`);

    const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
        {
            method: "POST",
            headers: {
                "xi-api-key": apiKey,
                "Content-Type": "application/json",
                Accept: "audio/mpeg",
            },
            body: JSON.stringify({
                text,
                model_id: "eleven_multilingual_v2",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                },
            }),
        }
    );

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ElevenLabs API error ${response.status}: ${errText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    return filePath;
}

export function isElevenLabsReady(): boolean {
    return apiKey !== null;
}
