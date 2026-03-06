import type { ChatCompletionTool } from "openai/resources/chat/completions.js";

export const definitions: ChatCompletionTool[] = [
    {
        type: "function",
        function: {
            name: "ionos_get_datacenters",
            description: "Fetches the list of datacenters from the connected IONOS Cloud account using global API keys.",
            parameters: {
                type: "object",
                properties: {},
                additionalProperties: false,
            },
        },
    },
];

export async function executeGetDatacenters(): Promise<string> {
    const publicPrefix = process.env.IONOS_PUBLIC_PREFIX;
    const secret = process.env.IONOS_SECRET;

    if (!publicPrefix || !secret) {
        return "Error: IONOS_PUBLIC_PREFIX or IONOS_SECRET is not configured in the global environment variables.";
    }

    try {
        const authHeader = "Basic " + Buffer.from(`${publicPrefix}:${secret}`).toString("base64");

        const response = await fetch("https://api.ionos.com/cloudapi/v6/datacenters", {
            method: "GET",
            headers: {
                "Authorization": authHeader,
                "Accept": "application/json"
            }
        });

        if (!response.ok) {
            const errBody = await response.text();
            return `IONOS API Error: ${response.status} - ${errBody}`;
        }

        const data = await response.json();
        return JSON.stringify({ datacenters: data.items || [] }, null, 2);
    } catch (err) {
        return `Failed to execute IONOS API call: ${err}`;
    }
}
