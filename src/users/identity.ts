// ─── Gravity Claw — User Identity System ────────────────────────
// Unified user profiles that map platform identifiers (Telegram ID,
// Discord nickname, WhatsApp phone) to a single canonical user_id.
// Designed to be dashboard-ready.

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

let db: Database.Database;

// ── Types ────────────────────────────────────────────────────────

export interface UserProfile {
    id: string;              // Canonical UUID e.g. "user_abc123"
    display_name: string;    // Friendly display name
    telegram_id: number | null;
    discord_id: string | null;    // Discord user ID or nickname
    whatsapp_phone: string | null;
    email: string | null;         // For future dashboard login
    avatar_url: string | null;
    preferences: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    last_seen_at: string;
    is_active: boolean;
}

export type PlatformType = "telegram" | "discord" | "whatsapp";

// ── Init ─────────────────────────────────────────────────────────

export function initUserDB(dbPath?: string): void {
    const resolvedPath = dbPath || path.join(process.cwd(), "data", "users.db");
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

    db = new Database(resolvedPath);
    db.pragma("journal_mode = WAL");

    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            display_name TEXT NOT NULL DEFAULT 'User',
            telegram_id INTEGER UNIQUE,
            discord_id TEXT UNIQUE,
            whatsapp_phone TEXT UNIQUE,
            email TEXT UNIQUE,
            avatar_url TEXT,
            preferences TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            last_seen_at TEXT DEFAULT (datetime('now')),
            is_active INTEGER DEFAULT 1
        );

        CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_id);
        CREATE INDEX IF NOT EXISTS idx_users_discord ON users(discord_id);
        CREATE INDEX IF NOT EXISTS idx_users_whatsapp ON users(whatsapp_phone);
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);

    console.log("✅ User identity database ready");
}

// ── Resolve / Auto-Create ────────────────────────────────────────

function generateUserId(): string {
    return `user_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Resolve a platform-specific ID to a canonical user_id.
 * If the user doesn't exist yet, auto-creates a profile.
 */
export function resolveUser(
    platform: PlatformType,
    platformId: string | number,
    displayName?: string
): UserProfile {
    const column = platformColumnMap[platform];
    const value = platform === "telegram" ? Number(platformId) : String(platformId);

    // Look up by platform ID
    const existing = db.prepare(
        `SELECT * FROM users WHERE ${column} = ?`
    ).get(value) as Record<string, unknown> | undefined;

    if (existing) {
        // Update last_seen
        db.prepare(`UPDATE users SET last_seen_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
            .run(existing.id);

        // Update display name if provided and different
        if (displayName && displayName !== existing.display_name) {
            db.prepare(`UPDATE users SET display_name = ? WHERE id = ?`).run(displayName, existing.id);
            existing.display_name = displayName;
        }

        return rowToProfile(existing);
    }

    // Auto-create new user
    const id = generateUserId();
    const name = displayName || `${platform}_${platformId}`;

    const insertFields: Record<string, unknown> = {
        id,
        display_name: name,
        [column]: value,
    };

    const columns = Object.keys(insertFields).join(", ");
    const placeholders = Object.keys(insertFields).map(() => "?").join(", ");

    db.prepare(`INSERT INTO users (${columns}) VALUES (${placeholders})`)
        .run(...Object.values(insertFields));

    console.log(`🆕 New user created: ${name} (${platform}: ${platformId}) → ${id}`);

    return resolveUser(platform, platformId); // Re-fetch to get full row
}

/**
 * Get a user's canonical ID from a platform-specific ID.
 * Returns null if user doesn't exist (use resolveUser to auto-create).
 */
export function getUserId(platform: PlatformType, platformId: string | number): string | null {
    const column = platformColumnMap[platform];
    const value = platform === "telegram" ? Number(platformId) : String(platformId);

    const row = db.prepare(
        `SELECT id FROM users WHERE ${column} = ?`
    ).get(value) as { id: string } | undefined;

    return row?.id || null;
}

/**
 * Get a user profile by canonical user_id.
 */
export function getUserProfile(userId: string): UserProfile | null {
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as Record<string, unknown> | undefined;
    return row ? rowToProfile(row) : null;
}

// ── Link Platforms ───────────────────────────────────────────────

/**
 * Link a new platform identity to an existing user.
 * Useful when a user later connects Discord or WhatsApp.
 */
export function linkPlatform(
    userId: string,
    platform: PlatformType,
    platformId: string | number
): boolean {
    const column = platformColumnMap[platform];
    const value = platform === "telegram" ? Number(platformId) : String(platformId);

    try {
        db.prepare(`UPDATE users SET ${column} = ?, updated_at = datetime('now') WHERE id = ?`)
            .run(value, userId);
        return true;
    } catch (err) {
        console.warn(`⚠️ Failed to link ${platform}:${platformId} to user ${userId}:`, err);
        return false;
    }
}

// ── Update Profile ───────────────────────────────────────────────

export function updateUserProfile(
    userId: string,
    updates: Partial<Pick<UserProfile, "display_name" | "email" | "avatar_url" | "preferences" | "is_active">>
): boolean {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.display_name !== undefined) {
        fields.push("display_name = ?");
        values.push(updates.display_name);
    }
    if (updates.email !== undefined) {
        fields.push("email = ?");
        values.push(updates.email);
    }
    if (updates.avatar_url !== undefined) {
        fields.push("avatar_url = ?");
        values.push(updates.avatar_url);
    }
    if (updates.preferences !== undefined) {
        fields.push("preferences = ?");
        values.push(JSON.stringify(updates.preferences));
    }
    if (updates.is_active !== undefined) {
        fields.push("is_active = ?");
        values.push(updates.is_active ? 1 : 0);
    }

    if (fields.length === 0) return false;

    fields.push("updated_at = datetime('now')");
    values.push(userId);

    db.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return true;
}

// ── List / Search ────────────────────────────────────────────────

export function listUsers(limit = 50, offset = 0): UserProfile[] {
    const rows = db.prepare(
        "SELECT * FROM users WHERE is_active = 1 ORDER BY last_seen_at DESC LIMIT ? OFFSET ?"
    ).all(limit, offset) as Record<string, unknown>[];

    return rows.map(rowToProfile);
}

export function getUserCount(): number {
    const row = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
    return row.count;
}

/**
 * Search users by name or platform ID.
 */
export function searchUsers(query: string): UserProfile[] {
    const rows = db.prepare(
        `SELECT * FROM users WHERE
            display_name LIKE ? OR
            telegram_id = ? OR
            discord_id LIKE ? OR
            whatsapp_phone LIKE ? OR
            email LIKE ?
        LIMIT 20`
    ).all(
        `%${query}%`,
        isNaN(Number(query)) ? -1 : Number(query),
        `%${query}%`,
        `%${query}%`,
        `%${query}%`
    ) as Record<string, unknown>[];

    return rows.map(rowToProfile);
}

// ── Dashboard-Ready Stats ────────────────────────────────────────

export interface UserStats {
    totalUsers: number;
    activeToday: number;
    activeThisWeek: number;
    platformBreakdown: {
        telegram: number;
        discord: number;
        whatsapp: number;
    };
}

export function getUserStats(): UserStats {
    const total = (db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number }).c;
    const today = (db.prepare("SELECT COUNT(*) as c FROM users WHERE last_seen_at >= datetime('now', '-1 day')").get() as { c: number }).c;
    const week = (db.prepare("SELECT COUNT(*) as c FROM users WHERE last_seen_at >= datetime('now', '-7 days')").get() as { c: number }).c;
    const tg = (db.prepare("SELECT COUNT(*) as c FROM users WHERE telegram_id IS NOT NULL").get() as { c: number }).c;
    const dc = (db.prepare("SELECT COUNT(*) as c FROM users WHERE discord_id IS NOT NULL").get() as { c: number }).c;
    const wa = (db.prepare("SELECT COUNT(*) as c FROM users WHERE whatsapp_phone IS NOT NULL").get() as { c: number }).c;

    return {
        totalUsers: total,
        activeToday: today,
        activeThisWeek: week,
        platformBreakdown: { telegram: tg, discord: dc, whatsapp: wa },
    };
}

// ── Helpers ──────────────────────────────────────────────────────

const platformColumnMap: Record<PlatformType, string> = {
    telegram: "telegram_id",
    discord: "discord_id",
    whatsapp: "whatsapp_phone",
};

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

export function closeUserDB(): void {
    if (db) db.close();
}
