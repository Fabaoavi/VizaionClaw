// POST /api/admin/approve — Approve a pending user and send registration link via Telegram
import { NextRequest, NextResponse } from "next/server";
import { approvePendingUser, createAuthTokenFromMC, getSession, getUserById, getUserByTelegramId, isAdmin, getAllPendingUsers } from "@/lib/auth";

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

        const approved = approvePendingUser(Number(telegramId));
        if (!approved) {
            return NextResponse.json({ error: "User not found or already reviewed" }, { status: 404 });
        }

        // Check if user is already registered
        const existingUser = getUserByTelegramId(Number(telegramId));
        const isReapproval = !!existingUser;

        // Generate token and link based on status
        const tokenType = isReapproval ? 'login' : 'register';
        const token = createAuthTokenFromMC(tokenType, { telegramId: Number(telegramId) });
        const mcBaseUrl = process.env.MC_BASE_URL || "http://localhost:3000";
        const link = `${mcBaseUrl}/${tokenType}?token=${token}`;

        // If it's a re-approval, make sure they are active
        if (isReapproval) {
            try {
                // Ensure db is imported or we use a helper. 
                // We don't have updateActivity here directly, but we can do it if we import getDb
                const { getDb } = require("@/lib/auth");
                const db = getDb();
                db.prepare("UPDATE users SET is_active = 1 WHERE telegram_id = ?").run(Number(telegramId));
                db.close();
            } catch (err) {
                console.error("Failed to reactivate user:", err);
            }
        }

        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (botToken) {
            const pendingUser = getAllPendingUsers().find(u => u.telegram_id === Number(telegramId));
            const pendingMsgId = pendingUser?.pending_message_id;

            // Delete "pending analysis" message if we saved its ID
            if (pendingMsgId) {
                await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        chat_id: Number(telegramId),
                        message_id: pendingMsgId
                    })
                }).catch(() => { }); // Ignore errors if message was already deleted
            }

            const message = isReapproval
                ? `✅ Access Reactivated!\n\nWelcome back to VizaionDashboard! Your access has been restored. Click the link below to login safely:\n\n🔗 ${link}\n\n⏱ This private link expires in 10 minutes.`
                : `✅ Access Approved!\n\nYour access to VizaionDashboard has been approved! Click the link below to create your account:\n\n🔗 ${link}\n\n⏱ This link expires in 10 minutes.\n\n📋 During registration you'll need your Telegram User ID.\nFind it here: https://telegram.me/userinfobot`;

            // Send Welcome Message
            const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: Number(telegramId),
                    text: message,
                    disable_web_page_preview: true
                }),
            });
            const data = await res.json();

            // Pin the Welcome Message
            if (data.ok && data.result?.message_id) {
                await fetch(`https://api.telegram.org/bot${botToken}/pinChatMessage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        chat_id: Number(telegramId),
                        message_id: data.result.message_id,
                        disable_notification: true
                    }),
                }).catch(() => { });
            }
        }

        return NextResponse.json({ success: true, link });
    } catch (err) {
        console.error("Approve error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
