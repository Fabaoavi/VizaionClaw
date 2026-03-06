// ── Gravity Claw — Connections Store ─────────────────────────────
// SQLite-backed storage for user-specific OAuth tokens (Google, YouTube).
// Uses the shared users.db database.

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

let db: Database.Database;

// ── Types ────────────────────────────────────────────────────────

export interface Connection {
    id: number;
    user_id: string; // Canonical user_id from users.db
    provider: string; // e.g. "google", "youtube"
    access_token: string;
    refresh_token: string | null;
    scopes: string; // Comma-separated list of granted scopes
    status: "connected" | "expired" | "revoked";
    token_expires_at: string | null;
    created_at: string;
    updated_at: string;
}

// ── Init ─────────────────────────────────────────────────────────

export function initConnectionsStore(dbPath?: string): void {
    const resolvedPath = dbPath || path.join(process.cwd(), "data", "users.db");
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

    db = new Database(resolvedPath);
    db.pragma("journal_mode = WAL");

    db.exec(`
        CREATE TABLE IF NOT EXISTS connections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            provider TEXT NOT NULL,
            access_token TEXT NOT NULL,
            refresh_token TEXT,
            scopes TEXT,
            status TEXT NOT NULL DEFAULT 'connected' CHECK(status IN ('connected', 'expired', 'revoked')),
            token_expires_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, provider)
        );

        CREATE INDEX IF NOT EXISTS idx_connections_user ON connections(user_id);
        CREATE INDEX IF NOT EXISTS idx_connections_provider ON connections(provider);
    `);

    console.log("✅ Connections store ready");
}

// ── Core Methods ─────────────────────────────────────────────────

export function upsertConnection(
    userId: string,
    provider: string,
    accessToken: string,
    refreshToken: string | null,
    scopes: string,
    expiresInMs?: number
): boolean {
    if (!db) initConnectionsStore();

    const expiresAt = expiresInMs
        ? new Date(Date.now() + expiresInMs).toISOString()
        : null;

    const stmt = db.prepare(`
        INSERT INTO connections (user_id, provider, access_token, refresh_token, scopes, token_expires_at, status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'connected', datetime('now'))
        ON CONFLICT(user_id, provider) DO UPDATE SET
            access_token = excluded.access_token,
            refresh_token = COALESCE(excluded.refresh_token, connections.refresh_token),
            scopes = excluded.scopes,
            token_expires_at = excluded.token_expires_at,
            status = 'connected',
            updated_at = datetime('now')
    `);

    try {
        const result = stmt.run(userId, provider, accessToken, refreshToken, scopes, expiresAt);
        return result.changes > 0;
    } catch (err) {
        console.error(`Failed to upsert connection for ${userId}/${provider}:`, err);
        return false;
    }
}

export function getConnection(userId: string, provider: string): Connection | null {
    if (!db) initConnectionsStore();

    const row = db.prepare(`
        SELECT * FROM connections
        WHERE user_id = ? AND provider = ?
    `).get(userId, provider) as Connection | undefined;

    return row || null;
}

export function getUserConnections(userId: string): Connection[] {
    if (!db) initConnectionsStore();

    return db.prepare(`
        SELECT * FROM connections
        WHERE user_id = ?
        ORDER BY updated_at DESC
    `).all(userId) as Connection[];
}

export function revokeConnection(userId: string, provider: string): boolean {
    if (!db) initConnectionsStore();

    const result = db.prepare(`
        UPDATE connections
        SET status = 'revoked', updated_at = datetime('now')
        WHERE user_id = ? AND provider = ?
    `).run(userId, provider);

    return result.changes > 0;
}

export function deleteConnection(userId: string, provider: string): boolean {
    if (!db) initConnectionsStore();

    const result = db.prepare(`
        DELETE FROM connections
        WHERE user_id = ? AND provider = ?
    `).run(userId, provider);

    return result.changes > 0;
}

// ── Cleanup ──────────────────────────────────────────────────────

export function closeConnectionsStore(): void {
    if (db) db.close();
}
