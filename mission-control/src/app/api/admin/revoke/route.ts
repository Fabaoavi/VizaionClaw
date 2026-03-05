// POST /api/admin/revoke — Move a user from approved/denied back to pending
import { NextRequest, NextResponse } from "next/server";
import { revokePendingUser, getSession, getUserById, getUserByTelegramId, invalidateAllSessions, isAdmin, deactivateUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
    try {
        // Admin authorization check
        const sessionId = req.cookies.get("mc_session")?.value;
        if (!sessionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const session = getSession(sessionId);
        if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const adminUser = getUserById(session.userId) || getUserByTelegramId(Number(session.userId));
        if (!adminUser || !adminUser.telegram_id || !isAdmin(adminUser.telegram_id)) {
            return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
        }

        const { telegramId } = await req.json();

        if (!telegramId) {
            return NextResponse.json({ error: "telegramId required" }, { status: 400 });
        }

        const user = getUserByTelegramId(Number(telegramId));

        if (user) {
            // If they are a registered user, just deactivate them (don't move back to pending)
            invalidateAllSessions(user.id);
            deactivateUser(user.id);
        } else {
            // If they are not registered (only in pending_users), move them back to pending
            const revoked = revokePendingUser(Number(telegramId));
            if (!revoked) {
                return NextResponse.json({ error: "User not found" }, { status: 404 });
            }
        }

        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (botToken) {
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: Number(telegramId),
                    text: "⚠️ Your access to VizaionDashboard has been revoked by the administrator. Please contact support if you believe this is an error.",
                }),
            }).catch(() => { });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("Revoke error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
