// ─── Gravity Claw — Security Module ─────────────────────────────
// Command allowlists, per-user path restrictions, and encrypted secrets.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const SECURITY_FILE = path.join(DATA_DIR, "security.json");
const SECRETS_FILE = path.join(DATA_DIR, ".secrets.enc");

// ── Types ────────────────────────────────────────────────────────

export interface UserPathRule {
    path: string;
    mode: "read" | "write" | "none"; // 'none' means dormant rule
}

export interface SecurityConfig {
    globalAllowedCommands: string[];
    globalBlockedCommands: string[];
    globalBlockedPaths: string[];
    globalAllowedHosts: string[];
    enableContainerIsolation: boolean;
    userPathRules: Record<string, UserPathRule[]>; // Key: canonical userId
}

// ── Default Configuration ────────────────────────────────────────

const DEFAULT_CONFIG: SecurityConfig = {
    globalAllowedCommands: [
        "echo", "date", "whoami", "hostname", "pwd", "ls", "dir",
        "cat", "head", "tail", "wc", "grep", "find", "which",
        "node", "npm", "npx", "git", "python", "pip", "curl"
    ],
    globalBlockedCommands: [
        "rm -rf /", "format", "del /f /s /q", "mkfs",
        "shutdown", "reboot", "poweroff"
    ],
    globalBlockedPaths: [
        "/etc/shadow", "/etc/passwd", "C:\\Windows\\System32"
    ],
    globalAllowedHosts: [], // Empty array = all external hosts allowed by default
    enableContainerIsolation: false, // Default host execution unless specifically enabled
    userPathRules: {} // Empty = all users are strictly denied from the host filesystem
};

// ── State Management ─────────────────────────────────────────────

let currentConfig: SecurityConfig = { ...DEFAULT_CONFIG };

export function loadSecurityConfig(): SecurityConfig {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(SECURITY_FILE)) {
        saveSecurityConfig(DEFAULT_CONFIG);
        return DEFAULT_CONFIG;
    }

    try {
        const raw = fs.readFileSync(SECURITY_FILE, "utf-8");
        const parsed = JSON.parse(raw) as Partial<SecurityConfig>;

        // Merge with defaults to ensure all keys exist
        currentConfig = {
            globalAllowedCommands: parsed.globalAllowedCommands || DEFAULT_CONFIG.globalAllowedCommands,
            globalBlockedCommands: parsed.globalBlockedCommands || DEFAULT_CONFIG.globalBlockedCommands,
            globalBlockedPaths: parsed.globalBlockedPaths || DEFAULT_CONFIG.globalBlockedPaths,
            globalAllowedHosts: parsed.globalAllowedHosts || DEFAULT_CONFIG.globalAllowedHosts,
            enableContainerIsolation: typeof parsed.enableContainerIsolation === 'boolean' ? parsed.enableContainerIsolation : DEFAULT_CONFIG.enableContainerIsolation,
            userPathRules: parsed.userPathRules || {}
        };
        return currentConfig;
    } catch (e) {
        console.error("⚠️ Failed to parse security.json, using defaults.");
        return DEFAULT_CONFIG;
    }
}

export function saveSecurityConfig(config: SecurityConfig): void {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(SECURITY_FILE, JSON.stringify(config, null, 2), "utf-8");
    currentConfig = { ...config };
}

export function getSecurityConfig(): SecurityConfig {
    return currentConfig;
}

// Execute on import
loadSecurityConfig();


// ── Command Allowlists (Global) ──────────────────────────────────

export function isCommandAllowed(command: string): { allowed: boolean; reason?: string } {
    for (const blocked of currentConfig.globalBlockedCommands) {
        if (command.includes(blocked)) {
            return { allowed: false, reason: `Blocked command pattern: ${blocked}` };
        }
    }
    // We don't strictly enforce globalAllowedCommands as a whitelist yet, 
    // but the blocked commands act as a blacklist.
    return { allowed: true };
}


// ── Host File System Allowlists (Per-User RBAC) ──────────────────

/**
 * Checks if a user is allowed to access a given path on the host system.
 * By default, users have NO access. They must be explicitly whitelisted.
 * @param filePath The absolute path they are trying to access
 * @param userId The canonical user ID asking for access
 * @param requiredMode Whether they are trying to 'read' or 'write'
 */
export function isPathAllowedForUser(filePath: string, userId: string, requiredMode: "read" | "write" = "read"): { allowed: boolean; reason?: string } {
    const resolved = path.resolve(filePath);

    // 1. Check Global Blacklist First (Overrides everything)
    if (currentConfig.globalBlockedPaths.some((b) => {
        const rel = path.relative(path.resolve(b), resolved);
        return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
    })) {
        return { allowed: false, reason: "Path is globally blocked." };
    }

    // 2. Check User-Specific Whitelist
    const rules = currentConfig.userPathRules[userId] || [];

    // Default Deny if no rules
    if (rules.length === 0) {
        return { allowed: false, reason: "Strict Mode: You do not have permission to access the host file system." };
    }

    // Check if any rule covers this path
    for (const rule of rules) {
        const rulePathResolved = path.resolve(rule.path);

        // If the requested path is INSIDE or EXACTLY the allowed rule path
        const rel = path.relative(rulePathResolved, resolved);
        const isInside = rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));

        if (isInside) {
            // Dormant check
            if (rule.mode === "none") {
                return { allowed: false, reason: `Permission denied: Dormant explicit rule for this path.` };
            }

            // Mode check
            if (requiredMode === "write" && rule.mode === "read") {
                return { allowed: false, reason: `Permission denied: You only have 'read' access to this path.` };
            }
            return { allowed: true };
        }
    }

    return { allowed: false, reason: "Path is not explicitly allowlisted for your user." };
}

/**
 * Backwards compatibility for generic system tasks
 */
export function isPathAllowed(filePath: string): boolean {
    const resolved = path.resolve(filePath);
    if (currentConfig.globalBlockedPaths.some((b) => {
        const rel = path.relative(path.resolve(b), resolved);
        return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
    })) return false;

    // For generic system checks (not tied to a user), we assume allowed unless blocked
    // Real path security is now enforced per-user at the tool level
    return true;
}


// ── External Hosts (Global) ──────────────────────────────────────

export function isHostAllowed(host: string): boolean {
    if (currentConfig.globalAllowedHosts.length === 0) return true;
    return currentConfig.globalAllowedHosts.includes(host);
}


// ── Encrypted Secrets ───────────────────────────────────────────

const ALGORITHM = "aes-256-gcm";

export function encryptSecret(key: string, value: string, masterKey: string): void {
    const existing = loadSecrets(masterKey);
    existing[key] = value;
    saveSecrets(existing, masterKey);
}

export function decryptSecret(key: string, masterKey: string): string | undefined {
    const secrets = loadSecrets(masterKey);
    return secrets[key];
}

function loadSecrets(masterKey: string): Record<string, string> {
    if (!fs.existsSync(SECRETS_FILE)) return {};

    try {
        const raw = fs.readFileSync(SECRETS_FILE, "utf-8");
        const data = JSON.parse(raw) as { iv: string; tag: string; encrypted: string };
        const derivedKey = crypto.scryptSync(masterKey, "gravity-claw-salt", 32);
        const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, Buffer.from(data.iv, "hex"));
        decipher.setAuthTag(Buffer.from(data.tag, "hex"));
        const decrypted = decipher.update(data.encrypted, "hex", "utf-8") + decipher.final("utf-8");
        return JSON.parse(decrypted);
    } catch {
        return {};
    }
}

function saveSecrets(secrets: Record<string, string>, masterKey: string): void {
    const dir = path.dirname(SECRETS_FILE);
    fs.mkdirSync(dir, { recursive: true });

    const derivedKey = crypto.scryptSync(masterKey, "gravity-claw-salt", 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
    const encrypted = cipher.update(JSON.stringify(secrets), "utf-8", "hex") + cipher.final("hex");
    const tag = cipher.getAuthTag();

    fs.writeFileSync(SECRETS_FILE, JSON.stringify({
        iv: iv.toString("hex"),
        tag: tag.toString("hex"),
        encrypted,
    }));
}
