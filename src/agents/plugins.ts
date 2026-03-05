// ─── Gravity Claw — Plugin System ───────────────────────────────
// Trait-based interfaces for Provider, Channel, Tool, Memory.

export interface PluginProvider {
    name: string;
    type: "llm" | "channel" | "tool" | "memory";
    version: string;
    init: (config: Record<string, unknown>) => Promise<void>;
    shutdown?: () => Promise<void>;
}

export interface LLMPlugin extends PluginProvider {
    type: "llm";
    chat: (messages: unknown[], tools?: unknown[]) => Promise<unknown>;
}

export interface ChannelPlugin extends PluginProvider {
    type: "channel";
    send: (userId: string, message: string) => Promise<void>;
    onMessage: (handler: (msg: unknown) => void) => void;
}

export interface ToolPlugin extends PluginProvider {
    type: "tool";
    definition: unknown;
    execute: (input: Record<string, unknown>) => Promise<string>;
}

export interface MemoryPlugin extends PluginProvider {
    type: "memory";
    store: (content: string, metadata?: Record<string, unknown>) => Promise<string>;
    search: (query: string, limit?: number) => Promise<unknown[]>;
}

// ── Plugin Registry ──────────────────────────────────────────────

const plugins = new Map<string, PluginProvider>();

export function registerPlugin(plugin: PluginProvider): void {
    plugins.set(plugin.name, plugin);
    console.log(`🔌 Plugin registered: ${plugin.name} (${plugin.type})`);
}

export function getPlugin<T extends PluginProvider>(name: string): T | undefined {
    return plugins.get(name) as T | undefined;
}

export function getPluginsByType<T extends PluginProvider>(type: string): T[] {
    return Array.from(plugins.values()).filter((p) => p.type === type) as T[];
}

export function listPlugins(): Array<{ name: string; type: string; version: string }> {
    return Array.from(plugins.values()).map((p) => ({
        name: p.name,
        type: p.type,
        version: p.version,
    }));
}

export async function shutdownPlugins(): Promise<void> {
    for (const plugin of plugins.values()) {
        if (plugin.shutdown) await plugin.shutdown();
    }
    plugins.clear();
}
