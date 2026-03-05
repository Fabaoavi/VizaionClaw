import { NextRequest, NextResponse } from "next/server";
import { getSession, getUserById, getUserByTelegramId, isAdmin, getSystemLogs } from "@/lib/auth";

export async function GET(req: NextRequest) {
    try {
        // Admin authorization check
        const sessionId = req.cookies.get("mc_session")?.value;
        if (!sessionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const session = getSession(sessionId);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const user = getUserById(session.userId) || getUserByTelegramId(Number(session.userId));
        if (!user || !user.telegram_id || !isAdmin(user.telegram_id)) {
            return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
        }

        const logs = getSystemLogs(50);
        return NextResponse.json({ logs });
    } catch (err) {
        console.error("Admin Logs fetch error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
