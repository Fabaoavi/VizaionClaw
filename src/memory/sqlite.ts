// ─── Gravity Claw — SQLite Memory ───────────────────────────────
// Persistent memory: facts, preferences, conversation history.
// Uses FTS5 for full-text search.

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

let db: Database.Database;

export function initMemoryDB(dbPath?: string): void {
  const resolvedPath = dbPath || path.join(process.cwd(), "data", "memory.db");

  // Ensure data directory exists
  const dir = path.dirname(resolvedPath);
  fs.mkdirSync(dir, { recursive: true });

  db = new Database(resolvedPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // ── Core tables ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'fact',
      category TEXT DEFAULT 'general',
      content TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      importance INTEGER DEFAULT 5,
      access_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tokens INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT DEFAULT 'thing',
      properties TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_entity_id INTEGER NOT NULL,
      to_entity_id INTEGER NOT NULL,
      relation TEXT NOT NULL,
      weight REAL DEFAULT 1.0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (from_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
      FOREIGN KEY (to_entity_id) REFERENCES entities(id) ON DELETE CASCADE
    );

    -- FTS5 virtual table for full-text search on memories
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content, category, tokenize='porter'
    );

    -- Trigger to keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content, category)
      VALUES (new.id, new.content, new.category);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, category)
      VALUES ('delete', old.id, old.content, old.category);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, category)
      VALUES ('delete', old.id, old.content, old.category);
      INSERT INTO memories_fts(rowid, content, category)
      VALUES (new.id, new.content, new.category);
    END;
  `);

  console.log("✅ Memory database ready");
}

// ── Memory CRUD ──────────────────────────────────────────────────

export interface Memory {
  id: number;
  type: string;
  category: string;
  content: string;
  metadata: Record<string, unknown>;
  importance: number;
  accessCount: number;
  createdAt: string;
}

export function storeMemory(
  content: string,
  options: {
    type?: string;
    category?: string;
    metadata?: Record<string, unknown>;
    importance?: number;
  } = {}
): number {
  const stmt = db.prepare(`
    INSERT INTO memories (content, type, category, metadata, importance)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    content,
    options.type || "fact",
    options.category || "general",
    JSON.stringify(options.metadata || {}),
    options.importance || 5
  );
  return Number(result.lastInsertRowid);
}

export function searchMemories(query: string, limit = 10): Memory[] {
  // Escape FTS5 query to prevent syntax errors: wrap in quotes and escape internal quotes
  const safeQuery = `"${query.replace(/"/g, '""')}"`;

  try {
    const rows = db.prepare(`
      SELECT m.* FROM memories m
      JOIN memories_fts ON memories_fts.rowid = m.id
      WHERE memories_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(safeQuery, limit) as Array<Record<string, unknown>>;

    return rows.map(rowToMemory);
  } catch (err) {
    console.warn(`⚠️ FTS5 search failed for query: ${query}`, err);
    return [];
  }
}

export function getRecentMemories(limit = 10): Memory[] {
  const rows = db.prepare(`
    SELECT * FROM memories ORDER BY created_at DESC LIMIT ?
  `).all(limit) as Array<Record<string, unknown>>;

  return rows.map(rowToMemory);
}

export function getMemoriesByCategory(category: string, limit = 20): Memory[] {
  const rows = db.prepare(`
    SELECT * FROM memories WHERE category = ? ORDER BY importance DESC, created_at DESC LIMIT ?
  `).all(category, limit) as Array<Record<string, unknown>>;

  return rows.map(rowToMemory);
}

export function deleteMemory(id: number): boolean {
  const result = db.prepare("DELETE FROM memories WHERE id = ?").run(id);
  return result.changes > 0;
}

export function getMemoryStats(): { total: number; categories: Record<string, number> } {
  const total = (db.prepare("SELECT COUNT(*) as count FROM memories").get() as { count: number }).count;
  const cats = db.prepare("SELECT category, COUNT(*) as count FROM memories GROUP BY category").all() as Array<{ category: string; count: number }>;
  const categories: Record<string, number> = {};
  for (const c of cats) {
    categories[c.category] = c.count;
  }
  return { total, categories };
}

// ── Conversation History ─────────────────────────────────────────

export function storeConversation(sessionId: string, role: string, content: string, tokens = 0): void {
  db.prepare(`
    INSERT INTO conversations (session_id, role, content, tokens) VALUES (?, ?, ?, ?)
  `).run(sessionId, role, content, tokens);
}

export function getConversationHistory(sessionId: string, limit = 50): Array<{ role: string; content: string }> {
  return db.prepare(`
    SELECT role, content FROM conversations WHERE session_id = ? ORDER BY created_at ASC LIMIT ?
  `).all(sessionId, limit) as Array<{ role: string; content: string }>;
}

export function clearConversation(sessionId: string): void {
  db.prepare("DELETE FROM conversations WHERE session_id = ?").run(sessionId);
}

// ── Knowledge Graph ──────────────────────────────────────────────

export function upsertEntity(name: string, type = "thing", properties: Record<string, unknown> = {}): number {
  const existing = db.prepare("SELECT id FROM entities WHERE name = ?").get(name) as { id: number } | undefined;
  if (existing) {
    db.prepare("UPDATE entities SET type = ?, properties = ?, updated_at = datetime('now') WHERE id = ?")
      .run(type, JSON.stringify(properties), existing.id);
    return existing.id;
  }
  const result = db.prepare("INSERT INTO entities (name, type, properties) VALUES (?, ?, ?)")
    .run(name, type, JSON.stringify(properties));
  return Number(result.lastInsertRowid);
}

export function addRelationship(fromName: string, toName: string, relation: string, weight = 1.0): void {
  const fromId = upsertEntity(fromName);
  const toId = upsertEntity(toName);
  db.prepare(`
    INSERT OR REPLACE INTO relationships (from_entity_id, to_entity_id, relation, weight)
    VALUES (?, ?, ?, ?)
  `).run(fromId, toId, relation, weight);
}

export function getEntityRelationships(name: string): Array<{ name: string; relation: string; direction: string }> {
  const entity = db.prepare("SELECT id FROM entities WHERE name = ?").get(name) as { id: number } | undefined;
  if (!entity) return [];

  const outgoing = db.prepare(`
    SELECT e.name, r.relation, 'outgoing' as direction
    FROM relationships r JOIN entities e ON e.id = r.to_entity_id
    WHERE r.from_entity_id = ?
  `).all(entity.id) as Array<{ name: string; relation: string; direction: string }>;

  const incoming = db.prepare(`
    SELECT e.name, r.relation, 'incoming' as direction
    FROM relationships r JOIN entities e ON e.id = r.from_entity_id
    WHERE r.to_entity_id = ?
  `).all(entity.id) as Array<{ name: string; relation: string; direction: string }>;

  return [...outgoing, ...incoming];
}

// ── Self-Evolving Memory ─────────────────────────────────────────

export function incrementAccess(id: number): void {
  db.prepare("UPDATE memories SET access_count = access_count + 1, updated_at = datetime('now') WHERE id = ?").run(id);
}

export function decayMemories(daysOld = 30, importanceThreshold = 3): number {
  const result = db.prepare(`
    DELETE FROM memories
    WHERE importance <= ?
    AND access_count = 0
    AND created_at < datetime('now', '-' || ? || ' days')
    AND expires_at IS NULL
  `).run(importanceThreshold, daysOld);
  return result.changes;
}

export function mergeDuplicates(): number {
  // Find memories with very similar content (same first 50 chars)
  const dupes = db.prepare(`
    SELECT MIN(id) as keep_id, GROUP_CONCAT(id) as all_ids, COUNT(*) as cnt
    FROM memories
    GROUP BY SUBSTR(content, 1, 50)
    HAVING cnt > 1
  `).all() as Array<{ keep_id: number; all_ids: string; cnt: number }>;

  let merged = 0;
  for (const dupe of dupes) {
    const ids = dupe.all_ids.split(",").map(Number).filter((id) => id !== dupe.keep_id);
    if (ids.length > 0) {
      try {
        db.prepare(`DELETE FROM memories WHERE id IN (${ids.join(",")})`).run();
        merged += ids.length;
      } catch (err: any) {
        console.warn(`⚠️ Failed to merge memory duplicates (FTS mismatch?): ${err.message}`);
        try {
          db.exec("INSERT INTO memories_fts(memories_fts) VALUES('rebuild');");
          db.prepare(`DELETE FROM memories WHERE id IN (${ids.join(",")})`).run();
          merged += ids.length;
        } catch (rebuildErr) {
          console.error("❌ FTS Rebuild also failed:", rebuildErr);
        }
      }
    }
  }
  return merged;
}

// ── Helpers ──────────────────────────────────────────────────────

function rowToMemory(row: Record<string, unknown>): Memory {
  return {
    id: row["id"] as number,
    type: row["type"] as string,
    category: row["category"] as string,
    content: row["content"] as string,
    metadata: JSON.parse((row["metadata"] as string) || "{}"),
    importance: row["importance"] as number,
    accessCount: row["access_count"] as number,
    createdAt: row["created_at"] as string,
  };
}

export function closeMemoryDB(): void {
  if (db) db.close();
}
