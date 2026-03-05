'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Zap,
    Calendar,
    Flame,
    TrendingUp,
    Plus,
    X,
    Check,
    StickyNote,
} from 'lucide-react';

/* ── Helpers ──────────────────────────────────────────────── */
const LS_HABITS = 'mc_habits';
const LS_TODOS = 'mc_todos';
const LS_NOTES = 'mc_notes';

function loadJSON<T>(key: string, fallback: T): T {
    if (typeof window === 'undefined') return fallback;
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function saveJSON(key: string, value: unknown) {
    localStorage.setItem(key, JSON.stringify(value));
}

/* ── Types ────────────────────────────────────────────────── */
interface Todo {
    id: number;
    text: string;
    done: boolean;
}

interface Note {
    id: number;
    text: string;
}

/* ── Motivational Messages ────────────────────────────────── */
const MOTIVATION = [
    'Day 1. Every empire starts with a single brick. 🧱',
    "You're building momentum. Keep showing up. 🔥",
    "A week in — you're already ahead of 90% who quit. 💪",
    'Two weeks of consistency. The compound effect is real. 📈',
    "Halfway through Phase 1. You're forging new neural pathways. 🧠",
    'One month. The hardest part is behind you. 🏔️',
    "Phase 2 — you're not just surviving, you're thriving. 🚀",
    'Six weeks deep. This is who you are now. 👑',
    "You're in the final stretch. Don't stop at 80%. 🎯",
    'Phase 3. Scale mode. Everything compounds from here. ⚡',
];

function getMotivation(daysCompleted: number): string {
    const idx = Math.min(Math.floor(daysCompleted / 10), MOTIVATION.length - 1);
    return MOTIVATION[idx];
}

/* ── Phases ───────────────────────────────────────────────── */
const PHASES = [
    { name: 'Foundation', range: '1–30', color: 'var(--brand-green)' },
    { name: 'Growth', range: '31–60', color: 'var(--brand-blue)' },
    { name: 'Scale', range: '61–90', color: 'var(--brand-orange)' },
];

function getCurrentPhase(daysCompleted: number): typeof PHASES[0] {
    if (daysCompleted <= 30) return PHASES[0];
    if (daysCompleted <= 60) return PHASES[1];
    return PHASES[2];
}

export default function ProductivityPage() {
    /* ── Habit State ────────────────────────────────────────── */
    const [habits, setHabits] = useState<boolean[]>(() => loadJSON(LS_HABITS, new Array(90).fill(false)));

    useEffect(() => { saveJSON(LS_HABITS, habits); }, [habits]);

    const toggleDay = (idx: number) => {
        setHabits(prev => {
            const next = [...prev];
            next[idx] = !next[idx];
            return next;
        });
    };

    const daysCompleted = habits.filter(Boolean).length;
    const currentDay = Math.max(1, daysCompleted + 1);
    const streak = (() => {
        let s = 0;
        for (let i = habits.length - 1; i >= 0; i--) {
            if (habits[i]) s++;
            else if (s > 0) break;
        }
        // Check forward from start if no streak from end
        if (s === 0) {
            for (let i = 0; i < habits.length; i++) {
                if (habits[i]) s++;
                else break;
            }
        }
        return s;
    })();
    const phase = getCurrentPhase(daysCompleted);
    const progress = Math.round((daysCompleted / 90) * 100);

    /* ── Todo State ─────────────────────────────────────────── */
    const [todos, setTodos] = useState<Todo[]>(() => loadJSON(LS_TODOS, []));
    const [newTodo, setNewTodo] = useState('');

    useEffect(() => { saveJSON(LS_TODOS, todos); }, [todos]);

    const addTodo = useCallback(() => {
        if (!newTodo.trim()) return;
        setTodos(prev => [...prev, { id: Date.now(), text: newTodo.trim(), done: false }]);
        setNewTodo('');
    }, [newTodo]);

    const toggleTodo = (id: number) => {
        setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
    };

    const deleteTodo = (id: number) => {
        setTodos(prev => prev.filter(t => t.id !== id));
    };

    /* ── Notes State ────────────────────────────────────────── */
    const [notes, setNotes] = useState<Note[]>(() =>
        loadJSON(LS_NOTES, [
            { id: 1, text: 'Focus on the system, not the goal. The goal is the output of a well-designed system.' },
            { id: 2, text: '' },
        ])
    );

    useEffect(() => { saveJSON(LS_NOTES, notes); }, [notes]);

    const updateNote = (id: number, text: string) => {
        setNotes(prev => prev.map(n => n.id === id ? { ...n, text } : n));
    };

    const addNote = () => {
        setNotes(prev => [...prev, { id: Date.now(), text: '' }]);
    };

    const deleteNote = (id: number) => {
        setNotes(prev => prev.filter(n => n.id !== id));
    };

    /* ── Stat Cards ─────────────────────────────────────────── */
    const STATS = [
        { label: 'Days Completed', value: daysCompleted.toString(), color: 'green', icon: Calendar },
        { label: 'Current Streak', value: `${streak}d`, color: 'orange', icon: Flame },
        { label: 'Current Phase', value: phase.name, color: 'blue', icon: Zap },
        { label: 'Progress', value: `${progress}%`, color: 'orange', icon: TrendingUp },
    ];

    return (
        <>
            <div className="page-header">
                <h1>⚡ Productivity</h1>
                <p>Your personal productivity layer — habits, todos, and notes</p>
            </div>

            {/* Stats */}
            <div className="stat-grid">
                {STATS.map((s, i) => {
                    const Icon = s.icon;
                    return (
                        <div key={s.label} className={`stat-card ${s.color} delay-${i + 1}`}>
                            <div className="stat-label"><Icon size={14} /> {s.label}</div>
                            <div className="stat-value">{s.value}</div>
                        </div>
                    );
                })}
            </div>

            {/* Motivation */}
            <div className="card delay-5" style={{ marginBottom: 'var(--space-2xl)', textAlign: 'center' }}>
                <p style={{ fontSize: 'var(--font-md)', fontWeight: 500, fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                    {getMotivation(daysCompleted)}
                </p>
            </div>

            {/* 90-Day Habit Grid */}
            <div className="card delay-6" style={{ marginBottom: 'var(--space-2xl)' }}>
                <div className="card-header">
                    <h2>📊 90-Day Tracker</h2>
                    <div style={{ display: 'flex', gap: 'var(--space-lg)' }}>
                        {PHASES.map(p => (
                            <span key={p.name} style={{ fontSize: 'var(--font-xs)', color: p.color, fontWeight: 500 }}>
                                {p.name} ({p.range})
                            </span>
                        ))}
                    </div>
                </div>
                <div className="habit-grid">
                    {habits.map((done, i) => {
                        const isToday = i === currentDay - 1;
                        const isFuture = i >= currentDay;
                        let cls = 'upcoming';
                        if (done) cls = 'done';
                        else if (isToday) cls = 'today';
                        else if (isFuture) cls = 'upcoming';
                        else cls = 'missed';

                        return (
                            <div
                                key={i}
                                className={`habit-cell ${cls}`}
                                onClick={() => toggleDay(i)}
                                title={`Day ${i + 1}`}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Bottom Grid: Todos + Notes */}
            <div className="section-grid">
                {/* Quick Todos */}
                <div className="card delay-7">
                    <div className="card-header">
                        <h2>📝 Quick Todos</h2>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
                        <input
                            type="text"
                            placeholder="Add a task..."
                            value={newTodo}
                            onChange={(e) => setNewTodo(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addTodo()}
                            style={{ flex: 1 }}
                        />
                        <button className="btn btn-primary" onClick={addTodo}>
                            <Plus size={16} />
                        </button>
                    </div>
                    <div>
                        {todos.map((todo) => (
                            <div key={todo.id} className="todo-item">
                                <div
                                    className={`todo-checkbox ${todo.done ? 'checked' : ''}`}
                                    onClick={() => toggleTodo(todo.id)}
                                >
                                    {todo.done && <Check size={12} color="#fff" />}
                                </div>
                                <span className={`todo-text ${todo.done ? 'completed' : ''}`}>
                                    {todo.text}
                                </span>
                                <button className="todo-delete" onClick={() => deleteTodo(todo.id)}>
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                        {todos.length === 0 && (
                            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-xl)' }}>
                                No todos yet. Add one above!
                            </p>
                        )}
                    </div>
                </div>

                {/* Notes */}
                <div className="card delay-8">
                    <div className="card-header">
                        <h2><StickyNote size={18} style={{ marginRight: 8 }} /> Notes</h2>
                        <button className="btn btn-ghost" onClick={addNote}>
                            <Plus size={16} /> Add Note
                        </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                        {notes.map((note) => (
                            <div key={note.id} style={{ position: 'relative' }}>
                                <AutoResizeTextarea
                                    value={note.text}
                                    onChange={(val) => updateNote(note.id, val)}
                                    placeholder="Type your note..."
                                />
                                <button
                                    className="todo-delete"
                                    onClick={() => deleteNote(note.id)}
                                    style={{ position: 'absolute', top: 8, right: 8 }}
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}

/* ── Auto-Resize Textarea ─────────────────────────────────── */
function AutoResizeTextarea({
    value,
    onChange,
    placeholder,
}: {
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
}) {
    const ref = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (ref.current) {
            ref.current.style.height = 'auto';
            ref.current.style.height = ref.current.scrollHeight + 'px';
        }
    }, [value]);

    return (
        <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            style={{
                width: '100%',
                minHeight: 60,
                resize: 'none',
                overflow: 'hidden',
                lineHeight: 1.6,
            }}
        />
    );
}
