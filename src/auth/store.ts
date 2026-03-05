// ── Gravity Claw — Auth Store ──────────────────────────────────
// SQLite-backed auth: one-time tokens, 2FA codes, sessions, and pending user approvals.
// Shares the users.db database with identity.ts.

import Database from "better-sqlite3";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";

let db: Database.Database;

// ── Types ────────────────────────────────────────────────────────

export interface AuthToken {
    token: string;
    user_id: string | null;
    telegram_id: number | null;
    type: "register" | "login";
    expires_at: string;
    used: boolean;
}

export interface AuthCode {
    code: string;
    user_id: string;
    channel: "telegram" | "discord" | "whatsapp";
    expires_at: string;
    used: boolean;
}

export interface Session {
    session_id: string;
    user_id: string;
    created_at: string;
    expires_at: string;
    is_active: boolean;
}

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

// ── Init ─────────────────────────────────────────────────────────

export function initAuthStore(dbPath?: string): void {
    const resolvedPath = dbPath || path.join(process.cwd(), "data", "users.db");
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

    db = new Database(resolvedPath);
    db.pragma("journal_mode = WAL");

    db.exec(`
        CREATE TABLE IF NOT EXISTS auth_tokens (
            token TEXT PRIMARY KEY,
            user_id TEXT,
            telegram_id INTEGER,
            type TEXT NOT NULL CHECK(type IN ('register', 'login')),
            expires_at TEXT NOT NULL,
            used INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS auth_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL,
            user_id TEXT NOT NULL,
            channel TEXT NOT NULL CHECK(channel IN ('telegram', 'discord', 'whatsapp')),
            expires_at TEXT NOT NULL,
            used INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            expires_at TEXT NOT NULL,
            is_active INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS pending_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id INTEGER UNIQUE NOT NULL,
            first_name TEXT NOT NULL DEFAULT 'User',
            username TEXT,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'denied')),
            requested_at TEXT DEFAULT (datetime('now')),
            reviewed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens(expires_at);
        CREATE INDEX IF NOT EXISTS idx_auth_codes_user ON auth_codes(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_pending_users_status ON pending_users(status);
        CREATE INDEX IF NOT EXISTS idx_pending_users_status ON pending_users(status);

        CREATE TABLE IF NOT EXISTS system_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            level TEXT NOT NULL CHECK(level IN ('info', 'warn', 'error')),
            message TEXT NOT NULL,
            metadata TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_system_logs_created ON system_logs(created_at);
    `);

    try {
        db.exec("ALTER TABLE pending_users ADD COLUMN pending_message_id INTEGER");
    } catch (e) {
        // Ignore if column already exists
    }

    // Clean up expired entries on init
    db.exec(`
        DELETE FROM auth_tokens WHERE expires_at < datetime('now');
        DELETE FROM auth_codes WHERE expires_at < datetime('now');
        UPDATE sessions SET is_active = 0 WHERE expires_at < datetime('now');
    `);

    console.log("✅ Auth store ready");
}

// ── Tokens (one-time URL links) ──────────────────────────────────

export function createAuthToken(
    type: "register" | "login",
    opts: { userId?: string; telegramId?: number }
): string {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    db.prepare(`
        INSERT INTO auth_tokens (token, user_id, telegram_id, type, expires_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(token, opts.userId || null, opts.telegramId || null, type, expiresAt);

    return token;
}

export function validateAuthToken(token: string): AuthToken | null {
    const row = db.prepare(`
        SELECT * FROM auth_tokens
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
        used: true,
    };
}

export function peekAuthToken(token: string): AuthToken | null {
    const row = db.prepare(`
        SELECT * FROM auth_tokens
        WHERE token = ? AND used = 0 AND expires_at > datetime('now')
    `).get(token) as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
        token: String(row.token),
        user_id: row.user_id ? String(row.user_id) : null,
        telegram_id: row.telegram_id ? Number(row.telegram_id) : null,
        type: row.type as "register" | "login",
        expires_at: String(row.expires_at),
        used: row.used === 1,
    };
}

// ── 2FA Codes ────────────────────────────────────────────────────

export function createAuthCode(userId: string, channel: "telegram" | "discord" | "whatsapp"): string {
    db.prepare("UPDATE auth_codes SET used = 1 WHERE user_id = ? AND used = 0").run(userId);

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    db.prepare(`
        INSERT INTO auth_codes (code, user_id, channel, expires_at)
        VALUES (?, ?, ?, ?)
    `).run(code, userId, channel, expiresAt);

    return code;
}

export function validateAuthCode(userId: string, code: string): boolean {
    const row = db.prepare(`
        SELECT id FROM auth_codes
        WHERE user_id = ? AND code = ? AND used = 0 AND expires_at > datetime('now')
        ORDER BY created_at DESC LIMIT 1
    `).get(userId, code) as { id: number } | undefined;

    if (!row) return false;

    db.prepare("UPDATE auth_codes SET used = 1 WHERE id = ?").run(row.id);
    return true;
}

// ── Sessions ─────────────────────────────────────────────────────

export function createSession(userId: string): string {
    const sessionId = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
        INSERT INTO sessions (session_id, user_id, expires_at)
        VALUES (?, ?, ?)
    `).run(sessionId, userId, expiresAt);

    return sessionId;
}

export function getSession(sessionId: string): { userId: string; expiresAt: string } | null {
    const row = db.prepare(`
        SELECT user_id, expires_at FROM sessions
        WHERE session_id = ? AND is_active = 1 AND expires_at > datetime('now')
    `).get(sessionId) as { user_id: string; expires_at: string } | undefined;

    if (!row) return null;

    return { userId: row.user_id, expiresAt: row.expires_at };
}

export function invalidateSession(sessionId: string): void {
    db.prepare("UPDATE sessions SET is_active = 0 WHERE session_id = ?").run(sessionId);
}

export function invalidateAllSessions(userId: string): void {
    db.prepare("UPDATE sessions SET is_active = 0 WHERE user_id = ?").run(userId);
}

// ── Pending Users (approval queue) ───────────────────────────────

/**
 * Add a user to the pending approval queue. Returns false if already pending/approved.
 */
export function addPendingUser(telegramId: number, firstName: string, username?: string): "added" | "already_pending" | "already_approved" | "denied" {
    const existing = db.prepare(
        "SELECT status FROM pending_users WHERE telegram_id = ?"
    ).get(telegramId) as { status: string } | undefined;

    if (existing) {
        return existing.status === "pending" ? "already_pending"
            : existing.status === "approved" ? "already_approved"
                : "denied";
    }

    db.prepare(`
        INSERT INTO pending_users (telegram_id, first_name, username)
        VALUES (?, ?, ?)
    `).run(telegramId, firstName, username || null);

    return "added";
}

/**
 * Save the Telegram message ID of the 'pending analysis' message.
 */
export function setPendingMessageId(telegramId: number, messageId: number): void {
    if (!db) initAuthStore();
    db.prepare(
        "UPDATE pending_users SET pending_message_id = ? WHERE telegram_id = ?"
    ).run(messageId, telegramId);
}

/**
 * Get all pending users awaiting approval.
 */
export function getPendingUsers(): PendingUser[] {
    return db.prepare(
        "SELECT * FROM pending_users WHERE status = 'pending' ORDER BY requested_at ASC"
    ).all() as PendingUser[];
}

/**
 * Get all users (pending, approved, denied).
 */
export function getAllPendingUsers(): PendingUser[] {
    return db.prepare(
        "SELECT * FROM pending_users ORDER BY requested_at DESC"
    ).all() as PendingUser[];
}

/**
 * Approve a pending user.
 */
export function approvePendingUser(telegramId: number): boolean {
    const result = db.prepare(
        "UPDATE pending_users SET status = 'approved', reviewed_at = datetime('now') WHERE telegram_id = ? AND status = 'pending'"
    ).run(telegramId);
    return result.changes > 0;
}

/**
 * Deny a pending user.
 */
export function denyPendingUser(telegramId: number): boolean {
    const result = db.prepare(
        "UPDATE pending_users SET status = 'denied', reviewed_at = datetime('now') WHERE telegram_id = ? AND status = 'pending'"
    ).run(telegramId);
    return result.changes > 0;
}

/**
 * Check if a telegram user is approved.
 */
export function isUserApproved(telegramId: number): boolean {
    const row = db.prepare(
        "SELECT status FROM pending_users WHERE telegram_id = ?"
    ).get(telegramId) as { status: string } | undefined;
    return row?.status === "approved";
}

/**
 * Revoke a user's approval/denial, moving them back to pending.
 */
export function revokePendingUser(telegramId: number): boolean {
    const result = db.prepare(
        "UPDATE pending_users SET status = 'pending', reviewed_at = NULL WHERE telegram_id = ?"
    ).run(telegramId);
    return result.changes > 0;
}

/**
 * Revert approvals that are > 10 mins old where the user hasn't registered.
 * Returns the list of telegram IDs that were reverted.
 */
export function revertExpiredApprovals(): number[] {
    const expiredRows = db.prepare(`
        SELECT telegram_id FROM pending_users
        WHERE status = 'approved'
          AND reviewed_at < datetime('now', '-10 minutes')
          AND telegram_id NOT IN (SELECT telegram_id FROM users WHERE telegram_id IS NOT NULL)
    `).all() as { telegram_id: number }[];

    if (expiredRows.length === 0) return [];

    const ids = expiredRows.map(r => r.telegram_id);
    const placeholders = ids.map(() => '?').join(',');

    db.prepare(`
        UPDATE pending_users
        SET status = 'pending', reviewed_at = NULL
        WHERE telegram_id IN (${placeholders})
    `).run(...ids);

    return ids;
}

// ── Cleanup ──────────────────────────────────────────────────────

export function closeAuthStore(): void {
    if (db) db.close();
}

// ── System Logs ──────────────────────────────────────────────────

/**
 * Add a generic system log entry.
 */
export function addSystemLog(level: "info" | "warn" | "error", message: string, metadata?: Record<string, unknown>): void {
    if (!db) initAuthStore();
    try {
        db.prepare(`
            INSERT INTO system_logs (level, message, metadata)
            VALUES (?, ?, ?)
        `).run(level, message, metadata ? JSON.stringify(metadata) : null);
    } catch (e) {
        console.error("Failed to write system log:", e);
    }
}

/**
 * Get recent system logs.
 */
export function getSystemLogs(limit = 50): LogEntry[] {
    if (!db) initAuthStore();
    try {
        return db.prepare(
            "SELECT * FROM system_logs ORDER BY created_at DESC LIMIT ?"
        ).all(limit) as LogEntry[];
    } catch (e) {
        return [];
    }
}
