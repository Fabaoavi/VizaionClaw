// ─── Gravity Claw — Markdown Memory ─────────────────────────────
// Human-readable, git-friendly .md file memory storage.

import fs from "node:fs";
import path from "node:path";

const MEMORY_DIR = path.join(process.cwd(), "data", "memory");

function ensureDir(): void {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

export function writeMarkdownMemory(
    filename: string,
    content: string,
    category = "notes"
): string {
    ensureDir();
    const dir = path.join(MEMORY_DIR, category);
    fs.mkdirSync(dir, { recursive: true });

    const safeName = filename.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = path.join(dir, `${safeName}.md`);

    const header = `---\ncreated: ${new Date().toISOString()}\ncategory: ${category}\n---\n\n`;
    fs.writeFileSync(filePath, header + content, "utf-8");

    return filePath;
}

export function readMarkdownMemory(filename: string, category = "notes"): string | null {
    const safeName = filename.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = path.join(MEMORY_DIR, category, `${safeName}.md`);

    try {
        return fs.readFileSync(filePath, "utf-8");
    } catch {
        return null;
    }
}

export function listMarkdownMemories(category?: string): string[] {
    ensureDir();
    const searchDir = category ? path.join(MEMORY_DIR, category) : MEMORY_DIR;

    if (!fs.existsSync(searchDir)) return [];

    const results: string[] = [];

    function walk(dir: string, prefix = ""): void {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                walk(path.join(dir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name);
            } else if (entry.name.endsWith(".md")) {
                results.push(prefix ? `${prefix}/${entry.name}` : entry.name);
            }
        }
    }

    walk(searchDir);
    return results;
}

export function deleteMarkdownMemory(filename: string, category = "notes"): boolean {
    const safeName = filename.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = path.join(MEMORY_DIR, category, `${safeName}.md`);

    try {
        fs.unlinkSync(filePath);
        return true;
    } catch {
        return false;
    }
}
