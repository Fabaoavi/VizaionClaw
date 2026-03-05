// ─── Gravity Claw — Embedding Generator ────────────────────────
// Generates text embeddings via OpenRouter for semantic search.

const EMBEDDING_CACHE = new Map<string, number[]>();

/**
 * Generate an embedding vector for the given text.
 * Uses OpenRouter's embedding endpoint with a free/cheap model.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    // Check cache first
    const cacheKey = text.slice(0, 200); // Use first 200 chars as cache key
    const cached = EMBEDDING_CACHE.get(cacheKey);
    if (cached) return cached;

    const apiKey = process.env["OPENROUTER_API_KEY"];
    if (!apiKey) {
        throw new Error("OPENROUTER_API_KEY required for embeddings");
    }

    // Use a free/cheap embedding model
    const model = process.env["EMBEDDING_MODEL"] || "openai/text-embedding-3-small";

    try {
        const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/gravity-claw",
                "X-Title": "Gravity Claw",
            },
            body: JSON.stringify({
                model,
                input: text.slice(0, 8000), // Limit input length
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Embedding API error (${response.status}): ${err}`);
        }

        const data = await response.json() as {
            data: Array<{ embedding: number[] }>;
        };

        const embedding = data.data?.[0]?.embedding;
        if (!embedding || !Array.isArray(embedding)) {
            throw new Error(`Invalid embedding response: ${JSON.stringify(data).slice(0, 200)}`);
        }

        // Cache it
        EMBEDDING_CACHE.set(cacheKey, embedding);

        // Keep cache manageable (max 500 entries)
        if (EMBEDDING_CACHE.size > 500) {
            const firstKey = EMBEDDING_CACHE.keys().next().value;
            if (firstKey) EMBEDDING_CACHE.delete(firstKey);
        }

        return embedding;
    } catch (err) {
        console.error("❌ Embedding generation failed:", err);
        throw err;
    }
}

/**
 * Generate embeddings for multiple texts in a batch.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
    // Process in parallel, but limit concurrency
    const results: number[][] = [];
    const batchSize = 5;

    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const embeddings = await Promise.all(batch.map(t => generateEmbedding(t)));
        results.push(...embeddings);
    }

    return results;
}

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i]! * b[i]!;
        normA += a[i]! * a[i]!;
        normB += b[i]! * b[i]!;
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
}
