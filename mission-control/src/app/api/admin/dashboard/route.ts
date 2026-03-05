// GET /api/admin/dashboard — Fetch admin-level system data
import { NextRequest, NextResponse } from "next/server";
import { getSession, getUserById, getUserByTelegramId, isAdmin, getSystemLogs, getUsageStatsByUser } from "@/lib/auth";

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

        // 1. API Keys (Full value is returned for the toggle, masked on frontend, or masked here to be safe and only revealed if we had an edit endpoint. Wait, if the user is the admin, returning the full key is fine so they can copy it if needed. Let's return the full keys and the frontend will mask them by default.)
        const keys = [
            { id: 'telegram', name: 'Telegram Bot Token', value: process.env.TELEGRAM_BOT_TOKEN || null, link: 'https://core.telegram.org/bots/features#botfather' },
            { id: 'openrouter', name: 'OpenRouter API Key', value: process.env.OPENROUTER_API_KEY || null, link: 'https://openrouter.ai/keys' },
            { id: 'pinecone', name: 'Pinecone API Key', value: process.env.PINECONE_API_KEY || null, link: 'https://app.pinecone.io/' },
            { id: 'groq', name: 'Groq API Key', value: process.env.GROQ_API_KEY || null, link: 'https://console.groq.com/keys' },
            { id: 'elevenlabs', name: 'ElevenLabs API Key', value: process.env.ELEVENLABS_API_KEY || null, link: 'https://elevenlabs.io/app/settings/api-keys' },
        ];

        // 2. OpenRouter Metrics
        let openRouterData = null;
        if (process.env.OPENROUTER_API_KEY) {
            try {
                const orRes = await fetch("https://openrouter.ai/api/v1/auth/key", {
                    headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` }
                });
                if (orRes.ok) {
                    const orJson = await orRes.json();
                    openRouterData = orJson.data; // { label, usage, limit, is_free_tier, rate_limit }
                }
            } catch (err) {
                console.error("Failed to fetch OpenRouter data:", err);
            }
        }

        // 3. System Logs
        let logs: any[] = [];
        try {
            logs = getSystemLogs(50);
        } catch (err) {
            console.error("Failed to fetch logs:", err);
        }

        // 4. User Stats for Charting
        let userStats: any[] = [];
        try {
            userStats = getUsageStatsByUser();
        } catch (err) {
            console.error("Failed to fetch user stats:", err);
        }

        return NextResponse.json({
            keys,
            openRouterData,
            logs,
            userStats
        });
    } catch (err) {
        console.error("Admin Dashboard error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
