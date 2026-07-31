'use client';

/**
 * Shared full-screen viewer ground for folio files and room scans. It owns the
 * dialog boundary, keyboard containment, scroll isolation, and return focus;
 * the interactive RoomScanViewer can still own every pixel of its inner UI.
 */

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from 'react';
import { DocumentAction } from '../document-action';

const FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  'iframe:not([tabindex="-1"])',
  '[contenteditable="true"]:not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let bodyScrollLocks = 0;
let bodyOverflowBeforeLock = '';
let bodyPaddingBeforeLock = '';

function lockBodyScroll() {
  if (bodyScrollLocks === 0) {
    bodyOverflowBeforeLock = document.body.style.overflow;
    bodyPaddingBeforeLock = document.body.style.paddingRight;

    const layoutWidth = document.documentElement.clientWidth;
    const scrollbarWidth =
      layoutWidth > 0 ? Math.max(0, window.innerWidth - layoutWidth) : 0;
    if (scrollbarWidth > 0) {
      const currentPadding =
        Number.parseFloat(window.getComputedStyle(document.body).paddingRight) ||
        0;
      document.body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
    }
    document.body.style.overflow = 'hidden';
  }

  bodyScrollLocks += 1;
  return () => {
    bodyScrollLocks = Math.max(0, bodyScrollLocks - 1);
    if (bodyScrollLocks > 0) return;
    document.body.style.overflow = bodyOverflowBeforeLock;
    document.body.style.paddingRight = bodyPaddingBeforeLock;
  };
}

function focusableWithin(panel: HTMLElement) {
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

interface ViewerContextValue {
  title: string;
  onClose: () => void;
}

const ViewerContext = createContext<ViewerContextValue | null>(null);

export function FullScreenViewerShell({
  title,
  meta,
  onClose,
  children,
  showHeader = true,
  actionKey = 'close-full-screen-viewer',
  contentClassName,
}: {
  title: string;
  meta?: string;
  onClose: () => void;
  children: ReactNode;
  /** False when a child such as RoomScanViewer supplies its own visible UI. */
  showHeader?: boolean;
  actionKey?: string;
  contentClassName?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const activeElement = document.activeElement;
    restoreRef.current =
      activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : null;
    const unlockBodyScroll = lockBodyScroll();
    const focusFrame = window.requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true });
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }

      if (event.key !== 'Tab' || event.defaultPrevented) return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = focusableWithin(panel);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (active === panel || !panel.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKeyDown, true);
      unlockBodyScroll();
      const focusTarget = restoreRef.current;
      restoreRef.current = null;
      if (!focusTarget?.isConnected) return;
      window.requestAnimationFrame(() => {
        focusTarget.focus({ preventScroll: true });
      });
    };
  }, []);

  return (
    <ViewerContext.Provider value={{ title, onClose }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-overlay-viewer-shell
        className="fixed inset-0 z-[60] flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden overscroll-contain bg-[var(--doc-paper)] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] outline-none motion-safe:animate-[doc-fade_200ms_ease-out] motion-reduce:animate-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-clay)]"
      >
        {showHeader ? (
          <FullScreenViewerHeader
            title={title}
            meta={meta}
            titleId={titleId}
            actionKey={actionKey}
            onClose={onClose}
          />
        ) : (
          <h2 id={titleId} className="sr-only">
            {title}
          </h2>
        )}
        <div
          data-overlay-viewer-content
          className={`flex min-h-0 flex-1 flex-col ${contentClassName ?? ''}`}
        >
          {children}
        </div>
      </div>
    </ViewerContext.Provider>
  );
}

export function FullScreenViewerHeader({
  title,
  meta,
  titleId,
  actionKey = 'close-full-screen-viewer',
  onClose,
}: {
  title: string;
  meta?: string;
  titleId?: string;
  actionKey?: string;
  onClose: () => void;
}) {
  return (
    <header
      data-overlay-viewer-header
      className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-5 gap-y-1 border-b border-[var(--doc-ink-border)] px-4 sm:px-7"
    >
      <div className="min-w-0 py-2">
        <h2
          id={titleId}
          className="truncate font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-charcoal)]"
        >
          {title}
        </h2>
        {meta ? (
          <p className="mt-0.5 font-mono text-[12px] uppercase tracking-[0.05em] text-[var(--text-body)]">
            {meta}
          </p>
        ) : null}
      </div>
      <DocumentAction
        actionKey={actionKey}
        surfaceKey="open-document"
        regionKey="full-screen-viewer"
        variant="tertiary"
        onClick={onClose}
        leading="←"
      >
        Back to the document
      </DocumentAction>
    </header>
  );
}

/** Loading and error copy shared by both viewer doors. `withHeader` is for the
 * lazy 3D placeholder inside a shell whose live child owns its own chrome. */
export function FullScreenViewerState({
  children,
  error = false,
  withHeader = false,
}: {
  children: ReactNode;
  error?: boolean;
  withHeader?: boolean;
}) {
  const viewer = useContext(ViewerContext);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {withHeader && viewer ? (
        <FullScreenViewerHeader
          title={viewer.title}
          onClose={viewer.onClose}
        />
      ) : null}
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center">
        <p
          role={error ? 'alert' : 'status'}
          data-overlay-viewer-state={error ? 'error' : 'loading'}
          className={`text-[14px] italic ${
            error
              ? 'border-l-2 border-[var(--color-terracotta)] pl-3 text-[var(--color-charcoal)]'
              : 'text-[var(--text-body)]'
          }`}
        >
          {children}
        </p>
      </div>
    </div>
  );
}
