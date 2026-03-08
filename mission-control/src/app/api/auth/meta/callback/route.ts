import { NextRequest, NextResponse } from "next/server";
import { upsertConnection } from "@/lib/connections";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    const baseUrl = process.env.MC_BASE_URL || "http://localhost:3000";

    if (error) {
        return NextResponse.redirect(`${baseUrl}/connections?error=${error}`);
    }

    if (!code || !state) {
        return NextResponse.redirect(`${baseUrl}/connections?error=missing_code_or_state`);
    }

    let userId = "";
    try {
        const decodedState = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
        userId = decodedState.userId;
    } catch (err) {
        return NextResponse.redirect(`${baseUrl}/connections?error=invalid_state`);
    }

    const META_CLIENT_ID = process.env.META_CLIENT_ID;
    const META_CLIENT_SECRET = process.env.META_CLIENT_SECRET;
    const redirectUri = `${baseUrl}/api/auth/meta/callback`;

    if (!META_CLIENT_ID || !META_CLIENT_SECRET) {
        return NextResponse.redirect(`${baseUrl}/connections?error=missing_meta_credentials`);
    }

    try {
        const tokenResponse = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?client_id=${META_CLIENT_ID}&redirect_uri=${redirectUri}&client_secret=${META_CLIENT_SECRET}&code=${code}`);
        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            console.error("Meta Token Error:", tokenData.error);
            return NextResponse.redirect(`${baseUrl}/connections?error=meta_token_error`);
        }

        const accessToken = tokenData.access_token;

        upsertConnection(
            userId,
            "meta",
            accessToken,
            null,
            "pages_show_list,instagram_basic,instagram_manage_comments,pages_read_engagement"
        );

        return NextResponse.redirect(`${baseUrl}/connections?success=meta_connected`);

    } catch (err) {
        console.error("Failed to exchange Meta code:", err);
        return NextResponse.redirect(`${baseUrl}/connections?error=meta_exchange_failed`);
    }
}
