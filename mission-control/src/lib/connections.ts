// ─── Mission Control — Connections Library ─────────────────────────
// Lightweight SQLite client for the Connections Manager on the Next.js side.
// Reads/writes the same users.db as the agent's connections/store.ts.

import Database from "better-sqlite3";
import path from "node:path";

// Path to the shared database
const DB_PATH = path.join(process.cwd(), "..", "data", "users.db");

function getDb(): Database.Database {
    const db = new Database(DB_PATH, { readonly: false });
    db.pragma("journal_mode = WAL");
    return db;
}

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

// ── Connections Operations ─────────────────────────────────────────────

export function getUserConnections(userId: string): Connection[] {
    const db = getDb();
    try {
        const rows = db.prepare(`
            SELECT * FROM connections
            WHERE user_id = ?
            ORDER BY updated_at DESC
        `).all(userId) as Connection[];
        return rows;
    } catch (e) {
        return [];
    } finally {
        db.close();
    }
}

export function upsertConnection(
    userId: string,
    provider: string,
    accessToken: string,
    refreshToken: string | null,
    scopes: string,
    expiresInMs?: number
): boolean {
    const db = getDb();
    try {
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

        const result = stmt.run(userId, provider, accessToken, refreshToken, scopes, expiresAt);
        return result.changes > 0;
    } catch (err) {
        console.error(`Failed to upsert connection for ${userId}/${provider}:`, err);
        return false;
    } finally {
        db.close();
    }
}

export function deleteConnection(userId: string, provider: string): boolean {
    const db = getDb();
    try {
        const result = db.prepare(`
            DELETE FROM connections
            WHERE user_id = ? AND provider = ?
            `).run(userId, provider);
        return result.changes > 0;
    } catch (e) {
        return false;
    } finally {
        db.close();
    }
}
