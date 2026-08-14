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

import { useMemo, useState } from 'react';
import type {
  CoordinationItem,
  ProjectParty,
  CommsMessage,
} from '@patina/supabase';
import {
  useThreadMessages,
  useSendMessage,
  useThreadRealtime,
  useCoordinationItemThread,
  useEnsureCoordinationItemThread,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
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
import {
  DocumentAction,
  DocumentActionGroup,
  type DocumentActionVariant,
} from '../document-action';

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
    <div className="mt-5 border-t border-[var(--doc-ink-border)] pt-4">
      {children}
    </div>
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

/** Exported so a caller swapping a date arm for DateTextInput (the Calendar
 *  Folio trigger — see resolve-waiting.tsx) can match the same paper-field
 *  footprint as ResolveTextarea below. */
export const FIELD_CLS =
  'w-full rounded-[6px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-3 py-2 font-body text-[0.82rem] text-[var(--color-charcoal)] outline-none transition-colors focus:border-[var(--color-clay)] placeholder:italic placeholder:text-[var(--text-muted)]';

/** A paper textarea matching the prototype `.field textarea`. */
export function ResolveTextarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className={`${FIELD_CLS} resize-vertical ${props.className ?? ''}`}
    />
  );
}

export type ResolveButtonTone = 'gold' | 'sage' | 'plain' | 'charcoal';

/** A resolve action button (`.btn`) — mono uppercase, flat, shadow-free. */
export function ResolveButton({
  actionKey,
  tone = 'plain',
  variant,
  className = '',
  children,
  ...props
}: {
  actionKey: string;
  tone?: ResolveButtonTone;
  variant?: DocumentActionVariant;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <DocumentAction
      actionKey={actionKey}
      variant={variant ?? (tone === 'plain' ? 'secondary' : 'primary')}
      {...props}
      className={className}
    >
      {children}
    </DocumentAction>
  );
}

/** The `.btn-row` — wrapped, aligned action cluster. */
export function ButtonRow({ children }: { children: React.ReactNode }) {
  return (
    <DocumentActionGroup surfaceKey="coordination" regionKey="item-resolution">
      {children}
    </DocumentActionGroup>
  );
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
        ? (parties.find((p) => p.id === item.court_party_id) ?? null)
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
                    ? (parties.find((p) => p.id === t.owner_party_id) ?? null)
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
// Thread — the item's canonical multi-party conversation (00216, R50).
//
// The item's thread is the ONE comms_threads row anchored via
// coordination_item_id. This reads its real messages (useThreadMessages, live
// via useThreadRealtime) and lets the designer post (useSendMessage). When no
// thread exists yet, the composer creates-on-first-post
// (useEnsureCoordinationItemThread) — the thread carries coordination_item_id
// and the designer as participant, then the message lands in the same flow.
//
// Kept paper-grammar and shadow-free (D4): the messages are flat `.msg` rows
// over the paper ground; depth is value contrast + a hairline rule. The
// composer is the prototype's quiet inline field (R51/D1) — no toast, no route
// change, the document stays mounted beneath.
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
  const { user } = useAuth();
  const myId = user?.id ?? '';

  // The court token gives a fallback name/colour for a non-self sender that has
  // no joined profile (e.g. a tracked GC/vendor with no login, R46).
  const courtTok = partyFor(item.court, {
    party:
      item.court_party ??
      (item.court_party_id
        ? (parties.find((p) => p.id === item.court_party_id) ?? null)
        : null),
    clientName,
  });

  // Resolve the existing item thread; the helper creates it on first post.
  const { data: resolvedThreadId } = useCoordinationItemThread(item.id);
  // The embed on the item row gives the thread head before the resolver settles.
  const threadId =
    resolvedThreadId ?? item.latest_thread_post?.thread_id ?? null;

  const ensureThread = useEnsureCoordinationItemThread();
  const sendMessage = useSendMessage();
  useThreadRealtime(threadId ?? undefined);
  const { data: pages, isLoading } = useThreadMessages(threadId ?? undefined);

  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Messages come back newest-first per page; flatten then show oldest-first.
  const messages = useMemo<CommsMessage[]>(() => {
    const all = (pages?.pages ?? []).flat();
    return all.slice().reverse();
  }, [pages]);

  const busy = ensureThread.isPending || sendMessage.isPending;

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setError(null);
    try {
      // Create-on-first-post: resolve (or create) the thread, then post.
      let tid = threadId;
      if (!tid) {
        if (!item.project_id) {
          setError(
            'This item has no project — start the thread from the project.',
          );
          return;
        }
        tid = await ensureThread.mutateAsync({
          itemId: item.id,
          projectId: item.project_id,
        });
      }
      await sendMessage.mutateAsync({ threadId: tid, body });
      setDraft('');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not post to the thread.',
      );
    }
  };

  return (
    <div className="my-4">
      <div className="mb-2.5 font-mono text-[0.5rem] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
        The thread
      </div>

      {/* Messages — flat paper rows, oldest first. */}
      {threadId && isLoading ? (
        <p className="text-[0.74rem] italic text-[var(--text-muted)]">
          Loading the thread…
        </p>
      ) : messages.length > 0 ? (
        <ul className="space-y-3">
          {messages.map((msg) => {
            const mine = msg.sender_id === myId;
            const name = msg.system
              ? 'System'
              : mine
                ? 'You'
                : (msg.sender?.full_name ?? courtTok.label);
            const dot = mine ? 'var(--color-clay)' : courtTok.dotColor;
            return (
              <li key={msg.id} className="flex gap-2.5">
                <span
                  aria-hidden
                  className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full font-mono text-[0.5rem] font-semibold text-white"
                  style={{ background: dot }}
                >
                  {initialsFor(name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[0.48rem] font-semibold uppercase tracking-[0.04em] text-[var(--color-aged-oak)]">
                    {name}
                    <span className="ml-1.5 font-normal normal-case tracking-normal opacity-60">
                      {fmtDay(msg.created_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-[0.78rem] leading-[1.55] text-[var(--color-mocha)]">
                    {msg.deleted_at ? (
                      <em className="text-[var(--text-muted)]">
                        (message deleted)
                      </em>
                    ) : (
                      msg.body
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : item.context ? (
        // No thread yet — the item's own context reads as the opening note.
        <p className="text-[0.78rem] leading-[1.55] text-[var(--color-mocha)]">
          {item.context}
        </p>
      ) : (
        <p className="text-[0.74rem] italic text-[var(--text-muted)]">
          No messages yet on this item.
        </p>
      )}

      {/* Composer — the quiet inline field (R51), shadow-free. */}
      <div className="mt-3 flex items-end gap-2 border-t border-[var(--doc-ink-border)] pt-3">
        <ResolveTextarea
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Add a note to the thread…"
          disabled={busy}
          className="flex-1"
        />
        <ResolveButton
          actionKey="post-coordination-thread-note"
          tone="charcoal"
          onClick={() => void handleSend()}
          disabled={busy || !draft.trim()}
        >
          {busy ? 'Posting…' : 'Post'}
        </ResolveButton>
      </div>
      {error && <p className="mt-1.5 text-[0.68rem] text-[#C4836F]">{error}</p>}
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
