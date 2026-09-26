'use client';

/**
 * The Studio — the Desk's Contents page (R95). Book-style front matter, not a
 * dashboard: three columns of labels and doorways, and nothing else. No counts,
 * no tiles, no cards, no metrics — R95 is strict about this, and so is the
 * registry it reads (which forbids consumers deriving any of those from its
 * data). Every entry is a single line: a name, a doorway affordance, and the
 * one act it opens.
 *
 *   · ROOMS  — the places you walk into (D14 room-weight). Only the *global*
 *     rooms appear here (Library, People); the Drafting Room is registry
 *     room-weight but document-scoped — it exists only with a proposal in hand,
 *     so it is never a standalone doorway from the Desk. Dotted leader → ↗.
 *   · LEDGERS — the sheet-weight books (Orders / Accounts / Hours / The Post)
 *     that slide over whatever is in hand. Dotted leader → a "SHEET" type-tag.
 *     Opening them dispatches the same events the Studio Drawer and ⌘K own.
 *     Only the *global* ledgers appear here; the Call Sheet is registry
 *     sheet-weight but document-scoped — like the Drafting Room, it has
 *     nothing to describe without a project document in hand, so it is never
 *     a standalone doorway from the Desk.
 *   · BEGIN  — the registry verbs (the front doors that start something new),
 *     each an em-dash lead + icon, wired to the exact same openers the Desk
 *     header and the ⌘K palette use.
 *
 * Every use fires wayfinding.contentsActed — the index stays labels + doorways;
 * the metric lives in telemetry, never on the page. Zero shadows (D4).
 */

import { useRouter } from 'next/navigation';
import { PenTool, type LucideIcon } from 'lucide-react';
import { useRunningTimer, useStudioUnbilledTime } from '@patina/supabase';
import {
  STUDIO_ROOMS,
  STUDIO_LEDGERS,
  STUDIO_VERBS,
} from '@/lib/document/registry';
import { SectionEyebrow } from '@/components/document/section-eyebrow';
import { documentEvents } from '@/lib/analytics/document-events';
import {
  openLedger,
  openCaptureLead,
  openOpenProject,
} from '@/components/document/command-bar';
import { openPost } from '@/components/document/overlays/post-sheet';
import { openInvoiceComposer } from '@/components/document/accounts/invoice-overlays';
import { openDraftProposalPicker } from '@/components/document/rooms/drafting/draft-proposal-opener';
import { openLogTime } from '@/components/document/log-time-sheet';
import { openDraftingRoom } from '@/lib/document/open-drafting-room';
import { fmtDay } from '@/lib/document/format';
import { useViewerStudio } from '@/hooks/use-viewer-studio';

type RowVariant = 'room' | 'ledger' | 'verb';

// F38 — every row gains a static sub-label naming what is behind the door
// (R95 permits this: a sub-label is not a count, tile, or metric). Rooms and
// ledgers carry no sub-label in the registry itself (that field serves other
// consumers, e.g. `rooms`'s longer drawer gloss) — the Desk Contents' own
// concise phrasing lives here.
const ROOM_SUBLABEL: Record<string, string> = {
  library: 'pieces and makers',
  people: 'clients, makers, trades',
  rooms: 'measured rooms',
};

const LEDGER_SUBLABEL: Record<string, string> = {
  orders: 'POs, receiving, claims',
  accounts: 'invoices, receivables, earnings',
  hours: 'time in hand',
  'the-post': 'mail and messages',
};

/**
 * HT-29 — the Desk's "time in hand" line is act-bearing or absent. Never a bare
 * total: R95 keeps counts and metrics off this index, and HT-30 refuses a total
 * standing apart from the rows that produced it. So this is one of two acts, or
 * nothing at all — unbilled hours to bill, or a timer still running from a day
 * that has ended.
 */
function HoursInHandAct() {
  const runningTimer = useRunningTimer();
  const {
    data: unbilled,
    isPending: unbilledPending,
    isError: unbilledFailed,
  } = useStudioUnbilledTime();
  // Drawing an invoice is the studio's act, not a member's: after 00606 a plain
  // member reads her OWN unbilled rows, so the Desk offered her the composer on
  // its one act-bearing line. Her timer line below is still hers.
  const { isOwnerOrAdmin, isSettled: standingKnown } = useViewerStudio();

  const timer = runningTimer.data;
  const startedDay = timer ? new Date(timer.started_at).toDateString() : null;
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const startedToday = startedDay === today.toDateString();
  // A timer opened three days ago read "from yesterday" — a small lie about the
  // studio's own clock, on the Desk's one act-bearing line.
  const whenStarted =
    startedDay === yesterday.toDateString()
      ? 'yesterday'
      : timer
        ? fmtDay(timer.started_at)
        : '';

  if (timer && !startedToday) {
    return (
      <button
        type="button"
        onClick={() => {
          openLedger('hours');
          documentEvents.wayfinding.contentsActed({
            key: 'hours',
            kind: 'ledger',
          });
        }}
        className="doc-type-meta pl-[22px] text-left text-[var(--color-clay-ink)] underline decoration-dotted underline-offset-4"
      >
        a timer is still running from {whenStarted} →
      </button>
    );
  }

  if (!standingKnown || !isOwnerOrAdmin) return null;

  // A money read that did not answer is not "nothing to bill". A terracotta
  // sentence is wrong on an index of labels and doorways (R95), so the failure
  // reads as the neutral door: the sheet stays reachable and says the rest.
  if (unbilledFailed) {
    return (
      <button
        type="button"
        onClick={() => {
          openLedger('hours');
          documentEvents.wayfinding.contentsActed({
            key: 'hours',
            kind: 'ledger',
          });
        }}
        className="doc-type-meta pl-[22px] text-left text-[var(--color-clay-ink)] underline decoration-dotted underline-offset-4"
      >
        hours →
      </button>
    );
  }

  if (unbilledPending || (unbilled?.length ?? 0) === 0) return null;

  const projects = [
    ...new Set((unbilled ?? []).map((row) => row.project_id)),
  ];
  return (
    <button
      type="button"
      onClick={() => {
        if (projects.length === 1) {
          openInvoiceComposer({
            projectId: projects[0],
            initialTimeEntryIds: (unbilled ?? []).map((row) => row.id),
          });
        } else {
          openLedger('hours');
        }
        documentEvents.wayfinding.contentsActed({
          key: 'hours',
          kind: 'ledger',
        });
      }}
      className="doc-type-meta pl-[22px] text-left text-[var(--color-clay-ink)] underline decoration-dotted underline-offset-4"
    >
      hours to bill →
    </button>
  );
}

/** The small DM-mono heading over each column of the contents. */
function ColumnHead({ children }: { children: React.ReactNode }) {
  return (
    <p className="doc-type-meta mb-3.5 font-semibold uppercase tracking-[0.14em]">
      {children}
    </p>
  );
}

/** One contents line — icon + Playfair label + (rooms/ledgers) a dotted pearl
 *  leader to a right-aligned doorway glyph. Verbs lead with a thin em-dash and
 *  carry no leader (they begin, they don't open a shelf). */
function ContentsRow({
  icon: Icon,
  label,
  subLabel,
  variant,
  prominent,
  onOpen,
  act,
}: {
  icon: LucideIcon;
  label: string;
  /** F38 — a static sub-label naming what's behind the door. */
  subLabel?: string;
  variant: RowVariant;
  prominent: boolean;
  onOpen: () => void;
  /** HT-29 — one act beneath the line, where there is something to act on.
   *  Sits outside the doorway button: a button inside a button is not markup. */
  act?: React.ReactNode;
}) {
  const labelSize = prominent ? 'text-[19px]' : 'text-[17px]';
  // Sub-label indents to sit under the label, past the icon (and, for verbs,
  // the em-dash lead too).
  const subLabelIndent = variant === 'verb' ? 'pl-[34px]' : 'pl-[22px]';
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="group flex min-h-11 w-full flex-col gap-0.5 rounded-[3px] py-[5px] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
      >
        <span className="flex items-baseline gap-2">
          {variant === 'verb' && (
            <span
              aria-hidden
              className="self-center font-heading text-[15px] leading-none text-[var(--text-muted)]"
            >
              —
            </span>
          )}
          <Icon
            className="h-[14px] w-[14px] shrink-0 self-center text-[var(--color-aged-oak)]"
            strokeWidth={1.5}
            aria-hidden
          />
          <span
            className={`shrink-0 font-heading ${labelSize} font-normal leading-tight text-[var(--text-primary)] transition-colors group-hover:text-[var(--color-aged-oak)] motion-reduce:transition-none`}
          >
            {label}
          </span>
          {variant !== 'verb' && (
            <span
              aria-hidden
              className="flex-1 -translate-y-[0.32em] border-b border-dotted border-[var(--color-pearl)]"
            />
          )}
          {variant === 'room' && (
            <span
              aria-hidden
              className="shrink-0 self-center font-mono text-[13px] text-[var(--text-muted)] transition-colors group-hover:text-[var(--color-clay-ink)] motion-reduce:transition-none"
            >
              ↗
            </span>
          )}
          {variant === 'ledger' && (
            <span
              aria-hidden
              className="doc-type-meta shrink-0 self-center uppercase tracking-[0.12em]"
            >
              Sheet
            </span>
          )}
        </span>
        {subLabel && (
          <span className={`doc-type-meta ${subLabelIndent} text-[var(--text-muted)]`}>
            {subLabel}
          </span>
        )}
      </button>
      {act}
    </li>
  );
}

/**
 * The Studio index. `prominent` — set when the Desk is quiet (no folders, no
 * chips) — lets the index rise to fill the quiet: a touch larger, and composed
 * without the dividing rule it wears when it sits as quiet front matter under a
 * working Desk.
 */
export function DeskContents({ prominent = false }: { prominent?: boolean }) {
  const router = useRouter();

  // Global rooms only — the document-scoped Drafting Room is excluded (it has no
  // standalone doorway without a proposal in hand).
  const rooms = STUDIO_ROOMS.filter((room) => room.scope === 'global');

  // Global ledgers only — the document-scoped Call Sheet is excluded the same
  // way (no standalone doorway without a project document in hand).
  const ledgers = STUDIO_LEDGERS.filter((ledger) => ledger.scope === 'global');

  const openRoom = (key: string) => () => {
    // The Studio Drawer owns room-weight routing (it walks in + remembers the
    // origin); dispatching the same open-ledger event reuses that centralized path.
    openLedger(key);
    documentEvents.wayfinding.contentsActed({ key, kind: 'room' });
  };

  const openLedgerRow = (key: string) => () => {
    if (key === 'the-post') openPost();
    else openLedger(key);
    documentEvents.wayfinding.contentsActed({ key, kind: 'ledger' });
  };

  // The verbs reuse the exact openers the Desk header + ⌘K palette already call.
  const verbHandlers: Record<string, () => void> = {
    'capture-lead': openCaptureLead,
    'open-project': openOpenProject,
    'draft-proposal': openDraftProposalPicker,
    'draw-invoice': () => openInvoiceComposer(),
    // W3 — the Desk's Begin column renders STUDIO_VERBS wholesale, so a verb
    // added to the registry for ⌘K stands here too. Without an entry the row
    // renders and does nothing at all.
    'log-time': () => openLogTime(),
    'add-maker': () => router.push('/people?add=maker'),
  };

  const openVerb = (key: string) => () => {
    verbHandlers[key]?.();
    documentEvents.wayfinding.contentsActed({ key, kind: 'verb' });
  };

  // F51 — the Drafting Room joins Begin. Called bare (no id, no router): the
  // shared opener falls to the household picker doorway (C-AF-01 — an
  // opener, not a string).
  const openDraftingRoomRow = () => {
    openDraftingRoom();
    documentEvents.wayfinding.contentsActed({
      key: 'open-drafting-room',
      kind: 'verb',
    });
  };

  return (
    <section
      aria-labelledby="the-studio"
      data-tour-anchor="desk-contents"
      className={
        prominent
          ? 'mt-10'
          : 'mt-16 border-t border-[var(--border-subtle)] pt-12'
      }
    >
      <SectionEyebrow>
        <span id="the-studio">The Studio</span>
      </SectionEyebrow>

      <div className="grid grid-cols-1 gap-x-12 gap-y-9 min-[700px]:grid-cols-3">
        <div>
          <ColumnHead>Rooms</ColumnHead>
          <ul>
            {rooms.map((room) => (
              <ContentsRow
                key={room.key}
                icon={room.icon}
                label={room.label}
                subLabel={ROOM_SUBLABEL[room.key]}
                variant="room"
                prominent={prominent}
                onOpen={openRoom(room.key)}
              />
            ))}
          </ul>
        </div>

        <div>
          <ColumnHead>Ledgers</ColumnHead>
          <ul>
            {ledgers.map((ledger) => (
              <ContentsRow
                key={ledger.key}
                icon={ledger.icon}
                label={ledger.label}
                subLabel={LEDGER_SUBLABEL[ledger.key]}
                variant="ledger"
                prominent={prominent}
                onOpen={openLedgerRow(ledger.key)}
                act={ledger.key === 'hours' ? <HoursInHandAct /> : undefined}
              />
            ))}
          </ul>
        </div>

        <div>
          <ColumnHead>Begin</ColumnHead>
          <ul>
            {/* A9: capture-lead is the Desk header's primary CTA — showing it
                again in the Studio Contents index is the A9 triplicate; ⌘K
                still finds it via the untouched STUDIO_VERBS registry. */}
            {STUDIO_VERBS.filter((verb) => verb.key !== 'capture-lead').map(
              (verb) => (
                <ContentsRow
                  key={verb.key}
                  icon={verb.icon}
                  // The Desk's invoice door is unscoped: it opens the composer
                  // fresh. Its release note, not the label, tells her it is new.
                  label={verb.label}
                  subLabel={verb.key === 'draw-invoice' ? undefined : verb.subLabel}
                  variant="verb"
                  prominent={prominent}
                  onOpen={openVerb(verb.key)}
                />
              ),
            )}
            {/* F51 — the Drafting Room joins Begin, calling the opener A3-L3
                exports rather than a doorway string (C-AF-01). */}
            <ContentsRow
              icon={PenTool}
              label="Open the Contract Room"
              subLabel="facets fill in any order"
              variant="verb"
              prominent={prominent}
              onOpen={openDraftingRoomRow}
            />
          </ul>
        </div>
      </div>
    </section>
  );
}
