import type { ChatCompletionTool } from "openai/resources/chat/completions.js";
import { getConnection } from "../connections/store.js";

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
];

export async function executeCalendarListEvents(input: { maxResults?: number }, userId?: string): Promise<string> {
    if (!userId) {
        return "Error: userId is required to fetch Google Calendar events.";
    }

    // Pull token from the DB
    const connection = getConnection(userId, "google");

    if (!connection || connection.status !== "connected" || !connection.access_token) {
        return "Error: User has not connected their Google account or the token is revoked/expired.";
    }

    if (!connection.scopes.includes("calendar")) {
        return "Error: User has connected Google but did not grant the 'calendar' scope.";
    }

    const maxResults = input.maxResults || 10;
    const timeMin = new Date().toISOString();

    try {
        const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=${maxResults}&timeMin=${encodeURIComponent(timeMin)}&singleEvents=true&orderBy=startTime`,
            {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${connection.access_token} `,
                    "Accept": "application/json"
                }
            }
        );

        if (!response.ok) {
            if (response.status === 401) {
                return "Error: Google access token might be expired. Refresh token logic needs to be triggered (Not implemented in MVP).";
            }
            const errBody = await response.text();
            return `Google API Error: ${response.status} - ${errBody} `;
        }

        const data = await response.json();
        const items = data.items || [];

        if (items.length === 0) {
            return "No upcoming events found on your primary calendar.";
        }

        const parsedEvents = items.map((e: any) => ({
            id: e.id,
            summary: e.summary || "Untitled Event",
            start: e.start?.dateTime || e.start?.date,
            end: e.end?.dateTime || e.end?.date,
            link: e.htmlLink
        }));

        return JSON.stringify({ events: parsedEvents }, null, 2);
    } catch (err) {
        return `Failed to execute Google Calendar API call: ${err} `;
    }
}
