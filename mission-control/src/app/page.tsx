'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    MessageSquare,
    Wrench,
    RefreshCw,
    Clock,
    Heart,
    Send,
    Play,
    Zap,
    Activity,
    AlertCircle,
    Shield,
    CheckSquare,
    ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

interface TaskStats {
    total: number;
    todo: number;
    progress: number;
    done: number;
    overdue: number;
    inProgress: { id: string; title: string; priority: string; project_name?: string }[];
}

interface LogEntry {
    id: number;
    created_at: string;
    level: string;
    message: string;
    metadata: string | null;
}

const ICON_MAP: Record<string, typeof Heart> = {
    heartbeat: Heart,
    message: MessageSquare,
    tool: Wrench,
    error: AlertCircle,
};

function getLogType(message: string): string {
    if (message.toLowerCase().includes('heartbeat')) return 'heartbeat';
    if (message.toLowerCase().includes('error') || message.toLowerCase().includes('fail')) return 'error';
    if (message.toLowerCase().includes('tool') || message.toLowerCase().includes('memory')) return 'tool';
    return 'message';
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

export default function CommandCenter() {
    const [time, setTime] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);
    const [taskStats, setTaskStats] = useState<TaskStats | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [msgCount, setMsgCount] = useState(0);
    const [toolCount, setToolCount] = useState(0);

    useEffect(() => {
        const update = () => setTime(new Date().toLocaleTimeString());
        update();
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, []);

    const fetchData = useCallback(async () => {
        try {
            // Task stats
            const statsRes = await fetch('/api/tasks/stats');
            if (statsRes.ok) {
                const data = await statsRes.json();
                setTaskStats(data);
            }

            // Logs (use admin endpoint if admin, else system logs)
            const logRes = await fetch('/api/admin/logs');
            if (logRes.ok) {
                const data = await logRes.json();
                const allLogs = data.logs || [];
                setLogs(allLogs.slice(0, 10));
                setMsgCount(allLogs.filter((l: LogEntry) => l.message.startsWith('Message from') || l.message.startsWith('Replied to')).length);
                setToolCount(allLogs.filter((l: LogEntry) => l.message.toLowerCase().includes('tool')).length);
            }
        } catch (err) {
            console.error('Command Center fetch error:', err);
        }
    }, []);

    useEffect(() => {
        fetch('/api/auth/session')
            .then(res => res.json())
            .then(data => {
                if (data.session?.isAdmin) setIsAdmin(true);
            })
            .catch(console.error);
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const stats = [
        { label: 'Messages', value: String(msgCount), badge: 'from logs', color: 'orange', icon: MessageSquare },
        { label: 'Tasks Active', value: String((taskStats?.todo || 0) + (taskStats?.progress || 0)), badge: `${taskStats?.done || 0} done`, color: 'blue', icon: CheckSquare },
        { label: 'In Progress', value: String(taskStats?.progress || 0), badge: `${taskStats?.overdue || 0} overdue`, color: 'green', icon: Zap },
        { label: 'Tool Calls', value: String(toolCount), badge: 'from logs', color: 'orange', icon: Wrench },
    ];

    return (
        <>
            {/* Page Header */}
            <div className="page-header">
                <h1>🏠 Command Center</h1>
                <p>Real-time overview · {time}</p>
            </div>

            {/* Stat Cards */}
            <div className="stat-grid">
                {stats.map((s, i) => {
                    const Icon = s.icon;
                    return (
                        <div key={s.label} className={`stat-card ${s.color} delay-${i + 1}`}>
                            <div className="stat-label">
                                <Icon size={14} />
                                {s.label}
                            </div>
                            <div className="stat-value">{s.value}</div>
                            <span className={`stat-badge ${s.color}`}>{s.badge}</span>
                        </div>
                    );
                })}
            </div>

            {/* Main Grid: Activity Feed + Panels */}
            <div className="section-grid">
                {/* Live Activity Feed */}
                <div className="card delay-5">
                    <div className="card-header">
                        <h2><Activity size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />Live Activity</h2>
                        <span className="tag green"><span className="status-dot online" /> Live</span>
                    </div>
                    <ul className="activity-list">
                        {logs.length === 0 ? (
                            <li className="activity-item" style={{ justifyContent: 'center', color: 'var(--text-muted)' }}>
                                No activity yet. Send a message to the bot!
                            </li>
                        ) : (
                            logs.map((log) => {
                                const logType = getLogType(log.message);
                                const Icon = ICON_MAP[logType] || Zap;
                                return (
                                    <li key={log.id} className="activity-item">
                                        <div className={`activity-icon ${logType}`}>
                                            <Icon size={16} />
                                        </div>
                                        <div className="activity-content">
                                            <div className="activity-title">{log.message.slice(0, 100)}</div>
                                            <div className="activity-time">{timeAgo(log.created_at)}</div>
                                        </div>
                                    </li>
                                );
                            })
                        )}
                    </ul>
                </div>

                {/* Right Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)' }}>
                    {/* My Tasks Widget */}
                    <div className="card delay-6">
                        <div className="card-header">
                            <h2>📋 My Tasks</h2>
                            <Link href="/tasks" className="tag blue" style={{ textDecoration: 'none' }}>
                                View All <ChevronRight size={12} />
                            </Link>
                        </div>
                        <ul className="activity-list" style={{ maxHeight: 200 }}>
                            {(!taskStats?.inProgress || taskStats.inProgress.length === 0) ? (
                                <li className="activity-item" style={{ justifyContent: 'center', color: 'var(--text-muted)', fontSize: 'var(--font-sm)' }}>
                                    No tasks in progress. Create one in Tasks & Projects!
                                </li>
                            ) : (
                                taskStats.inProgress.map((task) => (
                                    <li key={task.id} className="activity-item">
                                        <div className={`activity-icon tool`}>
                                            <CheckSquare size={16} />
                                        </div>
                                        <div className="activity-content">
                                            <div className="activity-title">{task.title}</div>
                                            <div className="activity-time">{task.project_name || 'No project'}</div>
                                        </div>
                                        <span className={`tag ${task.priority === 'high' ? 'red' : task.priority === 'medium' ? 'orange' : 'green'}`}>
                                            {task.priority}
                                        </span>
                                    </li>
                                ))
                            )}
                        </ul>
                    </div>

                    {/* Quick Actions */}
                    <div className="card delay-7">
                        <div className="card-header">
                            <h2>⚡ Quick Actions</h2>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
                            <Link href="/tasks" className="btn btn-primary" style={{ textDecoration: 'none' }}>
                                <CheckSquare size={14} /> Open Tasks
                            </Link>
                            <Link href="/brain" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
                                <Activity size={14} /> Second Brain
                            </Link>
                            <Link href="/connections" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
                                <RefreshCw size={14} /> Connections
                            </Link>
                            {isAdmin && (
                                <Link href="/admin" className="btn btn-primary" style={{ background: 'var(--brand-red)', borderColor: 'var(--brand-red)', textDecoration: 'none' }}>
                                    <Shield size={14} /> ADMIN PANEL
                                </Link>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
