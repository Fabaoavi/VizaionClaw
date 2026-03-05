// GET /api/admin/users — Get all pending users and registered users
import { NextResponse } from "next/server";
import { getPendingUsers, getAllPendingUsers, getAllRegisteredUsers, getSession, getUserById, getUserByTelegramId, isAdmin } from "@/lib/auth";

export async function GET(req: Request) {
    try {
        // Admin authorization check
        const cookieStr = req.headers.get("cookie") || "";
        const match = cookieStr.match(/mc_session=([^;]+)/);
        const sessionId = match ? match[1] : null;

        if (!sessionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const session = getSession(sessionId);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const user = getUserById(session.userId) || getUserByTelegramId(Number(session.userId));
        if (!user || !user.telegram_id || !isAdmin(user.telegram_id)) {
            return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
        }

        const pending = getPendingUsers();
        const allRequests = getAllPendingUsers();
        const registered = getAllRegisteredUsers();

        return NextResponse.json({
            pending,
            allRequests,
            registered,
            counts: {
                pending: pending.length,
                total: allRequests.length,
                registered: registered.length,
            },
        });
    } catch (err) {
        console.error("Admin users error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
