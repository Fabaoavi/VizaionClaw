// ─── Gravity Claw — Skills Loader ───────────────────────────────
// Loads markdown-based skill files from /skills directory.
// Skills define new capabilities via structured markdown instructions.

import fs from "node:fs";
import path from "node:path";

export interface Skill {
    name: string;
    description: string;
    instructions: string;
    triggers: string[];
    filePath: string;
}

const skills: Skill[] = [];
const SKILLS_DIR = path.join(process.cwd(), "skills");

export function loadSkills(): void {
    if (!fs.existsSync(SKILLS_DIR)) {
        fs.mkdirSync(SKILLS_DIR, { recursive: true });
        console.log("⏭️  Skills: No skills found (created /skills directory)");
        return;
    }

    const files = fs.readdirSync(SKILLS_DIR).filter((f) => f.endsWith(".md"));

    for (const file of files) {
        try {
            const content = fs.readFileSync(path.join(SKILLS_DIR, file), "utf-8");
            const skill = parseSkill(content, file);
            if (skill) {
                skills.push(skill);
            }
        } catch (err) {
            console.warn(`⚠️ Failed to load skill ${file}: ${err instanceof Error ? err.message : err}`);
        }
    }

    if (skills.length > 0) {
        console.log(`✅ Skills: ${skills.length} loaded (${skills.map((s) => s.name).join(", ")})`);
    } else {
        console.log("⏭️  Skills: No skills found in /skills directory");
    }
}

function parseSkill(content: string, filename: string): Skill | null {
    // Parse YAML-like frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    let name = filename.replace(/\.md$/, "");
    let description = "";
    let triggers: string[] = [];
    let instructions = content;

    if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1] ?? "";
        instructions = (frontmatterMatch[2] ?? "").trim();

        // Parse simple YAML
        for (const line of frontmatter.split("\n")) {
            const [key, ...valueParts] = line.split(":");
            const value = valueParts.join(":").trim();
            switch (key?.trim()) {
                case "name":
                    name = value;
                    break;
                case "description":
                    description = value;
                    break;
                case "triggers":
                    triggers = value.split(",").map((t) => t.trim()).filter(Boolean);
                    break;
            }
        }
    }

    if (!instructions) return null;

    return {
        name,
        description: description || `Skill: ${name}`,
        instructions,
        triggers,
        filePath: path.join(SKILLS_DIR, filename),
    };
}

export function getSkills(): Skill[] {
    return [...skills];
}

export function findSkillByTrigger(message: string): Skill | undefined {
    const lower = message.toLowerCase();
    return skills.find((skill) =>
        skill.triggers.some((trigger) => lower.includes(trigger.toLowerCase()))
    );
}

/**
 * Build a skills context string to inject into the system prompt.
 */
export function getSkillsContext(): string {
    if (skills.length === 0) return "";

    const lines = skills.map(
        (s) => `- **${s.name}**: ${s.description}` +
            (s.triggers.length > 0 ? ` (triggers: ${s.triggers.join(", ")})` : "")
    );

    return `\n\n[Available Skills]\n${lines.join("\n")}`;
}
