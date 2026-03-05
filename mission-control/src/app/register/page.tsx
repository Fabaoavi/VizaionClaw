'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import {
    Shield, User, AtSign, Phone, Globe, Hash,
    ArrowRight, Loader2, CheckCircle, AlertCircle, Send, ExternalLink
} from 'lucide-react';

type RegisterStep = 'loading' | 'form' | 'choose-2fa' | 'verify-code' | 'success';

interface ChannelInfo {
    channel: 'telegram' | 'discord' | 'whatsapp';
    label: string;
}

function RegisterContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [step, setStep] = useState<RegisterStep>('loading');
    const [telegramId, setTelegramId] = useState<number | null>(null);
    const [token, setToken] = useState('');

    // Form fields
    const [displayName, setDisplayName] = useState('');
    const [discordId, setDiscordId] = useState('');
    const [phone, setPhone] = useState('');
    const [countryCode, setCountryCode] = useState('+55');

    // 2FA
    const [userId, setUserId] = useState('');
    const [channels, setChannels] = useState<ChannelInfo[]>([]);
    const [selectedChannel, setSelectedChannel] = useState('');
    const [code, setCode] = useState(['', '', '', '', '', '']);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [countdown, setCountdown] = useState(0);

    const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Validate token on load
    useEffect(() => {
        const t = searchParams.get('token');
        if (!t) {
            router.push('/login');
            return;
        }

        setToken(t);

        fetch('/api/auth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: t }),
        })
            .then(r => r.json())
            .then(data => {
                if (data.error || data.type !== 'register') {
                    router.push('/login');
                    return;
                }
                setTelegramId(data.telegram_id);
                setStep('form');
            })
            .catch(() => router.push('/login'));
    }, [searchParams, router]);

    // Countdown timer
    useEffect(() => {
        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [countdown]);

    // ── Submit Registration ──
    async function submitRegistration() {
        if (!displayName.trim()) {
            setError('Display name is required');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token,
                    displayName: displayName.trim(),
                    discordId: discordId.trim() || undefined,
                    phone: phone.trim() ? `${countryCode}${phone.trim()}` : undefined,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Registration failed');
                return;
            }

            setUserId(data.userId);

            // Build available channels
            const availableChannels: ChannelInfo[] = [];
            if (data.channels.includes('telegram')) {
                availableChannels.push({ channel: 'telegram', label: 'Telegram' });
            }
            if (data.channels.includes('discord')) {
                availableChannels.push({ channel: 'discord', label: 'Discord' });
            }
            if (data.channels.includes('whatsapp')) {
                availableChannels.push({ channel: 'whatsapp', label: 'WhatsApp' });
            }

            setChannels(availableChannels);

            // If only telegram available, auto-select it
            if (availableChannels.length === 1) {
                sendCode(availableChannels[0].channel, data.userId);
            } else {
                setStep('choose-2fa');
            }
        } catch {
            setError('Connection error. Try again.');
        } finally {
            setLoading(false);
        }
    }

    // ── Send 2FA Code ──
    async function sendCode(channel: string, uid?: string) {
        setSelectedChannel(channel);
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/send-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: uid || userId, channel }),
            });

            if (!res.ok) {
                setError('Failed to send code');
                return;
            }

            setCountdown(60);
            setStep('verify-code');
            setTimeout(() => codeRefs.current[0]?.focus(), 100);
        } catch {
            setError('Connection error. Try again.');
        } finally {
            setLoading(false);
        }
    }

    // ── Verify Code ──
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

            if (!res.ok) {
                setError('Invalid or expired code');
                setCode(['', '', '', '', '', '']);
                codeRefs.current[0]?.focus();
                return;
            }

            setStep('success');
            setTimeout(() => router.push('/login'), 2000);
        } catch {
            setError('Connection error. Try again.');
        } finally {
            setLoading(false);
        }
    }

    // ── Code input handlers ──
    function handleCodeInput(index: number, value: string) {
        if (!/^\d*$/.test(value)) return;

        const newCode = [...code];
        newCode[index] = value.slice(-1);
        setCode(newCode);

        if (value && index < 5) codeRefs.current[index + 1]?.focus();

        if (index === 5 && value) {
            const full = newCode.join('');
            if (full.length === 6) setTimeout(() => verifyCode(), 100);
        }
    }

    function handleCodeKeyDown(index: number, e: React.KeyboardEvent) {
        if (e.key === 'Backspace' && !code[index] && index > 0) {
            codeRefs.current[index - 1]?.focus();
        }
    }

    function handlePaste(e: React.ClipboardEvent) {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        const newCode = [...code];
        for (let i = 0; i < pasted.length; i++) newCode[i] = pasted[i];
        setCode(newCode);
        if (pasted.length === 6) setTimeout(() => verifyCode(), 100);
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
                    <p className="auth-version">New Registration</p>
                </div>

                {/* Loading */}
                {step === 'loading' && (
                    <div className="auth-step" style={{ textAlign: 'center' }}>
                        <Loader2 size={32} className="spin" style={{ color: 'var(--brand-orange)', margin: '2rem auto' }} />
                        <p className="auth-subtitle">Validating your invite…</p>
                    </div>
                )}

                {/* Registration Form */}
                {step === 'form' && (
                    <div className="auth-step">
                        <h2>Create your profile</h2>
                        <p className="auth-subtitle">Fill in your details to complete registration</p>

                        <div className="auth-form">
                            <div className="auth-input-group">
                                <label htmlFor="reg-tgid">
                                    Telegram User ID{' '}
                                    <a
                                        href="https://telegram.me/userinfobot"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ color: 'var(--brand-blue)', fontSize: 'var(--font-xs)', textTransform: 'none', letterSpacing: 'normal' }}
                                    >
                                        <ExternalLink size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> Find yours here
                                    </a>
                                </label>
                                <div className="auth-input-wrapper" style={{ opacity: 0.7 }}>
                                    <Hash size={18} className="auth-input-icon" />
                                    <input
                                        id="reg-tgid"
                                        type="text"
                                        value={telegramId ? String(telegramId) : ''}
                                        readOnly
                                        style={{ cursor: 'not-allowed' }}
                                    />
                                </div>
                            </div>

                            <div className="auth-input-group">
                                <label htmlFor="reg-name">Display Name *</label>
                                <div className="auth-input-wrapper">
                                    <User size={18} className="auth-input-icon" />
                                    <input
                                        id="reg-name"
                                        type="text"
                                        placeholder="Your display name"
                                        value={displayName}
                                        onChange={e => { setDisplayName(e.target.value); setError(''); }}
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <div className="auth-input-group">
                                <label htmlFor="reg-discord">Discord Nickname</label>
                                <div className="auth-input-wrapper">
                                    <AtSign size={18} className="auth-input-icon" />
                                    <input
                                        id="reg-discord"
                                        type="text"
                                        placeholder="e.g. fabao#1234"
                                        value={discordId}
                                        onChange={e => setDiscordId(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="auth-input-group">
                                <label htmlFor="reg-phone">Phone Number</label>
                                <div className="auth-phone-row">
                                    <div className="auth-input-wrapper auth-country-code">
                                        <Globe size={18} className="auth-input-icon" />
                                        <select
                                            value={countryCode}
                                            onChange={e => setCountryCode(e.target.value)}
                                            id="reg-country"
                                        >
                                            <option value="+55">🇧🇷 +55</option>
                                            <option value="+1">🇺🇸 +1</option>
                                            <option value="+44">🇬🇧 +44</option>
                                            <option value="+351">🇵🇹 +351</option>
                                            <option value="+49">🇩🇪 +49</option>
                                            <option value="+33">🇫🇷 +33</option>
                                            <option value="+81">🇯🇵 +81</option>
                                            <option value="+91">🇮🇳 +91</option>
                                        </select>
                                    </div>
                                    <div className="auth-input-wrapper" style={{ flex: 1 }}>
                                        <Phone size={18} className="auth-input-icon" />
                                        <input
                                            id="reg-phone"
                                            type="tel"
                                            placeholder="Phone number"
                                            value={phone}
                                            onChange={e => setPhone(e.target.value)}
                                        />
                                    </div>
                                </div>
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
                            onClick={submitRegistration}
                            disabled={!displayName.trim() || loading}
                            id="register-submit"
                        >
                            {loading ? <Loader2 size={18} className="spin" /> : <ArrowRight size={18} />}
                            {loading ? 'Creating…' : 'Create Account'}
                        </button>
                    </div>
                )}

                {/* Choose 2FA */}
                {step === 'choose-2fa' && (
                    <div className="auth-step">
                        <h2>Verify your identity</h2>
                        <p className="auth-subtitle">Choose where to receive your verification code</p>

                        <div className="auth-channels">
                            {channels.map(ch => (
                                <button
                                    key={ch.channel}
                                    className="auth-channel-btn"
                                    onClick={() => sendCode(ch.channel)}
                                    disabled={loading}
                                    id={`reg-channel-${ch.channel}`}
                                >
                                    <div className="auth-channel-icon">
                                        {channelIcons[ch.channel]}
                                    </div>
                                    <div className="auth-channel-info">
                                        <span className="auth-channel-name">{ch.label}</span>
                                    </div>
                                    <ArrowRight size={16} className="auth-channel-arrow" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Enter Code */}
                {step === 'verify-code' && (
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
                                    id={`reg-code-${i}`}
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
                            id="reg-verify-submit"
                        >
                            {loading ? <Loader2 size={18} className="spin" /> : <Shield size={18} />}
                            {loading ? 'Verifying…' : 'Complete Registration'}
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
                    </div>
                )}

                {/* Success */}
                {step === 'success' && (
                    <div className="auth-step" style={{ textAlign: 'center' }}>
                        <div className="auth-success-icon">
                            <CheckCircle size={48} />
                        </div>
                        <h2>Welcome aboard! 🚀</h2>
                        <p className="auth-subtitle">Your account is ready. Redirecting to VizaionDashboard…</p>
                    </div>
                )}
            </div>

            {/* Security badge */}
            <div className="auth-security-badge">
                <Shield size={14} />
                <span>End-to-end secured · No passwords stored</span>
            </div>
        </div>
    );
}

export default function RegisterPage() {
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
            <RegisterContent />
        </Suspense>
    );
}
