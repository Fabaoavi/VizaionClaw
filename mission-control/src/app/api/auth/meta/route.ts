import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
        return NextResponse.redirect(`${process.env.MC_BASE_URL || "http://localhost:3000"}/connections?error=missing_userId`);
    }

    const META_CLIENT_ID = process.env.META_CLIENT_ID;
    if (!META_CLIENT_ID) {
        return NextResponse.redirect(`${process.env.MC_BASE_URL || "http://localhost:3000"}/connections?error=missing_meta_client_id`);
    }

    const redirectUri = `${process.env.MC_BASE_URL || "http://localhost:3000"}/api/auth/meta/callback`;

    // State will carry the userId
    const stateObj = { userId };
    const stateString = Buffer.from(JSON.stringify(stateObj)).toString('base64');

    const metaAuthUrl = new URL("https://www.facebook.com/v19.0/dialog/oauth");
    metaAuthUrl.searchParams.append("client_id", META_CLIENT_ID);
    metaAuthUrl.searchParams.append("redirect_uri", redirectUri);
    metaAuthUrl.searchParams.append("state", stateString);
    metaAuthUrl.searchParams.append("scope", "pages_show_list,instagram_basic,instagram_manage_comments,pages_read_engagement");

    return NextResponse.redirect(metaAuthUrl.toString());
}
