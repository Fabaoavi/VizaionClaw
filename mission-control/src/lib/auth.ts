// ─── Mission Control — Auth Library ──────────────────────────────
// Lightweight SQLite auth client for the Next.js side.
// Reads/writes the same users.db as the agent's auth/store.ts.

import Database from "better-sqlite3";
import crypto from "node:crypto";
import path from "node:path";

// Path to the shared database
const DB_PATH = path.join(process.cwd(), "..", "data", "users.db");

function getDb(): Database.Database {
    const db = new Database(DB_PATH, { readonly: false });
    db.pragma("journal_mode = WAL");
    return db;
}

// ── Types ────────────────────────────────────────────────────────

export interface AuthTokenInfo {
    token: string;
    user_id: string | null;
    telegram_id: number | null;
    type: "register" | "login";
    expires_at: string;
}

export interface UserProfile {
    id: string;
    display_name: string;
    telegram_id: number | null;
    discord_id: string | null;
    whatsapp_phone: string | null;
    email: string | null;
    avatar_url: string | null;
    preferences: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    last_seen_at: string;
    is_active: boolean;
}

export type TwoFAChannel = "telegram" | "discord" | "whatsapp";

export interface PendingUser {
    id: number;
    telegram_id: number;
    first_name: string;
    username: string | null;
    status: "pending" | "approved" | "denied";
    requested_at: string;
    reviewed_at: string | null;
    pending_message_id?: number | null;
}

export interface LogEntry {
    id: number;
    level: "info" | "warn" | "error";
    message: string;
    metadata: string | null;
    created_at: string;
}

// ── Token Operations ─────────────────────────────────────────────

/** Peek at a token without consuming it */
export function peekToken(token: string): AuthTokenInfo | null {
    const db = getDb();
    try {
        const row = db.prepare(`
            SELECT token, user_id, telegram_id, type, expires_at
            FROM auth_tokens
            WHERE token = ? AND used = 0 AND expires_at > datetime('now')
        `).get(token) as Record<string, unknown> | undefined;

        if (!row) return null;

        return {
            token: String(row.token),
            user_id: row.user_id ? String(row.user_id) : null,
            telegram_id: row.telegram_id ? Number(row.telegram_id) : null,
            type: row.type as "register" | "login",
            expires_at: String(row.expires_at),
        };
    } finally {
        db.close();
    }
}

/** Consume a token (mark as used) */
export function consumeToken(token: string): AuthTokenInfo | null {
    const db = getDb();
    try {
        const row = db.prepare(`
            SELECT token, user_id, telegram_id, type, expires_at
            FROM auth_tokens
            WHERE token = ? AND used = 0 AND expires_at > datetime('now')
        `).get(token) as Record<string, unknown> | undefined;

        if (!row) return null;

        db.prepare("UPDATE auth_tokens SET used = 1 WHERE token = ?").run(token);

        return {
            token: String(row.token),
            user_id: row.user_id ? String(row.user_id) : null,
            telegram_id: row.telegram_id ? Number(row.telegram_id) : null,
            type: row.type as "register" | "login",
            expires_at: String(row.expires_at),
        };
    } finally {
        db.close();
    }
}

// ── User Operations ──────────────────────────────────────────────

/** Find a user by any identifier */
export function findUserByAnyId(identifier: string): UserProfile | null {
    const db = getDb();
    try {
        const numId = isNaN(Number(identifier)) ? -1 : Number(identifier);
        const row = db.prepare(`
            SELECT * FROM users WHERE
                id = ? OR
                telegram_id = ? OR
                discord_id = ? OR
                whatsapp_phone = ? OR
                display_name = ?
            LIMIT 1
        `).get(identifier, numId, identifier, identifier, identifier) as Record<string, unknown> | undefined;

        return row ? rowToProfile(row) : null;
    } finally {
        db.close();
    }
}

/** Get user by canonical ID */
export function getUserById(userId: string): UserProfile | null {
    const db = getDb();
    try {
        const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as Record<string, unknown> | undefined;
        return row ? rowToProfile(row) : null;
    } finally {
        db.close();
    }
}

/** Get user by telegram ID */
export function getUserByTelegramId(telegramId: number): UserProfile | null {
    const db = getDb();
    try {
        const row = db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(telegramId) as Record<string, unknown> | undefined;
        return row ? rowToProfile(row) : null;
    } finally {
        db.close();
    }
}

/** Get all registered users */
export function getAllRegisteredUsers(): UserProfile[] {
    const db = getDb();
    try {
        const rows = db.prepare("SELECT * FROM users ORDER BY last_seen_at DESC").all() as Record<string, unknown>[];
        return rows.map(rowToProfile);
    } finally {
        db.close();
    }
}

/** Register a new user */
export function registerUser(data: {
    telegramId: number;
    displayName: string;
    discordId?: string;
    phone?: string;
}): UserProfile {
    const db = getDb();
    try {
        const id = `user_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

        db.prepare(`
            INSERT INTO users (id, display_name, telegram_id, discord_id, whatsapp_phone)
            VALUES (?, ?, ?, ?, ?)
        `).run(id, data.displayName, data.telegramId, data.discordId || null, data.phone || null);

        return getUserById(id)!;
    } finally {
        db.close();
    }
}

/** Set a user as inactive (revoked) */
export function deactivateUser(userId: string): void {
    const db = getDb();
    try {
        db.prepare("UPDATE users SET is_active = 0 WHERE id = ?").run(userId);
    } finally {
        db.close();
    }
}

/** Set a user as active */
export function activateUser(userId: string): void {
    const db = getDb();
    try {
        db.prepare("UPDATE users SET is_active = 1 WHERE id = ?").run(userId);
    } finally {
        db.close();
    }
}

/** Get available 2FA channels for a user */
export function getAvailable2FAChannels(user: UserProfile): TwoFAChannel[] {
    const channels: TwoFAChannel[] = [];
    if (user.telegram_id) channels.push("telegram");
    if (user.discord_id) channels.push("discord");
    if (user.whatsapp_phone) channels.push("whatsapp");
    return channels;
}

// ── 2FA Code Operations ──────────────────────────────────────────

/** Create a 2FA code for a user */
export function createAuthCode(userId: string, channel: TwoFAChannel): string {
    const db = getDb();
    try {
        db.prepare("UPDATE auth_codes SET used = 1 WHERE user_id = ? AND used = 0").run(userId);

        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        db.prepare(`
            INSERT INTO auth_codes (code, user_id, channel, expires_at)
            VALUES (?, ?, ?, ?)
        `).run(code, userId, channel, expiresAt);

        return code;
    } finally {
        db.close();
    }
}

/** Validate a 2FA code */
export function validateAuthCode(userId: string, code: string): boolean {
    const db = getDb();
    try {
        const row = db.prepare(`
            SELECT id FROM auth_codes
            WHERE user_id = ? AND code = ? AND used = 0 AND expires_at > datetime('now')
            ORDER BY created_at DESC LIMIT 1
        `).get(userId, code) as { id: number } | undefined;

        if (!row) return false;

        db.prepare("UPDATE auth_codes SET used = 1 WHERE id = ?").run(row.id);
        return true;
    } finally {
        db.close();
    }
}

// ── Session Operations ───────────────────────────────────────────

/** Create a login session (7-day expiry) */
export function createSession(userId: string): string {
    const db = getDb();
    try {
        const sessionId = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        db.prepare(`
            INSERT INTO sessions (session_id, user_id, expires_at)
            VALUES (?, ?, ?)
        `).run(sessionId, userId, expiresAt);

        return sessionId;
    } finally {
        db.close();
    }
}

/** Validate a session */
export function getSession(sessionId: string): { userId: string } | null {
    const db = getDb();
    try {
        const row = db.prepare(`
            SELECT user_id FROM sessions
            WHERE session_id = ? AND is_active = 1 AND expires_at > datetime('now')
        `).get(sessionId) as { user_id: string } | undefined;

        return row ? { userId: row.user_id } : null;
    } finally {
        db.close();
    }
}

/** Invalidate a session (logout) */
export function invalidateSession(sessionId: string): void {
    const db = getDb();
    try {
        db.prepare("UPDATE sessions SET is_active = 0 WHERE session_id = ?").run(sessionId);
    } finally {
        db.close();
    }
}

/** Invalidate all sessions for a user */
export function invalidateAllSessions(userId: string): void {
    const db = getDb();
    try {
        db.prepare("UPDATE sessions SET is_active = 0 WHERE user_id = ?").run(userId);
    } finally {
        db.close();
    }
}

// ── Admin Utilities ──────────────────────────────────────────────

/** Check if a Telegram ID belongs to an admin */
export function isAdmin(telegramId: number): boolean {
    const allowed = process.env.ALLOWED_USER_IDS || "";
    const adminIds = allowed.split(",").map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
    return adminIds.includes(telegramId);
}

// ── Pending Users (Admin) ────────────────────────────────────────

/** Get all pending users */
export function getPendingUsers(): PendingUser[] {
    const db = getDb();
    try {
        return db.prepare(
            "SELECT * FROM pending_users WHERE status = 'pending' ORDER BY requested_at ASC"
        ).all() as PendingUser[];
    } finally {
        db.close();
    }
}

/** Get all users in the approval queue (all statuses) */
export function getAllPendingUsers(): PendingUser[] {
    const db = getDb();
    try {
        return db.prepare(
            "SELECT * FROM pending_users ORDER BY requested_at DESC"
        ).all() as PendingUser[];
    } finally {
        db.close();
    }
}

/** Approve a pending user */
export function approvePendingUser(telegramId: number): boolean {
    const db = getDb();
    try {
        const result = db.prepare(
            "UPDATE pending_users SET status = 'approved', reviewed_at = datetime('now') WHERE telegram_id = ? AND status = 'pending'"
        ).run(telegramId);
        return result.changes > 0;
    } finally {
        db.close();
    }
}

/** Deny a pending user */
export function denyPendingUser(telegramId: number): boolean {
    const db = getDb();
    try {
        const result = db.prepare(
            "UPDATE pending_users SET status = 'denied', reviewed_at = datetime('now') WHERE telegram_id = ? AND status = 'pending'"
        ).run(telegramId);
        return result.changes > 0;
    } finally {
        db.close();
    }
}

/** Revoke a user's approval/denial (move back to pending) */
export function revokePendingUser(telegramId: number): boolean {
    const db = getDb();
    try {
        const result = db.prepare(
            "UPDATE pending_users SET status = 'pending', reviewed_at = NULL WHERE telegram_id = ?"
        ).run(telegramId);
        return result.changes > 0;
    } finally {
        db.close();
    }
}

/** Create an auth token (for admin-triggered registration links) */
export function createAuthTokenFromMC(type: "register" | "login", opts: { userId?: string; telegramId?: number }): string {
    const db = getDb();
    try {
        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        db.prepare(`
            INSERT INTO auth_tokens (token, user_id, telegram_id, type, expires_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(token, opts.userId || null, opts.telegramId || null, type, expiresAt);

        return token;
    } finally {
        db.close();
    }
}

// ── Helpers ──────────────────────────────────────────────────────

function rowToProfile(row: Record<string, unknown>): UserProfile {
    return {
        id: String(row.id),
        display_name: String(row.display_name || "User"),
        telegram_id: row.telegram_id ? Number(row.telegram_id) : null,
        discord_id: row.discord_id ? String(row.discord_id) : null,
        whatsapp_phone: row.whatsapp_phone ? String(row.whatsapp_phone) : null,
        email: row.email ? String(row.email) : null,
        avatar_url: row.avatar_url ? String(row.avatar_url) : null,
        preferences: row.preferences ? JSON.parse(String(row.preferences)) : {},
        created_at: String(row.created_at || ""),
        updated_at: String(row.updated_at || ""),
        last_seen_at: String(row.last_seen_at || ""),
        is_active: row.is_active === 1 || row.is_active === true,
    };
}

// ── System Logs ──────────────────────────────────────────────────

export function getSystemLogs(limit = 100): LogEntry[] {
    const db = getDb();
    try {
        return db.prepare(
            "SELECT * FROM system_logs ORDER BY created_at DESC LIMIT ?"
        ).all(limit) as LogEntry[];
    } catch (e) {
        return [];
    } finally {
        db.close();
    }
}

/**
 * Get aggregated LLM usage stats per user based on system logs.
 */
export function getUsageStatsByUser(): { user: string; userName: string; model: string; cost: number; tokens: number }[] {
    const db = getDb();
    try {
        // First, build a userId -> display_name lookup from the users table
        const allUsers = db.prepare("SELECT id, display_name FROM users").all() as { id: string; display_name: string }[];
        const nameMap: Record<string, string> = {};
        for (const u of allUsers) {
            nameMap[u.id] = u.display_name || 'User';
        }

        const logs = db.prepare(
            "SELECT message, metadata FROM system_logs WHERE message LIKE 'Replied to%'"
        ).all() as { message: string; metadata: string }[];

        const usageMap: Record<string, { userName: string; model: string; cost: number; tokens: number }> = {};

        for (const log of logs) {
            try {
                if (!log.metadata) continue;
                const meta = JSON.parse(log.metadata);
                if (!meta.model) continue;

                // Get the user ID — use canonicalUserId, fall back to telegramId
                const uid = meta.canonicalUserId || meta.telegramId || 'unknown';
                const key = `${uid}_${meta.model}`;

                // Resolve the display name: from users table, from metadata, from log message
                let displayName = nameMap[uid] || meta.userName || '';
                if (!displayName && log.message.startsWith('Replied to ')) {
                    displayName = log.message.replace('Replied to ', '').trim();
                }
                if (!displayName) displayName = `ID: ${uid}`;

                if (!usageMap[key]) {
                    usageMap[key] = { userName: displayName, model: meta.model, cost: 0, tokens: 0 };
                }
                usageMap[key].cost += Number(meta.cost || 0);
                usageMap[key].tokens += Number(meta.tokens || 0);
            } catch (e) { /* ignore parse error */ }
        }

        return Object.entries(usageMap).map(([key, data]) => {
            const uid = key.substring(0, key.lastIndexOf('_'));
            return { user: uid, ...data };
        });
    } catch (e) {
        return [];
    } finally {
        db.close();
    }
}


