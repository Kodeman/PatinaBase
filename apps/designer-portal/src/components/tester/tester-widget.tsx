'use client';

/**
 * Tester Notes — a flag-gated (`tester-notes`) floating instrument that rides
 * every designer-portal route, mounted once in the root layout.
 *
 * It looks deliberately unlike Patina — system font, black, hazard yellow, a
 * bug glyph — because a tester should never have to wonder whether the thing
 * she is looking at is the product or the tool measuring it. The whole tree
 * carries `data-feedback-layer`, which the screenshotter filters out, so a
 * captured screen is the screen and never the widget.
 *
 * Every doorway (the pill, ⌘⇧F, ⌘K's "Leave a note") goes through
 * {@link openFeedbackSheet}, which starts the screenshot and then dispatches
 * `document:open-feedback`; this component only listens. That is the whole
 * reason the pill does not call `setOpen` directly — an open that skips the
 * opener is an open with no screenshot.
 *
 * z-[68] deliberately: above fullscreen viewers (z-60) and toasts (z-65), below
 * the command bar (z-70).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import { Bug, X } from 'lucide-react';
import { useUnseenShipped, type FeedbackBucket } from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { useHydrated } from '@/hooks/use-hydrated';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { FeedbackLedger } from '@/components/document/feedback/feedback-ledger';
import { openFeedbackSheet } from '@/components/document/feedback/open-feedback';
import {
  topActiveModalDialog,
  topDismissiblePopover,
} from '@/components/document/overlays/active-dialog';
import { FeedbackForm } from './feedback-form';
import {
  subscribeTesterSlots,
  testerSlot,
  testerSlotsVersion,
} from './tester-slot';

const YELLOW = '#ffd60a';
/** F8 — the open panel (and the mark, when no dock slot is laid out) clears
 *  the dock. The widget mounts in the root layout, outside
 *  `.document-route-shell`, so the shell's floating-bottom token never reached
 *  it. The MobileBar (below 1180) and the Studio Drawer (above it) each
 *  publish their own height on `html` only while laid out. */
const BOTTOM =
  'calc(var(--doc-mobile-bar-height, var(--doc-drawer-height, 8px)) + 8px)';

/** The dock that is laid out at this width: the drawer from 1180, the bar
 *  below it (both components' own breakpoints). */
const WIDE_DOCK = '(min-width: 1180px)';

type Tab = 'new' | 'past';

export function TesterWidget() {
  const hydrated = useHydrated();
  const { value: enabled, isLoading } = useFeatureFlag('tester-notes');
  const { user } = useAuth();
  // The root layout also renders the signed-out pages; nothing shows there,
  // and nothing listens or queries there either.
  const live = hydrated && !isLoading && !!enabled && !!user;

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('new');
  // Bumped on every open so the form remounts: bucket, note, weight, the
  // screenshot and any error all start clean, the way the old sheet's mount did.
  const [openSeq, setOpenSeq] = useState(0);
  const [initialBucket, setInitialBucket] = useState<FeedbackBucket | null>(null);
  // `open` as a ref, read synchronously by openNew: a second doorway fired
  // while the panel is already open must not remount the form.
  const openRef = useRef(false);

  // A doorway on an already-open panel only switches to the New tab. It does
  // NOT bump openSeq (the remount key) and does NOT re-apply detail.bucket —
  // a ⌘⇧F mid-sentence would otherwise wipe the note being written.
  const openNew = useCallback((bucket: FeedbackBucket | null) => {
    if (!openRef.current) {
      setInitialBucket(bucket);
      setOpenSeq((n) => n + 1);
    }
    setTab('new');
    openRef.current = true;
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    openRef.current = false;
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!live) return;
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ bucket?: FeedbackBucket }>).detail;
      openNew(detail?.bucket ?? null);
    };
    window.addEventListener('document:open-feedback', onOpen);
    return () => window.removeEventListener('document:open-feedback', onOpen);
  }, [live, openNew]);

  // ⌘⇧F — the keyboard doorway the old feedback button owned.
  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        openFeedbackSheet();
        return;
      }
      // Esc closes this panel only when it is open, and never out from under
      // anything stacked on top of it: a modal dialog, a dismissible popover
      // (Calendar Folio), or the command bar — which wears role="dialog"
      // without aria-modal, so topActiveModalDialog() cannot see it.
      if (
        e.key === 'Escape' &&
        open &&
        !topActiveModalDialog() &&
        !topDismissiblePopover() &&
        !document.querySelector('[aria-label="Command bar"]')
      ) {
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [live, open, close]);

  if (!live) return null;

  return (
    <TesterInstrument
      open={open}
      onClose={close}
      tab={tab}
      onTab={setTab}
      openSeq={openSeq}
      initialBucket={initialBucket}
    />
  );
}

/**
 * Everything that queries lives here, below the flag/auth gate — a signed-out
 * or unflagged visitor must never spend a request on the tester's ledger.
 */
function TesterInstrument({
  open,
  onClose,
  tab,
  onTab,
  openSeq,
  initialBucket,
}: {
  open: boolean;
  onClose: () => void;
  tab: Tab;
  onTab: (tab: Tab) => void;
  openSeq: number;
  initialBucket: FeedbackBucket | null;
}) {
  const { data: unseen } = useUnseenShipped();
  const pillRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const wasOpen = useRef(open);
  // Only a pill-opened panel hands focus back to the pill. A panel opened from
  // ⌘⇧F or ⌘K came from somewhere else entirely, and parking focus on the pill
  // would leave a product-wide instrument holding the keyboard — registry
  // shortcuts read "activeElement is body" as "nothing is typing".
  const openedFromPill = useRef(false);

  // The keyboard follows the panel: in to the first bucket on open, back to
  // the pill (or to nothing) on close.
  useEffect(() => {
    if (open && tab === 'new') {
      panelRef.current?.querySelector<HTMLElement>('[role="radio"]')?.focus();
    }
  }, [open, tab, openSeq]);

  useEffect(() => {
    if (wasOpen.current && !open) {
      if (openedFromPill.current) pillRef.current?.focus();
      else (document.activeElement as HTMLElement | null)?.blur?.();
      openedFromPill.current = false;
    }
    wasOpen.current = open;
  }, [open]);

  const hasUnseen = !!unseen && unseen.length > 0;

  // SQ-856 — the dock slot laid out at this width, if any (see tester-slot).
  useSyncExternalStore(subscribeTesterSlots, testerSlotsVersion, () => 0);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(WIDE_DOCK);
    const read = () => setWide(query.matches);
    read();
    query.addEventListener('change', read);
    return () => query.removeEventListener('change', read);
  }, []);
  const slot = testerSlot(wide ? 'drawer' : 'bar');

  const pill = (
    <button
      ref={pillRef}
      type="button"
      data-tester-mark={slot ? 'dock' : 'fixed'}
      onClick={() => {
        openedFromPill.current = true;
        openFeedbackSheet();
      }}
      /* SQ-856 (chrome-p6) — a quiet paper tag, not a filled pill. In a
         dock it is one more act in the dock's own row, so it covers nothing.
         With no dock (Preferences, Help, the board room) it is fixed, and
         stands UNDER the chrome layer (z-40: the dock, its popovers, the
         sheets, the board room) so it never takes a click meant for a live
         control there. Opened, the panel still floats at z-68: that is an
         instrument the tester asked for. */
      className={slot ? 'shrink-0' : 'fixed left-4 z-[39]'}
      style={{
        bottom: slot ? undefined : BOTTOM,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        minHeight: 44,
        minWidth: 44,
        // Docked, it is one more worded act and keeps tight to its word so
        // the dock's own label and acts keep their room.
        padding: slot ? '0 8px' : '0 12px',
        backgroundColor: 'var(--paper-doc)',
        color: 'var(--text-primary)',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: 'var(--card-edge)',
        borderRadius: 2,
        fontFamily: 'var(--font-meta)',
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: slot ? '0.04em' : '0.08em',
        textTransform: 'uppercase',
        cursor: 'pointer',
      }}
    >
      Tester
      {hasUnseen && (
        <span
          aria-label="shipped notes to see"
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: 'currentColor',
            display: 'inline-block',
          }}
        />
      )}
    </button>
  );

  return (
    <div data-feedback-layer style={{ fontFamily: 'system-ui, sans-serif' }}>
      {!open && (slot ? createPortal(pill, slot) : pill)}

      {open && (
        <div
          ref={panelRef}
          data-tester-panel
          // Deliberately NOT role="dialog": five product surfaces
          // (registry-shortcuts, the plan and schedule confirm strips, the
          // shelf panel, the document page) stand down from their own keys
          // whenever any [role="dialog"] is in the DOM. This panel is an
          // instrument alongside the product, not a modal over it, so it must
          // not silence the product it is there to test.
          role="region"
          aria-label="Tester notes"
          className="fixed left-4 z-[68]"
          style={{
            bottom: BOTTOM,
            width: 380,
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            background: '#000',
            color: '#eaeaea',
            border: `1px solid ${YELLOW}`,
            fontFamily: 'inherit',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              borderBottom: '1px solid #333',
            }}
          >
            <Bug size={14} aria-hidden color={YELLOW} />
            <span style={{ color: YELLOW, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em' }}>
              TESTER
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close tester notes"
              style={{
                marginLeft: 'auto',
                background: 'transparent',
                border: 'none',
                color: '#999',
                cursor: 'pointer',
                display: 'inline-flex',
              }}
            >
              <X size={14} aria-hidden />
            </button>
          </div>

          <div role="tablist" aria-label="Tester notes tabs" style={{ display: 'flex', borderBottom: '1px solid #333' }}>
            <TabButton label="New note" on={tab === 'new'} onClick={() => onTab('new')} />
            <TabButton label="Past notes" on={tab === 'past'} onClick={() => onTab('past')} />
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {/* The form stays mounted behind `hidden`: a half-written note
                survives a trip to Past notes and back. */}
            <div hidden={tab !== 'new'} style={{ padding: 12 }}>
              <FeedbackForm key={openSeq} initialBucket={initialBucket} />
            </div>
            {tab === 'past' && (
              // The ledger is a Patina surface; give it its own paper ground
              // rather than restyling it for the black panel.
              <div style={{ background: 'var(--color-paper, #fff)', padding: 12 }}>
                <FeedbackLedger compact onNew={() => onTab('new')} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      style={{
        flex: 1,
        minHeight: 34,
        background: 'transparent',
        border: 'none',
        borderBottom: on ? `2px solid ${YELLOW}` : '2px solid transparent',
        color: on ? YELLOW : '#999',
        fontFamily: 'inherit',
        fontSize: 12,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
