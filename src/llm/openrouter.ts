// ─── Gravity Claw — OpenRouter Dynamic Models ──────────────────
// Fetches and caches the available models from OpenRouter API.

export interface OpenRouterModel {
    id: string;
    name: string;
    description: string;
    pricing: {
        prompt: string;
        completion: string;
    };
    context_length: number;
    architecture?: {
        modality?: string;
    };
}

let cachedModels: OpenRouterModel[] = [];

export async function fetchOpenRouterModels(apiKey?: string): Promise<void> {
    if (!apiKey) {
        console.log("⏭️  OpenRouter: No API key, skipping dynamic model fetch.");
        return;
    }

    try {
        console.log("🔄 Fetching OpenRouter models...");
        const response = await fetch("https://openrouter.ai/api/v1/models", {
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "HTTP-Referer": "https://github.com/gravity-claw",
                "X-Title": "Gravity Claw",
            }
        });

        if (!response.ok) {
            throw new Error(`OpenRouter API error: ${response.statusText}`);
        }

        const data = await response.json() as { data: OpenRouterModel[] };

        // Filter out deprecated models, and sort by CHEAPEST price first
        cachedModels = data.data
            .filter(m => !m.id.includes("deprecated"))
            .sort((a, b) => {
                const costA = parseFloat(a.pricing.prompt) + parseFloat(a.pricing.completion);
                const costB = parseFloat(b.pricing.prompt) + parseFloat(b.pricing.completion);

                // If costs are the same, fallback to alphabetical
                if (costA === costB) {
                    return a.name.localeCompare(b.name);
                }

                return costA - costB;
            });

        console.log(`✅ OpenRouter: Loaded ${cachedModels.length} models.`);
    } catch (err) {
        console.warn(`⚠️ Failed to fetch OpenRouter models:`, err);
    }
}

export function getOpenRouterModels(): OpenRouterModel[] {
    return cachedModels;
}

export function getOpenRouterImageModels(): OpenRouterModel[] {
    return cachedModels.filter(m => {
        const idLower = m.id.toLowerCase();
        // Check keywords
        const keywords = ['image', 'flux', 'dall', 'diffusion', 'midjourney', 'seed', 'riverflow'];
        if (keywords.some(k => idLower.includes(k))) return true;

        // Check architecture modality for output containing image
        if (m.architecture?.modality) {
            const parts = m.architecture.modality.split('->');
            if (parts.length > 1 && parts[1]?.includes('image')) return true;
        }

        return false;
    });
}
