'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shield, Eye, EyeOff, ExternalLink, Loader2, Key, Cpu, Server, Lock, Save, Globe, Package } from 'lucide-react';

interface ApiKey {
    id: string;
    name: string;
    value: string | null;
    link: string;
}

interface OpenRouterData {
    label: string;
    usage: number;
    limit: number | null;
    is_free_tier: boolean;
    rate_limit: { requests: number; interval: string };
}

interface LogEntry {
    id: number;
    created_at: string;
    level: string;
    message: string;
    metadata: string | null;
}

interface UserStat {
    user: string;
    userName: string;
    model: string;
    cost: number;
    tokens: number;
}

interface SecurityConfig {
    globalAllowedCommands: string[];
    globalBlockedCommands: string[];
    globalBlockedPaths: string[];
    globalAllowedHosts: string[];
    enableContainerIsolation: boolean;
}

export default function SecurityTab() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
    const [openRouterData, setOpenRouterData] = useState<OpenRouterData | null>(null);
    const [userStats, setUserStats] = useState<UserStat[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);

    const [security, setSecurity] = useState<SecurityConfig | null>(null);

    const fetchAdminData = useCallback(async () => {
        try {
            const [resDash, resSec] = await Promise.all([
                fetch('/api/admin/dashboard'),
                fetch('/api/admin/security')
            ]);

            if (resDash.ok) {
                const data = await resDash.json();
                setKeys(data.keys || []);
                setOpenRouterData(data.openRouterData || null);
                setUserStats(data.userStats || []);
                setLogs(data.logs || []);
            }
            if (resSec.ok) {
                const secData = await resSec.json();
                setSecurity(secData);
            }
        } catch (err) {
            console.error('Failed to fetch admin dashboard:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchLogs = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/logs');
            if (!res.ok) return;
            const data = await res.json();
            if (data.logs) {
                setLogs(data.logs);
            }
        } catch (err) {
            console.error('Failed to fetch logs:', err);
        }
    }, []);

    useEffect(() => {
        fetchAdminData();
        const interval = setInterval(fetchLogs, 2000);
        return () => clearInterval(interval);
    }, [fetchAdminData, fetchLogs]);

    const toggleKeyVisibility = (id: string) => {
        setVisibleKeys(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const maskKey = (key: string | null) => {
        if (!key) return 'Not Configured';
        if (key.length <= 8) return '••••••••';
        return `${key.substring(0, 4)}••••••••••••••••${key.substring(key.length - 4)}`;
    };

    const handleSaveSecurity = async () => {
        if (!security) return;
        setSaving(true);
        try {
            await fetch('/api/admin/security', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(security)
            });
            alert('Security configuration saved globally.');
        } catch (e) {
            alert('Failed to save security configuration.');
        } finally {
            setSaving(false);
        }
    };

    const updateSecurityList = (key: keyof SecurityConfig, value: string) => {
        if (!security) return;
        const list = value.split('\n').map(s => s.trim()).filter(Boolean);
        setSecurity({ ...security, [key]: list });
    };

    const getBrandName = (modelId: string) => {
        const lower = modelId.toLowerCase();
        if (lower.includes('gpt')) return 'GPT';
        if (lower.includes('claude')) return 'Claude';
        if (lower.includes('gemini')) return 'Gemini';
        if (lower.includes('deepseek')) return 'DeepSeek';
        if (lower.includes('llama')) return 'Llama';
        if (lower.includes('qwen')) return 'Qwen';
        if (lower.includes('mistral')) return 'Mistral';
        return modelId.split('/')[0] || modelId;
    };

    const toggleContainer = () => {
        if (!security) return;
        setSecurity({ ...security, enableContainerIsolation: !security.enableContainerIsolation });
    };

    const userMap = userStats.reduce((acc, stat) => {
        if (!acc[stat.user]) acc[stat.user] = { totalCost: 0, models: [], name: stat.userName || stat.user };
        acc[stat.user].totalCost += stat.cost;
        acc[stat.user].models.push({ model: stat.model, cost: stat.cost });
        return acc;
    }, {} as Record<string, { totalCost: number, name: string, models: { model: string, cost: number }[] }>);

    const colors = ["#F5A623", "#4A90E2", "#50E3C2", "#B8E986", "#BD10E0", "#FF4A5A"];
    const modelColors: Record<string, string> = {};
    let colorIdx = 0;
    userStats.forEach(s => {
        const brandName = getBrandName(s.model);
        if (!modelColors[brandName]) {
            modelColors[brandName] = colors[colorIdx % colors.length];
            colorIdx++;
        }
    });

    return (
        <div className="page-container">
            {loading ? (
                <div className="admin-loading">
                    <Loader2 size={32} className="spin" />
                    <p>Loading secure data…</p>
                </div>
            ) : (
                <div className="admin-grid">
                    {/* Left Column */}
                    <div className="admin-col">

                        {/* API Keys Panel */}
                        <div className="admin-card">
                            <div className="admin-card-header">
                                <h2><Key size={18} /> Environment API Keys</h2>
                                <span>Secured by .env</span>
                            </div>
                            <div className="keys-list">
                                {keys.map(key => (
                                    <div key={key.id} className="key-item">
                                        <div className="key-item-header">
                                            <span className="key-name">{key.name}</span>
                                            <a href={key.link} target="_blank" rel="noreferrer" className="key-link">
                                                Dashboard <ExternalLink size={12} />
                                            </a>
                                        </div>
                                        <div className="key-item-value">
                                            <div className={`key-text ${!key.value ? 'missing' : ''}`}>
                                                {visibleKeys[key.id] ? (key.value || 'Not Configured') : maskKey(key.value)}
                                            </div>
                                            {key.value && (
                                                <button
                                                    className="key-toggle"
                                                    onClick={() => toggleKeyVisibility(key.id)}
                                                    title={visibleKeys[key.id] ? "Hide Key" : "Reveal Key"}
                                                >
                                                    {visibleKeys[key.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Security Rules Panel */}
                        {security && (
                            <div className="admin-card">
                                <div className="admin-card-header">
                                    <h2><Lock size={18} /> Global Security Rules</h2>
                                    <button
                                        className="save-btn"
                                        onClick={handleSaveSecurity}
                                        disabled={saving}
                                    >
                                        {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
                                        Save Rules
                                    </button>
                                </div>
                                <div className="security-form">
                                    <div className="form-group">
                                        <label>Blocked Paths (One per line)</label>
                                        <textarea
                                            value={security.globalBlockedPaths.join('\n')}
                                            onChange={(e) => updateSecurityList('globalBlockedPaths', e.target.value)}
                                            placeholder="/etc/shadow&#10;C:\Windows"
                                            rows={4}
                                        />
                                        <span className="help-text">These paths are strictly denied for ALL users, including admins.</span>
                                    </div>
                                    <div className="form-group">
                                        <label>Allowed Commands (One per line)</label>
                                        <textarea
                                            value={security.globalAllowedCommands.join('\n')}
                                            onChange={(e) => updateSecurityList('globalAllowedCommands', e.target.value)}
                                            placeholder="echo&#10;ls"
                                            rows={3}
                                        />
                                        <span className="help-text">Base commands that are considered safe to execute.</span>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>

                    {/* Right Column */}
                    <div className="admin-col">

                        {/* Network & Sandbox Rules */}
                        {security && (
                            <div className="admin-card">
                                <div className="admin-card-header">
                                    <h2><Globe size={18} /> Network & Container</h2>
                                    <button
                                        className="save-btn"
                                        onClick={handleSaveSecurity}
                                        disabled={saving}
                                    >
                                        {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
                                        Save
                                    </button>
                                </div>
                                <div className="security-form">
                                    <div className="form-group toggle-group" onClick={toggleContainer}>
                                        <div className="toggle-info">
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Package size={16} /> Container Isolation (Docker)
                                            </label>
                                            <span className="help-text">Run tools inside a sandbox rather than the host system. Requires daemon.</span>
                                        </div>
                                        <div className={`switch ${security.enableContainerIsolation ? 'on' : 'off'}`}>
                                            <div className="switch-thumb" />
                                        </div>
                                    </div>
                                    <div className="form-group" style={{ marginTop: '8px' }}>
                                        <label>Allowed Hosts (Deep Research / Connections)</label>
                                        <textarea
                                            value={security.globalAllowedHosts.join('\n')}
                                            onChange={(e) => updateSecurityList('globalAllowedHosts', e.target.value)}
                                            placeholder="github.com&#10;api.openai.com"
                                            rows={3}
                                        />
                                        <span className="help-text">Leave blank to allow all connections. Mention domains explicitly to restrict.</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* OpenRouter Stats */}
                        <div className="admin-card">
                            <div className="admin-card-header">
                                <h2><Cpu size={18} /> OpenRouter LLM Gateway</h2>
                                <span className={openRouterData ? "status-ok" : "status-error"}>
                                    {openRouterData ? "Connected" : "Not Connected"}
                                </span>
                            </div>
                            {openRouterData ? (
                                <>
                                    <div className="or-stats">
                                        <div className="or-stat-box">
                                            <span className="or-label">Credit Usage</span>
                                            <span className="or-value">${openRouterData.usage.toFixed(4)}</span>
                                        </div>
                                        <div className="or-stat-box">
                                            <span className="or-label">Credit Limit</span>
                                            <span className="or-value">{openRouterData.limit ? `$${openRouterData.limit.toFixed(2)}` : 'Unlimited'}</span>
                                        </div>
                                        <div className="or-stat-box">
                                            <span className="or-label">Tier</span>
                                            <span className="or-value">{openRouterData.is_free_tier ? 'Free' : 'Paid'}</span>
                                        </div>
                                    </div>
                                    {Object.keys(userMap).length > 0 && (
                                        <div className="or-user-stats">
                                            <h3 style={{ fontSize: '12px', margin: 0, color: 'var(--text-primary)' }}>Usage By User (Proxy Logs)</h3>
                                            {Object.entries(userMap).map(([uid, data]) => (
                                                <div key={uid} className="or-user-row">
                                                    <div className="or-user-info">
                                                        <span>{data.name}</span>
                                                        <span>${data.totalCost.toFixed(4)}</span>
                                                    </div>
                                                    <div className="or-user-bar-container">
                                                        {data.models.sort((a, b) => b.cost - a.cost).map((m, i) => {
                                                            const brandName = getBrandName(m.model);
                                                            return (
                                                                <div
                                                                    key={i}
                                                                    className="or-user-bar-segment"
                                                                    style={{
                                                                        width: `${Math.max((m.cost / data.totalCost) * 100, 2)}%`,
                                                                        backgroundColor: modelColors[brandName]
                                                                    }}
                                                                    title={`${brandName}: $${m.cost.toFixed(4)}`}
                                                                />
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                            <div className="or-legend">
                                                {Object.entries(modelColors).map(([name, col]) => (
                                                    <div key={name} className="legend-item">
                                                        <div className="legend-color" style={{ backgroundColor: col }} />
                                                        <span>{name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="or-empty">
                                    No OpenRouter data available. Check API key.
                                </div>
                            )}
                        </div>

                        {/* System Logs */}
                        <div className="admin-card logs-card">
                            <div className="admin-card-header">
                                <h2><Server size={18} /> System Logs</h2>
                                <span>Recent</span>
                            </div>
                            <div className="logs-container">
                                {logs.length === 0 ? (
                                    <div className="logs-empty">No logs recorded yet.</div>
                                ) : (
                                    logs.map((log, i) => {
                                        let meta = null;
                                        try { if (log.metadata) meta = JSON.parse(log.metadata); } catch { }

                                        const isLlmReply = log.message.startsWith('Replied to');
                                        const brandName = meta?.model ? getBrandName(meta.model) : '';
                                        const costCalc = meta?.cost ? `$${Number(meta.cost).toFixed(4)}` : '';

                                        // Use the clean reply from metadata (already stripped of <think>)
                                        const cleanReply = meta?.reply || log.message;
                                        // Use reasoning from metadata directly (logged separately by bot.ts)
                                        const reasoning = meta?.reasoning || '';

                                        return (
                                            <div key={i} className={`log-entry log-${log.level}`}>
                                                <div className="log-header">
                                                    <span className="log-time">{new Date(log.created_at).toLocaleString()}</span>
                                                    {isLlmReply && meta && (
                                                        <div className="log-badges">
                                                            <span className="log-badge model-badge">{brandName}</span>
                                                            <span className="log-badge cost-badge">{costCalc}</span>
                                                            <span className="log-badge thinking-badge">
                                                                {reasoning ? '🧠 Deep Thought' : '💭 Thought'}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="log-msg">
                                                    {!isLlmReply ? (
                                                        <span>{log.message}</span>
                                                    ) : (
                                                        <>
                                                            {reasoning ? (
                                                                <details className="log-reasoning">
                                                                    <summary>🧠 Reasoning Process ({reasoning.length} chars)</summary>
                                                                    <div className="reasoning-content">{reasoning}</div>
                                                                </details>
                                                            ) : (
                                                                <details className="log-reasoning no-content">
                                                                    <summary>💭 Model processed without extended reasoning</summary>
                                                                    <div className="reasoning-content">This model does not produce visible chain-of-thought. Switch to DeepSeek R1 or QwQ for full reasoning logs.</div>
                                                                </details>
                                                            )}
                                                            <div style={{ marginTop: '4px', opacity: 0.9 }}>
                                                                {cleanReply}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                    </div>
                </div>
            )
            }

            <style jsx>{`
                .admin-loading {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--space-md);
                    padding: var(--space-3xl);
                    color: var(--text-muted);
                }

                .admin-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: var(--space-xl);
                }

                @media (max-width: 900px) {
                    .admin-grid {
                        grid-template-columns: 1fr;
                    }
                }

                .admin-col {
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-xl);
                }

                .admin-card {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-md);
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }

                .admin-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--space-md) var(--space-xl);
                    border-bottom: 1px solid var(--border-color);
                    background: var(--bg-elevated);
                }

                .admin-card-header h2 {
                    font-size: var(--font-base);
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: var(--space-sm);
                    margin: 0;
                    color: var(--text-primary);
                }

                .admin-card-header span {
                    font-size: var(--font-xs);
                    color: var(--text-muted);
                }
                
                .status-ok { color: var(--brand-green) !important; }
                .status-error { color: var(--brand-red) !important; }

                /* API Keys */
                .keys-list {
                    padding: var(--space-md) var(--space-xl);
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-lg);
                }

                .key-item {
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-xs);
                }

                .key-item-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .key-name {
                    font-weight: 500;
                    font-size: var(--font-sm);
                    color: var(--text-secondary);
                }

                .key-link {
                    font-size: 11px;
                    color: var(--brand-orange);
                    display: flex;
                    align-items: center;
                    gap: 3px;
                    text-decoration: none;
                    opacity: 0.8;
                }
                .key-link:hover { opacity: 1; }

                .key-item-value {
                    display: flex;
                    background: rgba(0,0,0,0.2);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-sm);
                    padding: 0;
                    align-items: stretch;
                }

                .key-text {
                    flex: 1;
                    padding: var(--space-sm) var(--space-md);
                    font-family: var(--font-mono);
                    font-size: var(--font-sm);
                    color: var(--text-primary);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .key-text.missing {
                    color: var(--text-muted);
                    font-family: inherit;
                    font-style: italic;
                }

                .key-toggle {
                    background: none;
                    border: none;
                    border-left: 1px solid var(--border-color);
                    padding: 0 var(--space-md);
                    color: var(--text-muted);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all var(--transition-fast);
                }
                .key-toggle:hover {
                    color: var(--brand-orange);
                    background: rgba(255,255,255,0.05);
                }

                /* OpenRouter Stats */
                .or-stats {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 1px;
                    background: var(--border-color);
                }
                
                .or-stat-box {
                    background: var(--bg-card);
                    padding: var(--space-lg);
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-xs);
                }
                
                .or-label {
                    font-size: var(--font-xs);
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                
                .or-value {
                    font-size: var(--font-xl);
                    font-weight: 700;
                    color: var(--text-primary);
                }

                .or-empty {
                    padding: var(--space-xl);
                    text-align: center;
                    color: var(--text-muted);
                    font-size: var(--font-sm);
                }

                /* Logs Enhancements */
                .logs-card {
                    flex: 1;
                    min-height: 250px;
                }

                .logs-container {
                    padding: var(--space-md);
                    font-family: var(--font-mono);
                    font-size: 12px;
                    background: #0B0E14;
                    flex: 1;
                    overflow-y: auto;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .log-entry {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    padding: var(--space-sm);
                    border-radius: var(--radius-sm);
                    background: rgba(255,255,255,0.03);
                    border-left: 2px solid transparent;
                }
                .log-info { border-left-color: var(--brand-blue, #3b82f6); }
                .log-error { border-left-color: var(--brand-red); }

                .log-header {
                    display: flex;
                    align-items: center;
                    gap: var(--space-md);
                }

                .log-time {
                    color: var(--text-muted);
                    font-size: 11px;
                }

                .log-badges {
                    display: flex;
                    gap: 6px;
                }

                .log-badge {
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 10px;
                    font-weight: 600;
                    text-transform: uppercase;
                }
                .model-badge { background: rgba(255,165,0,0.15); color: var(--brand-orange); }
                .cost-badge { background: rgba(16,185,129,0.15); color: #10b981; }
                .thinking-badge { background: rgba(139,92,246,0.15); color: #8b5cf6; }

                .log-reasoning.no-content summary {
                    color: var(--text-muted);
                }

                .log-msg {
                    color: var(--text-primary);
                    line-height: 1.4;
                    word-break: break-word;
                }

                .log-reasoning {
                    margin-top: 4px;
                    background: rgba(0,0,0,0.3);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-sm);
                    padding: 6px;
                }

                .log-reasoning summary {
                    cursor: pointer;
                    color: var(--brand-orange);
                    font-weight: 500;
                    font-size: 11px;
                    list-style: none; /* Hide default arrow in some browsers */
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                
                .log-reasoning summary::before {
                    content: "▶";
                    font-size: 8px;
                    transition: transform 0.2s;
                }
                
                .log-reasoning[open] summary::before {
                    transform: rotate(90deg);
                }

                .reasoning-content {
                    margin-top: 6px;
                    padding-top: 6px;
                    border-top: 1px dashed var(--border-color);
                    color: var(--text-muted);
                    font-size: 11px;
                    white-space: pre-wrap;
                }

                /* OpenRouter User Chart */
                .or-user-stats {
                    padding: var(--space-md) var(--space-xl);
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-md);
                    border-top: 1px solid var(--border-color);
                }
                
                .or-user-row {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                
                .or-user-info {
                    display: flex;
                    justify-content: space-between;
                    font-size: var(--font-xs);
                    color: var(--text-secondary);
                }
                
                .or-user-bar-container {
                    width: 100%;
                    height: 8px;
                    background: rgba(255,255,255,0.05);
                    border-radius: 4px;
                    overflow: hidden;
                    display: flex;
                }
                
                .or-user-bar-segment {
                    height: 100%;
                    transition: width 0.3s ease;
                }
                
                .or-legend {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 12px;
                    margin-top: 8px;
                    font-size: 10px;
                    color: var(--text-muted);
                }
                
                .legend-item {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                
                .legend-color {
                    width: 8px;
                    height: 8px;
                    border-radius: 2px;
                }

                /* Security Form */
                .security-form {
                    padding: var(--space-xl);
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-xl);
                }

                .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-xs);
                }

                .form-group label {
                    font-size: var(--font-sm);
                    font-weight: 600;
                    color: var(--text-secondary);
                }

                .form-group textarea {
                    background: rgba(0,0,0,0.2);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-sm);
                    padding: var(--space-md);
                    color: var(--text-primary);
                    font-family: var(--font-mono);
                    font-size: var(--font-sm);
                    resize: vertical;
                    min-height: 80px;
                }

                .form-group textarea:focus {
                    outline: none;
                    border-color: var(--brand-orange);
                    background: rgba(0,0,0,0.4);
                }

                .help-text {
                    font-size: 11px;
                    color: var(--text-muted);
                }

                .save-btn {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    background: var(--brand-orange);
                    color: #fff;
                    border: none;
                    padding: 6px 12px;
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .save-btn:hover:not(:disabled) {
                    filter: brightness(1.1);
                }

                .save-btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                /* Toggles */
                .toggle-group {
                    display: flex;
                    flex-direction: row;
                    justify-content: space-between;
                    align-items: center;
                    background: rgba(0,0,0,0.2);
                    border: 1px solid var(--border-color);
                    padding: var(--space-md);
                    border-radius: var(--radius-sm);
                    cursor: pointer;
                    transition: border-color var(--transition-fast);
                }

                .toggle-group:hover {
                    border-color: var(--brand-orange);
                }

                .toggle-info {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .switch {
                    width: 36px;
                    height: 20px;
                    background: var(--text-muted);
                    border-radius: 999px;
                    position: relative;
                    transition: background 0.2s;
                    flex-shrink: 0;
                }

                .switch.on { background: var(--brand-orange); }

                .switch-thumb {
                    width: 16px;
                    height: 16px;
                    background: #fff;
                    border-radius: 50%;
                    position: absolute;
                    top: 2px;
                    left: 2px;
                    transition: transform 0.2s;
                }

                .switch.on .switch-thumb {
                    transform: translateX(16px);
                }
            `}</style>
        </div >
    );
}
