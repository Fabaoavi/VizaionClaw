// ─── Gravity Claw — Tasks & Projects Store ─────────────────────
// SQLite-backed per-user task management: projects, tasks, and reminders.

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

// ── Types ────────────────────────────────────────────────────────

export interface Project {
    id: string;
    user_id: string;
    name: string;
    description: string;
    color: string;
    status: "active" | "archived";
    created_at: string;
    updated_at: string;
}

export interface Task {
    id: string;
    project_id: string | null;
    user_id: string;
    assignee_id: string | null;
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    status: "todo" | "progress" | "done";
    due_date: string | null;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
}

export interface Reminder {
    id: string;
    user_id: string;
    task_id: string | null;
    message: string;
    trigger_at: string;
    sent: boolean;
    created_at: string;
}

export interface TaskStats {
    total: number;
    todo: number;
    progress: number;
    done: number;
    overdue: number;
    upcoming: Task[];
    recentlyCompleted: Task[];
}

// ── DB Init ──────────────────────────────────────────────────────

function getDb(): Database.Database {
    const dbPath = path.join(process.cwd(), "data", "users.db");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");

    db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            color TEXT DEFAULT '#F5A623',
            status TEXT DEFAULT 'active',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            user_id TEXT NOT NULL,
            assignee_id TEXT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            priority TEXT DEFAULT 'medium',
            status TEXT DEFAULT 'todo',
            due_date TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            completed_at TEXT,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS reminders (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            task_id TEXT,
            message TEXT NOT NULL,
            trigger_at TEXT NOT NULL,
            sent INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(user_id, status);
        CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
        CREATE INDEX IF NOT EXISTS idx_reminders_trigger ON reminders(trigger_at, sent);
    `);

    // Migration: add assignee_id if it doesn't exist
    try {
        db.exec("ALTER TABLE tasks ADD COLUMN assignee_id TEXT");
    } catch (e) {
        // Ignore if column already exists
    }

    return db;
}

// ── Projects ─────────────────────────────────────────────────────

export function createProject(userId: string, name: string, description = "", color = "#F5A623"): Project {
    const db = getDb();
    try {
        const id = crypto.randomUUID();
        db.prepare(`
            INSERT INTO projects (id, user_id, name, description, color)
            VALUES (?, ?, ?, ?, ?)
        `).run(id, userId, name, description, color);

        return db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project;
    } finally {
        db.close();
    }
}

export function listProjects(userId: string): Project[] {
    const db = getDb();
    try {
        return db.prepare(
            "SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC"
        ).all(userId) as Project[];
    } finally {
        db.close();
    }
}

export function updateProject(id: string, userId: string, updates: Partial<Pick<Project, "name" | "description" | "color" | "status">>): Project | null {
    const db = getDb();
    try {
        const fields: string[] = [];
        const values: unknown[] = [];

        if (updates.name !== undefined) { fields.push("name = ?"); values.push(updates.name); }
        if (updates.description !== undefined) { fields.push("description = ?"); values.push(updates.description); }
        if (updates.color !== undefined) { fields.push("color = ?"); values.push(updates.color); }
        if (updates.status !== undefined) { fields.push("status = ?"); values.push(updates.status); }

        if (fields.length === 0) return null;
        fields.push("updated_at = datetime('now')");
        values.push(id, userId);

        db.prepare(`UPDATE projects SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`).run(...values);
        return db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project | null;
    } finally {
        db.close();
    }
}

// ── Tasks ────────────────────────────────────────────────────────

export function createTask(
    userId: string,
    title: string,
    opts: { projectId?: string; assigneeId?: string; description?: string; priority?: "high" | "medium" | "low"; dueDate?: string } = {}
): Task {
    const db = getDb();
    try {
        const id = crypto.randomUUID();
        db.prepare(`
            INSERT INTO tasks (id, project_id, user_id, assignee_id, title, description, priority, due_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, opts.projectId || null, userId, opts.assigneeId || null, title, opts.description || "", opts.priority || "medium", opts.dueDate || null);

        return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task;
    } finally {
        db.close();
    }
}

export function listTasks(userId: string, filters?: { status?: string; projectId?: string }): Task[] {
    const db = getDb();
    try {
        let query = "SELECT * FROM tasks WHERE (user_id = ? OR assignee_id = ?)";
        const params: unknown[] = [userId, userId];

        if (filters?.status) {
            query += " AND status = ?";
            params.push(filters.status);
        }
        if (filters?.projectId) {
            query += " AND project_id = ?";
            params.push(filters.projectId);
        }

        query += " ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, created_at DESC";

        return db.prepare(query).all(...params) as Task[];
    } finally {
        db.close();
    }
}

export function updateTask(id: string, userId: string, updates: Partial<Pick<Task, "title" | "description" | "priority" | "status" | "due_date" | "project_id">>): Task | null {
    const db = getDb();
    try {
        const fields: string[] = [];
        const values: unknown[] = [];

        if (updates.title !== undefined) { fields.push("title = ?"); values.push(updates.title); }
        if (updates.description !== undefined) { fields.push("description = ?"); values.push(updates.description); }
        if (updates.priority !== undefined) { fields.push("priority = ?"); values.push(updates.priority); }
        if (updates.status !== undefined) {
            fields.push("status = ?"); values.push(updates.status);
            if (updates.status === "done") {
                fields.push("completed_at = datetime('now')");
            } else {
                fields.push("completed_at = NULL");
            }
        }
        if (updates.due_date !== undefined) { fields.push("due_date = ?"); values.push(updates.due_date); }
        if (updates.project_id !== undefined) { fields.push("project_id = ?"); values.push(updates.project_id); }

        if (fields.length === 0) return null;
        fields.push("updated_at = datetime('now')");
        // Ensure that either the creator or the assignee can update the task
        values.push(id, userId, userId);

        db.prepare(`UPDATE tasks SET ${fields.join(", ")} WHERE id = ? AND (user_id = ? OR assignee_id = ?)`).run(...values);
        return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task | null;
    } finally {
        db.close();
    }
}

export function deleteTask(id: string, userId: string): boolean {
    const db = getDb();
    try {
        const result = db.prepare("DELETE FROM tasks WHERE id = ? AND (user_id = ? OR assignee_id = ?)").run(id, userId, userId);
        return result.changes > 0;
    } finally {
        db.close();
    }
}

export function getTaskStats(userId: string): TaskStats {
    const db = getDb();
    try {
        const all = db.prepare("SELECT * FROM tasks WHERE user_id = ? OR assignee_id = ?").all(userId, userId) as Task[];
        const now = new Date().toISOString();

        return {
            total: all.length,
            todo: all.filter(t => t.status === "todo").length,
            progress: all.filter(t => t.status === "progress").length,
            done: all.filter(t => t.status === "done").length,
            overdue: all.filter(t => t.due_date && t.due_date < now && t.status !== "done").length,
            upcoming: all.filter(t => t.due_date && t.status !== "done")
                .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""))
                .slice(0, 5),
            recentlyCompleted: all.filter(t => t.status === "done")
                .sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""))
                .slice(0, 5),
        };
    } finally {
        db.close();
    }
}

// ── Reminders ────────────────────────────────────────────────────

export function createReminder(userId: string, message: string, triggerAt: string, taskId?: string): Reminder {
    const db = getDb();
    try {
        const id = crypto.randomUUID();
        db.prepare(`
            INSERT INTO reminders (id, user_id, task_id, message, trigger_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(id, userId, taskId || null, message, triggerAt);

        return db.prepare("SELECT * FROM reminders WHERE id = ?").get(id) as Reminder;
    } finally {
        db.close();
    }
}

export function getDueReminders(): (Reminder & { task_title?: string })[] {
    const db = getDb();
    try {
        const now = new Date().toISOString();
        return db.prepare(`
            SELECT r.*, t.title as task_title
            FROM reminders r
            LEFT JOIN tasks t ON r.task_id = t.id
            WHERE r.trigger_at <= ? AND r.sent = 0
            ORDER BY r.trigger_at ASC
        `).all(now) as (Reminder & { task_title?: string })[];
    } finally {
        db.close();
    }
}

export function markReminderSent(id: string): void {
    const db = getDb();
    try {
        db.prepare("UPDATE reminders SET sent = 1 WHERE id = ?").run(id);
    } finally {
        db.close();
    }
}

export function listReminders(userId: string, includeSent = false): Reminder[] {
    const db = getDb();
    try {
        const query = includeSent
            ? "SELECT * FROM reminders WHERE user_id = ? ORDER BY trigger_at DESC"
            : "SELECT * FROM reminders WHERE user_id = ? AND sent = 0 ORDER BY trigger_at ASC";
        return db.prepare(query).all(userId) as Reminder[];
    } finally {
        db.close();
    }
}
