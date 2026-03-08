// GET/POST/PATCH/DELETE /api/tasks — User task management
import { NextRequest, NextResponse } from "next/server";
import { getSession, getUserById, getUserByTelegramId } from "@/lib/auth";
import Database from "better-sqlite3";
import path from "node:path";
import crypto from "node:crypto";

function getDb() {
    const dbPath = path.join(process.cwd(), "..", "data", "users.db");
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");

    // Ensure tables exist
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
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            user_id TEXT NOT NULL,
            assignee_id TEXT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            priority TEXT DEFAULT 'medium',
            status TEXT DEFAULT 'todo',
            due_date TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            completed_at TEXT,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS reminders (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            task_id TEXT,
            message TEXT NOT NULL,
            trigger_at TEXT NOT NULL,
            sent INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );
    `);

    try {
        db.exec("ALTER TABLE tasks ADD COLUMN assignee_id TEXT;");
    } catch (e) { /* ignore, column already exists */ }

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

// GET — list tasks for current user
export async function GET(req: NextRequest) {
    const user = getUserFromSession(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = getDb();
    try {
        const { searchParams } = new URL(req.url);
        const status = searchParams.get("status");
        const projectId = searchParams.get("project_id");

        let query = `
            SELECT t.*, p.name as project_name, p.color as project_color,
                   u1.display_name as creator_name,
                   u2.display_name as assignee_name
            FROM tasks t 
            LEFT JOIN projects p ON t.project_id = p.id
            LEFT JOIN users u1 ON t.user_id = u1.id
            LEFT JOIN users u2 ON t.assignee_id = u2.id
            WHERE t.user_id = ? OR t.assignee_id = ?
        `;
        const params: unknown[] = [user.id, user.id];

        if (status) { query += " AND t.status = ?"; params.push(status); }
        if (projectId) { query += " AND t.project_id = ?"; params.push(projectId); }

        query += " ORDER BY CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, t.created_at DESC";

        const tasks = db.prepare(query).all(...params);
        return NextResponse.json({ tasks, currentUser: user.id });
    } finally {
        db.close();
    }
}

// POST — create a new task
export async function POST(req: NextRequest) {
    const user = getUserFromSession(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { title, description, priority, due_date, project_id, assignee_id } = body;

    if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

    const db = getDb();
    try {
        const id = crypto.randomUUID();
        db.prepare(`
            INSERT INTO tasks (id, project_id, user_id, assignee_id, title, description, priority, due_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, project_id || null, user.id, assignee_id || null, title, description || "", priority || "medium", due_date || null);

        const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
        return NextResponse.json({ task });
    } finally {
        db.close();
    }
}

// PATCH — update a task
export async function PATCH(req: NextRequest) {
    const user = getUserFromSession(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { id, title, description, priority, status, due_date, project_id } = body;

    if (!id) return NextResponse.json({ error: "Task ID is required" }, { status: 400 });

    const db = getDb();
    try {
        const fields: string[] = [];
        const values: unknown[] = [];

        if (title !== undefined) { fields.push("title = ?"); values.push(title); }
        if (description !== undefined) { fields.push("description = ?"); values.push(description); }
        if (priority !== undefined) { fields.push("priority = ?"); values.push(priority); }
        if (status !== undefined) {
            fields.push("status = ?"); values.push(status);
            if (status === "done") fields.push("completed_at = datetime('now')");
            else fields.push("completed_at = NULL");
        }
        if (due_date !== undefined) { fields.push("due_date = ?"); values.push(due_date); }
        if (project_id !== undefined) { fields.push("project_id = ?"); values.push(project_id); }

        if (fields.length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });
        fields.push("updated_at = datetime('now')");
        values.push(id, user.id, user.id);

        db.prepare(`UPDATE tasks SET ${fields.join(", ")} WHERE id = ? AND (user_id = ? OR assignee_id = ?)`).run(...values);
        const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
        return NextResponse.json({ task });
    } finally {
        db.close();
    }
}

// DELETE — delete a task
export async function DELETE(req: NextRequest) {
    const user = getUserFromSession(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Task ID is required" }, { status: 400 });

    const db = getDb();
    try {
        const result = db.prepare("DELETE FROM tasks WHERE id = ? AND (user_id = ? OR assignee_id = ?)").run(id, user.id, user.id);
        return NextResponse.json({ success: (result as any).changes > 0 });
    } finally {
        db.close();
    }
}
