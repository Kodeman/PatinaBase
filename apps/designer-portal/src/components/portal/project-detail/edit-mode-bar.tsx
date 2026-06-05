'use client';

import { Button } from '@/components/ui/controls';

interface EditModeBarProps {
  onToggleClientView?: () => void;
  onSendUpdate?: () => void;
}

/**
 * Renders full-bleed (escapes the layout's max-w-portal wrapper via the
 * 100vw + negative-margin trick) so the background reaches the viewport
 * edges. Inner content uses the same `mx-auto w-[90vw] max-w-portal`
 * geometry as the layout shell so labels and buttons align with the
 * page body below.
 */
export function EditModeBar({ onToggleClientView, onSendUpdate }: EditModeBarProps) {
  return (
    <div
      style={{
        background: 'rgba(196, 165, 123, 0.06)',
        borderBottom: '1px solid rgba(196, 165, 123, 0.15)',
        width: '100vw',
        marginLeft: 'calc(-50vw + 50%)',
      }}
    >
      <div className="mx-auto flex w-[90vw] max-w-portal items-center justify-between px-4 py-2 md:px-0">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-block h-[7px] w-[7px] rounded-full"
            style={{
              background: 'var(--color-clay)',
              animation: 'pulse-dot 2s ease-in-out infinite',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.58rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-clay)',
            }}
          >
            Edit Mode
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.58rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-sage)',
            }}
          >
            Saved
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onToggleClientView}
          >
            Client View
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onSendUpdate}
          >
            Send Update
          </Button>
        </div>
      </div>
    </div>
  );
}
