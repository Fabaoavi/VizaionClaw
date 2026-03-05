'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    Users, UserCheck, UserX, Clock, RefreshCw,
    CheckCircle, XCircle, Shield, ExternalLink, Loader2, RotateCcw,
    MessageSquare, Database, X, Lock, FolderKey, Save
} from 'lucide-react';

interface PendingUser {
    id: number;
    telegram_id: number;
    first_name: string;
    username: string | null;
    status: 'pending' | 'approved' | 'denied';
    requested_at: string;
    reviewed_at: string | null;
}

interface RegisteredUser {
    id: string;
    display_name: string;
    telegram_id: number | null;
    discord_id: string | null;
    whatsapp_phone: string | null;
    created_at: string;
    last_seen_at: string;
    is_active?: boolean;
}

export default function UsersPage() {
    const router = useRouter();
    const [pending, setPending] = useState<PendingUser[]>([]);
    const [allRequests, setAllRequests] = useState<PendingUser[]>([]);
    const [registered, setRegistered] = useState<RegisteredUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [tab, setTab] = useState<'pending' | 'online' | 'offline'>('pending');

    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
    const [userDetails, setUserDetails] = useState<{ user: any, logs: any[], memories: any[] } | null>(null);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [modalTab, setModalTab] = useState<'info' | 'logs' | 'memories' | 'permissions'>('info');

    const [security, setSecurity] = useState<any>(null);
    const [securitySaving, setSecuritySaving] = useState(false);

    const fetchSecurity = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/security');
            if (res.ok) {
                setSecurity(await res.json());
            }
        } catch (err) {
            console.error('Failed to fetch security config:', err);
        }
    }, []);

    const fetchUsers = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/users');
            if (res.status === 401 || res.status === 403) {
                router.push('/');
                return;
            }
            const data = await res.json();
            setPending(data.pending || []);
            setAllRequests(data.allRequests || []);
            setRegistered(data.registered || []);
        } catch (err) {
            console.error('Failed to fetch users:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
        fetchSecurity();
        // Auto-refresh every 15s
        const interval = setInterval(fetchUsers, 15000);
        return () => clearInterval(interval);
    }, [fetchUsers]);

    async function handleApprove(telegramId: number) {
        setActionLoading(telegramId);
        try {
            await fetch('/api/admin/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telegramId }),
            });
            await fetchUsers();
        } catch (err) {
            console.error('Approve failed:', err);
        } finally {
            setActionLoading(null);
        }
    }

    async function handleDeny(telegramId: number) {
        setActionLoading(telegramId);
        try {
            await fetch('/api/admin/deny', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telegramId }),
            });
            await fetchUsers();
        } catch (err) {
            console.error('Deny failed:', err);
        } finally {
            setActionLoading(null);
        }
    }

    async function handleRevoke(telegramId: number) {
        setActionLoading(telegramId);
        try {
            await fetch('/api/admin/revoke', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telegramId }),
            });
            await fetchUsers();
            if (selectedUserId === telegramId) fetchUserDetails(telegramId, false);
        } catch (err) {
            console.error('Revoke failed:', err);
        } finally {
            setActionLoading(null);
        }
    }

    async function handleReactivate(telegramId: number) {
        setActionLoading(telegramId);
        try {
            await fetch('/api/admin/reactivate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telegramId }),
            });
            await fetchUsers();
            if (selectedUserId === telegramId) fetchUserDetails(telegramId, false);
        } catch (err) {
            console.error('Reactivate failed:', err);
        } finally {
            setActionLoading(null);
        }
    }

    const handleSavePermissions = async () => {
        if (!security || !userDetails?.user) return;
        setSecuritySaving(true);
        try {
            await fetch('/api/admin/security', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(security),
            });
            await fetchSecurity();
        } catch (err) {
            console.error('Failed to save security config:', err);
        } finally {
            setSecuritySaving(false);
        }
    };

    const handleAddUserPathRule = (userId: string) => {
        if (!security) return;
        const currentRules = [...(security.userPathRules?.[userId] || [])];
        currentRules.push({ path: '', mode: 'none' });
        setSecurity({
            ...security,
            userPathRules: { ...security.userPathRules, [userId]: currentRules }
        });
    };

    const handleUpdateUserPathRule = (userId: string, index: number, pathValue: string) => {
        if (!security) return;
        const currentRules = [...(security.userPathRules?.[userId] || [])];
        if (!currentRules[index]) return;
        currentRules[index] = { ...currentRules[index], path: pathValue };
        setSecurity({
            ...security,
            userPathRules: { ...security.userPathRules, [userId]: currentRules }
        });
    };

    const handleRemoveUserPathRule = (userId: string, index: number) => {
        if (!security) return;
        const currentRules = [...(security.userPathRules?.[userId] || [])];
        currentRules.splice(index, 1);
        setSecurity({
            ...security,
            userPathRules: { ...security.userPathRules, [userId]: currentRules }
        });
    };

    const handleToggleRuleMode = (userId: string, index: number, toggle: 'read' | 'write') => {
        if (!security) return;
        const currentRules = [...(security.userPathRules?.[userId] || [])];
        const rule = currentRules[index];
        if (!rule) return;

        let newMode: "read" | "write" | "none" = rule.mode;

        if (toggle === 'read') {
            if (rule.mode === 'none') newMode = 'read';
            else if (rule.mode === 'read') newMode = 'none';
            else if (rule.mode === 'write') newMode = 'none'; // Unchecking read also unchecks write
        } else if (toggle === 'write') {
            if (rule.mode === 'none' || rule.mode === 'read') newMode = 'write';
            else if (rule.mode === 'write') newMode = 'read';
        }

        currentRules[index] = { ...rule, mode: newMode };
        setSecurity({
            ...security,
            userPathRules: { ...security.userPathRules, [userId]: currentRules }
        });
    };

    function timeAgo(dateStr: string): string {
        const now = new Date();
        const then = new Date(dateStr + 'Z');
        const diffMs = now.getTime() - then.getTime();
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }

    const fetchUserDetails = useCallback(async (telegramId: number, showLoading = true) => {
        if (showLoading) setDetailsLoading(true);
        try {
            const res = await fetch(`/api/admin/users/${telegramId}`);
            if (res.ok) {
                const data = await res.json();
                setUserDetails(data);
            }
        } catch (err) {
            console.error('Failed to fetch user details:', err);
        } finally {
            if (showLoading) setDetailsLoading(false);
        }
    }, []);

    const handleUserClick = useCallback(async (telegramId: number | null) => {
        if (!telegramId) return;
        setSelectedUserId(telegramId);
        setUserDetails(null);
        await fetchUserDetails(telegramId, true);
        await fetchSecurity(); // Ensure we have fresh rules when opening modal
    }, [fetchUserDetails, fetchSecurity]);

    useEffect(() => {
        if (!selectedUserId) return;
        const interval = setInterval(() => {
            fetchUserDetails(selectedUserId, false);
        }, 3000);
        return () => clearInterval(interval);
    }, [selectedUserId, fetchUserDetails]);

    const statusBadge = (status: string) => {
        switch (status) {
            case 'pending':
                return <span className="users-badge users-badge-pending"><Clock size={12} /> Pending</span>;
            case 'approved':
                return <span className="users-badge users-badge-approved"><CheckCircle size={12} /> Approved</span>;
            case 'denied':
                return <span className="users-badge users-badge-denied"><XCircle size={12} /> Denied</span>;
            default:
                return null;
        }
    };

    return (
        <div className="page-container">
            {/* Tabs */}
            <div className="users-tabs">
                <button
                    className={`users-tab ${tab === 'pending' ? 'active' : ''}`}
                    onClick={() => setTab('pending')}
                    id="tab-pending"
                >
                    <UserCheck size={16} />
                    Pendente
                    {pending.length > 0 && <span className="users-tab-count">{pending.length}</span>}
                </button>
                <button
                    className={`users-tab ${tab === 'online' ? 'active' : ''}`}
                    onClick={() => setTab('online')}
                    id="tab-online"
                >
                    <CheckCircle size={16} />
                    Online
                </button>
                <button
                    className={`users-tab ${tab === 'offline' ? 'active' : ''}`}
                    onClick={() => setTab('offline')}
                    id="tab-offline"
                >
                    <XCircle size={16} />
                    Offline
                </button>
            </div>

            {/* Content */}
            {loading ? (
                <div className="users-loading">
                    <Loader2 size={32} className="spin" />
                    <p>Loading users…</p>
                </div>
            ) : (
                <>
                    {/* Pending Tab */}
                    {tab === 'pending' && (
                        <div className="users-list">
                            {pending.length === 0 ? (
                                <div className="users-empty">
                                    <UserCheck size={48} />
                                    <h3>No pending requests</h3>
                                    <p>New users who message the bot will appear here for approval.</p>
                                </div>
                            ) : (
                                pending.map(user => (
                                    <div key={user.telegram_id} className="users-card">
                                        <div className="users-card-avatar">
                                            {user.first_name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="users-card-info">
                                            <div className="users-card-name">{user.first_name}</div>
                                            <div className="users-card-details">
                                                {user.username && <span>@{user.username}</span>}
                                                <span>ID: {user.telegram_id}</span>
                                                <span><Clock size={12} /> {timeAgo(user.requested_at)}</span>
                                            </div>
                                        </div>
                                        <div className="users-card-actions">
                                            {actionLoading === user.telegram_id ? (
                                                <Loader2 size={20} className="spin" />
                                            ) : (
                                                <>
                                                    <button
                                                        className="users-btn-approve"
                                                        onClick={() => handleApprove(user.telegram_id)}
                                                        title="Approve"
                                                        id={`approve-${user.telegram_id}`}
                                                    >
                                                        <CheckCircle size={18} />
                                                        Approve
                                                    </button>
                                                    <button
                                                        className="users-btn-deny"
                                                        onClick={() => handleDeny(user.telegram_id)}
                                                        title="Deny"
                                                        id={`deny-${user.telegram_id}`}
                                                    >
                                                        <XCircle size={18} />
                                                        Deny
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}



                    {/* Online Tab */}
                    {tab === 'online' && (
                        <div className="users-list">
                            {registered.filter(u => u.is_active).length === 0 ? (
                                <div className="users-empty">
                                    <CheckCircle size={48} />
                                    <h3>No online users</h3>
                                    <p>Approved and functioning users will appear here.</p>
                                </div>
                            ) : (
                                registered.filter(u => u.is_active).map(user => (
                                    <div key={user.id} className="users-card clickable" onClick={() => handleUserClick(user.telegram_id)}>
                                        <div className="users-card-avatar">
                                            {user.display_name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="users-card-info">
                                            <div className="users-card-name">{user.display_name}</div>
                                            <div className="users-card-details">
                                                {user.telegram_id && <span>TG: {user.telegram_id}</span>}
                                                {user.discord_id && <span>DC: {user.discord_id}</span>}
                                                <span>Joined {timeAgo(user.created_at)}</span>
                                            </div>
                                        </div>
                                        <div className="users-card-status">
                                            <span className="users-badge users-badge-approved">
                                                <CheckCircle size={12} /> Active
                                            </span>
                                        </div>
                                        <div className="users-card-actions" onClick={e => e.stopPropagation()}>
                                            <div style={{
                                                display: 'flex',
                                                background: 'rgba(0,0,0,0.3)',
                                                borderRadius: '8px',
                                                padding: '4px',
                                                border: '1px solid rgba(255,255,255,0.1)'
                                            }}>
                                                <button
                                                    onClick={() => user.telegram_id && handleReactivate(user.telegram_id)}
                                                    disabled={true}
                                                    style={{
                                                        background: 'var(--brand-orange)',
                                                        color: '#fff',
                                                        border: 'none',
                                                        padding: '4px 12px',
                                                        borderRadius: '6px',
                                                        fontSize: '12px',
                                                        fontWeight: 600,
                                                        cursor: 'default',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    <CheckCircle size={12} />
                                                    Online
                                                </button>
                                                <button
                                                    onClick={() => user.telegram_id && handleRevoke(user.telegram_id)}
                                                    disabled={!user.telegram_id || actionLoading === user.telegram_id}
                                                    style={{
                                                        background: 'transparent',
                                                        color: 'rgba(255,255,255,0.5)',
                                                        border: 'none',
                                                        padding: '4px 12px',
                                                        borderRadius: '6px',
                                                        fontSize: '12px',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    {actionLoading === user.telegram_id ? <Loader2 size={12} className="spin" /> : <XCircle size={12} />}
                                                    Offline
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* Offline Tab */}
                    {tab === 'offline' && (
                        <div className="users-list">
                            {registered.filter(u => !u.is_active).length === 0 && allRequests.filter(u => u.status !== 'pending' && !registered.some(r => r.telegram_id === u.telegram_id)).length === 0 ? (
                                <div className="users-empty">
                                    <XCircle size={48} />
                                    <h3>No offline users</h3>
                                    <p>Revoked registrations and denied requests will appear here.</p>
                                </div>
                            ) : (
                                <>
                                    {registered.filter(u => !u.is_active).map(user => (
                                        <div key={user.id} className="users-card clickable" onClick={() => handleUserClick(user.telegram_id)}>
                                            <div className="users-card-avatar">
                                                {user.display_name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="users-card-info">
                                                <div className="users-card-name">{user.display_name}</div>
                                                <div className="users-card-details">
                                                    {user.telegram_id && <span>TG: {user.telegram_id}</span>}
                                                    <span>Joined {timeAgo(user.created_at)}</span>
                                                </div>
                                            </div>
                                            <div className="users-card-status">
                                                <span className="users-badge users-badge-denied">
                                                    <XCircle size={12} /> Revoked (Registered)
                                                </span>
                                            </div>
                                            <div className="users-card-actions" onClick={e => e.stopPropagation()}>
                                                <div style={{
                                                    display: 'flex',
                                                    background: 'rgba(0,0,0,0.3)',
                                                    borderRadius: '8px',
                                                    padding: '4px',
                                                    border: '1px solid rgba(255,255,255,0.1)'
                                                }}>
                                                    <button
                                                        onClick={() => user.telegram_id && handleReactivate(user.telegram_id)}
                                                        disabled={!user.telegram_id || actionLoading === user.telegram_id}
                                                        style={{
                                                            background: 'transparent',
                                                            color: 'rgba(255,255,255,0.5)',
                                                            border: 'none',
                                                            padding: '4px 12px',
                                                            borderRadius: '6px',
                                                            fontSize: '12px',
                                                            fontWeight: 600,
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            transition: 'all 0.2s'
                                                        }}
                                                    >
                                                        {actionLoading === user.telegram_id ? <Loader2 size={12} className="spin" /> : <CheckCircle size={12} />}
                                                        Online
                                                    </button>
                                                    <button
                                                        onClick={() => user.telegram_id && handleRevoke(user.telegram_id)}
                                                        disabled={true}
                                                        style={{
                                                            background: '#EF4444',
                                                            color: '#fff',
                                                            border: 'none',
                                                            padding: '4px 12px',
                                                            borderRadius: '6px',
                                                            fontSize: '12px',
                                                            fontWeight: 600,
                                                            cursor: 'default',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            transition: 'all 0.2s'
                                                        }}
                                                    >
                                                        <XCircle size={12} />
                                                        Offline
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {allRequests.filter(u => u.status !== 'pending' && !registered.some(r => r.telegram_id === u.telegram_id)).map(user => (
                                        <div key={`req-${user.telegram_id}`} className="users-card">
                                            <div className="users-card-avatar">
                                                {user.first_name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="users-card-info">
                                                <div className="users-card-name">{user.first_name}</div>
                                                <div className="users-card-details">
                                                    {user.username && <span>@{user.username}</span>}
                                                    <span>ID: {user.telegram_id}</span>
                                                    <span>{timeAgo(user.requested_at)}</span>
                                                </div>
                                            </div>
                                            <div className="users-card-status">
                                                {user.status === 'denied' ? (
                                                    <span className="users-badge users-badge-denied"><XCircle size={12} /> Denied (Request)</span>
                                                ) : (
                                                    <span className="users-badge users-badge-approved"><Clock size={12} /> Approved (Pending Registration)</span>
                                                )}
                                            </div>
                                            <div className="users-card-actions">
                                                {actionLoading === user.telegram_id ? (
                                                    <Loader2 size={20} className="spin" />
                                                ) : (
                                                    <button
                                                        className="users-btn-revoke"
                                                        onClick={() => handleRevoke(user.telegram_id)}
                                                        title="Move to Pending"
                                                    >
                                                        <RotateCcw size={16} /> Revert
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* User Details Modal */}
            {selectedUserId && (
                <div className="modal-backdrop" onClick={() => setSelectedUserId(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>User Insights</h2>
                            <button className="modal-close" onClick={() => setSelectedUserId(null)}><X size={20} /></button>
                        </div>

                        <div className="modal-body">
                            {detailsLoading ? (
                                <div className="modal-loading">
                                    <Loader2 size={32} className="spin" />
                                    <p>Loading user data...</p>
                                </div>
                            ) : !userDetails ? (
                                <div className="modal-error">Failed to load user details.</div>
                            ) : (
                                <div className="user-insights">
                                    <div className="users-tabs" style={{ padding: '16px 20px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <button className={`users-tab ${modalTab === 'info' ? 'active' : ''}`} onClick={() => setModalTab('info')}>
                                            <Shield size={16} /> Info
                                        </button>
                                        <button className={`users-tab ${modalTab === 'logs' ? 'active' : ''}`} onClick={() => setModalTab('logs')}>
                                            <MessageSquare size={16} /> Logs
                                        </button>
                                        <button className={`users-tab ${modalTab === 'memories' ? 'active' : ''}`} onClick={() => setModalTab('memories')}>
                                            <Database size={16} /> Memories
                                        </button>
                                        <button className={`users-tab ${modalTab === 'permissions' ? 'active' : ''}`} onClick={() => setModalTab('permissions')}>
                                            <Lock size={16} /> Permissions
                                        </button>
                                    </div>

                                    <div style={{ padding: '20px' }}>
                                        {modalTab === 'info' && (
                                            <div className="insight-section">
                                                <div className="insight-grid" style={{ marginBottom: '16px' }}>
                                                    <div className="insight-item">
                                                        <span className="insight-label">Name</span>
                                                        <span className="insight-value">{userDetails.user?.display_name || 'N/A'}</span>
                                                    </div>
                                                    <div className="insight-item">
                                                        <span className="insight-label">Telegram ID</span>
                                                        <span className="insight-value">{userDetails.user?.telegram_id || 'N/A'}</span>
                                                    </div>
                                                    <div className="insight-item">
                                                        <span className="insight-label">Discord ID</span>
                                                        <span className="insight-value">{userDetails.user?.discord_id || 'N/A'}</span>
                                                    </div>
                                                    <div className="insight-item">
                                                        <span className="insight-label">WhatsApp</span>
                                                        <span className="insight-value">{userDetails.user?.whatsapp_phone || 'N/A'}</span>
                                                    </div>
                                                    <div className="insight-item">
                                                        <span className="insight-label">Email</span>
                                                        <span className="insight-value">{userDetails.user?.email || 'N/A'}</span>
                                                    </div>
                                                    <div className="insight-item">
                                                        <span className="insight-label">Joined</span>
                                                        <span className="insight-value">{userDetails.user?.created_at ? new Date(userDetails.user.created_at + 'Z').toLocaleString() : 'N/A'}</span>
                                                    </div>
                                                </div>

                                                <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '12px', letterSpacing: '0.05em' }}>Account Access</h4>
                                                <div className="insight-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <div style={{
                                                        display: 'flex',
                                                        background: 'rgba(0,0,0,0.3)',
                                                        borderRadius: '8px',
                                                        padding: '4px',
                                                        border: '1px solid rgba(255,255,255,0.1)'
                                                    }}>
                                                        <button
                                                            onClick={() => userDetails.user?.telegram_id && handleReactivate(userDetails.user.telegram_id)}
                                                            disabled={!userDetails.user?.telegram_id || actionLoading === userDetails.user?.telegram_id || userDetails.user?.is_active}
                                                            style={{
                                                                background: userDetails.user?.is_active ? 'var(--brand-orange)' : 'transparent',
                                                                color: userDetails.user?.is_active ? '#fff' : 'rgba(255,255,255,0.5)',
                                                                border: 'none',
                                                                padding: '6px 16px',
                                                                borderRadius: '6px',
                                                                fontSize: '13px',
                                                                fontWeight: 600,
                                                                cursor: userDetails.user?.is_active ? 'default' : 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '6px',
                                                                transition: 'all 0.2s'
                                                            }}
                                                        >
                                                            {actionLoading === userDetails.user?.telegram_id && !userDetails.user?.is_active ? <Loader2 size={14} className="spin" /> : <CheckCircle size={14} />}
                                                            Online
                                                        </button>
                                                        <button
                                                            onClick={() => userDetails.user?.telegram_id && handleRevoke(userDetails.user.telegram_id)}
                                                            disabled={!userDetails.user?.telegram_id || actionLoading === userDetails.user?.telegram_id || !userDetails.user?.is_active}
                                                            style={{
                                                                background: !userDetails.user?.is_active ? '#EF4444' : 'transparent',
                                                                color: !userDetails.user?.is_active ? '#fff' : 'rgba(255,255,255,0.5)',
                                                                border: 'none',
                                                                padding: '6px 16px',
                                                                borderRadius: '6px',
                                                                fontSize: '13px',
                                                                fontWeight: 600,
                                                                cursor: !userDetails.user?.is_active ? 'default' : 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '6px',
                                                                transition: 'all 0.2s'
                                                            }}
                                                        >
                                                            {actionLoading === userDetails.user?.telegram_id && userDetails.user?.is_active ? <Loader2 size={14} className="spin" /> : <XCircle size={14} />}
                                                            Offline
                                                        </button>
                                                    </div>
                                                    <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginLeft: '8px' }}>
                                                        {userDetails.user?.is_active ? 'User has full access to the dashboard.' : 'User access is revoked and active sessions are terminated.'}
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        {modalTab === 'logs' && (
                                            <div className="insight-section">
                                                {(!userDetails.logs || userDetails.logs.length === 0) ? (
                                                    <div className="insight-empty">No conversation history found.</div>
                                                ) : (
                                                    <div className="insight-logs">
                                                        {userDetails.logs.map((log, i) => (
                                                            <div key={i} className={`log-msg role-${log.role}`}>
                                                                <div className="log-meta">
                                                                    <span className="log-role">{log.role.toUpperCase()}</span>
                                                                    <span className="log-time">{new Date(log.created_at + 'Z').toLocaleString()}</span>
                                                                </div>
                                                                <div className="log-content">{log.content}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {modalTab === 'memories' && (
                                            <div className="insight-section">
                                                {(!userDetails.memories || userDetails.memories.length === 0) ? (
                                                    <div className="insight-empty">
                                                        No memories extracted for this user yet.
                                                    </div>
                                                ) : (
                                                    <div className="insight-logs" style={{ gap: '8px' }}>
                                                        {userDetails.memories.map((mem, i) => (
                                                            <div key={i} className="log-msg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', padding: '12px' }}>
                                                                <div className="log-meta" style={{ marginBottom: '6px' }}>
                                                                    <span className="log-role" style={{ color: 'var(--accent)' }}>{mem.category.toUpperCase()}</span>
                                                                    <span className="log-role" style={{ marginLeft: '8px', color: 'rgba(255,255,255,0.4)' }}>
                                                                        Imp {mem.importance}/10
                                                                    </span>
                                                                    <span className="log-time">{new Date(mem.created_at + 'Z').toLocaleString()}</span>
                                                                </div>
                                                                <div className="log-content" style={{ color: '#fff', fontSize: '14px' }}>
                                                                    {mem.content}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {modalTab === 'permissions' && (
                                            <div className="insight-section">
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                                    <div>
                                                        <h3 style={{ fontSize: '16px', margin: 0 }}>Filesystem Permissions</h3>
                                                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>Default is <b>Denial</b>: Specify directories to whitelist.</p>
                                                    </div>
                                                    <button
                                                        onClick={handleSavePermissions}
                                                        disabled={securitySaving}
                                                        style={{
                                                            background: 'var(--brand-orange)',
                                                            color: '#fff',
                                                            border: 'none',
                                                            padding: '6px 12px',
                                                            borderRadius: '6px',
                                                            fontSize: '13px',
                                                            fontWeight: 600,
                                                            cursor: securitySaving ? 'not-allowed' : 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            opacity: securitySaving ? 0.6 : 1
                                                        }}
                                                    >
                                                        {securitySaving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
                                                        Save
                                                    </button>
                                                </div>

                                                <div className="security-form">
                                                    {(security?.userPathRules?.[userDetails.user.id] || []).map((rule: any, i: number) => (
                                                        <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '8px', alignItems: 'center' }}>
                                                            <input
                                                                type="text"
                                                                value={rule.path}
                                                                onChange={(e) => handleUpdateUserPathRule(userDetails.user.id, i, e.target.value)}
                                                                placeholder="/path/to/directory"
                                                                style={{ flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '8px 12px', color: '#fff', fontFamily: 'monospace' }}
                                                            />
                                                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: (rule.mode === 'read' || rule.mode === 'write') ? 'var(--brand-green)' : 'var(--text-muted)', fontSize: '13px', fontWeight: 500, transition: 'color 0.2s' }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={rule.mode === 'read' || rule.mode === 'write'}
                                                                        onChange={() => handleToggleRuleMode(userDetails.user.id, i, 'read')}
                                                                    /> Read
                                                                </label>
                                                                <div style={{ width: '1px', height: '16px', background: 'var(--border-color)' }} />
                                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: rule.mode === 'write' ? 'var(--brand-orange)' : 'var(--text-muted)', fontSize: '13px', fontWeight: 500, transition: 'color 0.2s' }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={rule.mode === 'write'}
                                                                        onChange={() => handleToggleRuleMode(userDetails.user.id, i, 'write')}
                                                                    /> Write
                                                                </label>
                                                            </div>
                                                            <button
                                                                onClick={() => handleRemoveUserPathRule(userDetails.user.id, i)}
                                                                style={{ background: 'transparent', border: 'none', color: 'var(--brand-red)', cursor: 'pointer', padding: '6px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                                title="Remove Path"
                                                                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(217, 85, 85, 0.1)'}
                                                                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                                                            >
                                                                <X size={16} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <button
                                                        onClick={() => handleAddUserPathRule(userDetails.user.id)}
                                                        style={{ marginTop: '12px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', border: '1px dashed var(--border-color)', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}
                                                        onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--brand-orange)'}
                                                        onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                                                    >
                                                        + Add Directory
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                .users-tabs {
                    display: flex;
                    gap: var(--space-xs);
                    margin-bottom: var(--space-xl);
                    border-bottom: 1px solid var(--border-color);
                    padding-bottom: var(--space-sm);
                }

                .users-tab {
                    display: flex;
                    align-items: center;
                    gap: var(--space-sm);
                    padding: var(--space-sm) var(--space-lg);
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    font-size: var(--font-sm);
                    font-weight: 500;
                    cursor: pointer;
                    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
                    transition: all var(--transition-fast);
                }

                .users-tab:hover {
                    color: var(--text-primary);
                    background: var(--bg-hover);
                }

                .users-tab.active {
                    color: var(--brand-orange);
                    border-bottom: 2px solid var(--brand-orange);
                }

                .users-tab-count {
                    background: var(--brand-orange);
                    color: #fff;
                    font-size: 11px;
                    font-weight: 700;
                    padding: 1px 7px;
                    border-radius: 99px;
                    min-width: 18px;
                    text-align: center;
                }

                .users-refresh-btn {
                    display: flex;
                    align-items: center;
                    gap: var(--space-sm);
                    padding: var(--space-sm) var(--space-lg);
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-sm);
                    color: var(--text-secondary);
                    font-size: var(--font-sm);
                    cursor: pointer;
                    transition: all var(--transition-fast);
                }

                .users-refresh-btn:hover {
                    border-color: var(--brand-orange);
                    color: var(--text-primary);
                }

                .users-loading {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--space-md);
                    padding: var(--space-3xl);
                    color: var(--text-muted);
                }

                .users-empty {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--space-md);
                    padding: var(--space-3xl);
                    text-align: center;
                    color: var(--text-muted);
                }

                .users-empty h3 {
                    color: var(--text-primary);
                    font-size: var(--font-lg);
                }

                .users-empty p {
                    font-size: var(--font-sm);
                    max-width: 320px;
                }

                .users-list {
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-sm);
                }

                .users-card {
                    display: flex;
                    align-items: center;
                    gap: var(--space-lg);
                    padding: var(--space-lg) var(--space-xl);
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-sm);
                    transition: border-color var(--transition-fast);
                }

                .users-card:hover {
                    border-color: var(--border-hover);
                }

                .users-card-avatar {
                    width: 44px;
                    height: 44px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, var(--brand-orange), var(--brand-purple));
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #fff;
                    font-weight: 700;
                    font-size: var(--font-lg);
                    flex-shrink: 0;
                }

                .users-card-info {
                    flex: 1;
                    min-width: 0;
                }

                .users-card-name {
                    font-weight: 600;
                    font-size: var(--font-base);
                    margin-bottom: 2px;
                }

                .users-card-details {
                    display: flex;
                    flex-wrap: wrap;
                    gap: var(--space-md);
                    font-size: var(--font-xs);
                    color: var(--text-muted);
                }

                .users-card-details span {
                    display: flex;
                    align-items: center;
                    gap: 3px;
                }

                .users-card-actions {
                    display: flex;
                    gap: var(--space-sm);
                    flex-shrink: 0;
                }

                .users-btn-approve,
                .users-btn-deny,
                .users-btn-revoke {
                    display: flex;
                    align-items: center;
                    gap: var(--space-xs);
                    padding: var(--space-sm) var(--space-lg);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-sm);
                    font-size: var(--font-sm);
                    font-weight: 500;
                    cursor: pointer;
                    transition: all var(--transition-fast);
                }

                .users-btn-revoke {
                    background: transparent;
                    color: var(--text-secondary);
                    border-color: var(--border-color);
                }

                .users-btn-revoke:hover {
                    background: var(--bg-hover);
                    color: var(--text-primary);
                }

                .users-btn-approve {
                    background: rgba(46, 204, 143, 0.1);
                    color: var(--brand-green);
                    border-color: rgba(46, 204, 143, 0.2);
                }

                .users-btn-approve:hover {
                    background: rgba(46, 204, 143, 0.2);
                    border-color: var(--brand-green);
                }

                .users-btn-deny {
                    background: rgba(217, 85, 85, 0.1);
                    color: var(--brand-red);
                    border-color: rgba(217, 85, 85, 0.2);
                }

                .users-btn-deny:hover {
                    background: rgba(217, 85, 85, 0.2);
                    border-color: var(--brand-red);
                }

                .users-card-status {
                    flex-shrink: 0;
                }

                .users-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 3px 10px;
                    border-radius: 99px;
                    font-size: 11px;
                    font-weight: 600;
                }

                .users-badge-pending {
                    background: rgba(229, 133, 15, 0.15);
                    color: var(--brand-orange);
                }

                .users-badge-approved {
                    background: rgba(46, 204, 143, 0.15);
                    color: var(--brand-green);
                }

                .users-badge-denied {
                    background: rgba(217, 85, 85, 0.15);
                    color: var(--brand-red);
                }

                .users-card.clickable {
                    cursor: pointer;
                }
                .users-card.clickable:hover {
                    background: var(--bg-hover);
                }

                /* Modal Styles */
                .modal-backdrop {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.6);
                    backdrop-filter: blur(4px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                    padding: var(--space-xl);
                }

                .modal-content {
                    background: var(--bg-shell);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-lg);
                    width: 100%;
                    max-width: 700px;
                    max-height: 90vh;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                }

                .modal-header {
                    padding: var(--space-xl);
                    border-bottom: 1px solid var(--border-color);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .modal-header h2 {
                    margin: 0;
                    font-size: var(--font-lg);
                }

                .modal-close {
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    padding: var(--space-xs);
                    border-radius: var(--radius-sm);
                }
                .modal-close:hover {
                    background: var(--bg-hover);
                    color: var(--text-primary);
                }

                .modal-body {
                    padding: var(--space-xl);
                    overflow-y: auto;
                    flex: 1;
                }

                .modal-loading, .modal-error {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: var(--space-3xl);
                    color: var(--text-muted);
                    gap: var(--space-md);
                }

                .user-insights {
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-2xl);
                }

                .insight-section h3 {
                    margin: 0 0 var(--space-md) 0;
                    font-size: var(--font-sm);
                    color: var(--text-secondary);
                    display: flex;
                    align-items: center;
                    gap: var(--space-sm);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .insight-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: var(--space-md);
                }

                .insight-item {
                    background: var(--bg-card);
                    padding: var(--space-md);
                    border-radius: var(--radius-sm);
                    border: 1px solid var(--border-color);
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-xs);
                }

                .insight-label {
                    font-size: var(--font-xs);
                    color: var(--text-muted);
                }

                .insight-value {
                    font-size: var(--font-sm);
                    font-weight: 500;
                    color: var(--text-primary);
                }

                .insight-empty {
                    background: var(--bg-card);
                    padding: var(--space-xl);
                    border-radius: var(--radius-sm);
                    border: 1px dashed var(--border-color);
                    text-align: center;
                    color: var(--text-muted);
                    font-size: var(--font-sm);
                }

                .insight-logs {
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-sm);
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-md);
                    max-height: 400px;
                    overflow-y: auto;
                    padding: var(--space-sm);
                }

                .log-msg {
                    padding: var(--space-md);
                    border-radius: var(--radius-sm);
                    background: var(--bg-elevated);
                    font-size: var(--font-sm);
                }

                .log-msg.role-user {
                    border-left: 2px solid var(--brand-orange);
                }

                .log-msg.role-assistant {
                    border-left: 2px solid var(--brand-blue);
                }

                .log-meta {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: var(--space-sm);
                    font-size: 11px;
                }

                .log-role {
                    font-weight: 700;
                    color: var(--text-secondary);
                }

                .log-time {
                    color: var(--text-muted);
                }

                .log-content {
                    color: var(--text-primary);
                    white-space: pre-wrap;
                    line-height: 1.5;
                }
            `}</style>
        </div>
    );
}
