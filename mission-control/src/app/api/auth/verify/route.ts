// POST /api/auth/verify — Validate 2FA code, create session
import { NextRequest, NextResponse } from "next/server";
import { validateAuthCode, createSession, getUserById } from "@/lib/auth";

export async function POST(req: NextRequest) {
    try {
        const { userId, code } = await req.json();

        if (!userId || !code) {
            return NextResponse.json({ error: "userId and code required" }, { status: 400 });
        }

        // Validate the 2FA code
        const valid = validateAuthCode(userId, String(code));

        if (!valid) {
            return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
        }

        // Get user info
        const user = getUserById(userId);
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Create a session
        const sessionId = createSession(userId);

        // Set session cookie
        const response = NextResponse.json({
            success: true,
            displayName: user.display_name,
        });

        response.cookies.set("mc_session", sessionId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 7 * 24 * 60 * 60, // 7 days
        });

        return response;
    } catch (err) {
        console.error("Verify error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
