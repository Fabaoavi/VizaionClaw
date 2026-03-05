// ─── Gravity Claw — Tool: get_current_time ──────────────────────
// Returns the current date/time. Supports optional IANA timezone.

export const definition = {
    type: "function" as const,
    function: {
        name: "get_current_time",
        description:
            "Returns the current date and time. Optionally in a specific timezone (IANA format, e.g. 'America/Sao_Paulo').",
        parameters: {
            type: "object" as const,
            properties: {
                timezone: {
                    type: "string",
                    description:
                        "IANA timezone name (e.g. 'America/New_York', 'Europe/London'). Defaults to system timezone if omitted.",
                },
            },
            required: [],
        },
    },
};

export function execute(input: { timezone?: string }): string {
    const now = new Date();
    const tz = input.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    try {
        const formatted = now.toLocaleString("en-US", {
            timeZone: tz,
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            timeZoneName: "short",
        });

        return JSON.stringify({
            iso: now.toISOString(),
            formatted,
            timezone: tz,
            unix: Math.floor(now.getTime() / 1000),
        });
    } catch {
        return JSON.stringify({
            error: `Invalid timezone: "${tz}". Use IANA format like "America/Sao_Paulo".`,
        });
    }
}
