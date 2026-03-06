import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserConnections, deleteConnection } from "@/lib/connections";

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

        const connections = getUserConnections(session.userId);

        // Strip sensitive tokens before sending to the client
        const safeConnections = connections.map(conn => ({
            provider: conn.provider,
            status: conn.status,
            scopes: conn.scopes,
            updated_at: conn.updated_at
        }));

        const globals = {
            ionos: !!process.env.IONOS_SECRET,
            meta: !!process.env.META_ACCESS_TOKEN
        };

        return NextResponse.json({ connections: safeConnections, userId: session.userId, globals });
    } catch (err) {
        console.error("Error fetching connections:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const sessionId = req.cookies.get("mc_session")?.value;
        if (!sessionId) {
            return NextResponse.json({ authenticated: false }, { status: 401 });
        }

        const session = getSession(sessionId);
        if (!session) {
            return NextResponse.json({ authenticated: false }, { status: 401 });
        }

        const body = await req.json();
        const { provider } = body;

        if (!provider) {
            return NextResponse.json({ error: "Missing provider" }, { status: 400 });
        }

        const success = deleteConnection(session.userId, provider);
        if (!success) {
            return NextResponse.json({ error: "Failed to delete connection" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("Error deleting connection:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
