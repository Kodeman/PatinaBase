'use client';

/**
 * DocSheet — the first Doc* overlay wrapper (R3), now the LAID SHEET (R96).
 *
 * Both the historic 'sheet' (bottom slide-up) and 'center' variants have
 * converged onto the paper-folio treatment: a warm veil over the desk and a
 * laid-paper panel that centers when it fits and begins at the safe viewport
 * edge when it does not (D8), without ever unmounting the work beneath (D1).
 * Depth is value contrast + a single 1px rule edge — zero shadow (D4). The
 * panel is `--doc-paper`, so every sheet reads as ink on paper, not chrome.
 *
 * The `variant` prop is retained for backward compatibility (callers still pass
 * it) but no longer changes the ground — both are the same paper sheet. Ledgers
 * that want a wider column pass `wide`. An optional standard head (icon +
 * DM-mono title + page + "put back · esc") renders when an `icon` is supplied;
 * consumers that already render their own header simply omit it.
 *
 * Built without design-system overlay primitives (DECISIONS.md I5): labelled
 * dialog semantics, trapped focus, Esc/backdrop dismiss, scroll isolation,
 * and focus restoration. Navigation invariant (§3): an overlay, never a route
 * — the surface beneath must not unmount.
 */

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import { openHelp, type HelpOpenSource } from '@/lib/help-system/open-help';
import { lockBodyScroll } from './body-scroll-lock';
import {
  isElementRendered,
  registerManagedModalDialog,
  topActiveModalDialog,
} from './active-dialog';

const FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[contenteditable="true"]:not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

type DocSheetOrigin = 'document' | 'margin';
const DocSheetOriginContext = createContext<DocSheetOrigin>('document');

export function DocSheetOriginProvider({
  origin,
  children,
}: {
  origin: DocSheetOrigin;
  children: React.ReactNode;
}) {
  return (
    <DocSheetOriginContext.Provider value={origin}>
      {children}
    </DocSheetOriginContext.Provider>
  );
}

function getFocusableElements(panel: HTMLElement) {
  return Array.from(
    panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => {
    const style = window.getComputedStyle(element);
    return (
      !element.hidden &&
      !element.matches(':disabled') &&
      element.getAttribute('aria-disabled') !== 'true' &&
      !element.closest('[hidden], [aria-hidden="true"], [inert]') &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'
    );
  });
}

/**
 * The `?` doorway (help-desk Wave 1) — the reactive-help glyph: a quiet
 * DM-mono question mark in Quiet Ink, no circle, no border, hover → charcoal.
 * Clicking opens the ContextualHelpPanel scoped to `helpKey` via
 * `openHelp({ source, surfaceKey })`. Exported so the ledger front-matter and
 * the court bar render the exact same doorway without re-deriving its idiom.
 */
export function HelpGlyph({
  helpKey,
  source,
  label = 'About this sheet',
  className,
}: {
  /** The help surface key this doorway scopes the panel to — always a
   *  DOCUMENT_SURFACE_KEYS constant, never a string literal. */
  helpKey: string;
  source: HelpOpenSource;
  /** Accessible name; defaults to the sheet-head idiom. */
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => openHelp({ source, surfaceKey: helpKey })}
      className={`doc-type-meta -my-2 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-[3px] text-[var(--color-quiet-ink)] transition-colors hover:text-[var(--color-charcoal)] ${className ?? ''}`}
    >
      ?
    </button>
  );
}

/**
 * The standard sheet head (R96) — a quiet folio strip: the surface's registry
 * icon, its DM-mono uppercase name (and optional page), and a "put back · esc"
 * hint. Exported so ledgers wrapped by the Studio Drawer (which owns their
 * DocSheet frame and can't reach these props) can render the same head inline,
 * where their live page label lives. Zero shadow (D4); the pearl rule is the
 * only edge. An optional `helpKey` renders the {@link HelpGlyph} doorway
 * beside the put-back hint (help-desk Wave 1).
 */
export function DocSheetHead({
  icon: Icon,
  title,
  pageLabel,
  onClose,
  helpKey,
  titleId,
}: {
  icon: LucideIcon;
  title: string;
  pageLabel?: string;
  onClose?: () => void;
  /** When set, the head carries the `?` doorway → openHelp({ source:
   *  'sheet-head', surfaceKey: helpKey }). */
  helpKey?: string;
  /** Connects the visible title to an owning dialog's aria-labelledby. */
  titleId?: string;
}) {
  return (
    <div className="mb-5 flex items-center justify-between gap-4 border-b border-[var(--color-pearl)] pb-3">
      <span className="flex min-w-0 items-center gap-2">
        <Icon
          className="h-[15px] w-[15px] shrink-0 text-[var(--color-aged-oak)]"
          strokeWidth={1.5}
          aria-hidden
        />
        <span
          className="doc-type-meta truncate font-semibold uppercase tracking-[0.14em] text-[var(--color-charcoal)]"
          data-doc-sheet-title-line
        >
          <span id={titleId} data-doc-sheet-title>
            {title}
          </span>
          {pageLabel ? (
            <span
              className="hidden font-normal text-[var(--color-quiet-ink)] sm:inline"
              data-doc-sheet-page-label
            >
              {' '}
              · {pageLabel}
            </span>
          ) : null}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 sm:gap-2.5">
        {helpKey ? <HelpGlyph helpKey={helpKey} source="sheet-head" /> : null}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Put back · Esc"
            className="doc-type-meta -my-2 inline-flex min-h-11 shrink-0 items-center px-1 uppercase tracking-[0.1em] text-[var(--color-quiet-ink)] transition-colors hover:text-[var(--color-charcoal)]"
          >
            <span aria-hidden className="sm:hidden">
              Close
            </span>
            <span aria-hidden className="hidden sm:inline">
              Put back · Esc
            </span>
          </button>
        ) : (
          <span
            aria-hidden
            className="doc-type-meta shrink-0 uppercase tracking-[0.1em] text-[var(--color-quiet-ink)]"
          >
            Put back · Esc
          </span>
        )}
      </span>
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
  helpKey,
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
  /** Forwarded to the standard head's `?` doorway (help-desk Wave 1). */
  helpKey?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const origin = useContext(DocSheetOriginContext);
  const [isTopModal, setIsTopModal] = useState(true);

  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    return registerManagedModalDialog(panel, setIsTopModal);
  }, [open]);

  // Focus in on open, restore on close. Depends on the open state and stable
  // origin — never onClose — so a caller's unstable onClose identity (recreated
  // each render) can't steal focus from a field mid-typing.
  useEffect(() => {
    if (!open) return;
    const activeElement = document.activeElement;
    restoreRef.current =
      activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : null;
    if (panelRef.current) {
      panelRef.current.dataset.docSheetOrigin = origin;
    }
    const unlockBodyScroll = lockBodyScroll();
    const focusFrame = window.requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      unlockBodyScroll();
      const focusTarget = restoreRef.current;
      restoreRef.current = null;
      if (!focusTarget?.isConnected) return;
      window.requestAnimationFrame(() => {
        if (focusTarget.isConnected && isElementRendered(focusTarget)) {
          focusTarget.focus({ preventScroll: true });
        }
      });
    };
  }, [open, origin]);

  // Keep keyboard focus on the laid sheet and let Escape put it back.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel || topActiveModalDialog() !== panel) return;

      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key !== 'Tab' || e.defaultPrevented) return;
      const focusable = getFocusableElements(panel);
      if (focusable.length === 0) {
        e.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (active === panel || !panel.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-doc-sheet-layer
      data-doc-sheet-stack-state={isTopModal ? 'top' : 'covered'}
      aria-hidden={isTopModal ? undefined : true}
      inert={isTopModal ? undefined : true}
      className="doc-sheet-layer fixed inset-0 z-50 box-border flex items-start justify-center overflow-hidden overscroll-contain pb-[var(--doc-sheet-inset-bottom)] pl-[var(--doc-sheet-inset-left)] pr-[var(--doc-sheet-inset-right)] pt-[var(--doc-sheet-inset-top)]"
    >
      {/* Warm veil over the desk (matches the paper-folio scrim), a backdrop
          button so a click in the margin puts the sheet back. */}
      <button
        type="button"
        aria-label="Close sheet"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-[rgba(20,18,16,0.55)]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={isTopModal ? true : undefined}
        aria-labelledby={titleId}
        tabIndex={-1}
        data-doc-sheet-panel
        data-doc-sheet-scroll-region
        className={`doc-sheet-panel relative my-auto max-h-[calc(100dvh_-_var(--doc-sheet-inset-top)_-_var(--doc-sheet-inset-bottom))] min-w-0 w-full ${
          wide ? 'max-w-[760px]' : 'max-w-[640px]'
        } overflow-y-auto overscroll-contain rounded-[5px] border border-[var(--color-rule-strong,#D8CCB8)] bg-[var(--doc-paper,#FAF7F2)] px-6 pb-8 pt-6 outline-none sm:px-9`}
      >
        {icon ? (
          <DocSheetHead
            icon={icon}
            title={title}
            pageLabel={pageLabel}
            onClose={onClose}
            helpKey={helpKey}
            titleId={titleId}
          />
        ) : (
          <h2 id={titleId} className="sr-only">
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
