import type { ChatCompletionTool } from "openai/resources/chat/completions.js";

export const definitions: ChatCompletionTool[] = [
    {
        type: "function",
        function: {
            name: "meta_get_page_profile",
            description: "Fetches the basic profile information of the connected Meta (Facebook/Instagram) Page using global credentials.",
            parameters: {
                type: "object",
                properties: {},
                additionalProperties: false,
            },
        },
    },
];

export async function executeGetPageProfile(): Promise<string> {
    const pageId = process.env.META_PAGE_ID;
    const accessToken = process.env.META_ACCESS_TOKEN;

    if (!pageId || !accessToken) {
        return "Error: META_PAGE_ID or META_ACCESS_TOKEN is not configured in the global environment variables.";
    }

    try {
        const response = await fetch(
            `https://graph.facebook.com/v19.0/${pageId}?fields=id,name,category,link,followers_count,instagram_business_account&access_token=${accessToken}`
        );

        if (!response.ok) {
            const errBody = await response.text();
            return `Meta API Error: ${response.status} - ${errBody}`;
        }

        const data = await response.json();
        return JSON.stringify({ metaPageProfile: data }, null, 2);
    } catch (err) {
        return `Failed to execute Meta Graph API call: ${err}`;
    }
}
