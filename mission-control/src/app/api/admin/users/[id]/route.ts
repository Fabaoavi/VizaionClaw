import { NextRequest, NextResponse } from "next/server";
import { getSession, getUserByTelegramId, isAdmin } from "@/lib/auth";
import Database from "better-sqlite3";
import path from "node:path";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const sessionId = req.cookies.get("mc_session")?.value;
        if (!sessionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const session = getSession(sessionId);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const adminUser = getUserByTelegramId(Number(session.userId)) || require('@/lib/auth').getUserById(session.userId);
        if (!adminUser || !adminUser.telegram_id || !isAdmin(adminUser.telegram_id)) {
            return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
        }

        const paramsAwaited = await params;
        const telegramId = paramsAwaited.id;
        const user = getUserByTelegramId(Number(telegramId));

        let logs: any[] = [];
        let memories: any[] = [];

        // Fetch from memory.db
        try {
            const memoryDbPath = path.join(process.cwd(), "..", "data", "memory.db");
            const memDb = new Database(memoryDbPath, { readonly: true });

            // Fetch conversations (session_id is usually session_telegramId_timestamp)
            logs = memDb.prepare(`
                SELECT role, content, created_at 
                FROM conversations 
                WHERE session_id LIKE ? 
                ORDER BY created_at DESC 
                LIMIT 50
            `).all(`%${telegramId}%`);

            // Fetch memories (metadata contains canonical userId)
            if (user?.id) {
                memories = memDb.prepare(`
                    SELECT id, type, category, content, importance, created_at
                    FROM memories
                    WHERE metadata LIKE ?
                    ORDER BY importance DESC, created_at DESC
                    LIMIT 20
                `).all(`%${user.id}%`);
            } else {
                console.log("API /users/[id] returned null user for TG:", telegramId);
            }

            memDb.close();
        } catch (err) {
            console.warn("Could not fetch memory.db logs/memories:", err);
        }

        return NextResponse.json({ user, logs, memories });
    } catch (err) {
        console.error("User details error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
