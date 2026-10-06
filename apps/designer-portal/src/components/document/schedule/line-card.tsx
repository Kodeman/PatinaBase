'use client';

/**
 * "The line, as it will be bought" (US-16 C-16, D1-02 S4). Every road in the
 * Add to the job sheet ends here: pre-filled from what the source captured,
 * editable before saving. Save is the placement RPC, then
 * set_project_ffe_line_commercials for maker and trade cost, then the
 * project_ffe_specs column grant for SKU, finish and dimensions.
 *
 * The client price is shown only when the source read a retail price, and is
 * never typed here (R5/R8). A retail price is never filed as trade cost
 * (R-DI4): the card warns instead.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FfeAssignmentScope, FfeDesignDisposition, FfeDuplicateMode } from '@patina/types';
import {
  useCanSeeStudioMargin,
  useCreateNamedProjectNeed,
  useLineCardProductPrefill,
  usePlaceProductInProjectV2,
  useProjectRecordedStudio,
  useResolveOrCreateVendor,
  useSetFfeLineCommercials,
  useSetFfeLineSpecFields,
  useUpsertStudioVendorAccount,
  type LineCardProductPrefill,
  type ProposalBoardSummary,
} from '@patina/supabase';
import type { ProductPickResult } from '@/components/portal/proposals/product-picker-modal';
import { ffeEvents } from '@/lib/analytics/ffe-events';
import { centsToInput, parseDollarsToCents } from '@/lib/currency-ui';
import { fmtUsd } from '@/lib/document/format';
import { deriveOrderReadiness, type OrderLineInput } from '@/lib/document/authorization-derivation';
import { DimensionFields } from '../dimension-fields';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { MakerSearch, type MakerOption } from '../line-unfold/the-buy-cell';

/** The roads that end at the line card. */
export type LineCardRoad = 'library' | 'link' | 'photo' | 'quote' | 'custom' | 'find' | 'store' | 'need';
export type LineKind = 'catalog' | 'custom' | 'find' | 'store';

export interface LineCardSource {
  road: LineCardRoad;
  /** Set for the Library and link roads. */
  pick?: ProductPickResult;
}

/** The sheet's page label: where this line came from. */
export const ROAD_PAGE_LABEL: Record<LineCardRoad, string> = {
  library: 'from the Library',
  link: 'from a link',
  photo: 'from a photo',
  quote: "from a vendor's quote",
  custom: 'a custom piece',
  find: 'a find',
  store: 'a store buy',
  need: 'a need',
};

const ROAD_KIND: Record<LineCardRoad, LineKind> = {
  library: 'catalog',
  link: 'catalog',
  photo: 'catalog',
  quote: 'catalog',
  custom: 'custom',
  find: 'find',
  store: 'store',
  need: 'catalog',
};

/** The `source` a manual line is placed with (project_ffe_items.added_via). */
const KIND_SOURCE: Record<Exclude<LineKind, 'catalog'>, string> = {
  custom: 'custom-piece',
  find: 'find',
  store: 'store-buy',
};
const ROAD_SOURCE: Partial<Record<LineCardRoad, string>> = {
  photo: 'photo',
  quote: 'vendor-quote',
  need: 'named-need',
};

const KIND_LABEL: Record<LineKind, string> = {
  catalog: 'catalog',
  custom: 'custom piece',
  find: 'a find',
  store: 'store buy',
};

/**
 * R-DI4: the source read a retail price and no trade price. The retail price
 * is the client price; it is never the studio's trade cost.
 */
export function retailOnlyWarning(
  retailCents: number | null | undefined,
  tradeCents: number | null | undefined,
): string | null {
  if (retailCents == null || tradeCents != null) return null;
  return `Only a retail price was read (${fmtUsd(retailCents)}). That is the client price, not your trade cost. Enter the maker's trade cost before ordering.`;
}

/** Markup over trade, shown plainly even when negative (R5). */
export function markupReading(
  tradeCents: number | null,
  clientCents: number | null,
): { text: string; belowTrade: boolean } | null {
  if (tradeCents == null || clientCents == null || tradeCents <= 0) return null;
  const pct = Math.round(((clientCents - tradeCents) / tradeCents) * 100);
  return { text: `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)}% markup`, belowTrade: clientCents < tradeCents };
}

const FIELD_CLASS =
  'min-h-11 w-full rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2.5 text-[13px] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]';
const LABEL_CLASS =
  'mb-1 block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';
const META_CLASS = 'text-[11px] text-[var(--text-muted)]';

function newIdempotencyKey(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}`;
}

interface RequestIdentity {
  fingerprint: string;
  key: string;
}

function idempotencyKeyFor(ref: { current: RequestIdentity | null }, prefix: string, request: object): string {
  const fingerprint = JSON.stringify(request);
  if (ref.current?.fingerprint !== fingerprint) {
    ref.current = { fingerprint, key: newIdempotencyKey(prefix) };
  }
  return ref.current.key;
}

interface NewMakerDraft {
  name: string;
  ordersEmail: string;
  website: string;
  specialty: string;
}

const textOrNull = (value: string) => (value.trim() ? value.trim() : null);

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function LineCard({
  projectId,
  source,
  rooms,
  boards,
  placeholders = [],
  onDone,
}: {
  projectId: string;
  source: LineCardSource;
  rooms: Array<{ id: string; name: string }>;
  boards: ProposalBoardSummary[];
  placeholders?: Array<{ id: string; name: string }>;
  onDone: (result: string) => void;
}) {
  const pick = source.pick;
  const placeProduct = usePlaceProductInProjectV2();
  const createNeed = useCreateNamedProjectNeed();
  const resolveVendor = useResolveOrCreateVendor();
  const upsertAccount = useUpsertStudioVendorAccount();
  const setCommercials = useSetFfeLineCommercials({ errorSurface: 'inline' });
  const setSpec = useSetFfeLineSpecFields();
  const { data: studioId } = useProjectRecordedStudio(projectId);
  const { data: canSeeMargin } = useCanSeeStudioMargin(studioId ?? null);
  const { data: prefill } = useLineCardProductPrefill(pick?.productId ?? null);

  const [name, setName] = useState(pick?.name ?? '');
  const [kind, setKind] = useState<LineKind>(ROAD_KIND[source.road]);
  const [maker, setMaker] = useState<{ id: string; name: string } | null>(null);
  const [choosingMaker, setChoosingMaker] = useState(false);
  const [newMaker, setNewMaker] = useState<NewMakerDraft | null>(null);
  const [seller, setSeller] = useState({ name: '', where: '', howPaid: '' });
  const [sku, setSku] = useState('');
  const [finish, setFinish] = useState('');
  const [dimensions, setDimensions] = useState<Record<string, unknown> | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [tradeInput, setTradeInput] = useState(centsToInput(pick?.priceTradeCents ?? null));
  const [assignment, setAssignment] = useState<FfeAssignmentScope>(pick?.scopeRoomId ? 'room' : 'unassigned');
  const [roomId, setRoomId] = useState(pick?.scopeRoomId ?? '');
  const [boardId, setBoardId] = useState('');
  const [disposition, setDisposition] = useState<Exclude<FfeDesignDisposition, 'superseded'>>('candidate');
  const [duplicateMode, setDuplicateMode] = useState<FfeDuplicateMode>('reuse');
  const [placeholderSelectionId, setPlaceholderSelectionId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestKey = useRef<RequestIdentity | null>(null);
  const prefilledFrom = useRef<string | null>(null);

  // Pre-fill once from what the source captured; her edits are never overwritten.
  useEffect(() => {
    if (!prefill || prefilledFrom.current === prefill.productId) return;
    prefilledFrom.current = prefill.productId;
    if (prefill.vendorId) setMaker({ id: prefill.vendorId, name: pick?.vendorName ?? 'Maker on the product' });
    setSku(prefill.sku ?? '');
    setFinish(prefill.finish ?? '');
    setDimensions(prefill.dimensions);
    setTradeInput(centsToInput(prefill.tradeCents));
  }, [prefill, pick?.vendorName]);

  const retailCents = pick ? (prefill?.retailCents ?? pick.priceCents ?? null) : null;
  const sourceTradeCents = pick ? (prefill ? prefill.tradeCents : (pick.priceTradeCents ?? null)) : null;
  const tradeCents = parseDollarsToCents(tradeInput);
  const clientCents = kind === 'catalog' ? retailCents : null;
  const isFind = kind === 'find';
  const sourceUrl = prefill?.sourceUrl ?? null;
  const imageUrl = prefill?.imageUrl ?? pick?.imageUrl ?? null;

  const compatibleBoards = useMemo(
    () => boards.filter((board) => {
      if (board.status === 'archived') return false;
      return assignment === 'room' ? board.project_room_id === roomId : !board.project_room_id;
    }),
    [assignment, boards, roomId],
  );

  const readiness = deriveOrderReadiness(
    {
      id: 'line-card',
      design_disposition: disposition,
      item_type: source.road === 'need' ? 'tbd' : 'fixed',
      vendor_id: isFind ? null : (maker?.id ?? (newMaker?.name.trim() ? 'new-maker' : null)),
      unit_price_cents: clientCents,
    } as OrderLineInput,
    { isCommercialOrigin: false },
  );

  const retailWarning = pick && !tradeCents ? retailOnlyWarning(retailCents, sourceTradeCents) : null;
  const markup = canSeeMargin ? markupReading(tradeCents, clientCents) : null;

  const chooseMaker = (option: MakerOption) => {
    setChoosingMaker(false);
    if (option.kind === 'vendor') {
      setMaker({ id: option.id, name: option.name });
      setNewMaker(null);
    } else {
      setMaker(null);
      setNewMaker({ name: option.name, ordersEmail: '', website: '', specialty: '' });
    }
  };

  const chooseAssignment = (next: FfeAssignmentScope) => {
    setAssignment(next);
    setBoardId('');
    if (next !== 'room') setRoomId('');
  };

  const canSave = Boolean(pick || name.trim()) && !(assignment === 'room' && !roomId) && !saving;

  const save = async () => {
    if (!canSave) return;
    setError(null);
    setSaving(true);
    try {
      // R-PB4: resolve the shared maker by website, then name, before any create.
      let vendorId = isFind ? null : (maker?.id ?? null);
      if (!isFind && !vendorId && newMaker?.name.trim()) {
        vendorId = await resolveVendor.mutateAsync({
          name: newMaker.name.trim(),
          website: textOrNull(newMaker.website),
        });
        const ordersEmail = textOrNull(newMaker.ordersEmail);
        const specialty = textOrNull(newMaker.specialty);
        if (studioId && (ordersEmail || specialty)) {
          await upsertAccount.mutateAsync({
            organizationId: studioId,
            vendorId,
            request: {
              ...(ordersEmail ? { ordersEmailOverride: ordersEmail } : {}),
              ...(specialty ? { notes: `Specialty: ${specialty}` } : {}),
            },
          });
        }
        setMaker({ id: vendorId, name: newMaker.name.trim() });
        setNewMaker(null);
      }

      const routing = {
        projectId,
        assignmentScope: assignment,
        roomId: assignment === 'room' ? roomId : null,
        boardId: boardId || null,
        disposition,
      };
      const qty = Math.max(1, Math.round(Number(quantity) || 1));
      let response;
      if (pick) {
        const request = {
          ...routing,
          productId: pick.productId,
          captureId: pick.captureId ?? null,
          quantity: qty,
          itemType: 'fixed' as const,
          duplicateMode,
          placeholderSelectionId: duplicateMode === 'hold' ? null : placeholderSelectionId || null,
          configurationId: pick.configurationSelection?.savedConfigurationId ?? null,
          roleConfigurationIdentity: 'default',
        };
        response = await placeProduct.mutateAsync({
          ...request,
          idempotencyKey: idempotencyKeyFor(requestKey, 'place', request),
        });
      } else {
        const request = {
          ...routing,
          name: name.trim(),
          quantity: qty,
          itemType: source.road === 'need' ? ('tbd' as const) : ('fixed' as const),
          source: kind === 'catalog' ? (ROAD_SOURCE[source.road] ?? 'project-add') : KIND_SOURCE[kind],
          ...(isFind && (seller.name.trim() || seller.where.trim() || seller.howPaid.trim())
            ? { sourceMetadata: { seller: { name: seller.name.trim(), where: seller.where.trim(), howPaid: seller.howPaid.trim() } } }
            : {}),
        };
        response = await createNeed.mutateAsync({
          ...request,
          idempotencyKey: idempotencyKeyFor(requestKey, 'need', request),
        });
      }
      ffeEvents.routingChosen({
        project_id: projectId,
        assignment_scope: assignment,
        has_board: Boolean(boardId),
        disposition,
      });
      ffeEvents.placementCompleted({
        project_id: projectId,
        selection_id: response.selectionId,
        placement_id: response.placementId,
        outcome: response.outcome,
      });

      // A reused or held selection is not this card's line: leave it alone.
      const itemId = response.selectionId;
      if (itemId && (response.outcome === 'created' || response.outcome === 'filled')) {
        const commercials: { vendorId?: string; tradePriceCents?: number } = {};
        if (vendorId && vendorId !== prefill?.vendorId) commercials.vendorId = vendorId;
        if (tradeCents != null && tradeCents !== sourceTradeCents) commercials.tradePriceCents = tradeCents;
        if (Object.keys(commercials).length > 0) {
          await setCommercials.mutateAsync({ itemId, projectId, ...commercials });
        }
        const base: LineCardProductPrefill | null | undefined = pick ? prefill : null;
        const spec: { sku?: string | null; finish?: string | null; dimensions?: Record<string, unknown> | null } = {};
        if (textOrNull(sku) !== (base?.sku ?? null)) spec.sku = textOrNull(sku);
        if (textOrNull(finish) !== (base?.finish ?? null)) spec.finish = textOrNull(finish);
        if (JSON.stringify(dimensions ?? null) !== JSON.stringify(base?.dimensions ?? null)) spec.dimensions = dimensions;
        if (Object.keys(spec).length > 0) {
          await setSpec.mutateAsync({ projectId, itemId, ...spec });
        }
      }
      const outcomeCopy = {
        created: 'Put on the schedule',
        reused: 'Reused selection',
        filled: 'Filled placeholder',
        held: 'Held for duplicate review',
      }[response.outcome];
      onDone(`${outcomeCopy} · ${pick?.name ?? name.trim()}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The line could not be saved.');
      ffeEvents.failed({ project_id: projectId, operation: 'place', reason_code: 'rpc_error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-line-card>
      <div className="mb-4 flex gap-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[3px] border border-[var(--color-pearl)] bg-[var(--doc-sheet-2)]">
          {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          {pick ? (
            <p className="font-heading text-[20px] leading-tight text-[var(--color-charcoal)]">{pick.name}</p>
          ) : (
            <label>
              <span className="sr-only">Name</span>
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={source.road === 'need' ? 'Pair of reading chairs' : 'Name the piece'}
                className={`${FIELD_CLASS} font-heading text-[18px]`}
              />
            </label>
          )}
          {sourceUrl ? (
            <a href={sourceUrl} target="_blank" rel="noreferrer" className={`${META_CLASS} mt-1 block truncate underline`}>
              {hostOf(sourceUrl) ?? sourceUrl}
            </a>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {isFind ? (
          <fieldset className="sm:col-span-2">
            <legend className={LABEL_CLASS}>Seller</legend>
            <p className={`${META_CLASS} mb-2`}>One-time seller — name, where, how paid.</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <label><span className="sr-only">Seller name</span><input aria-label="Seller name" value={seller.name} onChange={(e) => setSeller({ ...seller, name: e.target.value })} placeholder="Name" className={FIELD_CLASS} /></label>
              <label><span className="sr-only">Where</span><input aria-label="Where" value={seller.where} onChange={(e) => setSeller({ ...seller, where: e.target.value })} placeholder="Where" className={FIELD_CLASS} /></label>
              <label><span className="sr-only">How paid</span><input aria-label="How paid" value={seller.howPaid} onChange={(e) => setSeller({ ...seller, howPaid: e.target.value })} placeholder="How paid" className={FIELD_CLASS} /></label>
            </div>
          </fieldset>
        ) : (
          <div className="sm:col-span-2">
            <span className={LABEL_CLASS}>Maker</span>
            {choosingMaker || (!maker && !newMaker) ? (
              <MakerSearch disabled={saving} autoFocus={choosingMaker} onChoose={chooseMaker} onCancel={() => setChoosingMaker(false)} />
            ) : maker ? (
              <p className="flex min-h-11 items-center gap-3 text-[13px] text-[var(--color-charcoal)]">
                <span data-testid="line-card-maker">{maker.name}</span>
                <button type="button" onClick={() => setChoosingMaker(true)} className="text-[11px] text-[var(--color-clay-ink)] underline">Change maker</button>
              </p>
            ) : null}
            {newMaker && !choosingMaker && (
              <fieldset className="mt-2 border-l-2 border-[var(--color-pearl)] pl-3">
                <legend className={LABEL_CLASS}>New maker</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label><span className={LABEL_CLASS}>Name</span><input value={newMaker.name} onChange={(e) => setNewMaker({ ...newMaker, name: e.target.value })} className={FIELD_CLASS} /></label>
                  <label><span className={LABEL_CLASS}>Orders email</span><input type="email" value={newMaker.ordersEmail} onChange={(e) => setNewMaker({ ...newMaker, ordersEmail: e.target.value })} className={FIELD_CLASS} /></label>
                  <label><span className={LABEL_CLASS}>Website</span><input value={newMaker.website} onChange={(e) => setNewMaker({ ...newMaker, website: e.target.value })} placeholder="hale-upholstery.com" className={FIELD_CLASS} /></label>
                  <label><span className={LABEL_CLASS}>Specialty</span><input value={newMaker.specialty} onChange={(e) => setNewMaker({ ...newMaker, specialty: e.target.value })} className={FIELD_CLASS} /></label>
                </div>
                <p className={`${META_CLASS} mt-2`}>Saved to your studio&apos;s makers. Patina looks for this maker by website, then by name, before adding one.</p>
              </fieldset>
            )}
          </div>
        )}

        <label><span className={LABEL_CLASS}>SKU</span><input value={sku} onChange={(e) => setSku(e.target.value)} className={FIELD_CLASS} /></label>
        <label><span className={LABEL_CLASS}>Finish</span><input value={finish} onChange={(e) => setFinish(e.target.value)} className={FIELD_CLASS} /></label>
        <div className="sm:col-span-2">
          <span className={LABEL_CLASS}>Dimensions</span>
          <DimensionFields value={dimensions} onChange={setDimensions} disabled={saving} />
        </div>
        <label><span className={LABEL_CLASS}>Quantity</span><input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className={FIELD_CLASS} /></label>
        <label>
          <span className={LABEL_CLASS}>Trade cost</span>
          <input inputMode="decimal" value={tradeInput} onChange={(e) => setTradeInput(e.target.value)} placeholder="each" className={FIELD_CLASS} />
        </label>
        {canSeeMargin && (
          <div data-testid="line-card-client-price">
            <span className={LABEL_CLASS}>Client price</span>
            {clientCents != null ? (
              <p className="min-h-11 pt-2 text-[13px] text-[var(--color-charcoal)]">
                {fmtUsd(clientCents)} each <span className={META_CLASS}>· read from the source</span>
              </p>
            ) : (
              <p className={`${META_CLASS} min-h-11 pt-2`}>Not read from the source. It is set on the line once priced.</p>
            )}
            {markup && <p className={META_CLASS}>{markup.text}</p>}
          </div>
        )}
        {prefill?.leadTimeWeeks != null && (
          <p className={META_CLASS}><span className={LABEL_CLASS}>Lead time</span>{prefill.leadTimeWeeks} weeks</p>
        )}
      </div>

      {retailWarning && <p role="note" data-testid="retail-as-trade-warning" className="mt-3 text-[11px] text-[var(--color-clay-ink)]">{retailWarning}</p>}
      {markup?.belowTrade && (
        <p role="note" className="mt-2 text-[11px] text-[var(--color-clay-ink)]">The client price is below trade cost. The studio would sell this under what it pays.</p>
      )}

      <fieldset className="mt-4">
        <legend className={LABEL_CLASS}>Kind</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--color-charcoal)]">
          {(['catalog', 'custom', 'find', 'store'] as const).map((value) => (
            <label key={value} className="flex min-h-11 items-center gap-1.5">
              <input type="radio" name="line-kind" checked={kind === value} onChange={() => setKind(value)} disabled={Boolean(pick) && value !== 'catalog'} />
              {KIND_LABEL[value]}
            </label>
          ))}
          <label className="flex min-h-11 items-center gap-1.5 text-[var(--text-muted)]">
            <input type="radio" name="line-kind" disabled aria-describedby="line-kind-patina-note" />
            from Patina <span id="line-kind-patina-note" className={META_CLASS}>(not yet)</span>
          </label>
        </div>
      </fieldset>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <fieldset className="sm:col-span-2">
          <legend className={LABEL_CLASS}>Place in</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {(['unassigned', 'throughout', 'room'] as const).map((scope) => (
              <button
                key={scope}
                type="button"
                aria-pressed={assignment === scope}
                onClick={() => chooseAssignment(scope)}
                className={`min-h-11 rounded-[3px] border px-2 text-[11px] capitalize ${assignment === scope ? 'border-[var(--color-clay)] text-[var(--color-charcoal)]' : 'border-[var(--color-pearl)] text-[var(--text-muted)]'}`}
              >
                {scope === 'unassigned' ? 'Unsorted' : scope}
              </button>
            ))}
          </div>
        </fieldset>
        {assignment === 'room' && (
          <label>
            <span className={LABEL_CLASS}>Room</span>
            <select value={roomId} onChange={(event) => { setRoomId(event.target.value); setBoardId(''); }} className={FIELD_CLASS}>
              <option value="">Choose room</option>
              {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>
          </label>
        )}
        <label>
          <span className={LABEL_CLASS}>Design status</span>
          <select value={disposition} onChange={(event) => setDisposition(event.target.value as Exclude<FfeDesignDisposition, 'superseded'>)} className={FIELD_CLASS}>
            <option value="candidate">Candidate</option>
            <option value="selected">Selected</option>
            <option value="alternate">Alternate</option>
            <option value="not_selected">Not selected</option>
          </select>
        </label>
        <label>
          <span className={LABEL_CLASS}>Optional board placement</span>
          <select value={boardId} onChange={(event) => setBoardId(event.target.value)} className={FIELD_CLASS}>
            <option value="">No board</option>
            {compatibleBoards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}
          </select>
        </label>
      </div>

      <p data-testid="line-card-readiness" className={`${META_CLASS} mt-4`}>
        {readiness.ready ? 'Orderable.' : `Orderable once it has: ${readiness.reasons.map((reason) => reason.replace(/^Needs /, '').replace(/^Not selected yet$/, "the client's yes")).join(' · ')}`}
      </p>

      {pick && (
        <>
          <fieldset className="mt-4">
            <legend className={LABEL_CLASS}>If this product is already in the project</legend>
            <div className="grid grid-cols-3 gap-1.5">
              <button type="button" aria-pressed={duplicateMode === 'reuse'} onClick={() => setDuplicateMode('reuse')} className={`${FIELD_CLASS} ${duplicateMode === 'reuse' ? 'border-[var(--color-clay)]' : ''}`}>Reuse selection</button>
              <button type="button" aria-pressed={duplicateMode === 'create'} onClick={() => setDuplicateMode('create')} className={`${FIELD_CLASS} ${duplicateMode === 'create' ? 'border-[var(--color-clay)]' : ''}`}>Separate need</button>
              <button type="button" aria-pressed={duplicateMode === 'hold'} onClick={() => { setDuplicateMode('hold'); setPlaceholderSelectionId(''); }} className={`${FIELD_CLASS} ${duplicateMode === 'hold' ? 'border-[var(--color-clay)]' : ''}`}>Hold</button>
            </div>
          </fieldset>
          {placeholders.length > 0 && duplicateMode !== 'hold' && (
            <label className="mt-3 block">
              <span className={LABEL_CLASS}>Optional placeholder to fill</span>
              <select value={placeholderSelectionId} onChange={(event) => setPlaceholderSelectionId(event.target.value)} className={FIELD_CLASS}>
                <option value="">Create or reuse normally</option>
                {placeholders.map((placeholder) => <option key={placeholder.id} value={placeholder.id}>{placeholder.name}</option>)}
              </select>
            </label>
          )}
        </>
      )}

      <DocumentActionGroup surfaceKey="project" regionKey="add-to-project" className="mt-4 justify-end">
        <DocumentAction actionKey="put-line-on-schedule" variant="secondary" disabled={!canSave} loading={saving} onClick={() => void save()}>
          Put it on the schedule
        </DocumentAction>
      </DocumentActionGroup>
      {error && <p role="alert" className="mt-3 text-[11px] text-[var(--color-clay-ink)]">{error}</p>}
    </div>
  );
}
