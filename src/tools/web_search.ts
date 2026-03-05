// ─── Gravity Claw — Web Search Tool ─────────────────────────────
// Search the web via DuckDuckGo instant answers (no API key needed).

export const definition = {
    type: "function" as const,
    function: {
        name: "web_search",
        description: "Search the web for information. Returns titles, snippets, and URLs from search results.",
        parameters: {
            type: "object" as const,
            properties: {
                query: { type: "string", description: "Search query" },
                maxResults: { type: "number", description: "Max results to return (default 5)" },
            },
            required: ["query"],
        },
    },
};

export async function execute(input: { query: string; maxResults?: number }): Promise<string> {
    const { query, maxResults = 5 } = input;

    try {
        // DuckDuckGo HTML search (no API key needed)
        const encoded = encodeURIComponent(query);
        const response = await fetch(
            `https://html.duckduckgo.com/html/?q=${encoded}`,
            {
                headers: {
                    "User-Agent": "Gravity Claw Bot/1.0",
                },
            }
        );

        if (!response.ok) {
            return JSON.stringify({ error: `Search failed: HTTP ${response.status}` });
        }

        const html = await response.text();

        // Parse results from DuckDuckGo HTML
        const results: Array<{ title: string; url: string; snippet: string }> = [];
        const resultRegex = /<a rel="nofollow" class="result__a" href="([^"]*)"[^>]*>(.*?)<\/a>.*?<a class="result__snippet"[^>]*>(.*?)<\/a>/gs;

        let match;
        while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
            const url = decodeURIComponent((match[1] ?? "").replace(/.*uddg=/, "").replace(/&.*/, ""));
            const title = (match[2] ?? "").replace(/<[^>]+>/g, "").trim();
            const snippet = (match[3] ?? "").replace(/<[^>]+>/g, "").trim();

            if (title && url) {
                results.push({ title, url, snippet });
            }
        }

        // Fallback: simple regex for links if pattern didn't match
        if (results.length === 0) {
            const linkRegex = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>/g;
            while ((match = linkRegex.exec(html)) !== null && results.length < maxResults) {
                const url = match[1] ?? "";
                const title = (match[2] ?? "").trim();
                if (title.length > 5 && !url.includes("duckduckgo.com")) {
                    results.push({ title, url, snippet: "" });
                }
            }
        }

        return JSON.stringify({
            query,
            results,
            count: results.length,
        });
    } catch (err) {
        return JSON.stringify({
            error: `Search failed: ${err instanceof Error ? err.message : err}`,
        });
    }
}
