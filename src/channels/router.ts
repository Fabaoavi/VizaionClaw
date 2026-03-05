// ─── Gravity Claw — Multi-Channel Router ────────────────────────
// Unified message bus. All channels flow through a single router.

export interface ChannelMessage {
    channel: "telegram" | "discord" | "whatsapp" | "webchat";
    userId: string;
    userName: string;
    content: string;
    attachments?: Array<{ type: string; url: string; data?: Buffer }>;
    replyTo?: string;
    groupId?: string;
    metadata?: Record<string, unknown>;
}

export interface ChannelReply {
    content: string;
    attachments?: Array<{ type: string; data: Buffer; filename: string }>;
    parseMode?: "markdown" | "html" | "plain";
}

export type MessageHandler = (msg: ChannelMessage) => Promise<ChannelReply>;

interface ChannelAdapter {
    name: string;
    send: (userId: string, reply: ChannelReply) => Promise<void>;
    isReady: () => boolean;
}

const adapters = new Map<string, ChannelAdapter>();
let globalHandler: MessageHandler | null = null;

export function registerChannel(name: string, adapter: ChannelAdapter): void {
    adapters.set(name, adapter);
    console.log(`📡 Channel registered: ${name}`);
}

export function setMessageHandler(handler: MessageHandler): void {
    globalHandler = handler;
}

/**
 * Route an incoming message to the global handler and send reply via the appropriate channel.
 */
export async function routeMessage(msg: ChannelMessage): Promise<void> {
    if (!globalHandler) {
        console.error("No message handler registered");
        return;
    }

    console.log(`📨 [${msg.channel}] ${msg.userName}: ${msg.content.slice(0, 100)}`);

    const reply = await globalHandler(msg);

    const adapter = adapters.get(msg.channel);
    if (adapter?.isReady()) {
        await adapter.send(msg.userId, reply);
    }
}

export function listChannels(): string[] {
    return Array.from(adapters.entries())
        .filter(([, a]) => a.isReady())
        .map(([name]) => name);
}
