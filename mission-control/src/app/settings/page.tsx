'use client';

import { useState, useCallback } from 'react';
import { Save, Check, Loader2 } from 'lucide-react';

/* ── Mock Config Data ─────────────────────────────────────── */
const INITIAL_PERSONALITY = `You are a personal AI assistant named Gravity Claw. You're helpful, proactive, and concise. You have a dry sense of humour and prefer direct communication.

Core traits:
- Always be honest, even when the answer is "I don't know"
- Proactively suggest improvements and next steps
- Keep responses focused — no unnecessary filler
- Use emojis sparingly but effectively
- Reference previous conversations when relevant

Memory rules:
- Store important facts the user shares
- Remember preferences and recurring patterns
- Flag when stored information might be outdated`;

interface ConfigEntry {
    key: string;
    value: string;
    category: string;
}

const INITIAL_CONFIG: ConfigEntry[] = [
    { key: 'LLM Provider', value: 'Groq', category: 'Model' },
    { key: 'LLM Model', value: 'llama-3.1-70b-versatile', category: 'Model' },
    { key: 'Max Iterations', value: '10', category: 'Model' },
    { key: 'Heartbeat Interval', value: '15 min', category: 'Schedule' },
    { key: 'Content Sync', value: '06:00 UTC daily', category: 'Schedule' },
    { key: 'Memory Backend', value: 'Pinecone', category: 'Memory' },
    { key: 'Fallback DB', value: 'SQLite (local)', category: 'Memory' },
    { key: 'Embedding Model', value: 'text-embedding-3-small', category: 'Memory' },
    { key: 'Telegram Bot Token', value: '••••••••••mxyI', category: 'Integrations' },
    { key: 'Allowed User IDs', value: '1338530081', category: 'Integrations' },
    { key: 'ElevenLabs API', value: '••••••••••186f', category: 'Integrations' },
];

export default function SettingsPage() {
    const [personality, setPersonality] = useState(INITIAL_PERSONALITY);
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [config, setConfig] = useState(INITIAL_CONFIG);

    const handleSave = useCallback(() => {
        setSaveState('saving');
        setTimeout(() => {
            setSaveState('saved');
            setTimeout(() => setSaveState('idle'), 2000);
        }, 800);
    }, []);

    const updateConfig = (key: string, value: string) => {
        setConfig(prev => prev.map(c => c.key === key ? { ...c, value } : c));
    };

    // Group config by category
    const categories = [...new Set(config.map(c => c.category))];

    return (
        <>
            <div className="page-header">
                <h1>⚙️ Settings</h1>
                <p>Configure your agent&apos;s personality and behaviour</p>
            </div>

            {/* Personality & Character */}
            <div className="card delay-1" style={{ marginBottom: 'var(--space-2xl)' }}>
                <div className="card-header">
                    <h2>🧠 Personality & Character</h2>
                    <button
                        className={`btn ${saveState === 'saved' ? 'btn-secondary' : 'btn-primary'}`}
                        onClick={handleSave}
                        disabled={saveState === 'saving'}
                    >
                        {saveState === 'saving' && <Loader2 size={14} className="spin" />}
                        {saveState === 'saved' && <Check size={14} />}
                        {saveState === 'idle' && <Save size={14} />}
                        {saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved!' : 'Save Changes'}
                    </button>
                </div>
                <textarea
                    value={personality}
                    onChange={(e) => setPersonality(e.target.value)}
                    style={{
                        width: '100%',
                        minHeight: '250px',
                        lineHeight: '1.7',
                        fontSize: 'var(--font-sm)',
                        fontFamily: "'SF Mono', 'Fira Code', monospace",
                    }}
                />
            </div>

            {/* Config Entries by Category */}
            {categories.map((cat, catIdx) => (
                <div key={cat} className={`card delay-${catIdx + 2}`} style={{ marginBottom: 'var(--space-xl)' }}>
                    <div className="card-header">
                        <h3>{cat}</h3>
                    </div>
                    <div className="config-grid">
                        {config
                            .filter(c => c.category === cat)
                            .map((entry) => (
                                <div key={entry.key} className="config-entry">
                                    <label>{entry.key}</label>
                                    <input
                                        type="text"
                                        defaultValue={entry.value}
                                        onBlur={(e) => updateConfig(entry.key, e.target.value)}
                                    />
                                </div>
                            ))}
                    </div>
                </div>
            ))}

            <style jsx>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
        </>
    );
}
