// POST /api/auth/register — Register a new user from a token
import { NextRequest, NextResponse } from "next/server";
import { consumeToken, registerUser, getUserByTelegramId, createAuthCode, getAvailable2FAChannels } from "@/lib/auth";

export async function POST(req: NextRequest) {
    try {
        const { token, displayName, discordId, phone } = await req.json();

        if (!token || !displayName) {
            return NextResponse.json({ error: "Token and display name required" }, { status: 400 });
        }

        // Consume the token
        const tokenInfo = consumeToken(token);
        if (!tokenInfo || tokenInfo.type !== "register") {
            return NextResponse.json({ error: "Invalid or expired registration token" }, { status: 401 });
        }

        if (!tokenInfo.telegram_id) {
            return NextResponse.json({ error: "Token missing Telegram ID" }, { status: 400 });
        }

        // Check if user already exists
        const existing = getUserByTelegramId(tokenInfo.telegram_id);
        if (existing) {
            return NextResponse.json({ error: "User already registered" }, { status: 409 });
        }

        // Create the user
        const user = registerUser({
            telegramId: tokenInfo.telegram_id,
            displayName,
            discordId: discordId || undefined,
            phone: phone || undefined,
        });

        // Return available 2FA channels for verification
        const channels = getAvailable2FAChannels(user);

        return NextResponse.json({
            userId: user.id,
            displayName: user.display_name,
            channels,
        });
    } catch (err) {
        console.error("Registration error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
