'use client';

import { useState, useEffect } from 'react';
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
    Mail,
    Facebook,
    Server
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';

export interface Connection {
    id: string;
    name: string;
    icon: any;
    color: string;
    active: boolean;
    viaZapier?: boolean;
    isGlobal?: boolean;
    actionType?: "oauth" | "global_only";
    oauthUrl?: string;
    canDisconnect?: boolean;
}

const DEFAULT_CONNECTIONS: Connection[] = [
    {
        id: 'google',
        name: 'Google Workspace',
        icon: Mail,
        color: '#EA4335',
        active: false,
        actionType: "oauth",
        canDisconnect: true
    },
    {
        id: 'meta',
        name: 'Meta (Instagram / FB)',
        icon: Facebook,
        color: '#1877F2',
        active: false,
        isGlobal: true,
        actionType: "global_only"
    },
    {
        id: 'ionos',
        name: 'IONOS Cloud',
        icon: Server,
        color: '#003D8F',
        active: false,
        isGlobal: true,
        actionType: "global_only"
    },
    { id: 'claude', name: 'Claude / OpenRouter', icon: Cpu, color: '#E5850F', active: true, actionType: "global_only" },
    { id: 'telegram', name: 'Telegram', icon: Send, color: '#5A9CF5', active: true, actionType: "global_only" },
    { id: 'pinecone', name: 'Pinecone', icon: Database, color: '#2ECC8F', active: true, actionType: "global_only" },
];

export default function ConnectionsPage() {
    const searchParams = useSearchParams();
    const [connections, setConnections] = useState(DEFAULT_CONNECTIONS);
    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState<string | null>(null);

    const activeCount = connections.filter(c => c.active).length;
    const totalCount = connections.length;
    const progressPct = Math.round((activeCount / totalCount) * 100);

    const fetchConnections = async () => {
        try {
            const res = await fetch("/api/connections");
            if (res.ok) {
                const data = await res.json();
                setUserId(data.userId);

                const userConns = data.connections || [];
                const globals = data.globals || {};

                setConnections(prev => prev.map(c => {
                    let isActive = c.active;
                    if (c.id === "google") {
                        isActive = userConns.some((uc: any) => uc.provider === "google" && uc.status === "connected");
                    } else if (c.id === "meta") {
                        isActive = globals.meta;
                    } else if (c.id === "ionos") {
                        isActive = globals.ionos;
                    }
                    return { ...c, active: isActive };
                }));
            }
        } catch (error) {
            console.error("Failed to fetch connections", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConnections();
    }, []);

    const handleConnectClick = (conn: Connection) => {
        if (conn.actionType === "oauth" && conn.id === "google" && userId) {
            // Full CRUD scope example
            const scopes = "gmail,drive,calendar";
            window.location.href = `/api/auth/google?userId=${userId}&scopes=${scopes}`;
        }
    };

    const handleDisconnectListClick = async (conn: Connection) => {
        if (!conn.canDisconnect) return;

        if (confirm(`Are you sure you want to disconnect ${conn.name}?`)) {
            try {
                const res = await fetch("/api/connections", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ provider: conn.id })
                });
                if (res.ok) {
                    fetchConnections();
                }
            } catch (error) {
                console.error("Failed to disconnect", error);
            }
        }
    };

    if (loading) {
        return <div style={{ padding: 'var(--space-xl)', textAlign: 'center' }}>Loading connections...</div>;
    }

    return (
        <>
            <div className="page-header">
                <h1>🔌 Connections</h1>
                <p>Manage your agent&apos;s integrations and services</p>
            </div>

            {searchParams?.get("success") === "google_connected" && (
                <div style={{ padding: "10px", background: "var(--success-bg, #d4edda)", color: "var(--success-text, #155724)", borderRadius: "6px", marginBottom: "20px" }}>
                    ✅ Google account successfully connected!
                </div>
            )}

            {searchParams?.get("error") && (
                <div style={{ padding: "10px", background: "var(--danger-bg, #f8d7da)", color: "var(--danger-text, #721c24)", borderRadius: "6px", marginBottom: "20px" }}>
                    ❌ Error connecting account: {searchParams?.get("error")}
                </div>
            )}

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
                            {conn.active && conn.canDisconnect && (
                                <button
                                    className="disconnect-btn"
                                    onClick={() => handleDisconnectListClick(conn)}
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

                            {conn.isGlobal && (
                                <span className="zapier-badge" style={{ background: "var(--primary-color, #7289da)", color: "white" }}>Global</span>
                            )}

                            {!conn.active && conn.actionType === "oauth" && (
                                <button
                                    className="btn btn-primary"
                                    style={{ marginTop: 'var(--space-sm)', width: '100%' }}
                                    onClick={() => handleConnectClick(conn)}
                                >
                                    Connect
                                </button>
                            )}

                            {!conn.active && conn.actionType === "global_only" && (
                                <div style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)", marginTop: "10px", textAlign: "center" }}>
                                    Configured by Admin in .env
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </>
    );
}
