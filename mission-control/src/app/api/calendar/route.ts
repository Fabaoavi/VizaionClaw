import { NextRequest, NextResponse } from "next/server";
import { getSession, getUserById, getUserByTelegramId } from "@/lib/auth";
import Database from "better-sqlite3";
import path from "node:path";
import { google } from "googleapis";

function getDb() {
    const dbPath = path.join(process.cwd(), "..", "data", "users.db");
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    return db;
}

function getUserFromSession(req: NextRequest): { id: string } | null {
    const sessionId = req.cookies.get("mc_session")?.value;
    if (!sessionId) return null;
    const session = getSession(sessionId);
    if (!session) return null;
    const user = getUserById(session.userId) || getUserByTelegramId(Number(session.userId));
    return user ? { id: user.id } : null;
}

export async function GET(req: NextRequest) {
    const user = getUserFromSession(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = getDb();
    try {
        // Fetch OAuth connection for Google
        const connection = db.prepare(`
            SELECT * FROM oauth_connections 
            WHERE user_id = ? AND provider = 'google'
            ORDER BY created_at DESC LIMIT 1
        `).get(user.id) as any;

        if (!connection || !connection.access_token) {
            return NextResponse.json({ events: [], connected: false });
        }

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
        );

        oauth2Client.setCredentials({
            access_token: connection.access_token,
            refresh_token: connection.refresh_token,
            expiry_date: connection.expires_at ? new Date(connection.expires_at).getTime() : undefined
        });

        // Auto-refresh token if needed
        oauth2Client.on('tokens', (tokens) => {
            if (tokens.refresh_token || tokens.access_token) {
                db.prepare(`
                    UPDATE oauth_connections 
                    SET access_token = ?, 
                        refresh_token = COALESCE(?, refresh_token),
                        expires_at = ?
                    WHERE id = ?
                `).run(
                    tokens.access_token,
                    tokens.refresh_token || null,
                    tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
                    connection.id
                );
            }
        });

        const calendar = google.calendar({ version: "v3", auth: oauth2Client });

        // Get events for the next month
        const timeMin = new Date();
        timeMin.setDate(1); // start of month
        timeMin.setHours(0, 0, 0, 0);

        const timeMax = new Date();
        timeMax.setMonth(timeMax.getMonth() + 2); // get a couple months

        const res = await calendar.events.list({
            calendarId: "primary",
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            maxResults: 100,
            singleEvents: true,
            orderBy: "startTime",
        });

        const gEvents = res.data.items || [];

        // Map to our calendar generic format
        const mappedEvents = gEvents.map(item => {
            // Google calendar events can be all-day (date) or specific time (dateTime)
            const d = item.start?.dateTime || item.start?.date;
            let formattedDate = "";
            if (d) {
                // Return YYYY-MM-DD
                formattedDate = d.split('T')[0];
            }

            return {
                id: `google-${item.id}`,
                title: item.summary || "Busy",
                date: formattedDate,
                type: 'google'
            };
        }).filter(e => e.date !== "");

        return NextResponse.json({ events: mappedEvents, connected: true });
    } catch (err: any) {
        console.error("Google Calendar fetch error:", err.message);
        // If auth error, return empty events rather than breaking UI
        return NextResponse.json({ events: [], connected: false, error: err.message }, { status: 200 });
    } finally {
        db.close();
    }
}
