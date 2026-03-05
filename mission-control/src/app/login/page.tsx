'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import {
    Shield, User, MessageCircle, Phone, AtSign,
    ArrowRight, Loader2, CheckCircle, AlertCircle, Send
} from 'lucide-react';

// ── Login Steps ──────────────────────────────────────────────────
type LoginStep = 'identify' | 'choose-2fa' | 'verify-code';

interface MaskedChannel {
    channel: 'telegram' | 'discord' | 'whatsapp';
    hint: string;
}

function LoginContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [step, setStep] = useState<LoginStep>('identify');
    const [identifier, setIdentifier] = useState('');
    const [userId, setUserId] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [channels, setChannels] = useState<MaskedChannel[]>([]);
    const [selectedChannel, setSelectedChannel] = useState('');
    const [code, setCode] = useState(['', '', '', '', '', '']);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [codeSent, setCodeSent] = useState(false);
    const [countdown, setCountdown] = useState(0);

    const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Check if already logged in
    useEffect(() => {
        fetch('/api/auth/session')
            .then(r => r.json())
            .then(data => {
                const isRevoked = searchParams.get('revoked') === 'true';
                if (data.authenticated && !isRevoked) {
                    router.push('/');
                }
            })
            .catch(() => { });
    }, [router, searchParams]);

    // Check for revoked status directly
    useEffect(() => {
        if (searchParams.get('revoked') === 'true') {
            setError('Your access to VizaionDashboard has been revoked by the administrator.');
        }
    }, [searchParams]);

    // Auto-fill token if present (from bot link)
    useEffect(() => {
        const token = searchParams.get('token');
        if (token) {
            fetch('/api/auth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
            })
                .then(r => r.json())
                .then(data => {
                    if (data.type === 'register') {
                        router.push(`/register?token=${token}`);
                    } else if (data.user_id) {
                        setUserId(data.user_id);
                        lookupUser(data.user_id);
                    } else if (data.telegram_id) {
                        lookupUser(String(data.telegram_id));
                    }
                })
                .catch(() => { });
        }
    }, [searchParams, router]);

    // Countdown timer for resend
    useEffect(() => {
        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [countdown]);

    // ── Step 1: Identify ──
    async function lookupUser(id?: string) {
        setLoading(true);
        setError('');
        const payloadIdentifier = id || identifier;
        console.log(`[FRONTEND_LOGIN] Sending login payload for: ${payloadIdentifier}`);

        try {
            console.log(`[FRONTEND_LOGIN] Awaiting fetch from /api/auth/login...`);
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier: payloadIdentifier }),
            });

            console.log(`[FRONTEND_LOGIN] fetch returned with status: ${res.status}`);
            const data = await res.json();
            console.log(`[FRONTEND_LOGIN] fetch payload parsing complete.`);

            if (!res.ok) {
                setError('User not found');
                return;
            }

            setUserId(data.userId);
            setDisplayName(data.displayName);
            setChannels(data.channels);
            setStep('choose-2fa');
            console.log(`[FRONTEND_LOGIN] State updated successfully! Moving to choose-2fa.`);
        } catch (err) {
            console.error(`[FRONTEND_LOGIN] Connection error encountered:`, err);
            setError('Connection error. Try again.');
        } finally {
            console.log(`[FRONTEND_LOGIN] Request finalized.`);
            setLoading(false);
        }
    }

    // ── Step 2: Send code ──
    async function sendCode(channel: string) {
        setSelectedChannel(channel);
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/send-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, channel }),
            });

            if (!res.ok) {
                setError('Failed to send code');
                return;
            }

            setCodeSent(true);
            setCountdown(60);
            setStep('verify-code');
            setTimeout(() => codeRefs.current[0]?.focus(), 100);
        } catch {
            setError('Connection error. Try again.');
        } finally {
            setLoading(false);
        }
    }

    // ── Step 3: Verify code ──
    async function verifyCode() {
        const fullCode = code.join('');
        if (fullCode.length !== 6) return;

        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, code: fullCode }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError('Invalid or expired code');
                setCode(['', '', '', '', '', '']);
                codeRefs.current[0]?.focus();
                return;
            }

            // Success — redirect to dashboard
            router.push('/');
        } catch {
            setError('Connection error. Try again.');
        } finally {
            setLoading(false);
        }
    }

    // ── Code input handler ──
    function handleCodeInput(index: number, value: string) {
        if (!/^\d*$/.test(value)) return;

        const newCode = [...code];
        newCode[index] = value.slice(-1);
        setCode(newCode);

        // Auto-advance
        if (value && index < 5) {
            codeRefs.current[index + 1]?.focus();
        }

        // Auto-submit when all 6 digits entered
        if (index === 5 && value) {
            const fullCode = newCode.join('');
            if (fullCode.length === 6) {
                setTimeout(() => verifyCode(), 100);
            }
        }
    }

    function handleCodeKeyDown(index: number, e: React.KeyboardEvent) {
        if (e.key === 'Backspace' && !code[index] && index > 0) {
            codeRefs.current[index - 1]?.focus();
        }
    }

    // ── Paste handler ──
    function handlePaste(e: React.ClipboardEvent) {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        const newCode = [...code];
        for (let i = 0; i < pasted.length; i++) {
            newCode[i] = pasted[i];
        }
        setCode(newCode);
        if (pasted.length === 6) {
            setTimeout(() => verifyCode(), 100);
        }
    }

    const channelIcons: Record<string, React.ReactNode> = {
        telegram: <Send size={20} />,
        discord: <AtSign size={20} />,
        whatsapp: <Phone size={20} />,
    };

    return (
        <div className="auth-page">
            <div className="auth-container">
                {/* Logo */}
                <div className="auth-logo">
                    <div className="auth-logo-icon">
                        <Shield size={32} />
                    </div>
                    <h1>VizaionDashboard</h1>
                    <p className="auth-version">Secure Access</p>
                </div>

                {/* Step 1: Identify */}
                {step === 'identify' && (
                    <div className="auth-step">
                        <h2>Welcome back</h2>
                        <p className="auth-subtitle">Enter any of your linked identifiers</p>

                        {searchParams.get('revoked') === 'true' && (
                            <div className="auth-error" style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                <AlertCircle size={18} style={{ color: '#EF4444', flexShrink: 0, marginTop: '2px' }} />
                                <span style={{ color: '#EF4444', fontSize: '14px', lineHeight: '1.4' }}>Your access to VizaionDashboard has been revoked by the administrator.</span>
                            </div>
                        )}

                        {searchParams.get('revoked') !== 'true' && (
                            <>
                                <div className="auth-input-group">
                                    <div className="auth-input-wrapper">
                                        <User size={18} className="auth-input-icon" />
                                        <input
                                            type="text"
                                            placeholder="Username, Telegram ID, Discord, or Phone"
                                            value={identifier}
                                            onChange={e => { setIdentifier(e.target.value); setError(''); }}
                                            onKeyDown={e => e.key === 'Enter' && identifier && lookupUser()}
                                            autoFocus
                                            id="login-identifier"
                                        />
                                    </div>
                                </div>

                                {error && (
                                    <div className="auth-error">
                                        <AlertCircle size={16} />
                                        {error}
                                    </div>
                                )}

                                <button
                                    className="auth-btn-primary"
                                    onClick={() => lookupUser()}
                                    disabled={!identifier || loading}
                                    id="login-submit"
                                >
                                    {loading ? <Loader2 size={18} className="spin" /> : <ArrowRight size={18} />}
                                    {loading ? 'Looking up…' : 'Continue'}
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* Step 2: Choose 2FA method */}
                {
                    step === 'choose-2fa' && (
                        <div className="auth-step">
                            <h2>Hi, {displayName} 👋</h2>
                            <p className="auth-subtitle">Choose how to receive your verification code</p>

                            <div className="auth-channels">
                                {channels.map(ch => (
                                    <button
                                        key={ch.channel}
                                        className="auth-channel-btn"
                                        onClick={() => sendCode(ch.channel)}
                                        disabled={loading}
                                        id={`channel-${ch.channel}`}
                                    >
                                        <div className="auth-channel-icon">
                                            {channelIcons[ch.channel]}
                                        </div>
                                        <div className="auth-channel-info">
                                            <span className="auth-channel-name">
                                                {ch.channel.charAt(0).toUpperCase() + ch.channel.slice(1)}
                                            </span>
                                            <span className="auth-channel-hint">{ch.hint}</span>
                                        </div>
                                        <ArrowRight size={16} className="auth-channel-arrow" />
                                    </button>
                                ))}
                            </div>

                            <button className="auth-btn-ghost" onClick={() => { setStep('identify'); setError(''); }}>
                                ← Back
                            </button>
                        </div>
                    )
                }

                {/* Step 3: Enter code */}
                {
                    step === 'verify-code' && (
                        <div className="auth-step">
                            <div className="auth-code-sent">
                                <CheckCircle size={20} className="auth-code-sent-icon" />
                                <span>Code sent via {selectedChannel}</span>
                            </div>

                            <h2>Enter verification code</h2>
                            <p className="auth-subtitle">6-digit code sent to your {selectedChannel}</p>

                            <div className="auth-code-inputs" onPaste={handlePaste}>
                                {code.map((digit, i) => (
                                    <input
                                        key={i}
                                        ref={el => { codeRefs.current[i] = el; }}
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={1}
                                        value={digit}
                                        onChange={e => handleCodeInput(i, e.target.value)}
                                        onKeyDown={e => handleCodeKeyDown(i, e)}
                                        className="auth-code-digit"
                                        id={`code-digit-${i}`}
                                    />
                                ))}
                            </div>

                            {error && (
                                <div className="auth-error">
                                    <AlertCircle size={16} />
                                    {error}
                                </div>
                            )}

                            <button
                                className="auth-btn-primary"
                                onClick={verifyCode}
                                disabled={code.join('').length !== 6 || loading}
                                id="verify-submit"
                            >
                                {loading ? <Loader2 size={18} className="spin" /> : <Shield size={18} />}
                                {loading ? 'Verifying…' : 'Verify & Login'}
                            </button>

                            <div className="auth-resend">
                                {countdown > 0 ? (
                                    <span className="auth-countdown">Resend in {countdown}s</span>
                                ) : (
                                    <button className="auth-btn-ghost" onClick={() => sendCode(selectedChannel)}>
                                        Resend code
                                    </button>
                                )}
                            </div>

                            <button className="auth-btn-ghost" onClick={() => { setStep('choose-2fa'); setError(''); setCode(['', '', '', '', '', '']); }}>
                                ← Choose different method
                            </button>
                        </div>
                    )
                }
            </div >

            {/* Security badge */}
            < div className="auth-security-badge" >
                <Shield size={14} />
                <span>End-to-end secured · No passwords stored</span>
            </div >
        </div >
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div className="auth-page">
                <div className="auth-container">
                    <div className="auth-logo">
                        <div className="auth-logo-icon"><Shield size={32} /></div>
                        <h1>VizaionDashboard</h1>
                        <p className="auth-version">Loading…</p>
                    </div>
                </div>
            </div>
        }>
            <LoginContent />
        </Suspense>
    );
}
