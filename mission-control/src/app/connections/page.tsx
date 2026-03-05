'use client';

import { useState } from 'react';
import {
    X,
    Bot,
    MessageCircle,
    Send,
    Youtube,
    Github,
    Database,
    Globe,
    Cpu,
    Link2,
    Mic,
    Cloud,
} from 'lucide-react';

interface Connection {
    id: string;
    name: string;
    icon: typeof Bot;
    color: string;
    active: boolean;
    viaZapier?: boolean;
}

const INITIAL_CONNECTIONS: Connection[] = [
    { id: 'claude', name: 'Claude / OpenRouter', icon: Cpu, color: '#E5850F', active: true },
    { id: 'telegram', name: 'Telegram', icon: Send, color: '#5A9CF5', active: true },
    { id: 'pinecone', name: 'Pinecone', icon: Database, color: '#2ECC8F', active: true },
    { id: 'github', name: 'GitHub', icon: Github, color: '#f0f0f0', active: true },
    { id: 'youtube', name: 'YouTube', icon: Youtube, color: '#D95555', active: false, viaZapier: true },
    { id: 'discord', name: 'Discord', icon: MessageCircle, color: '#7289da', active: false },
    { id: 'elevenlabs', name: 'ElevenLabs', icon: Mic, color: '#E5850F', active: true },
    { id: 'notion', name: 'Notion', icon: Globe, color: '#fff', active: false, viaZapier: true },
    { id: 'zapier', name: 'Zapier', icon: Link2, color: '#ff4a00', active: false },
    { id: 'railway', name: 'Railway', icon: Cloud, color: '#a855f7', active: true },
    { id: 'groq', name: 'Groq', icon: Cpu, color: '#5A9CF5', active: true },
    { id: 'openai', name: 'OpenAI', icon: Bot, color: '#10a37f', active: false },
];

export default function ConnectionsPage() {
    const [connections, setConnections] = useState(INITIAL_CONNECTIONS);

    const activeCount = connections.filter(c => c.active).length;
    const totalCount = connections.length;
    const progressPct = Math.round((activeCount / totalCount) * 100);

    const toggleConnection = (id: string) => {
        setConnections(prev =>
            prev.map(c => c.id === id ? { ...c, active: !c.active } : c)
        );
    };

    return (
        <>
            <div className="page-header">
                <h1>🔌 Connections</h1>
                <p>Manage your agent&apos;s integrations and services</p>
            </div>

            {/* Progress Bar */}
            <div className="card delay-1" style={{ marginBottom: 'var(--space-2xl)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-sm)' }}>
                    <span style={{ fontWeight: 600 }}>{activeCount} / {totalCount} connected</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)' }}>{progressPct}%</span>
                </div>
                <div className="progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
                </div>
            </div>

            {/* Connection Grid */}
            <div className="section-grid-3">
                {connections.map((conn, i) => {
                    const Icon = conn.icon;
                    return (
                        <div
                            key={conn.id}
                            className={`connection-card ${!conn.active ? 'disconnected' : ''} delay-${(i % 8) + 1}`}
                        >
                            {conn.active && (
                                <button
                                    className="disconnect-btn"
                                    onClick={() => toggleConnection(conn.id)}
                                    title="Disconnect"
                                >
                                    <X size={16} />
                                </button>
                            )}

                            <div
                                className="conn-icon"
                                style={{ background: `${conn.color}20`, color: conn.color }}
                            >
                                <Icon size={24} />
                            </div>

                            <div className="conn-name">{conn.name}</div>

                            <div className="conn-status">
                                <span
                                    className={`status-dot ${conn.active ? 'online' : 'offline'}`}
                                />
                                {conn.active ? 'Active' : 'Inactive'}
                            </div>

                            {conn.viaZapier && (
                                <span className="zapier-badge">via Zapier</span>
                            )}

                            {!conn.active && (
                                <button
                                    className="btn btn-primary"
                                    style={{ marginTop: 'var(--space-sm)', width: '100%' }}
                                    onClick={() => toggleConnection(conn.id)}
                                >
                                    Connect
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </>
    );
}
