'use client';

import { useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import {
  useProposalCaptures,
  useDismissCapture,
  type ProposalCapture,
} from '@patina/supabase';

// ─── DnD wire-format ─────────────────────────────────────────────────────────
//
// Captures use a stable draggable id prefix so consumers (FFEScheduleBuilder,
// any future drop targets) can detect "this is a capture" without a closure
// lookup against the visible inbox. The drop handler parses the suffix to
// recover the capture id.
// ═══════════════════════════════════════════════════════════════════════════

export const CAPTURE_DRAGGABLE_PREFIX = 'capture:';

export function captureDraggableId(captureId: string): string {
  return `${CAPTURE_DRAGGABLE_PREFIX}${captureId}`;
}

export function parseCaptureDraggableId(id: string | number | null | undefined): string | null {
  if (typeof id !== 'string') return null;
  if (!id.startsWith(CAPTURE_DRAGGABLE_PREFIX)) return null;
  const rest = id.slice(CAPTURE_DRAGGABLE_PREFIX.length);
  return rest.length > 0 ? rest : null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const captured = new Date(iso).getTime();
  if (Number.isNaN(captured)) return iso;
  const now = Date.now();
  const seconds = Math.max(0, Math.floor((now - captured) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

function rawString(payload: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!payload) return null;
  const v = payload[key];
  return typeof v === 'string' && v.trim() ? v : null;
}

function captureName(capture: ProposalCapture): string {
  return (
    rawString(capture.raw_payload, 'name') ??
    rawString(capture.raw_payload, 'productName') ??
    rawString(capture.raw_payload, 'title') ??
    'Untitled capture'
  );
}

function captureVendorName(capture: ProposalCapture): string | null {
  const payload = capture.raw_payload;
  if (!payload) return null;
  // Most likely shapes the extension might serialize.
  const direct = rawString(payload, 'vendor_name') ?? rawString(payload, 'vendorName');
  if (direct) return direct;
  const vendor = payload['vendor'];
  if (vendor && typeof vendor === 'object') {
    const name = (vendor as Record<string, unknown>).name;
    if (typeof name === 'string' && name.trim()) return name;
  }
  return rawString(payload, 'manufacturer') ?? rawString(payload, 'brand');
}

function captureSourceLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// ─── Single row ──────────────────────────────────────────────────────────────

interface CaptureRowProps {
  capture: ProposalCapture;
  onDismiss: (captureId: string) => void;
  isDismissing: boolean;
}

function CaptureRow({ capture, onDismiss, isDismissing }: CaptureRowProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: captureDraggableId(capture.id),
    data: {
      kind: 'capture',
      captureId: capture.id,
      productId: capture.product_id,
    },
  });

  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    opacity: isDragging ? 0.5 : undefined,
    cursor: isDragging ? 'grabbing' : 'grab',
  };

  const name = captureName(capture);
  const vendor = captureVendorName(capture);
  const sourceLabel = captureSourceLabel(capture.source_url);
  const captured = relativeTime(capture.captured_at);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-capture-id={capture.id}
      className="group flex items-center gap-3 rounded-md border bg-[var(--bg-surface)] p-2 transition-colors hover:border-[var(--accent-primary)]"
    >
      {/* Thumbnail */}
      <div
        className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-sm"
        style={{ backgroundColor: 'var(--bg-surface)' }}
      >
        {capture.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={capture.thumbnail_url}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ color: 'var(--text-muted)', fontSize: '0.55rem' }}
          >
            No img
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div
          className="truncate"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.82rem',
            color: 'var(--text-primary)',
          }}
        >
          {name}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          {vendor && (
            <span
              className="truncate"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.68rem',
                fontStyle: 'italic',
                color: 'var(--color-aged-oak)',
              }}
            >
              {vendor}
            </span>
          )}
          <a
            href={capture.source_url}
            target="_blank"
            rel="noreferrer noopener"
            onPointerDown={(e) => e.stopPropagation()}
            className="truncate underline-offset-2 hover:underline"
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.62rem',
              color: 'var(--text-muted)',
            }}
          >
            {sourceLabel}
          </a>
          <span
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.58rem',
              color: 'var(--text-muted)',
            }}
          >
            · {captured}
          </span>
        </div>
      </div>

      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onDismiss(capture.id)}
        disabled={isDismissing}
        aria-label="Dismiss capture"
        title="Dismiss"
        className="flex-shrink-0 cursor-pointer rounded-sm p-1 text-[var(--text-muted)] opacity-0 transition-opacity hover:text-[var(--color-terracotta)] focus:opacity-100 group-hover:opacity-100"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface CaptureInboxProps {
  /**
   * If provided, only captures already assigned to this proposal are shown.
   * Without it, the panel renders every inbox-status capture for the
   * current designer (the global inbox view).
   */
  proposalId?: string;
  /**
   * `panel` (default): standalone block, shows header + total counts.
   * `tab`: embedded inside a parent dialog/tab — drops the heading.
   */
  mode?: 'panel' | 'tab';
}

export function CaptureInbox({ proposalId, mode = 'panel' }: CaptureInboxProps) {
  const { data: captures = [], isLoading, isError, error } = useProposalCaptures({
    status: 'inbox',
    proposalId,
  });
  const dismiss = useDismissCapture();

  const handleDismiss = (captureId: string) => {
    dismiss.mutate({ captureId });
  };

  const sorted = useMemo(() => {
    // Already ordered by the hook (captured_at desc), but defensively sort
    // again so the UI is stable against future query-key collisions.
    return [...captures].sort(
      (a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime()
    );
  }, [captures]);

  return (
    <div className="flex flex-col gap-3">
      {mode === 'panel' && (
        <div className="flex items-baseline justify-between">
          <h3
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 500,
              fontSize: '1.1rem',
              lineHeight: 1.35,
            }}
          >
            Capture Inbox
          </h3>
          <span
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.62rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-muted)',
            }}
          >
            {sorted.length} pending
          </span>
        </div>
      )}

      {isLoading && (
        <div
          className="py-6 text-center"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.82rem',
            color: 'var(--text-muted)',
          }}
        >
          Loading inbox…
        </div>
      )}

      {isError && (
        <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {(error as Error)?.message ?? 'Failed to load captures.'}
        </div>
      )}

      {!isLoading && !isError && sorted.length === 0 && (
        <div
          className="rounded-md border border-dashed px-3 py-6 text-center"
          style={{
            borderColor: 'var(--border-default)',
            color: 'var(--text-muted)',
            fontSize: '0.78rem',
          }}
        >
          No captures yet. Use the Patina extension to capture products from the web.
        </div>
      )}

      {sorted.length > 0 && (
        <div className="flex flex-col gap-2">
          {sorted.map((capture) => (
            <CaptureRow
              key={capture.id}
              capture={capture}
              onDismiss={handleDismiss}
              isDismissing={dismiss.isPending}
            />
          ))}
        </div>
      )}

      {dismiss.isError && (
        <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {(dismiss.error as Error)?.message ?? 'Failed to dismiss capture.'}
        </div>
      )}

      {mode === 'panel' && sorted.length > 0 && (
        <div
          style={{
            fontFamily: 'var(--font-meta)',
            fontSize: '0.62rem',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
          }}
        >
          Drag a capture onto an FF&E room to add it as a fixed line item.
        </div>
      )}

      {mode === 'tab' && sorted.length > 0 && (
        <div
          style={{
            fontFamily: 'var(--font-meta)',
            fontSize: '0.62rem',
            color: 'var(--text-muted)',
            lineHeight: 1.5,
          }}
        >
          Tap a capture to add it to this proposal.
        </div>
      )}
    </div>
  );
}

export default CaptureInbox;
