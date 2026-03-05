// ─── Gravity Claw — Automatic Fact Extractor ────────────────────
// Extracts key facts from conversations using the LLM.
// Runs asynchronously after each turn to populate long-term memory.

import { callLLM } from "../llm.js";
import { vectorStoreDedup, isPineconeReady } from "./pinecone.js";
import { storeMemory, searchMemories } from "./sqlite.js";
import { upsertEntity, addRelationship } from "./sqlite.js";

interface ExtractedFact {
    content: string;
    category: string;
    importance: number;
    entities?: Array<{ name: string; type: string }>;
    relationships?: Array<{ from: string; to: string; relation: string }>;
}

const EXTRACTION_PROMPT = `You are a fact extraction engine. Analyze the conversation below and extract any important, memorable facts.

Rules:
- Extract ONLY new, non-trivial facts (skip greetings, filler, commands)
- Categories: personal, preference, location, work, relationship, goal, decision, technical, other
- Importance: 1-10 (10 = critical life fact, 5 = useful preference, 1 = trivial)
- Also extract entities (people, places, projects) and relationships between them
- If there are NO facts worth remembering, return an empty array
- Be concise: each fact should be 1 sentence max

Respond ONLY with valid JSON in this exact format:
{
  "facts": [
    {
      "content": "User's dog is named Rex",
      "category": "personal",
      "importance": 7,
      "entities": [{"name": "Rex", "type": "pet"}, {"name": "User", "type": "person"}],
      "relationships": [{"from": "User", "to": "Rex", "relation": "owns"}]
    }
  ]
}

If no facts found, return: {"facts": []}`;

/**
 * Extract facts from a conversation turn and store them.
 * Runs asynchronously — does NOT block the response to the user.
 */
export async function extractAndStore(
    userMessage: string,
    assistantReply: string,
    userId: string
): Promise<void> {
    try {
        // Skip very short or command-like messages
        if (userMessage.length < 10 || userMessage.startsWith("/")) return;

        const conversationSnippet = `User: ${userMessage}\nAssistant: ${assistantReply}`;

        const response = await callLLM(
            [{ role: "user", content: conversationSnippet }],
            undefined,
            EXTRACTION_PROMPT
        );

        const content = response.content?.trim() || "";
        if (!content) return;

        // Parse the JSON response
        let parsed: { facts: ExtractedFact[] };
        try {
            // Try to extract JSON from the response (handle markdown code blocks)
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return;
            parsed = JSON.parse(jsonMatch[0]);
        } catch {
            console.warn("⚠️ Fact extraction: could not parse LLM response");
            return;
        }

        if (!parsed.facts || parsed.facts.length === 0) return;

        const userIdStr = String(userId);
        let stored = 0;

        for (const fact of parsed.facts) {
            if (!fact.content || fact.content.length < 5) continue;

            // Store in Pinecone (vector, with dedup)
            if (isPineconeReady()) {
                const result = await vectorStoreDedup(fact.content, userIdStr, {
                    category: fact.category,
                    importance: fact.importance,
                });

                if (result.action === "created") stored++;
                if (result.action === "duplicate") {
                    console.log(`   🔄 Dedup: "${fact.content.slice(0, 50)}..." (already known)`);
                }
            }

            // Also store in local SQLite (for FTS5 keyword backup)
            const existing = searchMemories(fact.content, 1);
            if (existing.length === 0 || existing[0]!.content !== fact.content) {
                storeMemory(fact.content, {
                    category: fact.category,
                    importance: fact.importance,
                    metadata: { source: "auto-extract", userId: userIdStr },
                });
            }

            // Populate knowledge graph
            if (fact.entities) {
                for (const entity of fact.entities) {
                    upsertEntity(entity.name, entity.type);
                }
            }
            if (fact.relationships) {
                for (const rel of fact.relationships) {
                    addRelationship(rel.from, rel.to, rel.relation);
                }
            }
        }

        if (stored > 0 || parsed.facts.length > 0) {
            console.log(`   🧠 Extracted ${parsed.facts.length} facts, stored ${stored} new to vector DB`);
        }
    } catch (err) {
        // Never let extraction errors crash the bot
        console.warn("⚠️ Fact extraction error (non-fatal):", err instanceof Error ? err.message : err);
    }
}
