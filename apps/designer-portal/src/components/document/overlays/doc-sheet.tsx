'use client';

/**
 * DocSheet — the first Doc* overlay wrapper (R3), now the LAID SHEET (R96).
 *
 * Both the historic 'sheet' (bottom slide-up) and 'center' variants have
 * converged onto the paper-folio treatment: a warm veil over the desk and a
 * CENTERED laid-paper panel that slides over whatever the designer is holding
 * (D8) without ever unmounting it (D1). Depth is value contrast + a single
 * 1px rule edge — zero shadow (D4). The panel is `--doc-paper`, so every sheet
 * content reads as ink on paper, not chrome on charcoal.
 *
 * The `variant` prop is retained for backward compatibility (callers still pass
 * it) but no longer changes the ground — both are the same paper sheet. Ledgers
 * that want a wider column pass `wide`. An optional standard head (icon +
 * DM-mono title + page + "put back · esc") renders when an `icon` is supplied;
 * consumers that already render their own header simply omit it.
 *
 * Built without design-system overlay primitives (DECISIONS.md I5): minimal
 * dialog semantics — Esc, backdrop dismiss, focus in on open / restored on
 * close. Navigation invariant (§3): an overlay, never a route — the surface
 * beneath must not unmount.
 */

import { useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * The standard sheet head (R96) — a quiet folio strip: the surface's registry
 * icon, its DM-mono uppercase name (and optional page), and a "put back · esc"
 * hint. Exported so ledgers wrapped by the Studio Drawer (which owns their
 * DocSheet frame and can't reach these props) can render the same head inline,
 * where their live page label lives. Zero shadow (D4); the pearl rule is the
 * only edge.
 */
export function DocSheetHead({
  icon: Icon,
  title,
  pageLabel,
  onClose,
}: {
  icon: LucideIcon;
  title: string;
  pageLabel?: string;
  onClose?: () => void;
}) {
  return (
    <div className="mb-5 flex items-center justify-between gap-4 border-b border-[var(--color-pearl)] pb-3">
      <span className="flex min-w-0 items-center gap-2">
        <Icon
          className="h-[15px] w-[15px] shrink-0 text-[var(--color-aged-oak)]"
          strokeWidth={1.5}
          aria-hidden
        />
        <span className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-charcoal)]">
          {title}
          {pageLabel ? (
            <span className="font-normal text-[var(--color-aged-oak)]"> · {pageLabel}</span>
          ) : null}
        </span>
      </span>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)] transition-colors hover:text-[var(--color-charcoal)]"
        >
          Put back · Esc
        </button>
      ) : (
        <span
          aria-hidden
          className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]"
        >
          Put back · Esc
        </span>
      )}
    </div>
  );
}

export function DocSheet({
  open,
  onClose,
  title,
  children,
  wide = false,
  icon,
  pageLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Retained for backward compatibility — both variants are now the same laid
   *  paper sheet (R96), so the prop no longer changes the ground. */
  variant?: 'sheet' | 'center';
  /** A ledger that needs a wider column than the 640px default. */
  wide?: boolean;
  /** When set, DocSheet renders the standard {@link DocSheetHead} at the top
   *  of the sheet (icon + title + optional page + put-back hint). */
  icon?: LucideIcon;
  /** The optional " · PAGE" segment for the standard head. */
  pageLabel?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Focus in on open, restore on close. Depends ONLY on `open` — not onClose —
  // so a caller's unstable onClose identity (recreated each render) can't re-run
  // this and steal focus from a field mid-typing (one keystroke re-renders the
  // caller → new onClose → panel.focus() would yank focus out of the input).
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      restoreRef.current?.focus?.();
    };
  }, [open]);

  // Esc closes. Re-subscribes if onClose changes (harmless — no focus effect).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-12">
      {/* Warm veil over the desk (matches the paper-folio scrim), a backdrop
          button so a click in the margin puts the sheet back. */}
      <button
        type="button"
        aria-label="Close sheet"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-[rgba(20,18,16,0.55)]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative w-full ${
          wide ? 'max-w-[760px]' : 'max-w-[640px]'
        } max-h-[82vh] overflow-y-auto rounded-[5px] border border-[var(--color-rule-strong,#D8CCB8)] bg-[var(--doc-paper,#FAF7F2)] px-6 pb-8 pt-6 outline-none motion-safe:animate-[doc-fade_200ms_ease-out] sm:px-9`}
      >
        {icon ? (
          <DocSheetHead icon={icon} title={title} pageLabel={pageLabel} onClose={onClose} />
        ) : null}
        {children}
      </div>
    </div>
  );
}
