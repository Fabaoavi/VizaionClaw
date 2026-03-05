'use client';

import { useState, useCallback, useRef } from 'react';
import {
    Brain,
    Search,
    FileText,
    Link2,
    Upload,
    Plus,
    Layers,
    Inbox,
    X,
} from 'lucide-react';

/* ── Mock Memory Data ─────────────────────────────────────── */
interface MemoryFact {
    id: number;
    text: string;
    category: string;
    timestamp: string;
}

const INITIAL_FACTS: MemoryFact[] = [
    { id: 1, text: 'User prefers concise, bullet-point responses over long paragraphs.', category: 'Preferences', timestamp: '2h ago' },
    { id: 2, text: 'The project uses Pinecone as the primary vector store for agent memory.', category: 'Technical', timestamp: '4h ago' },
    { id: 3, text: 'User timezone is UTC-3 (Brazil). Best hours for deep work: 9 AM - 1 PM local.', category: 'Context', timestamp: '1d ago' },
    { id: 4, text: 'Railway is the deployment platform. Auto-deploys from main branch.', category: 'Technical', timestamp: '1d ago' },
    { id: 5, text: 'Groq with llama-3.1-70b-versatile is the current LLM configuration.', category: 'Technical', timestamp: '2d ago' },
    { id: 6, text: 'User is building an AI agent called "Gravity Claw" with Discord + Telegram.', category: 'Context', timestamp: '3d ago' },
    { id: 7, text: 'ElevenLabs is used for voice message transcription via API.', category: 'Technical', timestamp: '3d ago' },
    { id: 8, text: 'The MCP bridge handles tool execution with a 10-iteration safety limit.', category: 'Technical', timestamp: '4d ago' },
    { id: 9, text: 'User is interested in physarum simulations and WebGL shader art.', category: 'Interests', timestamp: '5d ago' },
    { id: 10, text: 'Daily brief should be generated at 06:00 UTC automatically.', category: 'Schedule', timestamp: '1w ago' },
];

const CATEGORIES = ['All', ...new Set(INITIAL_FACTS.map(f => f.category))];
const CATEGORY_COLORS: Record<string, string> = {
    Preferences: 'orange',
    Technical: 'blue',
    Context: 'green',
    Interests: 'red',
    Schedule: 'orange',
};

type InputType = 'note' | 'url' | 'file';

export default function BrainPage() {
    const [facts, setFacts] = useState(INITIAL_FACTS);
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [inputType, setInputType] = useState<InputType>('note');
    const [newInput, setNewInput] = useState('');
    const [bulkMode, setBulkMode] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const filteredFacts = facts.filter(f => {
        const matchSearch = f.text.toLowerCase().includes(search.toLowerCase());
        const matchCat = selectedCategory === 'All' || f.category === selectedCategory;
        return matchSearch && matchCat;
    });

    const categories = [...new Set(facts.map(f => f.category))];
    const totalFacts = facts.length;
    const totalCategories = categories.length;

    const addFact = useCallback((text: string) => {
        if (!text.trim()) return;
        const isUrl = /^https?:\/\//i.test(text.trim());
        const newFact: MemoryFact = {
            id: Date.now() + Math.random(),
            text: text.trim(),
            category: isUrl ? 'Links' : 'Notes',
            timestamp: 'Just now',
        };
        setFacts(prev => [newFact, ...prev]);
    }, []);

    const handleSubmit = () => {
        if (bulkMode) {
            const lines = newInput.split('\n').filter(l => l.trim());
            lines.forEach(addFact);
        } else {
            addFact(newInput);
        }
        setNewInput('');
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files);
        files.forEach(f => {
            addFact(`📎 File: ${f.name} (${(f.size / 1024).toFixed(1)}KB)`);
        });
    };

    const deleteFact = (id: number) => {
        setFacts(prev => prev.filter(f => f.id !== id));
    };

    const STATS = [
        { label: 'Stored Facts', value: totalFacts.toString(), color: 'blue', icon: Brain },
        { label: 'Categories', value: totalCategories.toString(), color: 'green', icon: Layers },
        { label: 'Queued Items', value: '3', color: 'orange', icon: Inbox },
    ];

    return (
        <>
            <div className="page-header">
                <h1>🧠 Second Brain</h1>
                <p>Your agent&apos;s knowledge base and memory store</p>
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

            {/* Input Section */}
            <div className="card delay-4" style={{ marginBottom: 'var(--space-2xl)' }}>
                <div className="card-header">
                    <h2>Add Knowledge</h2>
                    <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                        <button
                            className={`btn ${bulkMode ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setBulkMode(!bulkMode)}
                            style={{ fontSize: 'var(--font-xs)' }}
                        >
                            Bulk Mode
                        </button>
                    </div>
                </div>

                {/* Type Selector */}
                <div className="tab-bar" style={{ marginBottom: 'var(--space-lg)' }}>
                    {([
                        { type: 'note' as InputType, label: 'Quick Note', icon: FileText, color: 'var(--brand-orange)' },
                        { type: 'url' as InputType, label: 'URL', icon: Link2, color: 'var(--brand-blue)' },
                        { type: 'file' as InputType, label: 'File Upload', icon: Upload, color: 'var(--brand-green)' },
                    ]).map((t) => {
                        const Icon = t.icon;
                        return (
                            <button
                                key={t.type}
                                className={`tab-btn ${inputType === t.type ? 'active' : ''}`}
                                onClick={() => setInputType(t.type)}
                                style={inputType === t.type ? { color: t.color } : undefined}
                            >
                                <Icon size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                                {t.label}
                            </button>
                        );
                    })}
                </div>

                {inputType === 'file' ? (
                    <div
                        className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => fileRef.current?.click()}
                    >
                        <Upload size={32} style={{ marginBottom: 'var(--space-sm)' }} />
                        <div>Drop files here or click to upload</div>
                        <div style={{ fontSize: 'var(--font-xs)', marginTop: 'var(--space-xs)' }}>
                            Supports .txt, .md, .pdf, .json
                        </div>
                        <input
                            ref={fileRef}
                            type="file"
                            multiple
                            style={{ display: 'none' }}
                            onChange={(e) => {
                                const files = Array.from(e.target.files || []);
                                files.forEach(f => addFact(`📎 File: ${f.name} (${(f.size / 1024).toFixed(1)}KB)`));
                            }}
                        />
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                        <textarea
                            value={newInput}
                            onChange={(e) => setNewInput(e.target.value)}
                            placeholder={
                                bulkMode
                                    ? 'Paste multiple items, one per line...'
                                    : inputType === 'url'
                                        ? 'https://example.com/article...'
                                        : 'Type a fact, note, or insight...'
                            }
                            style={{ flex: 1, minHeight: bulkMode ? 120 : 60 }}
                        />
                        <button className="btn btn-primary" onClick={handleSubmit} style={{ alignSelf: 'flex-end' }}>
                            <Plus size={16} /> Add
                        </button>
                    </div>
                )}
            </div>

            {/* Search & Filter */}
            <div style={{ display: 'flex', gap: 'var(--space-lg)', marginBottom: 'var(--space-xl)', flexWrap: 'wrap' }}>
                <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
                    <Search size={16} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Search memories..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="tab-bar" style={{ marginBottom: 0 }}>
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat}
                            className={`tab-btn ${selectedCategory === cat ? 'active' : ''}`}
                            onClick={() => setSelectedCategory(cat)}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Memory Cards */}
            <div className="section-grid-3">
                {filteredFacts.map((fact, i) => (
                    <div key={fact.id} className={`memory-card delay-${(i % 8) + 1}`}>
                        <div className="memory-text">{fact.text}</div>
                        <div className="memory-meta">
                            <span className={`tag ${CATEGORY_COLORS[fact.category] || 'blue'}`}>
                                {fact.category}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                                <span className="memory-time">{fact.timestamp}</span>
                                <button
                                    className="todo-delete"
                                    onClick={() => deleteFact(fact.id)}
                                    title="Remove"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {filteredFacts.length === 0 && (
                <div style={{ textAlign: 'center', padding: 'var(--space-3xl)', color: 'var(--text-muted)' }}>
                    No memories found matching your search.
                </div>
            )}
        </>
    );
}
