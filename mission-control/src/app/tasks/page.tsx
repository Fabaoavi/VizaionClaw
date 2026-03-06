'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    CheckSquare,
    Plus,
    FolderOpen,
    Clock,
    AlertCircle,
    X,
    ChevronRight,
    Trash2,
} from 'lucide-react';

interface Task {
    id: string;
    project_id: string | null;
    user_id: string;
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    status: 'todo' | 'progress' | 'done';
    due_date: string | null;
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

export default function TasksPage() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProject, setSelectedProject] = useState<string | null>(null);
    const [showNewTask, setShowNewTask] = useState(false);
    const [showNewProject, setShowNewProject] = useState(false);
    const [currentUser, setCurrentUser] = useState<string | null>(null);
    const [filterType, setFilterType] = useState<'all' | 'personal' | 'delegated' | 'shared'>('all');

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
            const [taskRes, projRes] = await Promise.all([
                fetch(`/api/tasks${selectedProject ? `?project_id=${selectedProject}` : ''}`),
                fetch('/api/projects'),
            ]);
            if (taskRes.ok) {
                const data = await taskRes.json();
                setTasks(data.tasks || []);
                setCurrentUser(data.currentUser || null);
            }
            if (projRes.ok) {
                const data = await projRes.json();
                setProjects(data.projects || []);
            }
        } catch (err) {
            console.error('Failed to fetch tasks:', err);
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

    const filteredTasks = tasks.filter(t => {
        if (filterType === 'all') return true;

        const isCreator = t.user_id === currentUser;
        const isAssignee = t.assignee_id === currentUser;
        const isUnassigned = !t.assignee_id;

        if (filterType === 'personal') return isCreator && (isUnassigned || isAssignee);
        if (filterType === 'delegated') return isCreator && t.assignee_id && !isAssignee;
        if (filterType === 'shared') return isAssignee && !isCreator;
        return true;
    });

    const todo = filteredTasks.filter(t => t.status === 'todo');
    const progress = filteredTasks.filter(t => t.status === 'progress');
    const done = filteredTasks.filter(t => t.status === 'done');

    if (loading) return <div className="page-header"><h1>✅ Tasks & Projects</h1><p>Loading...</p></div>;

    return (
        <>
            <div className="page-header">
                <h1>✅ Tasks & Projects</h1>
                <p>{tasks.length} tasks · {projects.length} projects</p>
            </div>

            {/* Action Bar */}
            <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-xl)' }}>
                <button className="btn btn-primary" onClick={() => setShowNewTask(true)}>
                    <Plus size={14} /> New Task
                </button>
                <button className="btn btn-secondary" onClick={() => setShowNewProject(true)}>
                    <FolderOpen size={14} /> New Project
                </button>
            </div>

            {/* New Task Modal */}
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

            {/* New Project Modal */}
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

            {/* Project & Type Filter */}
            <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 'var(--space-xs)', background: 'var(--bg-deep)', padding: 4, borderRadius: 8 }}>
                    {(['all', 'personal', 'delegated', 'shared'] as const).map(type => (
                        <button
                            key={type}
                            className={`btn ${filterType === type ? 'btn-primary' : ''}`}
                            style={filterType !== type ? { background: 'transparent', border: 'none', color: 'var(--text-muted)' } : {}}
                            onClick={() => setFilterType(type)}
                        >
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                        </button>
                    ))}
                </div>

                <div style={{ width: 1, height: 24, background: 'var(--border-color)', margin: '0 8px' }} />

                {projects.length > 0 && (
                    <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                        <button
                            className={`btn ${!selectedProject ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setSelectedProject(null)}
                        >
                            All Projects
                        </button>
                        {projects.map(p => (
                            <button
                                key={p.id}
                                className={`btn ${selectedProject === p.id ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setSelectedProject(selectedProject === p.id ? null : p.id)}
                                style={selectedProject === p.id ? { background: p.color, borderColor: p.color } : {}}
                            >
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block', marginRight: 6 }} />
                                {p.name}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Kanban Board */}
            <div className="kanban-board">
                {[
                    { label: 'To Do', items: todo, color: 'var(--text-muted)', nextStatus: 'progress', nextLabel: 'Start' },
                    { label: 'In Progress', items: progress, color: 'var(--brand-orange)', nextStatus: 'done', nextLabel: 'Complete' },
                    { label: 'Complete', items: done, color: 'var(--brand-green)', nextStatus: null, nextLabel: null },
                ].map((col) => (
                    <div key={col.label} className="kanban-column">
                        <div className="kanban-column-header" style={{ color: col.color }}>
                            {col.label}
                            <span className="kanban-column-count">{col.items.length}</span>
                        </div>
                        {col.items.length === 0 ? (
                            <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--font-sm)' }}>
                                No tasks here yet
                            </div>
                        ) : (
                            col.items.map((task) => (
                                <div key={task.id} className="kanban-card">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <h4 style={{ margin: 0, flex: 1 }}>
                                            <span className={`priority-dot ${task.priority}`} />
                                            {task.title}
                                        </h4>
                                        <button
                                            onClick={() => deleteTaskById(task.id)}
                                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
                                            title="Delete task"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                    {task.project_name && (
                                        <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: `${task.project_color || '#F5A623'}22`, color: task.project_color || '#F5A623', display: 'inline-block', marginTop: 4, marginRight: 6 }}>
                                            {task.project_name}
                                        </span>
                                    )}
                                    {task.assignee_id && task.assignee_id !== task.user_id && (
                                        <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)', display: 'inline-block', marginTop: 4 }}>
                                            {task.user_id === currentUser ? `To: ${task.assignee_name || 'Unknown'}` : `From: ${task.creator_name || 'Unknown'}`}
                                        </span>
                                    )}
                                    {task.due_date && (
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                            <Clock size={11} />
                                            {new Date(task.due_date).toLocaleDateString()}
                                        </div>
                                    )}
                                    {col.nextStatus && (
                                        <button
                                            className="btn btn-secondary"
                                            style={{ marginTop: 8, fontSize: 11, padding: '3px 8px' }}
                                            onClick={() => updateTaskStatus(task.id, col.nextStatus!)}
                                        >
                                            {col.nextLabel} <ChevronRight size={11} />
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                ))}
            </div>
        </>
    );
}
