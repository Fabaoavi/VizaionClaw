'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    CheckSquare,
    Plus,
    FolderOpen,
    Clock,
    X,
    Trash2,
    Users
} from 'lucide-react';
import { TaskCanvas } from '@/components/TaskCanvas';
import { TaskCalendar, CalendarEvent } from '@/components/TaskCalendar';

interface Task {
    id: string;
    project_id: string | null;
    user_id: string;
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    status: 'todo' | 'progress' | 'done';
    due_date: string | null;
    canvas_x?: number;
    canvas_y?: number;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
    project_name?: string;
    project_color?: string;
    creator_name?: string;
    assignee_name?: string;
    assignee_id?: string | null;
}

interface Project {
    id: string;
    name: string;
    description: string;
    color: string;
    status: string;
    task_count: number;
}

interface TaskEdge {
    id: string;
    source_id: string;
    target_id: string;
}

export default function TasksPage() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [taskEdges, setTaskEdges] = useState<TaskEdge[]>([]);
    const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProject, setSelectedProject] = useState<string | null>(null);
    const [showNewTask, setShowNewTask] = useState(false);
    const [showNewProject, setShowNewProject] = useState(false);
    const [currentUser, setCurrentUser] = useState<string | null>(null);

    // New task form
    const [newTitle, setNewTitle] = useState('');
    const [newPriority, setNewPriority] = useState<'high' | 'medium' | 'low'>('medium');
    const [newDueDate, setNewDueDate] = useState('');
    const [newProjectId, setNewProjectId] = useState('');

    // New project form
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectColor, setNewProjectColor] = useState('#F5A623');

    const fetchData = useCallback(async () => {
        try {
            const [taskRes, projRes, edgeRes, calRes] = await Promise.all([
                fetch(`/api/tasks${selectedProject ? `?project_id=${selectedProject}` : ''}`),
                fetch('/api/projects'),
                fetch('/api/tasks/edges'),
                fetch('/api/calendar')
            ]);

            let fetchedTasks: Task[] = [];
            if (taskRes.ok) {
                const data = await taskRes.json();
                fetchedTasks = data.tasks || [];
                setTasks(fetchedTasks);
                setCurrentUser(data.currentUser || null);
            }
            if (projRes.ok) {
                const data = await projRes.json();
                setProjects(data.projects || []);
            }
            if (edgeRes.ok) {
                const data = await edgeRes.json();
                setTaskEdges(data.edges || []);
            }

            let gEvents: CalendarEvent[] = [];
            if (calRes.ok) {
                const data = await calRes.json();
                gEvents = data.events || [];
            }

            // Combine local tasks into calendar events
            const localEvents: CalendarEvent[] = fetchedTasks.filter(t => t.due_date).map(t => ({
                id: t.id,
                title: t.title,
                date: t.due_date!.split('T')[0],
                color: t.project_color || (t.priority === 'high' ? '#F53A3A' : t.priority === 'medium' ? '#F5A623' : '#3AF5A6'),
                type: 'local',
                isShared: t.assignee_id !== null && t.assignee_id !== t.user_id,
                sharedBy: t.creator_name
            }));

            setCalendarEvents([...gEvents, ...localEvents]);

        } catch (err) {
            console.error('Failed to fetch data:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedProject]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const createTask = async () => {
        if (!newTitle.trim()) return;
        await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: newTitle,
                priority: newPriority,
                due_date: newDueDate || null,
                project_id: newProjectId || null,
            }),
        });
        setNewTitle(''); setNewPriority('medium'); setNewDueDate(''); setNewProjectId('');
        setShowNewTask(false);
        fetchData();
    };

    const createProject = async () => {
        if (!newProjectName.trim()) return;
        await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newProjectName, color: newProjectColor }),
        });
        setNewProjectName(''); setNewProjectColor('#F5A623');
        setShowNewProject(false);
        fetchData();
    };

    const updateTaskStatus = async (id: string, status: string) => {
        await fetch('/api/tasks', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status }),
        });
        fetchData();
    };

    const deleteTaskById = async (id: string) => {
        await fetch(`/api/tasks?id=${id}`, { method: 'DELETE' });
        fetchData();
    };

    const handleNodeDragStop = async (id: string, x: number, y: number) => {
        // Update local state instantly avoiding jitter
        setTasks(prev => prev.map(t => t.id === id ? { ...t, canvas_x: x, canvas_y: y } : t));
        // Persist DB
        await fetch('/api/tasks', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, canvas_x: x, canvas_y: y }),
        });
    };

    const handleConnectTasks = async (source: string, target: string) => {
        const res = await fetch('/api/tasks/edges', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source_id: source, target_id: target }),
        });
        if (res.ok) fetchData();
    };

    const handleDeleteEdge = async (edgeId: string) => {
        const res = await fetch(`/api/tasks/edges?id=${edgeId}`, { method: 'DELETE' });
        if (res.ok) fetchData();
    };

    if (loading) return <div className="page-header"><h1>✅ Workspace</h1><p>Loading...</p></div>;

    // Filter logic for prioritized left list
    let listTasks = [...tasks];

    // Sort logic (Incomplete first, then Priority, then Date)
    listTasks.sort((a, b) => {
        if (a.status === 'done' && b.status !== 'done') return 1;
        if (a.status !== 'done' && b.status === 'done') return -1;

        const priorityScore = { high: 3, medium: 2, low: 1 };
        const pA = priorityScore[a.priority] || 0;
        const pB = priorityScore[b.priority] || 0;
        if (pA !== pB) return pB - pA; // Higher first

        if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        if (a.due_date) return -1;
        if (b.due_date) return 1;
        return 0;
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)', height: 'calc(100vh - 80px)' }}>

            <div className="page-header" style={{ flexShrink: 0 }}>
                <h1>✅ Workspace</h1>
                <p>Manage schedule, layout nodes, and shared tasks.</p>
                <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
                    <button className="btn btn-primary" onClick={() => setShowNewTask(true)}>
                        <Plus size={14} /> New Task
                    </button>
                    <button className="btn btn-secondary" onClick={() => setShowNewProject(true)}>
                        <FolderOpen size={14} /> New Project
                    </button>
                </div>
            </div>

            {/* Modals */}
            {showNewTask && (
                <div className="card" style={{ marginBottom: 'var(--space-xl)', border: '1px solid var(--brand-orange)' }}>
                    <div className="card-header">
                        <h2><Plus size={18} style={{ marginRight: 8 }} /> New Task</h2>
                        <button className="btn btn-secondary" onClick={() => setShowNewTask(false)}><X size={14} /></button>
                    </div>
                    <div style={{ padding: 'var(--space-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                        <input
                            type="text" placeholder="Task title..."
                            value={newTitle} onChange={e => setNewTitle(e.target.value)}
                            style={{ width: '100%' }}
                            onKeyDown={e => e.key === 'Enter' && createTask()}
                        />
                        <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
                            <select value={newPriority} onChange={e => setNewPriority(e.target.value as any)}>
                                <option value="high">🔴 High</option>
                                <option value="medium">🟡 Medium</option>
                                <option value="low">🟢 Low</option>
                            </select>
                            <input type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} />
                            <select value={newProjectId} onChange={e => setNewProjectId(e.target.value)}>
                                <option value="">No Project</option>
                                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                        <button className="btn btn-primary" onClick={createTask}>Create Task</button>
                    </div>
                </div>
            )}

            {showNewProject && (
                <div className="card" style={{ marginBottom: 'var(--space-xl)', border: '1px solid var(--brand-purple)' }}>
                    <div className="card-header">
                        <h2><FolderOpen size={18} style={{ marginRight: 8 }} /> New Project</h2>
                        <button className="btn btn-secondary" onClick={() => setShowNewProject(false)}><X size={14} /></button>
                    </div>
                    <div style={{ padding: 'var(--space-lg)', display: 'flex', gap: 'var(--space-md)', alignItems: 'center' }}>
                        <input type="color" value={newProjectColor} onChange={e => setNewProjectColor(e.target.value)} style={{ width: 40, height: 36, padding: 0, border: 'none' }} />
                        <input
                            type="text" placeholder="Project name..."
                            value={newProjectName} onChange={e => setNewProjectName(e.target.value)}
                            style={{ flex: 1 }}
                            onKeyDown={e => e.key === 'Enter' && createProject()}
                        />
                        <button className="btn btn-primary" onClick={createProject}>Create</button>
                    </div>
                </div>
            )}

            {/* Split View Top */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: 'var(--space-xl)', maxHeight: '400px', flexShrink: 0 }}>

                {/* Left: Prioritized List */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div className="card-header">
                        <h2 style={{ fontSize: 16 }}>Agenda</h2>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                        {listTasks.map(task => {
                            const isDone = task.status === 'done';
                            const isShared = task.assignee_id && task.assignee_id !== task.user_id;

                            return (
                                <div key={task.id} style={{
                                    padding: 'var(--space-md)',
                                    background: 'var(--bg-deep)',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--border-color)',
                                    opacity: isDone ? 0.6 : 1,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 6
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <input
                                                type="checkbox"
                                                checked={isDone}
                                                onChange={(e) => updateTaskStatus(task.id, e.target.checked ? 'done' : 'todo')}
                                                style={{ cursor: 'pointer' }}
                                            />
                                            <span style={{
                                                fontWeight: 600,
                                                textDecoration: isDone ? 'line-through' : 'none',
                                                color: isDone ? 'var(--text-muted)' : 'var(--text-main)',
                                                fontSize: 14
                                            }}>
                                                {task.title}
                                            </span>
                                        </div>
                                        <button onClick={() => deleteTaskById(task.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                            <Trash2 size={12} />
                                        </button>
                                    </div>

                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                        <span className={`priority-dot ${task.priority}`} style={{ width: 8, height: 8 }} />

                                        {task.project_name && (
                                            <span style={{ fontSize: 10, padding: '2px 6px', background: `${task.project_color || '#F5A623'}22`, color: task.project_color || '#F5A623', borderRadius: 4 }}>
                                                {task.project_name}
                                            </span>
                                        )}

                                        {task.due_date && (
                                            <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <Clock size={10} /> {new Date(task.due_date).toLocaleDateString()}
                                            </span>
                                        )}

                                        {isShared && (
                                            <span style={{
                                                fontSize: 10,
                                                padding: '2px 6px',
                                                background: 'rgba(56, 189, 248, 0.1)',
                                                color: '#38BDF8',
                                                borderRadius: 4,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 4
                                            }}>
                                                <Users size={10} />
                                                SHARED by {task.creator_name || 'System'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {listTasks.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginTop: 20 }}>No tasks available</div>}
                    </div>
                </div>

                {/* Right: Calendar */}
                <TaskCalendar events={calendarEvents} />
            </div>

            {/* Split View Bottom: Node Canvas */}
            <div style={{ flex: 1, minHeight: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--text-muted)', fontSize: 12, fontWeight: 500 }}>
                    <CheckSquare size={14} /> TASK TOPOLOGY MAP
                </div>
                <TaskCanvas
                    tasks={tasks}
                    taskEdges={taskEdges}
                    onNodeDragStop={handleNodeDragStop}
                    onConnectTasks={handleConnectTasks}
                    onDeleteEdge={handleDeleteEdge}
                />
            </div>

        </div>
    );
}
