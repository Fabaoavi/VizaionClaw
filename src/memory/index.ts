// ─── Gravity Claw — Unified Memory Interface ────────────────────
// Combines all memory backends: SQLite, Pinecone Vector, Knowledge Graph.

import {
    initMemoryDB,
    storeMemory,
    searchMemories,
    getRecentMemories,
    getMemoryStats,
    deleteMemory,
    storeConversation,
    getConversationHistory,
    clearConversation,
    upsertEntity,
    addRelationship,
    getEntityRelationships,
    decayMemories,
    mergeDuplicates,
    closeMemoryDB,
} from "./sqlite.js";

import {
    writeMarkdownMemory,
    readMarkdownMemory,
    listMarkdownMemories,
} from "./markdown.js";

import {
    initPinecone,
    isPineconeReady,
    vectorSearch,
    archiveConversation,
    searchConversationArchive,
} from "./pinecone.js";

import { extractAndStore } from "./extractor.js";

export {
    // SQLite memory
    initMemoryDB,
    storeMemory,
    searchMemories,
    getRecentMemories,
    getMemoryStats,
    deleteMemory,
    closeMemoryDB,

    // Conversation history
    storeConversation,
    getConversationHistory,
    clearConversation,

    // Knowledge graph
    upsertEntity,
    addRelationship,
    getEntityRelationships,

    // Self-evolving
    decayMemories,
    mergeDuplicates,

    // Markdown memory
    writeMarkdownMemory,
    readMarkdownMemory,
    listMarkdownMemories,

    // Pinecone vector
    initPinecone,
    isPineconeReady,
    archiveConversation,

    // Auto-extraction
    extractAndStore,
};

/**
 * Load relevant memories for a given query using HYBRID recall:
 * 1. Vector search (Pinecone) — semantic similarity
 * 2. FTS5 search (local SQLite) — keyword matching
 * 3. Knowledge graph — related entities
 * 4. Past conversation archive — relevant past messages
 *
 * Results are deduplicated and ranked by a weighted score:
 *   score = similarity * 0.6 + importance * 0.3 + recency * 0.1
 */
export async function loadRelevantMemories(query: string, userId: number | string, limit = 5): Promise<string> {
    const userIdStr = String(userId);
    const results: Array<{ content: string; score: number; source: string }> = [];
    const seen = new Set<string>();

    // ── 1. Vector search (semantic) ──────────────────────────────
    if (isPineconeReady()) {
        try {
            const vectorResults = await vectorSearch(query, userIdStr, limit);
            for (const m of vectorResults) {
                const key = m.content.toLowerCase().trim();
                if (seen.has(key)) continue;
                seen.add(key);

                const similarity = m.similarity || 0.5;
                const importanceNorm = (m.importance || 5) / 10;
                const daysSince = (Date.now() - new Date(m.accessed_at).getTime()) / (1000 * 60 * 60 * 24);
                const recencyNorm = Math.max(0, 1 - daysSince / 365);

                const score = similarity * 0.6 + importanceNorm * 0.3 + recencyNorm * 0.1;
                results.push({ content: `[${m.category}] ${m.content}`, score, source: "vector" });
            }
        } catch (err) {
            console.warn("⚠️ Vector search failed, using FTS5 only:", err instanceof Error ? err.message : err);
        }
    }

    // ── 2. FTS5 search (keyword fallback) ────────────────────────
    const ftsResults = searchMemories(query, limit);
    for (const m of ftsResults) {
        const key = m.content.toLowerCase().trim();
        if (seen.has(key)) continue;
        seen.add(key);

        const importanceNorm = (m.importance || 5) / 10;
        const score = 0.4 + importanceNorm * 0.3; // Base score for keyword match
        results.push({
            content: `[${m.category}] ${m.content}` + (m.importance >= 8 ? " ⭐" : ""),
            score,
            source: "fts5",
        });
    }

    // ── 3. Knowledge graph context ───────────────────────────────
    const words = query.split(/\s+/).filter(w => w.length > 2 && w[0] === w[0]?.toUpperCase());
    for (const word of words.slice(0, 3)) {
        try {
            const rels = getEntityRelationships(word);
            for (const r of rels.slice(0, 2)) {
                const relContent = `${word} ${r.relation} ${r.name}`;
                const key = relContent.toLowerCase();
                if (seen.has(key)) continue;
                seen.add(key);
                results.push({ content: `[knowledge] ${relContent}`, score: 0.5, source: "graph" });
            }
        } catch { /* entity not found */ }
    }

    // ── 4. Past conversation archive (cross-session) ─────────────
    if (isPineconeReady()) {
        try {
            const archiveResults = await searchConversationArchive(query, userIdStr, 3);
            for (const msg of archiveResults) {
                const key = msg.content.toLowerCase().trim().slice(0, 100);
                if (seen.has(key)) continue;
                seen.add(key);

                results.push({
                    content: `[past ${msg.role}] ${msg.content.slice(0, 200)}`,
                    score: (msg.similarity || 0.5) * 0.5,
                    source: "archive",
                });
            }
        } catch { /* archive search failed */ }
    }

    // ── Sort by score and format ─────────────────────────────────
    results.sort((a, b) => b.score - a.score);
    const top = results.slice(0, limit);

    if (top.length === 0) return "";

    const lines = top.map(r => r.content);
    return `\n[Relevant Memories]\n${lines.join("\n")}`;
}
