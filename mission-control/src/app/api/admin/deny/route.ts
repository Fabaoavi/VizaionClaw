// POST /api/admin/deny — Deny a pending user and notify via Telegram
import { NextRequest, NextResponse } from "next/server";
import { denyPendingUser, getSession, getUserById, getUserByTelegramId, isAdmin } from "@/lib/auth";

export async function POST(req: NextRequest) {
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

        const { telegramId } = await req.json();

        if (!telegramId) {
            return NextResponse.json({ error: "telegramId required" }, { status: 400 });
        }

        const denied = denyPendingUser(Number(telegramId));
        if (!denied) {
            return NextResponse.json({ error: "User not found or already reviewed" }, { status: 404 });
        }

        // Notify the user via Telegram
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (botToken) {
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: Number(telegramId),
                    text: "❌ Your access request to VizaionDashboard was not approved at this time.",
                }),
            });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("Deny error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
