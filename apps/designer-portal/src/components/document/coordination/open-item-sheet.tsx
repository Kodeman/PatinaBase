'use client';

/**
 * OpenItemSheet — the per-item coordination overlay (Track 5).
 *
 * Rendered as a DocSheet *child* (the band owns DocSheet's `open`/`onClose`
 * local state, D1 — the document stays mounted beneath). DocSheet's frame is
 * charcoal, so this renders an inner `--doc-paper` panel with 1px pearl/ink
 * edges + value contrast for depth (ZERO shadows, D4) — the sheet reads as
 * paper exactly like the prototype while keeping DocSheet's verified shell.
 *
 * The body, top to bottom, mirrors the prototype's `.sheet-in`:
 *   · the type chip (+ Rev N for a submittal) + the Playfair sh-title
 *   · the ball-in-court banner ("Ball is in <who>'s court · … · due …")
 *   · the "⊘ This is blocking" list (downstream tasks / blocks_kind fallback)
 *   · the thread (latest post + a quiet composer stub when threaded)
 *   · the per-type resolve panel, chosen by coordination_kind + court
 *
 * No toast on resolve (R51): the resolve panels confirm with a quiet inline
 * line and the cascade re-reads every surface via the foundation hooks.
 */

import { useMemo } from 'react';
import type {
  CoordinationItem,
  ProjectParty,
} from '@patina/supabase';
import type { SectionTask } from '@/hooks/use-section-work';
import { blocksText } from '@/lib/document/coordination-derivation';
import { fmtDay } from '@/lib/document/format';
import { itemTypeToken, chipStyle, resolveKind } from './item-type';
import { partyFor, courtToken, initialsFor } from './party';
import { ResolveSelection } from './item-resolve/resolve-selection';
import { ResolveRfi } from './item-resolve/resolve-rfi';
import { ResolveSubmittal } from './item-resolve/resolve-submittal';
import { ResolveSignoff } from './item-resolve/resolve-signoff';
import { ResolvePunch } from './item-resolve/resolve-punch';
import { ResolveWaiting } from './item-resolve/resolve-waiting';

// ════════════════════════════════════════════════════════════════════════
// Shared resolve-panel primitives — the prototype's `.resolve` grammar.
// Exported so the six resolve-*.tsx panels share one button/field/quiet-line
// vocabulary without an extra file (open-item-sheet is their parent surface).
// All shadow-free (D4): depth is a 1px pearl/ink edge + value contrast.
// ════════════════════════════════════════════════════════════════════════

/**
 * The FROZEN resolve-panel contract (all six panels share this). Imported by
 * resolve-*.tsx so the type lives in one place (the parent surface) rather than
 * an extra file. Selection/sign-off panels additionally accept `clientName`.
 */
export interface ResolvePanelProps {
  item: CoordinationItem;
  projectId: string;
  designerClientId: string;
  /** Called after a successful resolve/nudge/extend/reassign so the sheet
   *  closes and surfaces re-read (the band closes the sheet on this). */
  onResolved: () => void;
}

/** The `.resolve` shell: a hairline top rule, then the question + actions. */
export function ResolveShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 border-t border-[var(--doc-ink-border)] pt-4">{children}</div>
  );
}

/** The `.resolve-q` line — Playfair italic, the framing question. */
export function ResolveQuestion({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 font-heading text-[0.95rem] italic leading-snug text-[var(--color-charcoal)]">
      {children}
    </p>
  );
}

/** A labelled field block (`.field`) — mono uppercase label over the control. */
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
        {label}
      </span>
      {children}
    </label>
  );
}

const FIELD_CLS =
  'w-full rounded-[6px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-3 py-2 font-body text-[0.82rem] text-[var(--color-charcoal)] outline-none transition-colors focus:border-[var(--color-clay)] placeholder:italic placeholder:text-[var(--text-muted)]';

/** A paper text input matching the prototype `.field input`. */
export function ResolveInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${FIELD_CLS} ${props.className ?? ''}`} />;
}

/** A paper textarea matching the prototype `.field textarea`. */
export function ResolveTextarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return <textarea {...props} className={`${FIELD_CLS} resize-vertical ${props.className ?? ''}`} />;
}

export type ResolveButtonTone = 'gold' | 'sage' | 'plain' | 'charcoal';

const TONE_CLS: Record<ResolveButtonTone, string> = {
  // The clay "gold" primary — fill clay, white ink (prototype `.btn.gold`).
  gold: 'border-[var(--color-clay)] bg-[var(--color-clay)] text-white hover:opacity-88',
  // Sage approve — fill sage, white ink (prototype `.btn.sage`).
  sage: 'border-[var(--color-sage)] bg-[var(--color-sage)] text-white hover:opacity-88',
  // Charcoal primary — the ground ink (prototype `.btn.primary`).
  charcoal:
    'border-[var(--color-charcoal)] bg-[var(--color-charcoal)] text-[var(--color-off-white)] hover:opacity-88',
  // Plain — paper, hairline border, clay on hover (prototype `.btn`).
  plain:
    'border-[var(--color-pearl)] bg-[var(--doc-paper)] text-[var(--color-charcoal)] hover:border-[var(--color-clay)]',
};

/** A resolve action button (`.btn`) — mono uppercase, flat, shadow-free. */
export function ResolveButton({
  tone = 'plain',
  className = '',
  ...props
}: { tone?: ResolveButtonTone } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-[6px] border px-[1.1rem] py-2 font-mono text-[0.54rem] font-semibold uppercase tracking-[0.06em] transition-all disabled:opacity-40 ${TONE_CLS[tone]} ${className}`}
    />
  );
}

/** The `.btn-row` — wrapped, aligned action cluster. */
export function ButtonRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

/**
 * The QUIET confirmation line (R51) — NOT a toast. A single sage-dotted line
 * the panel shows after a successful act, before the band closes the sheet.
 * Mirrors the prototype's `.toast .d` sage dot without the floating toast.
 */
export function QuietConfirm({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 flex items-center gap-2 font-mono text-[0.62rem] text-[var(--text-muted)]">
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--color-sage)]"
      />
      {children}
    </p>
  );
}

// ════════════════════════════════════════════════════════════════════════
// The sheet
// ════════════════════════════════════════════════════════════════════════

export interface OpenItemSheetProps {
  item: CoordinationItem;
  tasks: SectionTask[];
  parties: ProjectParty[];
  projectId: string;
  designerClientId: string;
  /** Real client's name for the client court banner copy. */
  clientName?: string;
  onClose: () => void;
}

export function OpenItemSheet({
  item,
  tasks,
  parties,
  projectId,
  designerClientId,
  clientName,
  onClose,
}: OpenItemSheetProps) {
  const type = itemTypeToken(item.coordination_kind);

  // The concrete party the court points at (named GC/vendor), or the client
  // name on the client court, falling back to the generic court token (R46).
  const party = useMemo(() => {
    const row =
      item.court_party ??
      (item.court_party_id
        ? parties.find((p) => p.id === item.court_party_id) ?? null
        : null);
    return partyFor(item.court, { party: row, clientName });
  }, [item.court, item.court_party, item.court_party_id, parties, clientName]);

  const inYourCourt = item.court === 'designer';

  // The "⊘ This is blocking →" list: the downstream tasks this item gates,
  // each with its owner chip; falls back to the blocks_kind sentence.
  const blockedTasks = useMemo(
    () => tasks.filter((t) => t.blocked_by_item_id === item.id),
    [tasks, item.id],
  );
  const blocksFallback = blocksText(item, tasks);

  // Rev N for a submittal title (the latest revision rides the revisions hook
  // inside ResolveSubmittal; the chip here shows the kind, the panel shows Rev).
  const chip = chipStyle(item.coordination_kind);

  return (
    <div className="mx-auto max-w-[600px]">
      {/* Inner paper panel — the sheet reads as paper over DocSheet's charcoal
          ground. Depth = 1px pearl/ink edges + value contrast, no shadow. */}
      <div className="rounded-[12px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-6 pb-7 pt-6">
        {/* Type chip */}
        <span
          className="mb-2.5 inline-block rounded-[3px] border-[1.5px] px-[9px] py-[3px] font-mono text-[0.46rem] font-semibold uppercase tracking-[0.08em]"
          style={chip}
        >
          {type.label}
        </span>

        {/* Title — Playfair */}
        <h2 className="font-heading text-[1.5rem] font-medium leading-[1.15] text-[var(--color-charcoal)]">
          {item.title}
        </h2>

        {/* Ball-in-court banner */}
        <div className="my-3 flex items-center gap-2 rounded-[7px] border border-[var(--color-pearl)] bg-[rgba(196,165,123,0.06)] px-3 py-2.5">
          <span
            aria-hidden
            className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
            style={{ background: courtToken(item.court).dotColor }}
          />
          <span className="text-[0.74rem] text-[var(--color-charcoal)]">
            Ball is in{' '}
            <b className="font-semibold">
              {inYourCourt ? 'your court' : `${party.label}'s court`}
            </b>
            {' · '}
            {inYourCourt ? 'your move' : 'waiting on them'}
            {item.due_date ? ` · due ${fmtDay(item.due_date)}` : ''}
          </span>
        </div>

        {/* "⊘ This is blocking" list */}
        {(blockedTasks.length > 0 || blocksFallback) && (
          <div className="my-3 rounded-[7px] border border-[rgba(212,160,144,0.4)] bg-[rgba(212,160,144,0.05)] px-3.5 py-3">
            <div className="mb-1.5 font-mono text-[0.46rem] font-semibold uppercase tracking-[0.08em] text-[#C4836F]">
              ⊘ This is blocking
            </div>
            {blockedTasks.length > 0 ? (
              <ul>
                {blockedTasks.map((t) => {
                  const owner = courtToken(t.owner);
                  const ownerRow = t.owner_party_id
                    ? parties.find((p) => p.id === t.owner_party_id) ?? null
                    : null;
                  const ownerTok = partyFor(t.owner, {
                    party: ownerRow,
                    clientName,
                  });
                  return (
                    <li
                      key={t.id}
                      className="flex items-center gap-1.5 py-[0.2rem] text-[0.74rem] text-[var(--color-mocha)]"
                    >
                      <span className="text-[#C4836F]">→</span>
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      <span className="ml-auto inline-flex items-center gap-1 whitespace-nowrap font-mono text-[0.46rem] uppercase tracking-[0.04em] text-[var(--text-muted)]">
                        <span
                          aria-hidden
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{ background: owner.dotColor }}
                        />
                        {ownerTok.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="flex items-center gap-1.5 py-[0.2rem] text-[0.74rem] text-[var(--color-mocha)]">
                <span className="text-[#C4836F]">→</span>
                {blocksFallback}
              </div>
            )}
          </div>
        )}

        {/* The thread */}
        <Thread item={item} parties={parties} clientName={clientName} />

        {/* The per-type resolve panel */}
        <ResolvePanel
          item={item}
          parties={parties}
          projectId={projectId}
          designerClientId={designerClientId}
          clientName={clientName}
          onResolved={onClose}
        />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Thread — the latest per-item thread post (00216), read-only preview.
// The comms hooks key off a thread_id the designer participates in; the
// coordination embed gives only the thread head, so this shows the latest
// post as the prototype's single `.msg` and links into the full thread.
// (A full message composer lives in the comms surface; this band keeps the
// thread a quiet read so the sheet stays focused on resolving — R51/D1.)
// ════════════════════════════════════════════════════════════════════════

function Thread({
  item,
  parties,
  clientName,
}: {
  item: CoordinationItem;
  parties: ProjectParty[];
  clientName?: string;
}) {
  const post = item.latest_thread_post;
  const court = item.court;
  const tok = partyFor(court, {
    party:
      item.court_party ??
      (item.court_party_id
        ? parties.find((p) => p.id === item.court_party_id) ?? null
        : null),
    clientName,
  });

  return (
    <div className="my-4">
      <div className="mb-2.5 font-mono text-[0.5rem] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
        The thread
      </div>
      {post ? (
        <div className="flex gap-2.5">
          <span
            aria-hidden
            className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full font-mono text-[0.5rem] font-semibold text-white"
            style={{ background: tok.dotColor }}
          >
            {initialsFor(tok.label)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[0.48rem] font-semibold uppercase tracking-[0.04em] text-[var(--color-aged-oak)]">
              {tok.label}
              {post.last_message_at && (
                <span className="ml-1.5 font-normal normal-case tracking-normal opacity-60">
                  {fmtDay(post.last_message_at)}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[0.78rem] leading-[1.55] text-[var(--color-mocha)]">
              {post.title || (item.context ?? 'Thread open on this item.')}
            </p>
          </div>
        </div>
      ) : item.context ? (
        // No thread yet — show the item's own context as the opening note.
        <p className="text-[0.78rem] leading-[1.55] text-[var(--color-mocha)]">
          {item.context}
        </p>
      ) : (
        <p className="text-[0.74rem] italic text-[var(--text-muted)]">
          No messages yet on this item.
        </p>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// ResolvePanel — picks the per-type panel by coordination_kind + court.
//
//   · The ball is NOT in your court AND it's not yours to record (a selection
//     the client must make / a sign-off they must grant has a designer-side
//     "record her approval" path, but an RFI/submittal/punch waiting on the
//     GC/vendor is theirs to move) → the waiting panel (nudge/extend/reassign).
//   · Otherwise the per-kind resolve panel.
// ════════════════════════════════════════════════════════════════════════

function ResolvePanel({
  item,
  parties,
  projectId,
  designerClientId,
  clientName,
  onResolved,
}: {
  item: CoordinationItem;
  parties: ProjectParty[];
  projectId: string;
  designerClientId: string;
  clientName?: string;
  onResolved: () => void;
}) {
  const kind = resolveKind(item.coordination_kind);

  // Selections and sign-offs always carry a designer-side record path (the
  // designer can record the client's pick / approval from the mirror), even
  // when the ball sits in the client's court. The other shapes, when waiting
  // on a non-designer court, are theirs to move → the waiting panel.
  const recordableFromHere = kind === 'select' || kind === 'sign';
  const waiting = item.court !== 'designer' && !recordableFromHere;

  if (waiting) {
    return (
      <ResolveWaiting
        item={item}
        projectId={projectId}
        designerClientId={designerClientId}
        parties={parties}
        clientName={clientName}
        onResolved={onResolved}
      />
    );
  }

  const shared = {
    item,
    projectId,
    designerClientId,
    onResolved,
  };

  switch (item.coordination_kind) {
    case 'selection':
      return <ResolveSelection {...shared} clientName={clientName} />;
    case 'rfi':
      return <ResolveRfi {...shared} />;
    case 'submittal':
      return <ResolveSubmittal {...shared} />;
    case 'signoff':
      return <ResolveSignoff {...shared} clientName={clientName} />;
    case 'punch':
      return <ResolvePunch {...shared} />;
    default:
      return <ResolveRfi {...shared} />;
  }
}
