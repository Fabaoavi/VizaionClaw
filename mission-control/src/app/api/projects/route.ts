// GET/POST /api/projects — User project management
import { NextRequest, NextResponse } from "next/server";
import { getSession, getUserById, getUserByTelegramId } from "@/lib/auth";
import Database from "better-sqlite3";
import path from "node:path";
import crypto from "node:crypto";

function getDb() {
    const dbPath = path.join(process.cwd(), "..", "data", "users.db");
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            color TEXT DEFAULT '#F5A623',
            status TEXT DEFAULT 'active',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
    `);
    return db;
}

function getUserFromSession(req: NextRequest): { id: string } | null {
    const sessionId = req.cookies.get("mc_session")?.value;
    if (!sessionId) return null;
    const session = getSession(sessionId);
    if (!session) return null;
    const user = getUserById(session.userId) || getUserByTelegramId(Number(session.userId));
    return user ? { id: user.id } : null;
}

// GET — list projects
export async function GET(req: NextRequest) {
    const user = getUserFromSession(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = getDb();
    try {
        const projects = db.prepare(
            "SELECT p.*, (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count FROM projects p WHERE p.user_id = ? ORDER BY p.created_at DESC"
        ).all(user.id);
        return NextResponse.json({ projects });
    } finally {
        db.close();
    }
}

// POST — create project
export async function POST(req: NextRequest) {
    const user = getUserFromSession(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { name, description, color } = body;
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const db = getDb();
    try {
        const id = crypto.randomUUID();
        db.prepare(`
            INSERT INTO projects (id, user_id, name, description, color)
            VALUES (?, ?, ?, ?, ?)
        `).run(id, user.id, name, description || "", color || "#F5A623");

        const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
        return NextResponse.json({ project });
    } finally {
        db.close();
    }
}
