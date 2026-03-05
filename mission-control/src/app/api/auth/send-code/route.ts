// POST /api/auth/send-code — Generate and send a 2FA code via chosen channel
import { NextRequest, NextResponse } from "next/server";
import { createAuthCode, getUserById, type TwoFAChannel } from "@/lib/auth";

export async function POST(req: NextRequest) {
    try {
        const { userId, channel } = await req.json() as { userId: string; channel: TwoFAChannel };

        if (!userId || !channel) {
            return NextResponse.json({ error: "userId and channel required" }, { status: 400 });
        }

        const validChannels: TwoFAChannel[] = ["telegram", "discord", "whatsapp"];
        if (!validChannels.includes(channel)) {
            return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
        }

        // Verify user exists
        const user = getUserById(userId);
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Verify the channel is linked for this user
        const channelLinked =
            (channel === "telegram" && user.telegram_id) ||
            (channel === "discord" && user.discord_id) ||
            (channel === "whatsapp" && user.whatsapp_phone);

        if (!channelLinked) {
            return NextResponse.json({ error: "Channel not linked" }, { status: 400 });
        }

        // Create the code
        const code = createAuthCode(userId, channel);

        // Send the code via the chosen channel
        if (channel === "telegram" && user.telegram_id) {
            // Send via Telegram Bot API directly
            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            if (botToken) {
                const message = `🔐 *VizaionDashboard — Auth Code*\n\nYour verification code is:\n\n\`${code}\`\n\n⏱ Expires in 5 minutes.\n⚠️ Do not share this code.`;

                await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        chat_id: user.telegram_id,
                        text: message,
                        parse_mode: "Markdown",
                    }),
                });
            } else {
                console.warn("⚠️ TELEGRAM_BOT_TOKEN not set — code generated but not sent:", code);
            }
        } else if (channel === "discord") {
            // Discord code sending — placeholder for future
            console.log(`📧 [Discord] Code for ${user.discord_id}: ${code}`);
        } else if (channel === "whatsapp") {
            // WhatsApp code sending — placeholder for future
            console.log(`📱 [WhatsApp] Code for ${user.whatsapp_phone}: ${code}`);
        }

        return NextResponse.json({
            sent: true,
            channel,
            expiresIn: 300, // 5 minutes in seconds
        });
    } catch (err) {
        console.error("Send code error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
