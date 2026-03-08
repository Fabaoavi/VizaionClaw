import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    // We expect the frontend to pass the scopes the user checked, e.g. "gmail_readonly,calendar_readwrite"
    const scopesParam = searchParams.get("scopes") || "";

    if (!userId) {
        return NextResponse.redirect(`${process.env.MC_BASE_URL || "http://localhost:3000"}/connections?error=missing_userId`);
    }

    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    if (!GOOGLE_CLIENT_ID) {
        return NextResponse.redirect(`${process.env.MC_BASE_URL || "http://localhost:3000"}/connections?error=missing_google_client_id`);
    }

    // Default basic scopes
    const requestedScopes = [
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/userinfo.email"
    ];

    if (scopesParam.includes("gmail")) {
        requestedScopes.push("https://mail.google.com/");
    }
    if (scopesParam.includes("drive")) {
        requestedScopes.push("https://www.googleapis.com/auth/drive");
    }
    if (scopesParam.includes("calendar")) {
        requestedScopes.push("https://www.googleapis.com/auth/calendar");
    }

    const redirectUri = `${process.env.MC_BASE_URL || "http://localhost:3000"}/api/auth/google/callback`;

    // State will carry the userId and requested scopes back to us securely
    const stateObj = { userId, scopesParam };
    const stateString = Buffer.from(JSON.stringify(stateObj)).toString('base64');

    const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    googleAuthUrl.searchParams.append("client_id", GOOGLE_CLIENT_ID);
    googleAuthUrl.searchParams.append("redirect_uri", redirectUri);
    googleAuthUrl.searchParams.append("response_type", "code");
    googleAuthUrl.searchParams.append("scope", requestedScopes.join(" "));
    googleAuthUrl.searchParams.append("access_type", "offline");
    googleAuthUrl.searchParams.append("prompt", "consent");
    googleAuthUrl.searchParams.append("state", stateString);

    return NextResponse.redirect(googleAuthUrl.toString());
}
