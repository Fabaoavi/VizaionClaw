// POST /api/auth/token — Validate a URL token (peek, don't consume)
import { NextRequest, NextResponse } from "next/server";
import { peekToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
    try {
        const { token } = await req.json();

        if (!token || typeof token !== "string") {
            return NextResponse.json({ error: "Token required" }, { status: 400 });
        }

        const tokenInfo = peekToken(token);

        if (!tokenInfo) {
            return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
        }

        return NextResponse.json({
            type: tokenInfo.type,
            telegram_id: tokenInfo.telegram_id,
            user_id: tokenInfo.user_id,
        });
    } catch (err) {
        console.error("Token validation error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
