import type { ChatCompletionTool } from "openai/resources/chat/completions.js";
import { getConnection, upsertConnection } from "../connections/store.js";

function decodeBase64Url(base64Url: string) {
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
}

export const definitions: ChatCompletionTool[] = [
    {
        type: "function",
        function: {
            name: "google_calendar_list_events",
            description: "List upcoming events on the user's primary Google Calendar.",
            parameters: {
                type: "object",
                properties: {
                    maxResults: {
                        type: "number",
                        description: "Maximum number of events to return. Defaults to 10.",
                    },
                },
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "google_calendar_create_event",
            description: "Create a new event on the user's primary Google Calendar.",
            parameters: {
                type: "object",
                properties: {
                    summary: {
                        type: "string",
                        description: "Title of the calendar event.",
                    },
                    description: {
                        type: "string",
                        description: "Description of the event.",
                    },
                    startTime: {
                        type: "string",
                        description: "Start time in ISO format (e.g. '2023-10-25T10:00:00Z').",
                    },
                    endTime: {
                        type: "string",
                        description: "End time in ISO format (e.g. '2023-10-25T11:00:00Z').",
                    },
                },
                required: ["summary", "startTime", "endTime"],
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "google_gmail_search",
            description: "Search for emails in the user's Gmail using a query.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "Gmail search query (e.g. 'is:unread', 'from:boss@example.com', 'subject:invoice'). Defaults to standard inbox.",
                    },
                    maxResults: {
                        type: "number",
                        description: "Maximum number of emails to return. Defaults to 5.",
                    },
                },
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "google_gmail_read",
            description: "Read the full content of a specific email by its message ID.",
            parameters: {
                type: "object",
                properties: {
                    messageId: {
                        type: "string",
                        description: "The ID of the Gmail message to read.",
                    },
                },
                required: ["messageId"],
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "google_gmail_delete",
            description: "Move a specific email to the trash (trash/delete) by its message ID.",
            parameters: {
                type: "object",
                properties: {
                    messageId: {
                        type: "string",
                        description: "The ID of the Gmail message to delete.",
                    },
                },
                required: ["messageId"],
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "google_drive_search",
            description: "Search for files in the user's Google Drive.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "Google Drive fulltext search query (e.g. 'name contains \"report\"' or 'mimeType=\"application/pdf\"'). If empty, returns recent files.",
                    },
                    maxResults: {
                        type: "number",
                        description: "Maximum number of files to return. Defaults to 5.",
                    },
                },
                additionalProperties: false,
            },
        },
    }
];

export async function fetchWithGoogleAuth(userId: string, url: string, options: RequestInit = {}): Promise<Response> {
    const connection = getConnection(userId, "google");
    if (!connection || connection.status !== "connected" || !connection.access_token) {
        throw new Error("User has not connected their Google account or the token is revoked/expired.");
    }

    let token = connection.access_token;
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);

    let response = await fetch(url, { ...options, headers });

    if (response.status === 401 && connection.refresh_token) {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

        if (clientId && clientSecret) {
            try {
                const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({
                        client_id: clientId,
                        client_secret: clientSecret,
                        refresh_token: connection.refresh_token,
                        grant_type: "refresh_token"
                    })
                });

                if (tokenRes.ok) {
                    const data = await tokenRes.json();
                    upsertConnection(userId, "google", data.access_token, connection.refresh_token, connection.scopes, data.expires_in * 1000);
                    token = data.access_token;
                    headers.set("Authorization", `Bearer ${token}`);
                    response = await fetch(url, { ...options, headers });
                } else {
                    console.error("Google token refresh failed:", tokenRes.status, await tokenRes.text());
                }
            } catch (err) {
                console.error("Failed to execute Google token refresh:", err);
            }
        } else {
            console.error("Cannot refresh token: missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment.");
        }
    }

    return response;
}

export async function executeCalendarListEvents(input: { maxResults?: number }, userId?: string): Promise<string> {
    if (!userId) return "Error: userId is required to fetch Google Calendar events.";
    const connection = getConnection(userId, "google");
    if (!connection || connection.status !== "connected" || !connection.access_token) {
        return "Error: User has not connected their Google account or the token is revoked/expired.";
    }
    if (!connection.scopes.includes("calendar")) return "Error: User has connected Google but did not grant the 'calendar' scope.";

    const maxResults = input.maxResults || 10;
    const timeMin = new Date().toISOString();

    try {
        const response = await fetchWithGoogleAuth(userId,
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=${maxResults}&timeMin=${encodeURIComponent(timeMin)}&singleEvents=true&orderBy=startTime`,
            {
                method: "GET",
                headers: { "Accept": "application/json" }
            }
        );

        if (!response.ok) {
            return `Google API Error: ${response.status} - ${await response.text()}`;
        }

        const data = await response.json();
        const items = data.items || [];
        if (items.length === 0) return "No upcoming events found on your primary calendar.";

        const parsedEvents = items.map((e: any) => ({
            id: e.id,
            summary: e.summary || "Untitled Event",
            start: e.start?.dateTime || e.start?.date,
            end: e.end?.dateTime || e.end?.date,
            link: e.htmlLink
        }));

        return JSON.stringify({ events: parsedEvents }, null, 2);
    } catch (err) {
        return `Failed to execute Google Calendar API call: ${err}`;
    }
}

export async function createGoogleCalendarEvent(userId: string, event: { summary: string, description?: string, startTime: string, endTime: string }): Promise<string> {
    const connection = getConnection(userId, "google");
    if (!connection || connection.status !== "connected" || !connection.access_token) return "Error: Google not connected.";

    // Check if the user has the required full calendar scope for writes
    if (!connection.scopes.includes("calendar")) return "Error: The user has not granted the full 'calendar' scope to create events.";

    const googleEvent = {
        summary: event.summary,
        description: event.description || "",
        start: { dateTime: event.startTime },
        end: { dateTime: event.endTime }
    };

    try {
        const response = await fetchWithGoogleAuth(userId, "https://www.googleapis.com/calendar/v3/calendars/primary/events", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(googleEvent)
        });

        if (!response.ok) return `Calendar API Error: ${response.status} - ${await response.text()}`;
        const data = await response.json();

        return `Successfully created event: ${data.htmlLink}`;
    } catch (err) {
        return `Failed to create Calendar event: ${err}`;
    }
}

export async function executeCalendarCreateEvent(input: { summary: string, description?: string, startTime: string, endTime: string }, userId?: string): Promise<string> {
    if (!userId) return "Error: userId is required.";
    return createGoogleCalendarEvent(userId, input);
}

export async function executeGmailSearch(input: { query?: string, maxResults?: any }, userId?: string): Promise<string> {
    if (!userId) return "Error: userId is required.";
    const connection = getConnection(userId, "google");
    if (!connection || connection.status !== "connected" || !connection.access_token) return "Error: User has not connected Google.";
    if (!connection.scopes.includes("mail.google.com") && !connection.scopes.includes("gmail")) return "Error: User hasn't granted Gmail scopes. Tell user to enable Gmail scope in connections.";

    const query = input.query || "in:inbox";
    const maxResults = typeof input.maxResults === 'string' ? parseInt(input.maxResults, 10) : (input.maxResults || 5);

    try {
        const response = await fetchWithGoogleAuth(userId, `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`);
        if (!response.ok) return `Gmail API Error: ${response.status} - ${await response.text()}`;
        const data = await response.json();

        if (!data.messages || data.messages.length === 0) return "No emails found.";

        // Fetch headers for these messages
        const details = await Promise.all(data.messages.map(async (m: { id: string }) => {
            const msgRes = await fetchWithGoogleAuth(userId, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`);
            if (msgRes.ok) {
                const msgData = await msgRes.json();
                const headers = msgData.payload?.headers || [];
                const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject';
                const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown Sender';
                const date = headers.find((h: any) => h.name === 'Date')?.value || '';
                return { id: m.id, snippet: msgData.snippet, subject, from, date };
            }
            return { id: m.id, error: "Failed to fetch details" };
        }));

        return JSON.stringify({ emails: details }, null, 2);
    } catch (err) {
        return `Failed to execute Gmail search: ${err}`;
    }
}

export async function executeGmailRead(input: { messageId: string }, userId?: string): Promise<string> {
    if (!userId) return "Error: userId is required.";
    const connection = getConnection(userId, "google");
    if (!connection || connection.status !== "connected" || !connection.access_token) return "Error: Google not connected.";

    try {
        const response = await fetchWithGoogleAuth(userId, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${input.messageId}?format=full`);
        if (!response.ok) return `Gmail API Error: ${response.status} - ${await response.text()}`;
        const data = await response.json();

        let body = "";

        // Extract body parts
        if (data.payload) {
            if (data.payload.body && data.payload.body.size > 0 && data.payload.body.data) {
                body = decodeBase64Url(data.payload.body.data);
            } else if (data.payload.parts) {
                // Try to find text/plain
                let part = data.payload.parts.find((p: any) => p.mimeType === "text/plain");
                if (!part) part = data.payload.parts.find((p: any) => p.mimeType === "text/html");
                if (part && part.body && part.body.data) {
                    body = decodeBase64Url(part.body.data);
                }
            }
        }

        if (!body) body = "Could not extract readable text/body from this email. It may be an attachment or complex MIME format.";

        // Strip out excess HTML tags for model context limits if it was HTML
        if (body.includes("<html") || body.includes("<div")) {
            body = body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .substring(0, 15000); // hard cap length
        }

        const headers = data.payload?.headers || [];
        const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject';
        const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown Sender';
        const to = headers.find((h: any) => h.name === 'To')?.value || 'Unknown Recipient';
        const date = headers.find((h: any) => h.name === 'Date')?.value || '';

        return JSON.stringify({ id: data.id, date, subject, from, to, body }, null, 2);
    } catch (err) {
        return `Failed to read Gmail message: ${err}`;
    }
}

export async function executeGmailDelete(input: { messageId: string }, userId?: string): Promise<string> {
    if (!userId) return "Error: userId is required.";
    const connection = getConnection(userId, "google");
    if (!connection || connection.status !== "connected" || !connection.access_token) return "Error: Google not connected.";

    try {
        const response = await fetchWithGoogleAuth(userId, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${input.messageId}/trash`, {
            method: "POST"
        });
        if (!response.ok) return `Gmail API Error: ${response.status} - ${await response.text()}`;

        return JSON.stringify({ success: true, message: `Message ${input.messageId} moved to trash.` });
    } catch (err) {
        return `Failed to trash Gmail message: ${err}`;
    }
}

export async function executeDriveSearch(input: { query?: string, maxResults?: number }, userId?: string): Promise<string> {
    if (!userId) return "Error: userId is required.";
    const connection = getConnection(userId, "google");
    if (!connection || connection.status !== "connected" || !connection.access_token) return "Error: Google not connected.";
    if (!connection.scopes.includes("drive.readonly") && !connection.scopes.includes("drive")) return "Error: Drive scope missing. Tell user to add drive scope in connections.";

    const maxResults = input.maxResults || 5;
    let url = `https://www.googleapis.com/drive/v3/files?pageSize=${maxResults}&fields=files(id,name,mimeType,modifiedTime,webViewLink)`;
    if (input.query) {
        url += `&q=${encodeURIComponent(input.query)}`;
    }

    try {
        const response = await fetchWithGoogleAuth(userId, url);
        if (!response.ok) return `Drive API Error: ${response.status} - ${await response.text()}`;
        const data = await response.json();
        const files = data.files || [];
        if (files.length === 0) return "No files found matching query in Drive.";
        return JSON.stringify({ files }, null, 2);
    } catch (err) {
        return `Failed to execute Drive API: ${err}`;
    }
}
