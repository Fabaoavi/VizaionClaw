import type { Metadata } from 'next';
import './globals.css';
import LayoutShell from '@/components/LayoutShell';

export const metadata: Metadata = {
    title: 'VizaionDashboard — Agent Dashboard',
    description: 'The visual cockpit for your AI agent. Real-time activity, analytics, task management, and more.',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>
                <LayoutShell>
                    {children}
                </LayoutShell>
            </body>
        </html>
    );
}
