// ─── Gravity Claw — Image Generation Tool ───────────────────────
// Generate images via OpenAI DALL-E or other providers.

export const definition = {
    type: "function" as const,
    function: {
        name: "image_generate",
        description: "Generate an image from a text description. Returns a URL to the generated image.",
        parameters: {
            type: "object" as const,
            properties: {
                prompt: { type: "string", description: "Description of the image to generate" },
                size: { type: "string", enum: ["256x256", "512x512", "1024x1024"], description: "Image size (default: 512x512)" },
            },
            required: ["prompt"],
        },
    },
};

export async function execute(input: { prompt: string; size?: string }): Promise<string> {
    // We no longer generate immediately. We instruct the agent to halt and the bot to show a menu.
    return JSON.stringify({
        __ACTION__: "IMAGE_MENU",
        prompt: input.prompt,
        size: input.size || "1024x1024",
        message: "Please tell the user you are preparing their image menu, and stop."
    });
}

// ── Actual Generation (called by bot callback) ─────────────────────

export async function generateImageWithModel(prompt: string, model: string, size = "1024x1024"): Promise<{ url?: string; imageBuffer?: Buffer; error?: string }> {
    const apiKey = process.env["OPENROUTER_API_KEY"];
    if (!apiKey) return { error: "No OPENROUTER_API_KEY configured" };

    try {
        console.log(`🎨 Generating image with model=${model}, prompt="${prompt.slice(0, 60)}..."`);

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/gravity-claw",
                "X-Title": "Gravity Claw",
            },
            body: JSON.stringify({
                model,
                modalities: ["image", "text"],
                messages: [{ role: "user", content: `Generate an image: ${prompt}` }]
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            console.error(`❌ Image generation API error: ${err}`);
            return { error: `Image generation failed: ${err}` };
        }

        const data = await response.json() as any;
        console.log(`📦 Image response keys: ${JSON.stringify(Object.keys(data))}`);

        const message = data.choices?.[0]?.message;
        if (!message) {
            return { error: `No message in response: ${JSON.stringify(data).slice(0, 200)}` };
        }

        // Method 1: Check message.images array (OpenRouter standard format)
        // Format: [{ type: "image_url", image_url: { url: "data:image/png;base64,..." } }]
        if (message.images && Array.isArray(message.images) && message.images.length > 0) {
            for (const imgEntry of message.images) {
                // Object format: { type: "image_url", image_url: { url: "data:..." } }
                if (typeof imgEntry === "object" && imgEntry.image_url?.url) {
                    const imgUrl = imgEntry.image_url.url;
                    if (imgUrl.startsWith("data:image")) {
                        const base64Part = imgUrl.split(",")[1];
                        if (base64Part) {
                            console.log("✅ Got image from message.images (object, base64 data URL)");
                            return { imageBuffer: Buffer.from(base64Part, "base64") };
                        }
                    }
                    if (imgUrl.startsWith("http")) {
                        console.log("✅ Got image from message.images (object, HTTP URL)");
                        return { url: imgUrl };
                    }
                }
                // String format (fallback)
                if (typeof imgEntry === "string") {
                    if (imgEntry.startsWith("data:")) {
                        const base64Part = imgEntry.split(",")[1];
                        if (base64Part) {
                            console.log("✅ Got image from message.images (string, base64)");
                            return { imageBuffer: Buffer.from(base64Part, "base64") };
                        }
                    }
                    if (imgEntry.startsWith("http")) {
                        console.log("✅ Got image from message.images (string, URL)");
                        return { url: imgEntry };
                    }
                }
            }
        }

        // Method 2: Check content for base64 data URLs or markdown images
        const content = typeof message.content === "string" ? message.content : "";

        // Check for inline base64 data URL
        const dataUrlMatch = content.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/);
        if (dataUrlMatch && dataUrlMatch[1]) {
            console.log("✅ Got image from content (inline base64 data URL)");
            return { imageBuffer: Buffer.from(dataUrlMatch[1], "base64") };
        }

        // Check for HTTP URL (markdown or plain)
        const urlMatch = content.match(/https?:\/\/[^\s"',)\]]+/);
        if (urlMatch) {
            console.log("✅ Got image from content (HTTP URL)");
            return { url: urlMatch[0] };
        }

        // Method 3: content is an array with image parts (multimodal responses)
        if (Array.isArray(message.content)) {
            for (const part of message.content) {
                if (part.type === "image_url" && part.image_url?.url) {
                    const imgUrl = part.image_url.url;
                    if (imgUrl.startsWith("data:")) {
                        const b64 = imgUrl.split(",")[1];
                        if (b64) {
                            console.log("✅ Got image from content array (base64)");
                            return { imageBuffer: Buffer.from(b64, "base64") };
                        }
                    }
                    console.log("✅ Got image from content array (URL)");
                    return { url: imgUrl };
                }
            }
        }

        console.warn(`⚠️ Could not extract image. Response content: ${JSON.stringify(message).slice(0, 500)}`);
        return { error: `Model returned unexpected format. Content: ${String(content).slice(0, 200)}` };
    } catch (err) {
        console.error(`❌ Image generation exception:`, err);
        return { error: err instanceof Error ? err.message : String(err) };
    }
}
