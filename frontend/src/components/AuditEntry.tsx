import type { AuditEvent } from '@/lib/api';

const EVENT_STYLE: Record<string, { bg: string; text: string; icon: string }> = {
  GRANT_CREATED: { bg: 'var(--color-teal-lt)',  text: 'var(--color-teal)',  icon: '✓' },
  REVOKED:       { bg: 'var(--color-red-lt)',   text: 'var(--color-red)',   icon: '✕' },
  EXPIRED:       { bg: 'var(--color-amber-lt)', text: 'var(--color-amber)', icon: '⏱' },
  ACCESS:        { bg: '#E8F2FB',               text: 'var(--color-blue)',  icon: '↓' },
  SCOPE_CHANGED: { bg: 'var(--color-amber-lt)', text: 'var(--color-amber)', icon: '↻' },
  GRANT_RENEWED: { bg: 'var(--color-teal-lt)',  text: 'var(--color-teal)',  icon: '↺' },
};

function formatTime(ts: string): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

export default function AuditEntry({ event }: { event: AuditEvent }) {
  const style = EVENT_STYLE[event.event_type] ?? EVENT_STYLE['ACCESS'];
  return (
    <div style={{
      display: 'flex',
      gap: 'var(--space-md)',
      padding: 'var(--space-md) 0',
      borderBottom: '1px solid var(--color-border)',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: style.bg, color: style.text,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, marginTop: 2,
      }}>
        {style.icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, color: 'var(--color-text-1)', lineHeight: '20px' }}>
          {event.label}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 2 }}>
          {formatTime(event.timestamp)}
        </div>
      </div>
    </div>
  );
}
