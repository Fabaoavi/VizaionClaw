'use client';

import { useState } from 'react';
import {
    MonitorPlay,
    Eye,
    TrendingUp,
    BarChart3,
    ChevronDown,
    ChevronUp,
} from 'lucide-react';

/* ── Mock Content Data ────────────────────────────────────── */
interface ContentItem {
    id: number;
    title: string;
    views: number;
    engagement: number;
    outlierScore: number;
    date: string;
    platform: string;
}

const MOCK_CONTENT: ContentItem[] = [
    { id: 1, title: 'How I Built an AI Agent That Runs My Life', views: 45200, engagement: 8.7, outlierScore: 4.2, date: '2 days ago', platform: 'YouTube' },
    { id: 2, title: 'The MCP Protocol Explained in 10 Minutes', views: 32100, engagement: 7.3, outlierScore: 3.0, date: '5 days ago', platform: 'YouTube' },
    { id: 3, title: 'Why Pinecone Beats Supabase for Agent Memory', views: 18500, engagement: 6.1, outlierScore: 1.7, date: '1 week ago', platform: 'YouTube' },
    { id: 4, title: 'Building Mission Control — Dev Stream', views: 12300, engagement: 5.4, outlierScore: 1.1, date: '1 week ago', platform: 'YouTube' },
    { id: 5, title: 'Groq vs OpenRouter — Speed Benchmark', views: 28700, engagement: 7.8, outlierScore: 2.7, date: '2 weeks ago', platform: 'YouTube' },
    { id: 6, title: 'My AI Reads My Telegram Messages — Here\'s How', views: 8900, engagement: 4.2, outlierScore: 0.8, date: '2 weeks ago', platform: 'YouTube' },
    { id: 7, title: 'The 90-Day AI Agent Challenge', views: 15600, engagement: 5.9, outlierScore: 1.5, date: '3 weeks ago', platform: 'YouTube' },
    { id: 8, title: 'Vector Databases for Beginners', views: 21400, engagement: 6.5, outlierScore: 2.0, date: '3 weeks ago', platform: 'YouTube' },
    { id: 9, title: 'Deploy Anything to Railway in 5 Minutes', views: 10200, engagement: 4.8, outlierScore: 0.9, date: '1 month ago', platform: 'YouTube' },
];

const AVG_VIEWS = Math.round(MOCK_CONTENT.reduce((sum, c) => sum + c.views, 0) / MOCK_CONTENT.length);

function getOutlierClass(score: number): string {
    if (score >= 3) return 'viral';
    if (score >= 1.5) return 'above';
    if (score >= 0.9) return 'normal';
    return 'below';
}

function formatViews(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
}

export default function ContentIntelPage() {
    const [expandedId, setExpandedId] = useState<number | null>(null);

    const totalViews = MOCK_CONTENT.reduce((sum, c) => sum + c.views, 0);
    const avgEngagement = (MOCK_CONTENT.reduce((sum, c) => sum + c.engagement, 0) / MOCK_CONTENT.length).toFixed(1);

    const STATS = [
        { label: 'Videos Tracked', value: MOCK_CONTENT.length.toString(), badge: '+2 this week', color: 'red', icon: MonitorPlay },
        { label: 'Total Views', value: formatViews(totalViews), badge: '+12K today', color: 'blue', icon: Eye },
        { label: 'Engagement Rate', value: `${avgEngagement}%`, badge: 'Above avg', color: 'green', icon: TrendingUp },
    ];

    return (
        <>
            <div className="page-header">
                <h1>📺 Content Intel</h1>
                <p>Analytics for your content across platforms</p>
            </div>

            {/* Stats */}
            <div className="stat-grid">
                {STATS.map((s, i) => {
                    const Icon = s.icon;
                    return (
                        <div key={s.label} className={`stat-card ${s.color} delay-${i + 1}`}>
                            <div className="stat-label"><Icon size={14} /> {s.label}</div>
                            <div className="stat-value">{s.value}</div>
                            <span className={`stat-badge ${s.color === 'red' ? 'orange' : s.color}`}>{s.badge}</span>
                        </div>
                    );
                })}
            </div>

            {/* Outlier Baseline Bar */}
            <div className="card delay-4" style={{ marginBottom: 'var(--space-2xl)' }}>
                <div className="card-header">
                    <h3><BarChart3 size={16} style={{ marginRight: 6 }} /> Outlier Baseline</h3>
                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-sm)' }}>
                        Avg of last {MOCK_CONTENT.length} videos: <strong style={{ color: 'var(--text-primary)' }}>{formatViews(AVG_VIEWS)} views</strong>
                    </span>
                </div>
                <div className="progress-bar-track" style={{ height: 12 }}>
                    <div className="progress-bar-fill" style={{ width: '55%' }} />
                </div>
            </div>

            {/* Content Grid */}
            <div className="content-grid">
                {MOCK_CONTENT.map((item, i) => {
                    const cls = getOutlierClass(item.outlierScore);
                    const isExpanded = expandedId === item.id;
                    return (
                        <div
                            key={item.id}
                            className={`content-card delay-${(i % 8) + 1}`}
                            onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        >
                            <div className="thumbnail" style={{
                                background: `linear-gradient(135deg, ${cls === 'viral' ? 'rgba(46,204,143,0.3)' :
                                        cls === 'above' ? 'rgba(90,156,245,0.3)' :
                                            cls === 'below' ? 'rgba(217,85,85,0.3)' :
                                                'rgba(255,255,255,0.05)'
                                    }, var(--bg-deep))`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                <MonitorPlay size={40} style={{ opacity: 0.3 }} />
                                <span className={`outlier-badge ${cls}`}>
                                    {item.outlierScore.toFixed(1)}×
                                </span>
                            </div>
                            <div className="content-info">
                                <div className="content-title">{item.title}</div>
                                <div className="content-meta">
                                    <span>{formatViews(item.views)} views</span>
                                    <span>{item.engagement}% eng.</span>
                                    <span>{item.date}</span>
                                </div>
                            </div>
                            {isExpanded && (
                                <div className="insights-panel">
                                    <div className="insight-row">
                                        <span className="label">Outlier Score</span>
                                        <span className={`tag ${cls === 'viral' ? 'green' : cls === 'above' ? 'blue' : cls === 'below' ? 'red' : 'orange'}`}>
                                            {item.outlierScore.toFixed(1)}×
                                        </span>
                                    </div>
                                    <div className="insight-row">
                                        <span className="label">Engagement Rate</span>
                                        <span>{item.engagement}%</span>
                                    </div>
                                    <div className="insight-row">
                                        <span className="label">vs Average</span>
                                        <span style={{ color: item.views > AVG_VIEWS ? 'var(--brand-green)' : 'var(--brand-red)' }}>
                                            {item.views > AVG_VIEWS ? '+' : ''}{((item.views / AVG_VIEWS - 1) * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                    <div className="insight-row">
                                        <span className="label">AI Recommendation</span>
                                        <span style={{ color: 'var(--brand-blue)', fontStyle: 'italic' }}>
                                            {item.outlierScore >= 3
                                                ? 'Double down — make a follow-up series'
                                                : item.outlierScore >= 1.5
                                                    ? 'Solid performance — repurpose into shorts'
                                                    : 'Experiment with a punchier hook'}
                                        </span>
                                    </div>
                                </div>
                            )}
                            <div style={{
                                padding: '6px var(--space-lg)',
                                textAlign: 'center',
                                color: 'var(--text-muted)',
                                fontSize: 'var(--font-xs)',
                                borderTop: '1px solid var(--border-color)',
                            }}>
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
