// ─── Gravity Claw — Task Management Tools ──────────────────────
// LLM agent tools for creating, managing, and querying tasks, projects, and reminders.

import type { ChatCompletionTool } from "openai/resources/chat/completions";
import {
    createProject, listProjects,
    createTask, listTasks, updateTask, deleteTask,
    createReminder, listReminders,
} from "../tasks/store.js";
import { searchUsers } from "../users/identity.js";

// ── Tool Definitions ─────────────────────────────────────────────

export const taskToolDefinitions: ChatCompletionTool[] = [
    {
        type: "function",
        function: {
            name: "task_create",
            description: "Create a new task for the user. Can optionally assign to a project, set priority, due date, and description.",
            parameters: {
                type: "object",
                properties: {
                    title: { type: "string", description: "Task title" },
                    description: { type: "string", description: "Optional detailed description" },
                    priority: { type: "string", enum: ["high", "medium", "low"], description: "Priority level (default: medium)" },
                    due_date: { type: "string", description: "Due date in ISO 8601 format (e.g. 2026-03-10T09:00:00Z)" },
                    project_name: { type: "string", description: "Name of existing project to attach to (optional)" },
                    assign_to_user: { type: "string", description: "Name or mention of a user to assign this task to (optional)" },
                },
                required: ["title"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "task_list",
            description: "List the user's tasks. Can filter by status (todo, progress, done) or project.",
            parameters: {
                type: "object",
                properties: {
                    status: { type: "string", enum: ["todo", "progress", "done"], description: "Filter by status" },
                    project_name: { type: "string", description: "Filter by project name" },
                },
            },
        },
    },
    {
        type: "function",
        function: {
            name: "task_update",
            description: "Update an existing task's status, priority, or due date. Use this to mark tasks as in-progress or done.",
            parameters: {
                type: "object",
                properties: {
                    task_title: { type: "string", description: "Title (or partial title) of the task to update" },
                    status: { type: "string", enum: ["todo", "progress", "done"], description: "New status" },
                    priority: { type: "string", enum: ["high", "medium", "low"], description: "New priority" },
                    due_date: { type: "string", description: "New due date in ISO 8601" },
                },
                required: ["task_title"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "task_delete",
            description: "Delete a task by its title.",
            parameters: {
                type: "object",
                properties: {
                    task_title: { type: "string", description: "Title (or partial title) of the task to delete" },
                },
                required: ["task_title"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "project_create",
            description: "Create a new project to group tasks under.",
            parameters: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Project name" },
                    description: { type: "string", description: "Project description" },
                    color: { type: "string", description: "Hex color code (e.g. #4A90E2)" },
                },
                required: ["name"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "project_list",
            description: "List the user's projects.",
            parameters: { type: "object", properties: {} },
        },
    },
    {
        type: "function",
        function: {
            name: "reminder_set",
            description: "Set a reminder. The agent will proactively notify the user at the specified time.",
            parameters: {
                type: "object",
                properties: {
                    message: { type: "string", description: "Reminder message text" },
                    trigger_at: { type: "string", description: "When to trigger, ISO 8601 format (e.g. 2026-03-05T14:00:00Z)" },
                    task_title: { type: "string", description: "Optional: link this reminder to a task by title" },
                },
                required: ["message", "trigger_at"],
            },
        },
    },
];

// ── Tool Handlers ────────────────────────────────────────────────

export const taskToolHandlers: Record<string, (input: Record<string, unknown>, userId: string) => string> = {
    task_create: (input, userId) => {
        // Resolve project by name if provided
        let projectId: string | undefined;
        if (input.project_name) {
            const projects = listProjects(userId);
            const match = projects.find(p => p.name.toLowerCase() === String(input.project_name).toLowerCase());
            if (match) {
                projectId = match.id;
            } else {
                // Auto-create the project
                const newP = createProject(userId, String(input.project_name));
                projectId = newP.id;
            }
        }

        let assigneeId: string | undefined;
        let assignMsg = "";
        if (input.assign_to_user) {
            const matches = searchUsers(String(input.assign_to_user));
            if (matches.length > 0) {
                assigneeId = matches[0].id;
                assignMsg = ` (Assigned to ${matches[0].display_name})`;
            } else {
                assignMsg = ` (Could not find user "${input.assign_to_user}" to assign)`;
            }
        }

        const task = createTask(userId, String(input.title), {
            projectId,
            assigneeId,
            description: input.description ? String(input.description) : undefined,
            priority: (input.priority as "high" | "medium" | "low") || "medium",
            dueDate: input.due_date ? String(input.due_date) : undefined,
        });

        return JSON.stringify({
            success: true,
            task: { id: task.id, title: task.title, priority: task.priority, status: task.status, due_date: task.due_date, assignee_id: task.assignee_id },
            message: `Task "${task.title}" created successfully.${assignMsg}`,
        });
    },

    task_list: (input, userId) => {
        let projectId: string | undefined;
        if (input.project_name) {
            const projects = listProjects(userId);
            const match = projects.find(p => p.name.toLowerCase() === String(input.project_name).toLowerCase());
            if (match) projectId = match.id;
        }

        const tasks = listTasks(userId, {
            status: input.status ? String(input.status) : undefined,
            projectId,
        });

        if (tasks.length === 0) {
            return JSON.stringify({ tasks: [], message: "No tasks found matching the criteria." });
        }

        // Get project names for display
        const projects = listProjects(userId);
        const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));

        return JSON.stringify({
            tasks: tasks.map(t => ({
                title: t.title,
                status: t.status,
                priority: t.priority,
                project: t.project_id ? projectMap[t.project_id] || "Unknown" : "No Project",
                due_date: t.due_date,
                description: t.description || undefined,
            })),
            total: tasks.length,
        });
    },

    task_update: (input, userId) => {
        const tasks = listTasks(userId);
        const searchTitle = String(input.task_title).toLowerCase();
        const match = tasks.find(t => t.title.toLowerCase().includes(searchTitle));

        if (!match) {
            return JSON.stringify({ success: false, message: `No task found matching "${input.task_title}".` });
        }

        const updates: Record<string, unknown> = {};
        if (input.status) updates.status = input.status;
        if (input.priority) updates.priority = input.priority;
        if (input.due_date) updates.due_date = input.due_date;

        const updated = updateTask(match.id, userId, updates as any);
        return JSON.stringify({
            success: true,
            task: updated ? { title: updated.title, status: updated.status, priority: updated.priority } : null,
            message: `Task "${match.title}" updated.`,
        });
    },

    task_delete: (input, userId) => {
        const tasks = listTasks(userId);
        const searchTitle = String(input.task_title).toLowerCase();
        const match = tasks.find(t => t.title.toLowerCase().includes(searchTitle));

        if (!match) {
            return JSON.stringify({ success: false, message: `No task found matching "${input.task_title}".` });
        }

        deleteTask(match.id, userId);
        return JSON.stringify({ success: true, message: `Task "${match.title}" deleted.` });
    },

    project_create: (input, userId) => {
        const project = createProject(
            userId,
            String(input.name),
            input.description ? String(input.description) : "",
            input.color ? String(input.color) : "#F5A623"
        );

        return JSON.stringify({
            success: true,
            project: { id: project.id, name: project.name, color: project.color },
            message: `Project "${project.name}" created.`,
        });
    },

    project_list: (_input, userId) => {
        const projects = listProjects(userId);
        if (projects.length === 0) {
            return JSON.stringify({ projects: [], message: "No projects found. Create one first!" });
        }

        return JSON.stringify({
            projects: projects.map(p => ({ name: p.name, color: p.color, status: p.status })),
            total: projects.length,
        });
    },

    reminder_set: (input, userId) => {
        let taskId: string | undefined;
        if (input.task_title) {
            const tasks = listTasks(userId);
            const match = tasks.find(t => t.title.toLowerCase().includes(String(input.task_title).toLowerCase()));
            if (match) taskId = match.id;
        }

        const reminder = createReminder(
            userId,
            String(input.message),
            String(input.trigger_at),
            taskId,
        );

        const triggerDate = new Date(reminder.trigger_at);
        return JSON.stringify({
            success: true,
            message: `Reminder set for ${triggerDate.toLocaleString()}. I'll notify you then!`,
        });
    },
};
