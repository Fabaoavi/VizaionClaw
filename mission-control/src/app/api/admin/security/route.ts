import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

// In production, the VizaionClaw root is one dir above mission-control.
const DATA_DIR = path.resolve(process.cwd(), "..", "data");
const SECURITY_FILE = path.join(DATA_DIR, "security.json");

// Define a fallback so the dashboard doesn't crash if the file is missing
const DEFAULT_CONFIG = {
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
    globalAllowedHosts: [],
    enableContainerIsolation: false,
    userPathRules: {}
};

export async function GET() {
    try {
        if (!fs.existsSync(SECURITY_FILE)) {
            return NextResponse.json(DEFAULT_CONFIG);
        }
        const data = fs.readFileSync(SECURITY_FILE, "utf-8");
        return NextResponse.json(JSON.parse(data));
    } catch (e) {
        console.error("Failed to read security config:", e);
        return NextResponse.json({ error: "Failed to read security configuration." }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        fs.writeFileSync(SECURITY_FILE, JSON.stringify(body, null, 2), "utf-8");

        return NextResponse.json({ success: true, config: body });
    } catch (e) {
        console.error("Failed to write security config:", e);
        return NextResponse.json({ error: "Failed to save security configuration." }, { status: 500 });
    }
}
