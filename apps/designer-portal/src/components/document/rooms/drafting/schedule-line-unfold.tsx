'use client';

/**
 * Schedule line unfold (Track S · S5) — the Drafting Room's expand-in-place
 * panel for one FF&E line. Document grammar throughout: the panel opens UNDER
 * the card (no modal, no drawer chrome), clay left border like the Orders
 * book's LineUnfold, zero shadows (D4), inline errors at the act (R83), quiet
 * confirmations (R51).
 *
 * Composition: product gallery · specification (doc code S1 · lead time S2 ·
 * category) · pricing (trade / markup / client — the same row the ItemEditForm
 * writes) · provenance (source URL + captured-by + the Strata-Mark
 * completeness fill via piece-progress when product-linked) · client vs
 * internal notes. "Edit the line" mounts the SAME ItemEditForm the legacy host
 * uses — one write path, two grammars.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useProduct,
  useProposalScopeRooms,
  useFFECategories,
  useProposalFeedback,
  useItemFeedbackThread,
  useReplyToItemFeedback,
  useResolveFeedback,
  createBrowserClient,
  type ItemFeedback,
} from '@patina/supabase';
import { useUpdateProposalItem } from '@/hooks/use-proposals';
import { StatusChip } from '@/components/document/status-chip';
import { verdictChipSpec } from '@/lib/document/verdict-chip';
import {
  ItemEditForm,
  type ScheduleLineItem,
  type ScheduleScopeRoom,
} from '@/components/portal/scope-builder/ffe-schedule-builder';
import { LeadTimeSelect } from '@/components/portal/ffe/lead-time-select';
import { leadTimeLabel } from '@/lib/scope/lead-time';
import { StrataMark } from '@/components/document/strata-mark';
import { pieceSections, pieceFill, piecePct } from '@/lib/document/piece-progress';

const ACTION_BTN =
  'rounded-[4px] border border-[var(--color-pearl)] px-2.5 py-1.5 text-[10.5px] font-medium text-[var(--color-charcoal)] hover:border-[var(--color-clay)] disabled:opacity-50';

function fmtCents(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function CellLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-0.5 font-mono text-[8px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
      {children}
    </p>
  );
}

/** Resolve captured_by (uuid) to a name, quietly. */
function useProfileName(profileId: string | null | undefined) {
  return useQuery({
    queryKey: ['profile-name', profileId],
    queryFn: async () => {
      const supabase = createBrowserClient() as any;
      const { data } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', profileId)
        .maybeSingle();
      return (data?.full_name || data?.email || null) as string | null;
    },
    enabled: !!profileId,
  });
}

export function ScheduleLineUnfold({
  item,
  proposalId,
  onFold,
}: {
  item: ScheduleLineItem;
  proposalId: string;
  onFold: () => void;
}) {
  // Same cached queries the builder holds — no extra round trips.
  const { data: rooms = [] } = useProposalScopeRooms(proposalId);
  const { data: categories = [] } = useFFECategories({ proposalId });
  const { data: product } = useProduct(item.product_id ?? '') as { data: any };
  const { data: capturedByName } = useProfileName(product?.captured_by);

  // C3 — this line's client verdict (the latest of any on this proposal_item),
  // sharing the schedule's ['proposal-feedback', id] query. Null → the feedback
  // block renders nothing (no empty block on a line the client hasn't touched).
  const { data: allFeedback = [] } = useProposalFeedback(proposalId);
  const lineFeedback = useMemo<ItemFeedback | null>(() => {
    const mine = allFeedback.filter((f) => f.proposal_item_id === item.id);
    if (mine.length === 0) return null;
    return mine.reduce((latest, f) => (f.created_at > latest.created_at ? f : latest));
  }, [allFeedback, item.id]);

  const updateItem = useUpdateProposalItem();
  const [editing, setEditing] = useState(false);
  const [docCode, setDocCode] = useState(item.doc_code ?? '');
  const [clientNotes, setClientNotes] = useState(item.notes ?? '');
  const [internalNotes, setInternalNotes] = useState(item.internal_notes ?? '');
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const categoryLabelText = item.ffe_category
    ? (categories as Array<{ slug: string; label: string }>).find(
        (c) => c.slug === item.ffe_category
      )?.label ?? item.ffe_category
    : null;

  // One quiet field-save path: confirm in a line of text, fail inline (R83).
  const save = (updates: Record<string, unknown>, confirmation: string) => {
    setError(null);
    setSaved(null);
    updateItem
      .mutateAsync({ itemId: item.id, proposalId, updates })
      .then(() => setSaved(confirmation))
      .catch((e: Error) => setError(e.message || 'The line could not be saved.'));
  };

  // Provenance completeness — the Strata Mark reads the linked piece's record
  // (piece-progress), never a stored progress column.
  const images: string[] = product?.images ?? (item.image_url ? [item.image_url] : []);
  const hasTeaching = ((product?.product_styles as unknown[] | null)?.length ?? 0) > 0;
  const sections = product ? pieceSections(product, hasTeaching) : null;
  const fill = sections ? pieceFill(sections) : null;
  const pct = fill ? piecePct(fill) : null;

  const gallery = images.filter(Boolean).slice(0, 6);

  return (
    <div className="mb-2 mt-1 rounded-r-[5px] border-l-[3px] border-[var(--color-clay)] bg-[rgba(196,165,123,0.05)] px-4 py-3.5">
      {/* ── Gallery ── */}
      {gallery.length > 0 && (
        <div className="mb-3 flex gap-2 overflow-x-auto">
          {gallery.map((src, i) => (
            <img
              key={`${src}-${i}`}
              src={src}
              alt=""
              loading="lazy"
              className="h-24 w-24 shrink-0 rounded-[4px] border border-[var(--color-pearl)] object-cover"
            />
          ))}
        </div>
      )}

      {/* ── Specification · lead time · pricing ── */}
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <CellLabel>Specification</CellLabel>
          <label className="flex items-baseline gap-1.5">
            <span className="font-mono text-[8px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
              code
            </span>
            <input
              type="text"
              value={docCode}
              placeholder="CH-01"
              aria-label="Doc code"
              disabled={updateItem.isPending}
              onChange={(e) => setDocCode(e.target.value)}
              onBlur={() => {
                const next = docCode.trim() || null;
                if (next !== (item.doc_code ?? null)) {
                  save({ doc_code: next }, next ? `code set — ${next}` : 'code cleared');
                }
              }}
              className="w-24 bg-transparent font-mono text-[11px] uppercase tracking-[0.04em] text-[var(--color-charcoal)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-50"
            />
          </label>
          {categoryLabelText && (
            <p className="text-[10px] text-[var(--text-muted)]">{categoryLabelText}</p>
          )}
          {item.vendor_name && (
            <p className="text-[10px] text-[var(--text-muted)]">{item.vendor_name}</p>
          )}
        </div>

        <div>
          <CellLabel>Lead time</CellLabel>
          <LeadTimeSelect
            value={item.lead_time_weeks}
            disabled={updateItem.isPending}
            onChange={(weeks) =>
              save(
                { lead_time_weeks: weeks },
                weeks == null ? 'lead time cleared' : `lead time — ${leadTimeLabel(weeks)}`
              )
            }
            className="!w-auto"
          />
          <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
            feeds the piece&apos;s ETA when the project activates
          </p>
        </div>

        <div>
          <CellLabel>Pricing</CellLabel>
          {item.item_type === 'allowance' ? (
            <p className="text-[11.5px] font-medium text-[var(--color-charcoal)]">
              {fmtCents(item.budget_min_cents)} – {fmtCents(item.budget_max_cents)}
              <span className="ml-1 text-[10px] font-normal text-[var(--text-muted)]">
                allowance
              </span>
            </p>
          ) : item.item_type === 'tbd' ? (
            <p className="text-[11.5px] font-medium text-[var(--color-charcoal)]">
              to be determined
            </p>
          ) : (
            <>
              <p className="text-[11.5px] font-medium text-[var(--color-charcoal)]">
                {fmtCents(item.unit_sell_price)} client
                {item.quantity > 1 ? ` × ${item.quantity}` : ''}
              </p>
              <p className="text-[10px] text-[var(--text-muted)]">
                trade {fmtCents(item.unit_price)}
                {item.markup_percent != null && Number(item.markup_percent) > 0
                  ? ` · markup ${Number(item.markup_percent)}%`
                  : ''}
                {' · line '}
                {fmtCents(item.line_total_cents)}
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Provenance — only when the line points at a real piece ── */}
      {product && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-dashed border-[var(--color-pearl)] pt-2.5">
          {fill && (
            <span className="flex items-center gap-2">
              <StrataMark size="sm" fill={fill} />
              <span className="font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                record {pct}% complete
              </span>
            </span>
          )}
          {product.brand && (
            <span className="text-[10.5px] text-[var(--color-mocha)]">{product.brand}</span>
          )}
          {product.source_url && (
            <a
              href={product.source_url}
              target="_blank"
              rel="noreferrer"
              className="max-w-[260px] truncate text-[10.5px] text-[var(--color-clay)] hover:underline"
            >
              {product.source_url.replace(/^https?:\/\//, '')}
            </a>
          )}
          {capturedByName && (
            <span className="text-[10px] text-[var(--text-muted)]">
              captured by {capturedByName}
            </span>
          )}
        </div>
      )}

      {/* ── Client feedback (C3) — the line's verdict + thread + designer reply /
          resolve. Only when the client has actually left a verdict on this line. ── */}
      {lineFeedback && <LineFeedbackBlock feedback={lineFeedback} proposalId={proposalId} />}

      {/* ── Notes — the client's line vs the studio's ── */}
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <CellLabel>Notes · on the client copy</CellLabel>
          <textarea
            rows={2}
            value={clientNotes}
            disabled={updateItem.isPending}
            onChange={(e) => setClientNotes(e.target.value)}
            onBlur={() => {
              const next = clientNotes.trim() || null;
              if (next !== (item.notes ?? null)) save({ notes: next }, 'notes saved');
            }}
            placeholder="Specification notes the client sees…"
            aria-label="Client notes"
            className="w-full resize-none rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2 py-1.5 text-[11px] text-[var(--color-charcoal)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-50"
          />
        </div>
        <div>
          <CellLabel>Internal · never leaves the studio</CellLabel>
          <textarea
            rows={2}
            value={internalNotes}
            disabled={updateItem.isPending}
            onChange={(e) => setInternalNotes(e.target.value)}
            onBlur={() => {
              const next = internalNotes.trim() || null;
              if (next !== (item.internal_notes ?? null))
                save({ internal_notes: next }, 'internal note saved');
            }}
            placeholder="Trade pricing context, vendor quirks, COM math…"
            aria-label="Internal notes"
            className="w-full resize-none rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2 py-1.5 text-[11px] text-[var(--color-charcoal)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-50"
          />
        </div>
      </div>

      {saved && !error && (
        // R51 — the quiet confirmation.
        <p className="mb-2 text-[10px] text-[var(--text-muted)]">{saved}</p>
      )}
      {error && (
        // R83 — inline at the act.
        <p role="alert" className="mb-2 text-[10px] text-[#C4836F]">
          {error}
        </p>
      )}

      {/* ── Acts ── */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className={ACTION_BTN}
          onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
        >
          {editing ? 'Close edit ↑' : 'Edit the line ✎'}
        </button>
        <button type="button" className={ACTION_BTN} onClick={onFold}>
          Fold ↑
        </button>
      </div>

      {/* The SAME edit form the legacy host mounts — one write path. */}
      {editing && (
        <div className="mt-2">
          <ItemEditForm
            item={item}
            proposalId={proposalId}
            rooms={rooms as ScheduleScopeRoom[]}
            categories={(categories as Array<{ slug: string; label: string }>).map((c) => ({
              slug: c.slug,
              label: c.label,
            }))}
            onDone={() => setEditing(false)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The line's client-feedback block (C3): the verdict chip + the client's note,
 * the thread (created / replied / resolved / reopened), a reply composer either
 * party may use, and — for an unresolved flag — Mark resolved / Reopen
 * (designer-only RPCs). Inline saved/error at the act (R83/R51); no toasts,
 * no shadows (D4).
 */
function LineFeedbackBlock({
  feedback,
  proposalId,
}: {
  feedback: ItemFeedback;
  proposalId: string;
}) {
  const { data: thread = [] } = useItemFeedbackThread(feedback.id);
  const reply = useReplyToItemFeedback();
  const resolve = useResolveFeedback();
  const [replyText, setReplyText] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const spec = verdictChipSpec(feedback.verdict, feedback.resolved_at);
  const isFlag = feedback.verdict === 'rejected';
  const resolved = !!feedback.resolved_at;

  const sendReply = () => {
    const body = replyText.trim();
    if (!body) return;
    setError(null);
    setSaved(null);
    reply
      .mutateAsync({ feedbackId: feedback.id, body, proposalId })
      .then(() => {
        setReplyText('');
        setSaved('reply sent');
      })
      .catch((e: Error) => setError(e.message || 'The reply could not be sent.'));
  };

  const toggleResolved = (reopen: boolean) => {
    setError(null);
    setSaved(null);
    resolve
      .mutateAsync({ feedbackId: feedback.id, proposalId, reopen })
      .then(() => setSaved(reopen ? 'flag reopened' : 'flag resolved'))
      .catch((e: Error) => setError(e.message || 'That could not be saved.'));
  };

  return (
    <div className="mb-3 rounded-[4px] border border-[var(--color-pearl)] bg-[rgba(196,165,123,0.04)] px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <CellLabel>Client feedback</CellLabel>
        {spec && <StatusChip label={spec.label} color={spec.color} />}
      </div>

      {feedback.body && (
        <p className="text-[11.5px] leading-snug text-[var(--color-charcoal)]">{feedback.body}</p>
      )}

      {/* The thread — created / replied / resolved / reopened, oldest first. */}
      {thread.length > 0 && (
        <ol className="mt-2 space-y-1 border-l border-[var(--color-pearl)] pl-2.5">
          {thread.map((ev) => (
            <li key={ev.id} className="text-[10.5px] leading-snug text-[var(--text-muted)]">
              <span className="font-mono text-[8px] uppercase tracking-[0.06em]">{ev.kind}</span>
              {ev.body ? (
                <span className="text-[var(--color-charcoal)]"> · {ev.body}</span>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {/* Reply composer — either party may reply. */}
      <textarea
        rows={2}
        value={replyText}
        disabled={reply.isPending}
        onChange={(e) => setReplyText(e.target.value)}
        placeholder="Reply to the client…"
        aria-label="Reply to client feedback"
        className="mt-2 w-full resize-none rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2 py-1.5 text-[11px] text-[var(--color-charcoal)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-50"
      />

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className={ACTION_BTN}
          disabled={reply.isPending || !replyText.trim()}
          onClick={sendReply}
        >
          {reply.isPending ? 'Sending…' : 'Reply'}
        </button>
        {isFlag && !resolved && (
          <button
            type="button"
            className={ACTION_BTN}
            disabled={resolve.isPending}
            onClick={() => toggleResolved(false)}
          >
            {resolve.isPending ? 'Saving…' : 'Mark resolved'}
          </button>
        )}
        {isFlag && resolved && (
          <button
            type="button"
            className={ACTION_BTN}
            disabled={resolve.isPending}
            onClick={() => toggleResolved(true)}
          >
            {resolve.isPending ? 'Saving…' : 'Reopen'}
          </button>
        )}
      </div>

      {saved && !error && <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">{saved}</p>}
      {error && (
        <p role="alert" className="mt-1.5 text-[10px] text-[#C4836F]">
          {error}
        </p>
      )}
    </div>
  );
}
