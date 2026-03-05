// GET /api/auth/session — Check current session
// DELETE /api/auth/session — Logout
import { NextRequest, NextResponse } from "next/server";
import { getSession, getUserById, invalidateSession, isAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
    try {
        const sessionId = req.cookies.get("mc_session")?.value;

        if (!sessionId) {
            return NextResponse.json({ authenticated: false }, { status: 401 });
        }

        const session = getSession(sessionId);
        if (!session) {
            return NextResponse.json({ authenticated: false }, { status: 401 });
        }

        const user = getUserById(session.userId);

        return NextResponse.json({
            authenticated: true,
            user: user ? {
                id: user.id,
                displayName: user.display_name,
                telegramId: user.telegram_id,
                isAdmin: user.telegram_id ? isAdmin(user.telegram_id) : false,
                isActive: user.is_active,
            } : null,
        });
    } catch (err) {
        console.error("Session check error:", err);
        return NextResponse.json({ authenticated: false }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const sessionId = req.cookies.get("mc_session")?.value;

        if (sessionId) {
            invalidateSession(sessionId);
        }

        const response = NextResponse.json({ success: true });
        response.cookies.delete("mc_session");
        return response;
    } catch (err) {
        console.error("Logout error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
