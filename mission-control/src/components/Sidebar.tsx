'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  LayoutDashboard,
  Zap,
  CheckSquare,
  MonitorPlay,
  Brain,
  Plug,
  Settings,
  Activity,
  Users,
  Server,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/', label: 'Command Center', icon: LayoutDashboard },
  { href: '/productivity', label: 'Productivity', icon: Zap },
  { href: '/tasks', label: 'Tasks & Projects', icon: CheckSquare },
  { href: '/content', label: 'Content Intel', icon: MonitorPlay },
  { href: '/brain', label: 'Second Brain', icon: Brain },
  { href: '/connections', label: 'Connections', icon: Plug },
  { href: '/admin', label: 'Admin Center', icon: Server },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const AGENT_LEVEL = 7;
const AGENT_TITLE = 'Field Agent';
const XP_PROGRESS = 65; // percent

export default function Sidebar() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch('/api/auth/session')
      .then(res => res.json())
      .then(data => {
        if (data?.user?.isAdmin) {
          setIsAdmin(true);
        }
      })
      .catch(console.error);
  }, []);

  return (
    <aside className="sidebar">
      {/* Logo & Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          <Image src="/logo.png" alt="Vizaion Logo" width={40} height={40} className="w-full h-full object-cover rounded-md" />
        </div>
        <div>
          <div className="sidebar-title">VizaionDashboard</div>
          <div className="sidebar-version">v1.0.0</div>
        </div>
      </div>

      {/* Agent Status */}
      <div className="agent-status-card">
        <div className="agent-status-row">
          <span className="agent-pulse" />
          <span className="agent-status-text">Agent Online</span>
        </div>
        <div className="agent-status-detail">Railway · Claude Sonnet 4</div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.filter(item => {
          if (item.href === '/admin' && !isAdmin) return false;
          return true;
        }).map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* XP Bar */}
      <div className="sidebar-xp">
        <div className="xp-header">
          <span className="xp-level">Level {AGENT_LEVEL}</span>
          <span className="xp-title">{AGENT_TITLE}</span>
        </div>
        <div className="xp-bar-track">
          <div
            className="xp-bar-fill"
            style={{ width: `${XP_PROGRESS}%` }}
          />
        </div>
        <div className="xp-percent">{XP_PROGRESS}% to next level</div>
      </div>

      <style jsx>{`
        .sidebar {
          position: fixed;
          top: 0;
          left: 0;
          width: var(--sidebar-width);
          height: 100vh;
          background: var(--bg-deep);
          border-right: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          padding: var(--space-xl) 0;
          z-index: 100;
          overflow-y: auto;
        }

        /* Brand */
        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: var(--space-md);
          padding: 0 var(--space-xl);
          margin-bottom: var(--space-xl);
        }

        .sidebar-logo {
          width: 40px;
          height: 40px;
          border-radius: var(--radius-md);
          background: transparent !important;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          flex-shrink: 0;
        }

        .sidebar-title {
          font-size: var(--font-md);
          font-weight: 700;
          letter-spacing: -0.01em;
        }

        .sidebar-version {
          font-size: var(--font-xs);
          color: var(--text-muted);
        }

        /* Agent Status */
        .agent-status-card {
          margin: 0 var(--space-lg) var(--space-xl);
          padding: var(--space-md) var(--space-lg);
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
        }

        .agent-status-row {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          margin-bottom: 2px;
        }

        .agent-pulse {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--brand-green);
          animation: pulse-glow 2s ease-in-out infinite;
          flex-shrink: 0;
        }

        .agent-status-text {
          font-size: var(--font-sm);
          font-weight: 600;
          color: var(--brand-green);
        }

        .agent-status-detail {
          font-size: var(--font-xs);
          color: var(--text-muted);
          margin-left: calc(8px + var(--space-sm));
        }

        /* Nav */
        .sidebar-nav {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 0 var(--space-md);
        }

        .sidebar-nav-item {
          display: flex;
          align-items: center;
          gap: var(--space-md);
          padding: var(--space-sm) var(--space-lg);
          border-radius: var(--radius-sm);
          font-size: var(--font-sm);
          font-weight: 500;
          color: var(--text-secondary);
          opacity: 0.72;
          transition: all var(--transition-fast);
          text-decoration: none;
        }

        .sidebar-nav-item:hover {
          background: var(--bg-hover);
          opacity: 1;
          color: var(--text-primary);
        }

        .sidebar-nav-item.active {
          background: var(--bg-elevated);
          color: #fff;
          opacity: 1;
        }

        .sidebar-nav-item.active :global(svg) {
          color: var(--brand-orange);
        }

        /* XP Bar */
        .sidebar-xp {
          padding: var(--space-lg) var(--space-xl);
          border-top: 1px solid var(--border-color);
          margin-top: var(--space-lg);
        }

        .xp-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: var(--space-sm);
        }

        .xp-level {
          font-size: var(--font-sm);
          font-weight: 700;
          color: var(--brand-orange);
        }

        .xp-title {
          font-size: var(--font-xs);
          color: var(--text-muted);
          font-style: italic;
        }

        .xp-bar-track {
          width: 100%;
          height: 6px;
          background: var(--bg-card);
          border-radius: 999px;
          overflow: hidden;
          margin-bottom: var(--space-xs);
        }

        .xp-bar-fill {
          height: 100%;
          border-radius: 999px;
          background: linear-gradient(90deg, var(--brand-orange), var(--brand-purple));
          background-size: 200% 100%;
          animation: gradient-shift 3s ease infinite;
        }

        .xp-percent {
          font-size: var(--font-xs);
          color: var(--text-muted);
        }
      `}</style>
    </aside>
  );
}
