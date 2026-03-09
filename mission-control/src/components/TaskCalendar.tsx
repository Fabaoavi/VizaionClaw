'use client';

import { useState } from 'react';
import {
    format,
    addMonths,
    subMonths,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    isToday
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

export interface CalendarEvent {
    id: string;
    title: string;
    date: string; // YYYY-MM-DD
    color?: string;
    type: 'local' | 'google';
    isShared?: boolean;
    sharedBy?: string;
}

interface TaskCalendarProps {
    events: CalendarEvent[];
    onDateClick?: (date: Date) => void;
    onEventClick?: (event: CalendarEvent) => void;
}

export function TaskCalendar({ events, onDateClick, onEventClick }: TaskCalendarProps) {
    const [currentDate, setCurrentDate] = useState(new Date());

    const startDate = startOfWeek(startOfMonth(currentDate));
    const endDate = endOfWeek(endOfMonth(currentDate));
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
    const goToToday = () => setCurrentDate(new Date());

    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
        <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-deep)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                    <CalendarIcon size={18} color="var(--brand-purple)" />
                    <h3 style={{ margin: 0 }}>{format(currentDate, 'MMMM yyyy')}</h3>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                    <button className="btn btn-secondary" onClick={goToToday} style={{ padding: '4px 12px', fontSize: 12 }}>Today</button>
                    <button className="btn btn-secondary" onClick={prevMonth} style={{ padding: '4px 8px' }}><ChevronLeft size={16} /></button>
                    <button className="btn btn-secondary" onClick={nextMonth} style={{ padding: '4px 8px' }}><ChevronRight size={16} /></button>
                </div>
            </div>

            {/* Weekdays Header */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
                {weekdays.map(day => (
                    <div key={day} style={{ padding: 'var(--space-sm)', textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                        {day}
                    </div>
                ))}
            </div>

            {/* Calendar Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: 'minmax(80px, 1fr)', flex: 1, overflowY: 'auto' }}>
                {days.map((day, i) => {
                    const dayEvents = events.filter(e => isSameDay(new Date(`${e.date}T12:00:00`), day));
                    const isMuted = !isSameMonth(day, currentDate);
                    const isCurrentDay = isToday(day);

                    return (
                        <div
                            key={day.toISOString()}
                            style={{
                                borderRight: (i + 1) % 7 === 0 ? 'none' : '1px solid var(--border-color)',
                                borderBottom: '1px solid var(--border-color)',
                                padding: 'var(--space-xs)',
                                background: isCurrentDay ? 'rgba(168, 85, 247, 0.05)' : isMuted ? 'var(--bg-deep)' : 'transparent',
                                cursor: 'pointer',
                                transition: 'background 0.2s'
                            }}
                            onClick={() => onDateClick?.(day)}
                            onMouseOver={(e) => e.currentTarget.style.background = isCurrentDay ? 'rgba(168, 85, 247, 0.1)' : 'rgba(255,255,255,0.02)'}
                            onMouseOut={(e) => e.currentTarget.style.background = isCurrentDay ? 'rgba(168, 85, 247, 0.05)' : isMuted ? 'var(--bg-deep)' : 'transparent'}
                        >
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: 12,
                                fontWeight: isCurrentDay ? 'bold' : 'normal',
                                color: isCurrentDay ? 'var(--brand-purple)' : isMuted ? 'var(--text-muted)' : 'var(--text-main)',
                                marginBottom: 4
                            }}>
                                <span>{format(day, 'd')}</span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {dayEvents.map(evt => (
                                    <div
                                        key={evt.id}
                                        onClick={(e) => { e.stopPropagation(); onEventClick?.(evt); }}
                                        style={{
                                            fontSize: 10,
                                            padding: '2px 4px',
                                            borderRadius: 4,
                                            background: evt.type === 'google' ? 'rgba(66, 133, 244, 0.15)' : `${evt.color || 'var(--brand-purple)'}33`,
                                            color: evt.type === 'google' ? '#4285F4' : evt.color || 'var(--brand-purple)',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            borderLeft: `2px solid ${evt.type === 'google' ? '#4285F4' : evt.color || 'var(--brand-purple)'}`
                                        }}
                                        title={evt.title}
                                    >
                                        {evt.type === 'google' && <span style={{ marginRight: 4 }}>🇬</span>}
                                        {evt.title}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
