'use client';

import { useState } from 'react';
import { Shield, Users, Server } from 'lucide-react';

import SecurityTab from './SecurityTab';
import UsersTab from './UsersTab';

export default function AdminCenterPage() {
    const [activeTab, setActiveTab] = useState<'security' | 'users'>('security');

    return (
        <div className="admin-container">
            {/* Master Admin Header */}
            <div className="admin-header">
                <div>
                    <h1><Server size={28} style={{ marginRight: '16px' }} />Admin Center</h1>
                    <p className="admin-subtitle">Global security rules, environment configs, and user access roles</p>
                </div>
            </div>

            {/* Master Tab Navigation */}
            <div className="admin-tabs">
                <button
                    className={`nav-tab ${activeTab === 'security' ? 'active' : ''}`}
                    onClick={() => setActiveTab('security')}
                >
                    <Shield size={18} />
                    <span>Security & Environment</span>
                </button>
                <button
                    className={`nav-tab ${activeTab === 'users' ? 'active' : ''}`}
                    onClick={() => setActiveTab('users')}
                >
                    <Users size={18} />
                    <span>User Management</span>
                </button>
            </div>

            {/* Content Area rendering the chosen Sub-page */}
            <div className="admin-content-area">
                {activeTab === 'security' && <SecurityTab />}
                {activeTab === 'users' && <UsersTab />}
            </div>

            <style jsx>{`
                .admin-container {
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    overflow: hidden;
                    background: var(--bg-default);
                }

                .admin-header {
                    padding: var(--space-xl) var(--space-2xl) 0 var(--space-2xl);
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                }

                .admin-header h1 {
                    display: flex;
                    align-items: center;
                    font-size: var(--font-2xl);
                    font-weight: 700;
                    color: var(--text-primary);
                    margin: 0 0 var(--space-xs) 0;
                    letter-spacing: -0.02em;
                }

                .admin-subtitle {
                    color: var(--text-secondary);
                    font-size: var(--font-sm);
                    margin: 0;
                }

                .admin-tabs {
                    display: flex;
                    gap: var(--space-xl);
                    padding: 0 var(--space-2xl);
                    margin-top: var(--space-xl);
                    border-bottom: 1px solid var(--border-color);
                }

                .nav-tab {
                    display: flex;
                    align-items: center;
                    gap: var(--space-sm);
                    padding: var(--space-sm) 0 var(--space-md) 0;
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    font-weight: 500;
                    font-size: var(--font-sm);
                    cursor: pointer;
                    position: relative;
                    transition: color var(--transition-fast);
                }

                .nav-tab:hover {
                    color: var(--text-primary);
                }

                .nav-tab.active {
                    color: var(--brand-orange);
                }

                .nav-tab.active::after {
                    content: '';
                    position: absolute;
                    bottom: -1px;
                    left: 0;
                    right: 0;
                    height: 2px;
                    background: var(--brand-orange);
                    border-radius: 2px 2px 0 0;
                }

                .admin-content-area {
                    flex: 1;
                    overflow-y: auto;
                    /* Since each sub-page already has .page-container padding, we don't need padding here */
                }

                /* Overriding the internal page-container padding of the imported tabs so they don't double-pad */
                .admin-content-area :global(.page-container) {
                    padding: var(--space-2xl);
                }
                .admin-content-area :global(.page-header) {
                    display: none; /* Hide the internal headers since we have a master header now */
                }
            `}</style>
        </div>
    );
}
