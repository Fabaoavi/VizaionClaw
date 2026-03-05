// ─── Gravity Claw — Pinecone Vector Memory ─────────────────────
// Semantic memory powered by Pinecone vector database.

import { Pinecone } from "@pinecone-database/pinecone";
import { generateEmbedding } from "./embeddings.js";

let pc: Pinecone | null = null;
let indexName = "gravity-claw-memory";

// ── Types ────────────────────────────────────────────────────────

export interface VectorMemory {
    id: string;
    user_id: string;
    content: string;
    category: string;
    importance: number;
    metadata: Record<string, unknown>;
    similarity?: number;
    created_at: string;
    accessed_at: string;
    access_count: number;
}

// ── Init ─────────────────────────────────────────────────────────

export async function initPinecone(): Promise<boolean> {
    const apiKey = process.env["PINECONE_API_KEY"];
    if (!apiKey) {
        console.log("⏭️  Pinecone: No API key configured, vector memory disabled.");
        return false;
    }

    try {
        pc = new Pinecone({ apiKey });

        // Check if index exists, create if not
        const indexes = await pc.listIndexes();
        const exists = indexes.indexes?.some((idx) => idx.name === indexName);

        if (!exists) {
            console.log(`🔧 Pinecone: Creating index "${indexName}"...`);
            await pc.createIndex({
                name: indexName,
                dimension: 1536, // text-embedding-3-small dimension
                metric: "cosine",
                spec: {
                    serverless: {
                        cloud: "aws",
                        region: "us-east-1",
                    },
                },
            });
            // Wait for index to be ready
            console.log("⏳ Pinecone: Waiting for index to be ready...");
            await waitForIndexReady(indexName);
        }

        console.log(`✅ Pinecone vector memory connected (index: ${indexName})`);
        return true;
    } catch (err) {
        console.warn("⚠️ Pinecone init failed:", err instanceof Error ? err.message : err);
        pc = null;
        return false;
    }
}

async function waitForIndexReady(name: string, maxWaitMs = 60000): Promise<void> {
    if (!pc) return;
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        const desc = await pc.describeIndex(name);
        if (desc.status?.ready) return;
        await new Promise((r) => setTimeout(r, 2000));
    }
    console.log("⚠️ Pinecone: Index took too long to be ready, proceeding anyway.");
}

export function isPineconeReady(): boolean {
    return pc !== null;
}

// ── Helpers ──────────────────────────────────────────────────────

function getIndex() {
    if (!pc) throw new Error("Pinecone not initialized");
    return pc.index(indexName);
}

function generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Store ────────────────────────────────────────────────────────

export async function vectorStore(
    content: string,
    userId: string,
    options: {
        category?: string;
        importance?: number;
        metadata?: Record<string, unknown>;
    } = {}
): Promise<string | null> {
    if (!pc) return null;

    try {
        const embedding = await generateEmbedding(content);
        const id = generateId();
        const now = new Date().toISOString();

        const index = getIndex();
        await index.upsert({
            records: [{
                id,
                values: embedding,
                metadata: {
                    user_id: userId,
                    content,
                    category: options.category || "fact",
                    importance: options.importance || 5,
                    created_at: now,
                    accessed_at: now,
                    access_count: 0,
                    type: "memory",
                    ...(options.metadata || {}),
                },
            }]
        });

        return id;
    } catch (err) {
        console.error("❌ Pinecone store error:", err instanceof Error ? err.message : err);
        return null;
    }
}

// ── Search ───────────────────────────────────────────────────────

export async function vectorSearch(
    query: string,
    userId: string,
    limit = 5,
    similarityThreshold = 0.5
): Promise<VectorMemory[]> {
    if (!pc) return [];

    try {
        const queryEmbedding = await generateEmbedding(query);
        const index = getIndex();

        const results = await index.query({
            vector: queryEmbedding,
            topK: limit,
            includeMetadata: true,
            filter: {
                user_id: { $eq: userId },
                type: { $eq: "memory" },
            },
        });

        return (results.matches || [])
            .filter((m) => (m.score || 0) >= similarityThreshold)
            .map((m) => ({
                id: m.id,
                user_id: String(m.metadata?.user_id || userId),
                content: String(m.metadata?.content || ""),
                category: String(m.metadata?.category || "fact"),
                importance: Number(m.metadata?.importance || 5),
                metadata: (m.metadata as Record<string, unknown>) || {},
                similarity: m.score || 0,
                created_at: String(m.metadata?.created_at || ""),
                accessed_at: String(m.metadata?.accessed_at || ""),
                access_count: Number(m.metadata?.access_count || 0),
            }));
    } catch (err) {
        console.error("❌ Pinecone search error:", err instanceof Error ? err.message : err);
        return [];
    }
}

// ── Deduplicate ──────────────────────────────────────────────────

export async function findDuplicate(
    content: string,
    userId: string,
    threshold = 0.92
): Promise<VectorMemory | null> {
    const results = await vectorSearch(content, userId, 1, threshold);
    return results.length > 0 ? results[0]! : null;
}

export async function vectorStoreDedup(
    content: string,
    userId: string,
    options: {
        category?: string;
        importance?: number;
        metadata?: Record<string, unknown>;
    } = {}
): Promise<{ stored: boolean; id: string | null; action: "created" | "duplicate" | "error" }> {
    const existing = await findDuplicate(content, userId);

    if (existing) {
        // Boost importance if the new one is higher
        if (pc && existing.importance < (options.importance || 5)) {
            try {
                const index = getIndex();
                const newMeta: Record<string, string | number | boolean | string[]> = {};
                for (const [k, v] of Object.entries(existing.metadata)) {
                    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                        newMeta[k] = v;
                    }
                }
                newMeta.importance = options.importance ?? existing.importance;
                const embedding = await generateEmbedding(existing.content);
                await index.upsert({
                    records: [{
                        id: existing.id,
                        values: embedding,
                        metadata: newMeta,
                    }]
                });
            } catch { /* ignore update error */ }
        }
        return { stored: false, id: existing.id, action: "duplicate" };
    }

    const id = await vectorStore(content, userId, options);
    return { stored: !!id, id, action: id ? "created" : "error" };
}

// ── Archive Conversation ─────────────────────────────────────────

export async function archiveConversation(
    userId: string,
    sessionId: string,
    messages: Array<{ role: string; content: string; tokens?: number }>
): Promise<number> {
    if (!pc) return 0;

    let archived = 0;
    const index = getIndex();

    // Batch upsert for efficiency
    const vectors: Array<{
        id: string;
        values: number[];
        metadata: Record<string, string | number | boolean | string[]>;
    }> = [];

    for (const msg of messages) {
        if (!msg.content || msg.content.length < 5) continue;

        try {
            const embedding = await generateEmbedding(msg.content);
            const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

            vectors.push({
                id,
                values: embedding,
                metadata: {
                    user_id: userId,
                    session_id: sessionId,
                    role: msg.role,
                    content: msg.content,
                    tokens: msg.tokens || 0,
                    created_at: new Date().toISOString(),
                    type: "conversation",
                },
            });
            archived++;
        } catch {
            // Skip failed entries
        }
    }

    // Batch upsert in chunks of 100
    for (let i = 0; i < vectors.length; i += 100) {
        const batch = vectors.slice(i, i + 100);
        await index.upsert({ records: batch });
    }

    console.log(`📦 Archived ${archived}/${messages.length} messages to Pinecone.`);
    return archived;
}

// ── Search Conversation Archive ─────────────────────────────────

export async function searchConversationArchive(
    query: string,
    userId: string,
    limit = 5
): Promise<Array<{ role: string; content: string; session_id: string; created_at: string; similarity: number }>> {
    if (!pc) return [];

    try {
        const queryEmbedding = await generateEmbedding(query);
        const index = getIndex();

        const results = await index.query({
            vector: queryEmbedding,
            topK: limit,
            includeMetadata: true,
            filter: {
                user_id: { $eq: userId },
                type: { $eq: "conversation" },
            },
        });

        return (results.matches || [])
            .filter((m) => (m.score || 0) >= 0.5)
            .map((m) => ({
                role: String(m.metadata?.role || "user"),
                content: String(m.metadata?.content || ""),
                session_id: String(m.metadata?.session_id || ""),
                created_at: String(m.metadata?.created_at || ""),
                similarity: m.score || 0,
            }));
    } catch (err) {
        console.error("❌ Conversation archive search error:", err instanceof Error ? err.message : err);
        return [];
    }
}

// ── Delete ───────────────────────────────────────────────────────

export async function vectorDelete(id: string): Promise<boolean> {
    if (!pc) return false;

    try {
        const index = getIndex();
        await index.deleteOne({ id });
        return true;
    } catch {
        return false;
    }
}
