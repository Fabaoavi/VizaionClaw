// GET /api/tasks/stats — Task statistics for Command Center
import { NextRequest, NextResponse } from "next/server";
import { getSession, getUserById, getUserByTelegramId } from "@/lib/auth";
import Database from "better-sqlite3";
import path from "node:path";

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

export async function GET(req: NextRequest) {
    const user = getUserFromSession(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = getDb();
    try {
        const now = new Date().toISOString();

        // Counts
        const total = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ?").get(user.id) as any)?.c || 0;
        const todo = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND status = 'todo'").get(user.id) as any)?.c || 0;
        const progress = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND status = 'progress'").get(user.id) as any)?.c || 0;
        const done = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND status = 'done'").get(user.id) as any)?.c || 0;
        const overdue = (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND due_date < ? AND status != 'done'").get(user.id, now) as any)?.c || 0;

        // Upcoming (next 5 with due dates)
        const upcoming = db.prepare(
            "SELECT * FROM tasks WHERE user_id = ? AND due_date IS NOT NULL AND status != 'done' ORDER BY due_date ASC LIMIT 5"
        ).all(user.id);

        // Recently completed (last 5)
        const recentlyCompleted = db.prepare(
            "SELECT * FROM tasks WHERE user_id = ? AND status = 'done' ORDER BY completed_at DESC LIMIT 5"
        ).all(user.id);

        // In-progress tasks (for command center widget)
        const inProgress = db.prepare(
            "SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE t.user_id = ? AND t.status = 'progress' ORDER BY t.updated_at DESC LIMIT 5"
        ).all(user.id);

        // Projects count
        const projectCount = (db.prepare("SELECT COUNT(*) as c FROM projects WHERE user_id = ?").get(user.id) as any)?.c || 0;

        return NextResponse.json({
            total, todo, progress, done, overdue,
            upcoming, recentlyCompleted, inProgress,
            projectCount,
        });
    } catch (e) {
        return NextResponse.json({ total: 0, todo: 0, progress: 0, done: 0, overdue: 0, upcoming: [], recentlyCompleted: [], inProgress: [], projectCount: 0 });
    } finally {
        db.close();
    }
}
