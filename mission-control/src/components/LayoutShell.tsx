'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

const AUTH_ROUTES = ['/login', '/register'];

export default function LayoutShell({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const isAuthPage = AUTH_ROUTES.some(route => pathname.startsWith(route));

    if (isAuthPage) {
        return <>{children}</>;
    }

    useEffect(() => {
        // Poll session every 15 seconds to ensure active access
        const checkSession = async () => {
            try {
                const res = await fetch('/api/auth/session');
                const data = await res.json();

                // If user is logged in but their access was revoked
                if (data.authenticated && data.user && !data.user.isActive) {
                    await fetch('/api/auth/session', { method: 'DELETE' }); // Clear local cookie
                    router.push('/login?revoked=true');
                } else if (!data.authenticated) {
                    router.push('/login');
                }
            } catch (err) {
                // Ignore silent network errors
            }
        };

        const interval = setInterval(checkSession, 15000);
        // Do an immediate check on mount too
        checkSession();

        return () => clearInterval(interval);
    }, [router]);

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                {children}
            </main>
        </div>
    );
}
