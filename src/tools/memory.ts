// ─── Gravity Claw — Memory Tools ────────────────────────────────
// LLM-callable tools for storing and searching memories.

import {
    storeMemory,
    searchMemories,
    getRecentMemories,
    getMemoryStats,
    deleteMemory,
    upsertEntity,
    addRelationship,
    getEntityRelationships,
    writeMarkdownMemory,
    readMarkdownMemory,
    listMarkdownMemories,
} from "../memory/index.js";

// ── Tool Definitions ─────────────────────────────────────────────

export const definitions = [
    {
        type: "function" as const,
        function: {
            name: "memory_store",
            description: "Store a fact, preference, or piece of information in persistent memory. Use this to remember things the user tells you.",
            parameters: {
                type: "object" as const,
                properties: {
                    content: { type: "string", description: "The information to remember" },
                    category: { type: "string", description: "Category: preferences, facts, people, projects, notes", enum: ["preferences", "facts", "people", "projects", "notes"] },
                    importance: { type: "number", description: "1-10 importance (10 = critical)", minimum: 1, maximum: 10 },
                },
                required: ["content"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "memory_search",
            description: "Search persistent memory for relevant information. Use this to recall things the user has told you before.",
            parameters: {
                type: "object" as const,
                properties: {
                    query: { type: "string", description: "Search query" },
                    limit: { type: "number", description: "Max results (default 5)" },
                },
                required: ["query"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "memory_list",
            description: "List recent memories or get memory statistics.",
            parameters: {
                type: "object" as const,
                properties: {
                    action: { type: "string", enum: ["recent", "stats"], description: "What to list" },
                    limit: { type: "number", description: "Max results for 'recent' (default 10)" },
                },
                required: ["action"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "memory_delete",
            description: "Delete a specific memory by ID.",
            parameters: {
                type: "object" as const,
                properties: {
                    id: { type: "number", description: "Memory ID to delete" },
                },
                required: ["id"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "knowledge_graph_add",
            description: "Add an entity or relationship to the knowledge graph. Use for connecting concepts, people, and projects.",
            parameters: {
                type: "object" as const,
                properties: {
                    entity: { type: "string", description: "Entity name" },
                    entity_type: { type: "string", description: "Entity type (person, project, concept, place)" },
                    related_to: { type: "string", description: "Name of related entity (optional)" },
                    relationship: { type: "string", description: "Relationship type (e.g. 'works_on', 'knows', 'part_of')" },
                },
                required: ["entity"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "knowledge_graph_query",
            description: "Query the knowledge graph for relationships of an entity.",
            parameters: {
                type: "object" as const,
                properties: {
                    entity: { type: "string", description: "Entity name to look up" },
                },
                required: ["entity"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "note_save",
            description: "Save a markdown note to persistent storage. Human-readable and git-friendly.",
            parameters: {
                type: "object" as const,
                properties: {
                    filename: { type: "string", description: "Note filename (without .md)" },
                    content: { type: "string", description: "Markdown content" },
                    category: { type: "string", description: "Category folder (default: notes)" },
                },
                required: ["filename", "content"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "note_read",
            description: "Read a markdown note from storage.",
            parameters: {
                type: "object" as const,
                properties: {
                    filename: { type: "string", description: "Note filename (without .md)" },
                    category: { type: "string", description: "Category folder (default: notes)" },
                },
                required: ["filename"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "note_list",
            description: "List all saved markdown notes.",
            parameters: {
                type: "object" as const,
                properties: {
                    category: { type: "string", description: "Filter by category (optional)" },
                },
            },
        },
    },
];

// ── Tool Handlers ────────────────────────────────────────────────

export const handlers: Record<string, (input: Record<string, unknown>) => string> = {
    memory_store: (input) => {
        const id = storeMemory(input["content"] as string, {
            category: (input["category"] as string) || "facts",
            importance: (input["importance"] as number) || 5,
        });
        return JSON.stringify({ success: true, id, message: "Memory stored" });
    },

    memory_search: (input) => {
        const results = searchMemories(
            input["query"] as string,
            (input["limit"] as number) || 5
        );
        return JSON.stringify({ results: results.map((m) => ({ id: m.id, content: m.content, category: m.category, importance: m.importance })) });
    },

    memory_list: (input) => {
        if (input["action"] === "stats") {
            return JSON.stringify(getMemoryStats());
        }
        const memories = getRecentMemories((input["limit"] as number) || 10);
        return JSON.stringify({ memories: memories.map((m) => ({ id: m.id, content: m.content, category: m.category })) });
    },

    memory_delete: (input) => {
        const success = deleteMemory(input["id"] as number);
        return JSON.stringify({ success, message: success ? "Memory deleted" : "Memory not found" });
    },

    knowledge_graph_add: (input) => {
        const entityName = input["entity"] as string;
        const entityType = (input["entity_type"] as string) || "thing";
        upsertEntity(entityName, entityType);

        if (input["related_to"] && input["relationship"]) {
            addRelationship(entityName, input["related_to"] as string, input["relationship"] as string);
        }
        return JSON.stringify({ success: true, message: `Entity '${entityName}' added` });
    },

    knowledge_graph_query: (input) => {
        const relationships = getEntityRelationships(input["entity"] as string);
        return JSON.stringify({ entity: input["entity"], relationships });
    },

    note_save: (input) => {
        const filePath = writeMarkdownMemory(
            input["filename"] as string,
            input["content"] as string,
            (input["category"] as string) || "notes"
        );
        return JSON.stringify({ success: true, path: filePath });
    },

    note_read: (input) => {
        const content = readMarkdownMemory(
            input["filename"] as string,
            (input["category"] as string) || "notes"
        );
        return content
            ? JSON.stringify({ content })
            : JSON.stringify({ error: "Note not found" });
    },

    note_list: (input) => {
        const notes = listMarkdownMemories(input["category"] as string | undefined);
        return JSON.stringify({ notes });
    },
};
