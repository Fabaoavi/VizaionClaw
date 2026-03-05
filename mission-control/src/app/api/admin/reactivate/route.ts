// POST /api/admin/reactivate — Re-enable a revoked user's access
import { NextRequest, NextResponse } from "next/server";
import { getSession, getUserById, getUserByTelegramId, isAdmin, activateUser, createAuthTokenFromMC } from "@/lib/auth";

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

        // Activate their dashboard access
        const user = getUserByTelegramId(Number(telegramId));
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        activateUser(user.id);

        const token = createAuthTokenFromMC("login", { telegramId: Number(telegramId) });
        const mcBaseUrl = process.env.MC_BASE_URL || "http://localhost:3000";
        const link = `${mcBaseUrl}/login?token=${token}`;

        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (botToken) {
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: Number(telegramId),
                    text: `✅ Access Reactivated!\n\nWelcome back to VizaionDashboard! Your access has been restored. Click the link below to login safely:\n\n🔗 ${link}\n\n⏱ This private link expires in 10 minutes.`,
                    disable_web_page_preview: true
                }),
            }).catch(() => { });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("Reactivate error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
