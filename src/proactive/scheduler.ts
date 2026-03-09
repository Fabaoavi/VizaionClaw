// ─── Gravity Claw — Proactive Scheduler ─────────────────────────
// Cron-based task scheduler for morning briefings, evening recaps,
// heartbeat checks, reminders, and custom scheduled tasks.
// Supports per-user message sending.

import type { Config } from "../config.js";
import { getDueReminders, markReminderSent } from "../tasks/store.js";

interface ScheduledTask {
    id: string;
    name: string;
    cronExpression: string;
    handler: () => Promise<string>;
    enabled: boolean;
    lastRun?: Date;
    nextRun?: Date;
    intervalId?: ReturnType<typeof setInterval>;
}

const tasks = new Map<string, ScheduledTask>();

// Per-user message senders: canonicalUserId → sendFn
const userSenders = new Map<string, (text: string) => Promise<void>>();

// Global fallback sender (for system-level notifications)
let globalSender: ((text: string) => Promise<void>) | null = null;

export function initScheduler(messageSender: (text: string) => Promise<void>): void {
    globalSender = messageSender;
    console.log("✅ Scheduler ready");
}

/**
 * Register a per-user message sender. Called each time a user interacts.
 */
export function registerUserSender(userId: string, sendFn: (text: string) => Promise<void>): void {
    userSenders.set(userId, sendFn);
}

/**
 * Send a message to a specific user. Falls back to global sender.
 */
export async function sendToUser(userId: string, text: string): Promise<boolean> {
    const sender = userSenders.get(userId);
    if (sender) {
        await sender(text);
        return true;
    }
    if (globalSender) {
        await globalSender(text);
        return true;
    }
    return false;
}

/**
 * Register a scheduled task with a simple interval (ms).
 */
export function scheduleTask(
    id: string,
    name: string,
    intervalMs: number,
    handler: () => Promise<string>,
    cronExpression = ""
): void {
    const task: ScheduledTask = {
        id,
        name,
        cronExpression: cronExpression || `every ${Math.round(intervalMs / 60000)}m`,
        handler,
        enabled: true,
    };

    task.intervalId = setInterval(async () => {
        if (!task.enabled) return;

        try {
            task.lastRun = new Date();
            const result = await handler();
            if (result && globalSender) {
                await globalSender(result);
            }
        } catch (err) {
            console.error(`❌ Scheduled task "${name}" failed:`, err);
        }
    }, intervalMs);

    tasks.set(id, task);
}

export function pauseTask(id: string): boolean {
    const task = tasks.get(id);
    if (!task) return false;
    task.enabled = false;
    return true;
}

export function resumeTask(id: string): boolean {
    const task = tasks.get(id);
    if (!task) return false;
    task.enabled = true;
    return true;
}

export function deleteTask(id: string): boolean {
    const task = tasks.get(id);
    if (!task) return false;
    if (task.intervalId) clearInterval(task.intervalId);
    tasks.delete(id);
    return true;
}

export function listTasks(): Array<{ id: string; name: string; enabled: boolean; cron: string; lastRun?: string }> {
    return Array.from(tasks.values()).map((t) => ({
        id: t.id,
        name: t.name,
        enabled: t.enabled,
        cron: t.cronExpression,
        lastRun: t.lastRun?.toISOString(),
    }));
}

export function stopAllTasks(): void {
    for (const task of tasks.values()) {
        if (task.intervalId) clearInterval(task.intervalId);
    }
    tasks.clear();
}

// ── Built-in Proactive Tasks ─────────────────────────────────────

export function setupMorningBriefing(config: Config, agentFn: (prompt: string) => Promise<string>): void {
    scheduleTask("morning_briefing", "Morning Briefing", 30 * 60 * 1000, async () => {
        const hour = new Date().getHours();
        if (hour !== 8) return "";

        // Send to all registered users
        const briefing = await agentFn(
            "Generate a brief morning check-in. Include: current time, a motivational greeting, and ask if there's anything I'd like to plan for today. Keep it short and friendly."
        );
        const text = `☀️ *Morning Briefing*\n\n${briefing}`;

        for (const [userId, sender] of userSenders) {
            try { await sender(text); } catch (e) { console.warn(`Failed to send briefing to ${userId}`); }
        }
        return ""; // Already sent individually
    }, "0 8 * * *");
}

export function setupEveningRecap(config: Config, agentFn: (prompt: string) => Promise<string>): void {
    scheduleTask("evening_recap", "Evening Recap", 30 * 60 * 1000, async () => {
        const hour = new Date().getHours();
        if (hour !== 21) return "";

        const recap = await agentFn(
            "Generate a brief evening recap. Summarize what we discussed today, any tasks completed, and wish good night. Keep it short."
        );
        const text = `🌙 *Evening Recap*\n\n${recap}`;

        for (const [userId, sender] of userSenders) {
            try { await sender(text); } catch (e) { console.warn(`Failed to send recap to ${userId}`); }
        }
        return "";
    }, "0 21 * * *");
}

export function setupHeartbeat(intervalMinutes: number, checkFn: () => Promise<string | null>): void {
    scheduleTask("heartbeat", "Heartbeat Check", intervalMinutes * 60 * 1000, async () => {
        const result = await checkFn();
        return result || "";
    }, `every ${intervalMinutes}m`);
}

export function setupAgenticHeartbeat(intervalMinutes: number, agentFn: (prompt: string) => Promise<string>): void {
    scheduleTask("agentic_heartbeat", "Agentic Proactive Heartbeat", intervalMinutes * 60 * 1000, async () => {
        const prompt = `[SYSTEM PROACTIVE HEARTBEAT]
It is currently ${new Date().toLocaleString()}. Check your memory and pending tasks. 
If there is an important task that is due, a follow-up you missed, or anything urgent you must proactively tell the user right now, write the message. 
If there is absolutely NOTHING to say, you MUST reply EXACTLY with 'NO_MESSAGE' and nothing else.`;

        const response = await agentFn(prompt);
        if (response.trim() === "NO_MESSAGE" || response.includes("NO_MESSAGE")) {
            return ""; // Silent failure, working as intended
        }

        const text = `📬 *Proactive Ping*\n\n${response}`;
        for (const [userId, sender] of userSenders) {
            try { await sender(text); } catch (e) { console.warn(`Failed to send agentic heartbeat to ${userId}`); }
        }
        return "";
    }, `every ${intervalMinutes}m`);
}

// ── Reminder System ──────────────────────────────────────────────

/**
 * Start the reminder check loop. Runs every 60 seconds looking for due reminders.
 */
export function startReminderLoop(): void {
    scheduleTask("reminder_check", "Reminder Check", 60 * 1000, async () => {
        const dueReminders = getDueReminders();

        for (const reminder of dueReminders) {
            const taskInfo = reminder.task_title ? ` (Task: ${reminder.task_title})` : "";
            const text = `🔔 *Reminder*\n\n${reminder.message}${taskInfo}`;

            const sent = await sendToUser(reminder.user_id, text);
            if (sent) {
                markReminderSent(reminder.id);
            }
        }
        return "";
    }, "every 1m");
}
