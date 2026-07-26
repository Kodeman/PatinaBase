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

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useProduct,
  useProposalScopeRooms,
  useFFECategories,
  useProposalFeedback,
  useItemFeedbackThread,
  useReplyToItemFeedback,
  useResolveFeedback,
  useTaughtAlternatives,
  useSwapLineToProduct,
  useLogSuggestionEvent,
  createBrowserClient,
  type ItemFeedback,
  type TaughtAlternative,
} from '@patina/supabase';
import {
  extractAttributeKeywords,
  rankTaughtAlternatives,
} from '@patina/utils';
import type { ComposeDecisionRequest } from '@/lib/document/compose-decision';
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
import {
  pieceSections,
  pieceFill,
  piecePct,
} from '@/lib/document/piece-progress';
// S² Wave 2 — custom fields (S6) + spec sheet PDF (S8)
import { useSpecFieldDefs } from '@/hooks/use-spec-fields';
import { withFieldValue, formatFieldValue } from '@/lib/scope/spec-fields';
import { downloadSpecPdf } from '@/lib/scope/spec-pdf-client';
import {
  DocumentAction,
  DocumentActionGroup,
  DocumentActionRow,
} from '@/components/document/document-action';

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
  canComposeDecision = false,
  onComposeDecision,
}: {
  item: ScheduleLineItem;
  proposalId: string;
  onFold: () => void;
  /** C4 — whether "Put it to the client" can open the margin composer (needs a project). */
  canComposeDecision?: boolean;
  onComposeDecision?: (request: ComposeDecisionRequest) => void;
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
    return mine.reduce((latest, f) =>
      f.created_at > latest.created_at ? f : latest,
    );
  }, [allFeedback, item.id]);

  // S6 — the document's custom field definitions (values live on the item).
  const { data: fieldDefs = [] } = useSpecFieldDefs({ proposalId });

  const updateItem = useUpdateProposalItem();
  const [editing, setEditing] = useState(false);
  const [docCode, setDocCode] = useState(item.doc_code ?? '');
  const [clientNotes, setClientNotes] = useState(item.notes ?? '');
  const [internalNotes, setInternalNotes] = useState(item.internal_notes ?? '');
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(
    (item.custom_fields as Record<string, unknown> | null) ?? {},
  );
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  // S8 — the item spec sheet (client price only; no trade/markup ever). Inline
  // error at the act (R83), quiet confirmation (R51).
  const handleSpecPdf = async () => {
    setPdfBusy(true);
    setError(null);
    setSaved(null);
    try {
      await downloadSpecPdf(
        { kind: 'item', proposalId, itemId: item.id },
        `spec-${item.doc_code || item.id}.pdf`,
      );
      setSaved('spec sheet downloaded');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'The spec sheet could not be generated.',
      );
    } finally {
      setPdfBusy(false);
    }
  };

  const categoryLabelText = item.ffe_category
    ? ((categories as Array<{ slug: string; label: string }>).find(
        (c) => c.slug === item.ffe_category,
      )?.label ?? item.ffe_category)
    : null;

  // One quiet field-save path: confirm in a line of text, fail inline (R83).
  const save = (updates: Record<string, unknown>, confirmation: string) => {
    setError(null);
    setSaved(null);
    updateItem
      .mutateAsync({ itemId: item.id, proposalId, updates })
      .then(() => setSaved(confirmation))
      .catch((e: Error) =>
        setError(e.message || 'The line could not be saved.'),
      );
  };

  // Provenance completeness — the Strata Mark reads the linked piece's record
  // (piece-progress), never a stored progress column.
  const images: string[] =
    product?.images ?? (item.image_url ? [item.image_url] : []);
  const hasTeaching =
    ((product?.product_styles as unknown[] | null)?.length ?? 0) > 0;
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
                  save(
                    { doc_code: next },
                    next ? `code set — ${next}` : 'code cleared',
                  );
                }
              }}
              className="w-24 bg-transparent font-mono text-[11px] uppercase tracking-[0.04em] text-[var(--color-charcoal)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-50"
            />
          </label>
          {categoryLabelText && (
            <p className="text-[10px] text-[var(--text-muted)]">
              {categoryLabelText}
            </p>
          )}
          {item.vendor_name && (
            <p className="text-[10px] text-[var(--text-muted)]">
              {item.vendor_name}
            </p>
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
                weeks == null
                  ? 'lead time cleared'
                  : `lead time — ${leadTimeLabel(weeks)}`,
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
              {fmtCents(item.budget_min_cents)} –{' '}
              {fmtCents(item.budget_max_cents)}
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

      {/* ── Custom fields (S6) — the schedule's designer-defined columns ── */}
      {fieldDefs.length > 0 && (
        <div className="mb-3 grid grid-cols-1 gap-3 border-t border-dashed border-[var(--color-pearl)] pt-2.5 sm:grid-cols-3">
          {fieldDefs.map((def) => (
            <div key={def.id}>
              <CellLabel>{def.name}</CellLabel>
              <input
                type={
                  def.kind === 'number'
                    ? 'number'
                    : def.kind === 'url'
                      ? 'url'
                      : 'text'
                }
                value={formatFieldValue(customFields[def.field_key])}
                disabled={updateItem.isPending}
                onChange={(e) =>
                  setCustomFields((cur) =>
                    withFieldValue(
                      cur,
                      def.field_key,
                      def.kind,
                      e.target.value,
                    ),
                  )
                }
                onBlur={() => {
                  const original =
                    (item.custom_fields as Record<string, unknown> | null)?.[
                      def.field_key
                    ] ?? null;
                  const current = customFields[def.field_key] ?? null;
                  if (JSON.stringify(current) !== JSON.stringify(original)) {
                    save({ custom_fields: customFields }, `${def.name} saved`);
                  }
                }}
                placeholder={def.kind === 'url' ? 'https://…' : '—'}
                aria-label={def.name}
                className="w-full bg-transparent text-[11px] text-[var(--color-charcoal)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-50"
              />
            </div>
          ))}
        </div>
      )}

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
            <span className="text-[10.5px] text-[var(--color-mocha)]">
              {product.brand}
            </span>
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
      {lineFeedback && (
        <LineFeedbackBlock feedback={lineFeedback} proposalId={proposalId} />
      )}

      {/* ── Taught alternatives (A1) — only on an UNRESOLVED rejection. A shortlist
          from the designer's own corpus first, lightly filtered by the flag note. ── */}
      {lineFeedback &&
        lineFeedback.verdict === 'rejected' &&
        !lineFeedback.resolved_at && (
          <AlternativesBand
            item={item}
            feedback={lineFeedback}
            proposalId={proposalId}
            canComposeDecision={canComposeDecision}
            onComposeDecision={onComposeDecision}
          />
        )}

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
              if (next !== (item.notes ?? null))
                save({ notes: next }, 'notes saved');
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
      <DocumentActionRow
        surfaceKey="drafting"
        regionKey="schedule-line-utilities"
        aria-label="Schedule line actions"
      >
        <DocumentAction
          actionKey="edit-schedule-line"
          variant="secondary"
          onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
        >
          {editing ? 'Close edit ↑' : 'Edit the line ✎'}
        </DocumentAction>
        <DocumentAction
          actionKey="download-spec-sheet"
          variant="secondary"
          onClick={handleSpecPdf}
          loading={pdfBusy}
          loadingLabel="Preparing…"
        >
          Spec sheet (PDF) ↓
        </DocumentAction>
        <DocumentAction
          actionKey="fold-schedule-line"
          variant="tertiary"
          onClick={onFold}
        >
          Fold ↑
        </DocumentAction>
      </DocumentActionRow>

      {/* The SAME edit form the legacy host mounts — one write path. */}
      {editing && (
        <div className="mt-2">
          <ItemEditForm
            item={item}
            proposalId={proposalId}
            rooms={rooms as ScheduleScopeRoom[]}
            categories={(
              categories as Array<{ slug: string; label: string }>
            ).map((c) => ({
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
 * Taught alternatives (A1) — the shortlist shown on an unresolved rejection.
 * Drawn from the designer's own corpus first (find_taught_alternatives boosts
 * personal, then studio, ahead of the catalog) and lightly re-ranked by the
 * attribute words parsed from the client's flag note. Two acts per pick — Swap
 * the line to it (which resolves the flag) or Dismiss — plus a line-level "Put
 * it to the client" that escalates to a Decision (C4). Every shown / swap /
 * dismiss is a training signal. Silent-degrade: no product link, no embedding,
 * or an RPC error → the band renders nothing. No shadows (D4), inline errors (R83).
 */
function AlternativesBand({
  item,
  feedback,
  proposalId,
  canComposeDecision,
  onComposeDecision,
}: {
  item: ScheduleLineItem;
  feedback: ItemFeedback;
  proposalId: string;
  canComposeDecision: boolean;
  onComposeDecision?: (request: ComposeDecisionRequest) => void;
}) {
  const { data: raw = [], isError } = useTaughtAlternatives(item.product_id, 8);
  const swap = useSwapLineToProduct();
  const logEvent = useLogSuggestionEvent();
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const keywords = useMemo(
    () => extractAttributeKeywords(feedback.body),
    [feedback.body],
  );
  const ranked = useMemo(
    () => rankTaughtAlternatives(raw, keywords),
    [raw, keywords],
  );
  const shown = useMemo(
    () => ranked.filter((p) => !dismissed.has(p.id)),
    [ranked, dismissed],
  );

  // Log the shown batch once per distinct product set — a training receipt.
  const shownKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (shown.length === 0) return;
    const key = shown.map((p) => p.id).join(',');
    if (shownKeyRef.current === key) return;
    shownKeyRef.current = key;
    logEvent.mutate(
      shown.map((p, i) => ({
        context: 'line_alternatives' as const,
        action: 'shown' as const,
        productId: p.id,
        feedbackId: feedback.id,
        rank: i,
      })),
    );
    // logEvent identity is stable; re-run only when the shown set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, feedback.id]);

  if (!item.product_id || isError || ranked.length === 0) return null;

  const doSwap = (p: TaughtAlternative, rank: number) => {
    setError(null);
    setSaved(null);
    swap
      .mutateAsync({
        proposalItemId: item.id,
        productId: p.id,
        feedbackId: feedback.id,
        proposalId,
        rank,
      })
      .then(() => setSaved(`Swapped to ${p.name}.`))
      .catch((e: Error) =>
        setError(e.message || 'The line could not be swapped.'),
      );
  };

  const doDismiss = (p: TaughtAlternative, rank: number) => {
    setDismissed((s) => new Set(s).add(p.id));
    logEvent.mutate({
      context: 'line_alternatives',
      action: 'dismissed',
      productId: p.id,
      feedbackId: feedback.id,
      rank,
    });
  };

  const putToClient = () => {
    const picks = shown.slice(0, 3);
    onComposeDecision?.({
      feedbackId: feedback.id,
      title: `Re: ${item.name}`,
      rejected: {
        productId: item.product_id ?? null,
        name: item.name,
        imageUrl: item.image_url ?? null,
        priceCents: item.unit_sell_price ?? null,
      },
      alternatives: picks.map((p) => ({
        productId: p.id,
        name: p.name,
        imageUrl: p.images?.[0] ?? null,
        priceCents: p.price_retail,
        brand: p.brand,
        layer: p.layer,
      })),
    });
    // Escalating these to the client is an accept signal for each.
    logEvent.mutate(
      picks.map((p, i) => ({
        context: 'line_alternatives' as const,
        action: 'accepted' as const,
        productId: p.id,
        feedbackId: feedback.id,
        rank: i,
      })),
    );
  };

  return (
    <div className="mb-3 rounded-[4px] border border-dashed border-[var(--color-clay)] bg-[rgba(196,165,123,0.04)] px-3 py-2.5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <CellLabel>Alternatives · taught from your library</CellLabel>
        {keywords.length > 0 && (
          <span className="font-mono text-[8px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
            matched · {keywords.join(' · ')}
          </span>
        )}
      </div>

      <ul className="space-y-1.5">
        {shown.map((p, i) => (
          <li key={p.id} className="flex items-center gap-2.5">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-[3px] border border-[var(--color-pearl)] bg-[rgba(196,165,123,0.06)]">
              {p.images?.[0] && (
                <img
                  src={p.images[0]}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11.5px] text-[var(--color-charcoal)]">
                {p.name}
              </p>
              <p className="flex items-center gap-2 text-[9px] text-[var(--text-muted)]">
                <LayerBadge layer={p.layer} />
                {p.price_retail != null && (
                  <span>
                    ${Math.round(p.price_retail / 100).toLocaleString()}
                  </span>
                )}
                {p.brand && <span className="truncate">{p.brand}</span>}
              </p>
            </div>
            <DocumentAction
              actionKey="swap-line-alternative"
              surfaceKey="drafting"
              regionKey={`line-alternative-${i + 1}`}
              variant="secondary"
              loading={swap.isPending}
              loadingLabel="Swapping…"
              onClick={() => doSwap(p, i)}
            >
              Swap
            </DocumentAction>
            <button
              type="button"
              aria-label={`Dismiss ${p.name}`}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[4px] border border-transparent px-1.5 py-1 text-[12px] leading-none text-[var(--text-muted)] hover:border-[var(--color-pearl)] hover:text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
              onClick={() => doDismiss(p, i)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {canComposeDecision && onComposeDecision && (
        <DocumentActionGroup
          surfaceKey="drafting"
          regionKey="line-alternatives-decision"
          className="mt-2 border-t border-dashed border-[var(--color-pearl)] pt-2"
          aria-label="Alternative decision actions"
        >
          <DocumentAction
            actionKey="put-alternatives-to-client"
            variant="primary"
            trailing="→"
            onClick={putToClient}
          >
            Put it to the client
          </DocumentAction>
        </DocumentActionGroup>
      )}

      {saved && !error && (
        <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">{saved}</p>
      )}
      {error && (
        <p role="alert" className="mt-1.5 text-[10px] text-[#C4836F]">
          {error}
        </p>
      )}
    </div>
  );
}

/** The taught-corpus provenance chip: your library / your studio / the catalog. */
function LayerBadge({ layer }: { layer: string }) {
  const label =
    layer === 'personal' ? 'Yours' : layer === 'studio' ? 'Studio' : 'Catalog';
  const taught = layer === 'personal' || layer === 'studio';
  return (
    <span
      className={`font-mono text-[7.5px] uppercase tracking-[0.08em] ${
        taught ? 'text-[var(--color-clay)]' : 'text-[var(--text-muted)]'
      }`}
    >
      {label}
    </span>
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
      .catch((e: Error) =>
        setError(e.message || 'The reply could not be sent.'),
      );
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
        <p className="text-[11.5px] leading-snug text-[var(--color-charcoal)]">
          {feedback.body}
        </p>
      )}

      {/* The thread — created / replied / resolved / reopened, oldest first. */}
      {thread.length > 0 && (
        <ol className="mt-2 space-y-1 border-l border-[var(--color-pearl)] pl-2.5">
          {thread.map((ev) => (
            <li
              key={ev.id}
              className="text-[10.5px] leading-snug text-[var(--text-muted)]"
            >
              <span className="font-mono text-[8px] uppercase tracking-[0.06em]">
                {ev.kind}
              </span>
              {ev.body ? (
                <span className="text-[var(--color-charcoal)]">
                  {' '}
                  · {ev.body}
                </span>
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

      <DocumentActionRow
        surfaceKey="drafting"
        regionKey="line-feedback"
        className="mt-1.5"
        aria-label="Line feedback actions"
      >
        <DocumentAction
          actionKey="reply-to-line-feedback"
          variant="primary"
          disabled={reply.isPending || !replyText.trim()}
          loading={reply.isPending}
          loadingLabel="Sending…"
          onClick={sendReply}
        >
          Reply
        </DocumentAction>
        {isFlag && !resolved && (
          <DocumentAction
            actionKey="resolve-line-feedback"
            variant="secondary"
            loading={resolve.isPending}
            loadingLabel="Saving…"
            onClick={() => toggleResolved(false)}
          >
            Mark resolved
          </DocumentAction>
        )}
        {isFlag && resolved && (
          <DocumentAction
            actionKey="reopen-line-feedback"
            variant="secondary"
            loading={resolve.isPending}
            loadingLabel="Saving…"
            onClick={() => toggleResolved(true)}
          >
            Reopen
          </DocumentAction>
        )}
      </DocumentActionRow>

      {saved && !error && (
        <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">{saved}</p>
      )}
      {error && (
        <p role="alert" className="mt-1.5 text-[10px] text-[#C4836F]">
          {error}
        </p>
      )}
    </div>
  );
}
