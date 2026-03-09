import { NextRequest, NextResponse } from "next/server";
import { getSession, getUserById, getUserByTelegramId } from "@/lib/auth";
import Database from "better-sqlite3";
import path from "node:path";
import crypto from "node:crypto";

function getDb() {
    const dbPath = path.join(process.cwd(), "..", "data", "users.db");
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
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

// GET — list all edges for the user's tasks
export async function GET(req: NextRequest) {
    const user = getUserFromSession(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = getDb();
    try {
        // Find edges where either the source or target task belongs to the user
        const query = `
            SELECT e.* 
            FROM task_edges e
            JOIN tasks t1 ON e.source_id = t1.id
            JOIN tasks t2 ON e.target_id = t2.id
            WHERE (t1.user_id = ? OR t1.assignee_id = ?)
               OR (t2.user_id = ? OR t2.assignee_id = ?)
        `;
        const edges = db.prepare(query).all(user.id, user.id, user.id, user.id);
        return NextResponse.json({ edges });
    } finally {
        db.close();
    }
}

// POST — create a new edge
export async function POST(req: NextRequest) {
    const user = getUserFromSession(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { source_id, target_id } = body;

    if (!source_id || !target_id) {
        return NextResponse.json({ error: "Source and target IDs are required" }, { status: 400 });
    }

    const db = getDb();
    try {
        // Verify user has access to at least one of these tasks
        const authCheck = db.prepare(`
            SELECT id FROM tasks 
            WHERE id IN (?, ?) 
            AND (user_id = ? OR assignee_id = ?)
        `).get(source_id, target_id, user.id, user.id);

        if (!authCheck) {
            return NextResponse.json({ error: "Unauthorized to link these tasks" }, { status: 403 });
        }

        const id = crypto.randomUUID();
        db.prepare(`
            INSERT INTO task_edges (id, source_id, target_id)
            VALUES (?, ?, ?)
        `).run(id, source_id, target_id);

        const edge = db.prepare("SELECT * FROM task_edges WHERE id = ?").get(id);
        return NextResponse.json({ edge });
    } catch (e: any) {
        if (e.message.includes("UNIQUE constraint failed")) {
            return NextResponse.json({ error: "Edge already exists" }, { status: 400 });
        }
        return NextResponse.json({ error: e.message }, { status: 500 });
    } finally {
        db.close();
    }
}

// DELETE — delete an edge
export async function DELETE(req: NextRequest) {
    const user = getUserFromSession(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "Edge ID is required" }, { status: 400 });

    const db = getDb();
    try {
        // Only delete if user owns one of the connecting tasks
        const result = db.prepare(`
            DELETE FROM task_edges 
            WHERE id = ? AND EXISTS (
                SELECT 1 FROM tasks t 
                WHERE (t.id = task_edges.source_id OR t.id = task_edges.target_id)
                AND (t.user_id = ? OR t.assignee_id = ?)
            )
        `).run(id, user.id, user.id);

        return NextResponse.json({ success: (result as any).changes > 0 });
    } finally {
        db.close();
    }
}
