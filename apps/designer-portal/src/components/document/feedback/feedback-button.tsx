'use client';

/**
 * The capture button (R7.1) — one persistent control, same bottom-right spot on
 * every document-model screen, on its own elevated layer above the interface.
 * Compact mark at rest; expands to a "Leave a note" label on hover/focus.
 * Carries a brass badge when a note she flagged has shipped and hasn't been
 * seen (R7.1.7). The global ⌘⇧F shortcut (R7.7 keyboard drop) lives here since
 * the FAB is always mounted.
 *
 * Placement clears the bottom chrome: on phones it sits above the Mobile bar
 * (fixed bottom-0, ~56px) + Log strip; on desktop the Mobile bar is gone so it
 * drops to the corner. It hides while the sheet is open so it never fights the
 * scrim for z-order.
 */

import { useEffect, useState } from 'react';
import { PenLine } from 'lucide-react';
import { useUnseenShipped } from '@patina/supabase';
import { useHydrated } from '@/hooks/use-hydrated';
import { openFeedbackSheet } from './feedback-sheet';

export function FeedbackButton() {
  const hydrated = useHydrated();
  const { data: unseen } = useUnseenShipped();
  const [sheetOpen, setSheetOpen] = useState(false);

  const hasUnseen = hydrated && (unseen?.length ?? 0) > 0;

  useEffect(() => {
    const onOpen = () => setSheetOpen(true);
    const onClosed = () => setSheetOpen(false);
    const onKey = (e: KeyboardEvent) => {
      // ⌘⇧F / Ctrl⇧F — the keyboard drop (R7.7).
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        openFeedbackSheet();
      }
    };
    window.addEventListener('document:open-feedback', onOpen);
    window.addEventListener('document:feedback-closed', onClosed);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('document:open-feedback', onOpen);
      window.removeEventListener('document:feedback-closed', onClosed);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  if (sheetOpen) return null;

  return (
    <button
      type="button"
      onClick={() => openFeedbackSheet()}
      aria-label="Leave a note"
      className="group fixed right-4 z-[60] flex min-h-[44px] items-center gap-2 rounded-full border border-[rgba(250,247,242,0.3)] bg-[var(--color-charcoal)] py-2 pl-3 pr-3 text-[var(--color-pearl)] transition-[padding,border-color] hover:border-[rgba(250,247,242,0.55)] hover:pr-4 focus-visible:pr-4 bottom-[calc(env(safe-area-inset-bottom,0px)+72px)] min-[980px]:bottom-6"
    >
      <span className="relative grid h-6 w-6 place-items-center">
        <PenLine className="h-[18px] w-[18px]" aria-hidden />
        {hasUnseen && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-charcoal)] bg-[var(--color-brass,#b08a49)]"
          />
        )}
      </span>
      {/* Label revealed on hover/focus (R7.1.4). */}
      <span className="max-w-0 overflow-hidden whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.08em] opacity-0 transition-all duration-200 group-hover:max-w-[8rem] group-hover:pl-0.5 group-hover:opacity-100 group-focus-visible:max-w-[8rem] group-focus-visible:pl-0.5 group-focus-visible:opacity-100">
        Leave a note
        {hasUnseen ? ' · shipped' : ''}
      </span>
    </button>
  );
}
