'use client';

/**
 * The unified bottom bar (D3-1). One bar owns the thumb edge, shown only
 * below the 980px breakpoint (the desktop Studio Drawer + rails hide there).
 *   · Desk: drawer handle (→ drawer sheet) + "in hand today".
 *   · Document: section handle (→ spine sheet, labelled with the active
 *     section) + timer glance (→ timer sheet) + drawer book.
 */

import { usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';
import { useUnreadInboxCount } from '@patina/supabase';
import { useDocumentTime } from '@/hooks/document-time-provider';
import { fmtElapsedQuiet, fmtMinutes } from '@/lib/document/time-derivation';
import { openPost } from '../overlays/post-sheet';
import { useMobileShell } from './mobile-shell';

const STRATA = (
  <span className="inline-flex flex-col gap-[2px]">
    <i className="block h-[1.5px] w-[12px] rounded-[1px] bg-[var(--color-clay)]" />
    <i className="block h-[1.5px] w-[9px] rounded-[1px] bg-[var(--color-clay)] opacity-55" />
    <i className="block h-[1.5px] w-[6px] rounded-[1px] bg-[var(--color-clay)] opacity-30" />
  </span>
);

/** The Post bell (R82) — the mobile twin of the Studio Drawer bell. Dispatches
 *  the same `document:open-post` event; the clay dot is awareness, not a count
 *  (D8), reading the same `useUnreadInboxCount` as the desktop bell. */
function MobileBell({ unread }: { unread: number }) {
  return (
    <button
      type="button"
      onClick={openPost}
      aria-label={unread > 0 ? `The Post, ${unread} unread` : 'The Post'}
      className="relative flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[5px] border border-[rgba(250,247,242,0.14)] bg-[rgba(250,247,242,0.06)]"
    >
      <Bell className="h-[15px] w-[15px] text-[var(--color-clay)]" strokeWidth={1.5} aria-hidden />
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute right-[6px] top-[6px] h-1.5 w-1.5 rounded-full bg-[var(--color-clay)]"
        />
      )}
    </button>
  );
}

export function MobileBar() {
  const pathname = usePathname();
  const { activeDoc, openSpine, openTimer, openDrawer } = useMobileShell();
  const { inHandToday, running, paused, elapsedSeconds } = useDocumentTime();
  const { data: unread = 0 } = useUnreadInboxCount();

  const inDocument = pathname?.startsWith('/doc/') && activeDoc !== null;
  const activeSection = activeDoc?.sections.find((s) => s.state === 'active');

  return (
    <nav
      aria-label="Document bar"
      className="fixed inset-x-0 bottom-0 z-40 flex min-h-[56px] items-center gap-2 border-t border-[rgba(250,247,242,0.16)] bg-[var(--color-charcoal)] px-3 pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-[0.45rem] min-[980px]:hidden"
    >
      {inDocument ? (
        <>
          <button
            type="button"
            onClick={openSpine}
            aria-label="Open the spine"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-[5px] border border-[rgba(250,247,242,0.12)] bg-[rgba(250,247,242,0.06)] px-2.5 py-[0.42rem] active:border-[rgba(196,165,123,0.45)]"
          >
            {STRATA}
            <span className="min-w-0">
              <span className="block font-mono text-[8px] uppercase tracking-[0.08em] text-[rgba(250,247,242,0.4)]">
                Section
              </span>
              <span className="block truncate font-heading text-[12.5px] font-medium text-[rgba(250,247,242,0.88)]">
                {activeSection?.label ?? 'Document'} ▴
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={openTimer}
            aria-label="Open the timer"
            className="flex shrink-0 items-center gap-1.5 rounded-[5px] border border-[rgba(196,165,123,0.35)] px-2.5 py-[0.42rem] font-mono text-[12.5px] text-[var(--color-clay)]"
          >
            <span
              aria-hidden
              className="inline-block h-[5px] w-[5px] rounded-full"
              style={{ background: paused || !running ? 'rgba(250,247,242,0.25)' : 'var(--color-sage)' }}
            />
            {fmtElapsedQuiet(elapsedSeconds)}
          </button>

          <MobileBell unread={unread} />

          <button
            type="button"
            onClick={openDrawer}
            aria-label="Open the drawer"
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center gap-[2px] rounded-[5px] border border-[rgba(250,247,242,0.14)] bg-[rgba(250,247,242,0.06)]"
          >
            <i className="block h-[14px] w-[2.5px] rounded-[1px] bg-[var(--color-clay)]" />
            <i className="block h-[14px] w-[2.5px] rounded-[1px] bg-[var(--color-dusty-blue)]" />
            <i className="block h-[14px] w-[2.5px] rounded-[1px] bg-[var(--color-sage)]" />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={openDrawer}
            aria-label="Open the drawer"
            className="flex items-center gap-2 rounded-[5px] border border-[rgba(250,247,242,0.12)] bg-[rgba(250,247,242,0.06)] px-2.5 py-[0.42rem] active:border-[rgba(196,165,123,0.45)]"
          >
            {STRATA}
            <span>
              <span className="block font-mono text-[8px] uppercase tracking-[0.08em] text-[rgba(250,247,242,0.4)]">
                The drawer
              </span>
              <span className="block font-heading text-[12.5px] font-medium text-[rgba(250,247,242,0.88)]">
                Five books ▴
              </span>
            </span>
          </button>
          <span className="flex-1" />
          <span className="text-right">
            <span className="block font-mono text-[8px] uppercase tracking-[0.08em] text-[rgba(250,247,242,0.35)]">
              In hand today
            </span>
            <span className="font-heading text-[12.5px] italic text-[var(--color-clay)]">
              {inHandToday > 0 ? fmtMinutes(inHandToday) : '—'}
            </span>
          </span>
          <MobileBell unread={unread} />
        </>
      )}
    </nav>
  );
}
