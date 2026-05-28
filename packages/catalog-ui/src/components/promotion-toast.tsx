'use client';

import * as React from 'react';
import { LayerIcon, type Layer } from './layer-icon';

export interface PromotionToastProps {
  /** Number of items promoted (1 for single, N for bulk). Drives copy. */
  count: number;
  /** Destination layer the items moved to. Drives the LayerIcon color. */
  layer: 'studio' | 'catalog';
  /** Link to navigate to the promoted items (typically the target LayerView). */
  viewUrl?: string;
  /** Optional explicit dismiss handler. Toast also auto-dismisses after `autoDismissMs`. */
  onDismiss?: () => void;
  /** Auto-dismiss timeout. Default 5000ms per PRD §5.5; pass 0 to disable. */
  autoDismissMs?: number;
}

const LAYER_LABEL: Record<PromotionToastProps['layer'], string> = {
  studio: 'Studio Library',
  catalog: 'Patina Catalog',
};

/**
 * Bottom-right success toast for promotion / nomination flows. Includes a
 * miniature LayerIcon in the target-layer color so the user sees at a
 * glance where the item went. Auto-dismisses on a 5-second timer by
 * default; respects `prefers-reduced-motion` (slide-in becomes an
 * instant fade).
 */
export function PromotionToast({
  count,
  layer,
  viewUrl,
  onDismiss,
  autoDismissMs = 5000,
}: PromotionToastProps) {
  const [dismissed, setDismissed] = React.useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  React.useEffect(() => {
    if (autoDismissMs <= 0) return;
    const timer = window.setTimeout(() => handleDismiss(), autoDismissMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDismissMs]);

  function handleDismiss() {
    setDismissed(true);
    onDismiss?.();
  }

  if (dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        right: 24,
        bottom: 24,
        zIndex: 60,
        minWidth: 280,
        maxWidth: 320,
        padding: '14px 16px',
        borderRadius: 6,
        background: 'var(--bg-surface, #FFFFFF)',
        border: '1px solid var(--border-default, #E5E2DD)',
        boxShadow: '0 18px 40px rgba(44, 41, 38, 0.18)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        animation: prefersReducedMotion
          ? 'patina-toast-fade 160ms var(--ease-default, ease) both'
          : 'patina-toast-rise 220ms var(--ease-spring, ease) both',
      }}
    >
      <style>{toastKeyframes}</style>

      <LayerIcon layer={layer} size="md" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        <span
          className="type-meta-small"
          style={{
            color: layer === 'studio'
              ? 'var(--color-sage, #A8B5A0)'
              : 'var(--color-clay, #C4A57B)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Promoted to {LAYER_LABEL[layer]}
        </span>
        <span
          style={{
            fontSize: '0.92rem',
            color: 'var(--text-primary, #2C2926)',
            fontWeight: 500,
          }}
        >
          {count === 1 ? '1 item' : `${count.toLocaleString()} items`}{' '}
          {count === 1 ? 'moved' : 'moved'}
        </span>
      </div>

      {viewUrl && (
        <a
          href={viewUrl}
          style={{
            fontSize: '0.78rem',
            color: 'var(--accent-primary, #C4A57B)',
            textDecoration: 'none',
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          View →
        </a>
      )}

      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        style={{
          background: 'transparent',
          border: 'none',
          padding: 4,
          marginLeft: 4,
          cursor: 'pointer',
          color: 'var(--text-muted, #8B7355)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

const toastKeyframes = `
  @keyframes patina-toast-rise {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes patina-toast-fade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
`;
