// POST /api/auth/login — Lookup user by any ID, return available 2FA methods
import { NextRequest, NextResponse } from "next/server";
import { findUserByAnyId, getAvailable2FAChannels } from "@/lib/auth";

export async function POST(req: NextRequest) {
    try {
        const { identifier } = await req.json();

        if (!identifier || typeof identifier !== "string") {
            return NextResponse.json({ error: "Identifier required" }, { status: 400 });
        }

        console.log(`[LOGIN_API] Receiving request for identifier: ${identifier}`);
        const user = findUserByAnyId(identifier.trim());
        console.log(`[LOGIN_API] findUserByAnyId returned data for identifier: ${identifier}`);

        if (!user) {
            console.log(`[LOGIN_API] User not found for identifier: ${identifier}`);
            // Intentionally vague — don't reveal which identifiers exist
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        if (!user.is_active) {
            console.log(`[LOGIN_API] User access revoked for identifier: ${identifier}`);
            return NextResponse.json({ error: "User access revoked" }, { status: 403 });
        }

        console.log(`[LOGIN_API] Fetching channels for user: ${user.id}`);
        const channels = getAvailable2FAChannels(user);
        console.log(`[LOGIN_API] Channels found: ${channels.join(", ")}`);

        // Mask the identifiers for security
        const maskedChannels = channels.map((ch) => {
            switch (ch) {
                case "telegram":
                    return {
                        channel: "telegram",
                        hint: `Telegram (ID: ...${String(user.telegram_id).slice(-4)})`,
                    };
                case "discord":
                    return {
                        channel: "discord",
                        hint: `Discord (${user.discord_id?.slice(0, 3)}...)`,
                    };
                case "whatsapp":
                    return {
                        channel: "whatsapp",
                        hint: `WhatsApp (...${user.whatsapp_phone?.slice(-4)})`,
                    };
            }
        });

        return NextResponse.json({
            userId: user.id,
            displayName: user.display_name,
            channels: maskedChannels,
        });
    } catch (err) {
        console.error("Login lookup error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
