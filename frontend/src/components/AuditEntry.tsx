import { Separator } from './ui/separator';
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
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

interface AuditEntryProps {
  event:  AuditEvent;
  divider?: boolean;
}

export default function AuditEntry({ event, divider = false }: AuditEntryProps) {
  const style = EVENT_STYLE[event.event_type] ?? EVENT_STYLE['ACCESS'];

  return (
    <>
      {divider && <Separator />}
      <div className="flex gap-3 py-3 px-4">
        <div
          className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[12px] font-bold mt-0.5"
          style={{ background: style.bg, color: style.text }}
        >
          {style.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] text-[var(--color-text-1)] leading-5">{event.label}</p>
          <p className="text-[11px] text-[var(--color-text-3)] mt-0.5">{formatTime(event.timestamp)}</p>
        </div>
      </div>
    </>
  );
}
