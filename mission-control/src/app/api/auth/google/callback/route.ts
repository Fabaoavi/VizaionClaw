import { NextRequest, NextResponse } from "next/server";
import { upsertConnection } from "@/lib/connections";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const stateString = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
        return NextResponse.redirect(`${process.env.MC_BASE_URL || "http://localhost:3000"}/connections?error=${encodeURIComponent(error)}`);
    }

    if (!code || !stateString) {
        return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
    }

    let stateObj;
    try {
        stateObj = JSON.parse(Buffer.from(stateString, "base64").toString("utf-8"));
    } catch (e) {
        return NextResponse.json({ error: "Invalid state" }, { status: 400 });
    }

    const { userId, scopesParam } = stateObj;
    if (!userId) {
        return NextResponse.json({ error: "Invalid state data" }, { status: 400 });
    }

    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    const REDIRECT_URI = `${process.env.MC_BASE_URL || "http://localhost:3000"}/api/auth/google/callback`;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return NextResponse.json({ error: "Google OAuth is not configured." }, { status: 500 });
    }

    try {
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: REDIRECT_URI,
                grant_type: "authorization_code",
            }),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
            console.error("Token exchange failed:", tokenData);
            return NextResponse.redirect(`${process.env.MC_BASE_URL || "http://localhost:3000"}/connections?error=token_exchange_failed`);
        }

        const accessToken = tokenData.access_token;
        const refreshToken = tokenData.refresh_token || null;
        const expiresInMs = tokenData.expires_in ? tokenData.expires_in * 1000 : undefined;

        // Save the granted scopes back for reference
        const grantedScopes = tokenData.scope || scopesParam;

        const success = upsertConnection(
            userId,
            "google",
            accessToken,
            refreshToken,
            grantedScopes,
            expiresInMs
        );

        if (!success) {
            return NextResponse.redirect(`${process.env.MC_BASE_URL || "http://localhost:3000"}/connections?error=db_save_failed`);
        }

        return NextResponse.redirect(`${process.env.MC_BASE_URL || "http://localhost:3000"}/connections?success=google_connected`);

    } catch (error) {
        console.error("Error exchanging code for tokens:", error);
        return NextResponse.redirect(`${process.env.MC_BASE_URL || "http://localhost:3000"}/connections?error=internal_error`);
    }
}
