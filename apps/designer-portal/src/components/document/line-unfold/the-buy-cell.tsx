'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useFindVendorMatch,
  useProductPrices,
  useResolveOrCreateVendor,
  useSetFfeLineCommercials,
  useVendors,
  type VendorMatch,
} from '@patina/supabase';
import { centsToInput, parseDollarsToCents } from '@/lib/currency-ui';
import { fmtUsd } from '@/lib/document/format';
import { FOCUS_FFE_LINE_EVENT, type FocusFfeLineRequest } from '@/lib/document/registry';
import { DocumentAction } from '../document-action';
import { ComPiece } from '../buying/com-piece';
import { CellSub, FIELD_CLS, LABEL_CLS, UnfoldCell } from './cell';
import { LineSamples } from './sample-request';

type FFERow = any;

export type MakerOption = { kind: 'vendor'; id: string; name: string } | { kind: 'add'; name: string };

/**
 * R-PB4: an added maker resolves an existing shared vendors row first. `add`
 * looks the name up (find_vendor_match); on a match it holds the match for the
 * designer to confirm with "Use it" and resolves to null, otherwise it creates
 * the row (resolve_or_create_vendor) and resolves to it.
 */
export function useAddMaker() {
  const find = useFindVendorMatch({ errorSurface: 'inline' });
  const resolve = useResolveOrCreateVendor({ errorSurface: 'inline' });
  const [match, setMatch] = useState<VendorMatch | null>(null);
  const add = async (name: string): Promise<VendorMatch | null> => {
    setMatch(null);
    const found = await find.mutateAsync({ name });
    if (found) {
      setMatch(found);
      return null;
    }
    const id = await resolve.mutateAsync({ name });
    return { id, name: name.trim() };
  };
  return {
    add,
    match,
    clearMatch: () => setMatch(null),
    isPending: find.isPending || resolve.isPending,
  };
}

/** "Hewn Woodworks is already in Patina. Use it." */
export function MakerMatchLine({
  match,
  disabled,
  onUse,
}: {
  match: VendorMatch;
  disabled: boolean;
  onUse: (match: VendorMatch) => void;
}) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-[var(--color-charcoal)]">
      <span>{match.name} is already in Patina.</span>
      <DocumentAction
        actionKey="use-matched-maker"
        surfaceKey="project"
        regionKey="ffe-commercials"
        variant="tertiary"
        disabled={disabled}
        onClick={() => onUse(match)}
      >
        Use it
      </DocumentAction>
    </p>
  );
}

/**
 * C-05: the maker search, mounted only while choosing so the vendors read
 * runs only then. Offers "Add" when no maker of that name exists yet; the add
 * resolves an existing shared maker first (useAddMaker, R-PB4).
 */
export function MakerSearch({
  disabled,
  autoFocus,
  onChoose,
  onCancel,
}: {
  disabled: boolean;
  autoFocus: boolean;
  onChoose: (option: MakerOption) => void;
  onCancel?: () => void;
}) {
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);
  const listId = `line-maker-${useId()}`;
  const term = search.trim();
  const { data } = useVendors(term ? { search: term } : undefined, {
    page: 1,
    pageSize: 8,
  });
  const vendors = ((data as { data?: { id: string; name: string }[] } | undefined)
    ?.data ?? []) as { id: string; name: string }[];
  const options: MakerOption[] = term
    ? [
        ...vendors.map((v) => ({ kind: 'vendor' as const, id: v.id, name: v.name })),
        ...(vendors.some((v) => v.name.trim().toLowerCase() === term.toLowerCase())
          ? []
          : [{ kind: 'add' as const, name: term }]),
      ]
    : [];

  const choose = (option: MakerOption | undefined) => {
    if (!option) return;
    setSearch('');
    setActive(0);
    onChoose(option);
  };

  return (
    <div className="relative min-w-0 flex-1">
      <input
        role="combobox"
        aria-label="Maker"
        aria-expanded={options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
        ref={inputRef}
        value={search}
        placeholder="Search makers…"
        disabled={disabled}
        onChange={(e) => {
          setSearch(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            setSearch('');
            onCancel?.();
          } else if (e.key === 'ArrowDown' && options.length) {
            e.preventDefault();
            setActive((i) => Math.min(options.length - 1, i + 1));
          } else if (e.key === 'ArrowUp' && options.length) {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (e.key === 'Enter' && options.length) {
            e.preventDefault();
            choose(options[active]);
          }
        }}
        className={`w-full ${FIELD_CLS}`}
      />
      {options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Makers"
          className="absolute z-10 mt-1 max-h-[220px] w-full min-w-[12rem] overflow-y-auto rounded-[6px] border border-[var(--color-pearl)] bg-white py-1"
        >
          {options.map((option, i) => (
            <li
              key={option.kind === 'vendor' ? option.id : 'add'}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(option)}
              className={`cursor-pointer px-3 py-1.5 text-[11.5px] text-[var(--color-charcoal)] hover:bg-[var(--doc-sheet-2)] ${
                i === active ? 'bg-[var(--doc-sheet-2)]' : ''
              }`}
            >
              {option.kind === 'vendor' ? option.name : `Add a maker: “${option.name}”`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * 511-R1: the line `Add the maker` is landing on. The landing names it before
 * the line unfolds, so the cell reads it as it mounts; a cell already mounted
 * hears the landing itself.
 */
export const makerLandingPending: { itemId: string | null } = { itemId: null };

/**
 * C-05 (S5): the buy's commercials — who makes it and what it costs the
 * studio. Editable only while the line is on no purchase order; after that it
 * changes through the PO. The client price and markup are never shown or
 * edited here (R1, R5, R8) — `set_project_ffe_line_commercials` refuses them.
 * Where the buy is otherwise read-only (install mode), `Add the maker` still
 * lands on a maker field (511-R1); the trade cost stays read-only there.
 */
function LineCommercials({
  item,
  po,
  projectId,
  canEdit,
}: {
  item: FFERow;
  po: FFERow | null;
  projectId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const commercials = useSetFfeLineCommercials({ errorSurface: 'inline' });
  const addMaker = useAddMaker();
  // The id, not the embed: a query shape without the PO join (or a partial
  // cache) leaves `po` null on a line that is already on a purchase order.
  const onPo = !!item.purchase_order_id;
  const editable = canEdit && !onPo;
  const pending = commercials.isPending || addMaker.isPending;
  const [landing, setLanding] = useState(() => makerLandingPending.itemId === String(item.id));
  useEffect(() => {
    if (landing && makerLandingPending.itemId === String(item.id)) makerLandingPending.itemId = null;
  }, [landing, item.id]);
  useEffect(() => {
    const onLand = (event: Event) => {
      const detail = (event as CustomEvent<Partial<FocusFfeLineRequest> | undefined>).detail;
      if (detail?.cell === 'maker' && detail.itemId === String(item.id)) setLanding(true);
    };
    window.addEventListener(FOCUS_FFE_LINE_EVENT, onLand);
    return () => window.removeEventListener(FOCUS_FFE_LINE_EVENT, onLand);
  }, [item.id]);
  const makerLanding = landing && !editable && !onPo;

  const storedTrade: number | null = item.trade_price_cents ?? null;
  const [trade, setTrade] = useState(() => centsToInput(storedTrade));
  useEffect(() => {
    setTrade(centsToInput(storedTrade));
  }, [storedTrade]);
  // The joined vendor name lands with the refetch; hold the pick meanwhile.
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // §2.4: a line off the catalog (or a product with no trade price) was
  // placed with retail written as trade. Warn, never block (R-DI4 pending).
  const { data: productPrices } = useProductPrices(
    editable ? [item.product_id] : [],
  );
  const offCatalog = !item.product_id
    ? true
    : productPrices
      ? productPrices.get(item.product_id)?.price_trade == null
      : false;
  const retail: number | null = item.unit_price_cents ?? null;
  const tradeMatchesRetail =
    editable &&
    offCatalog &&
    storedTrade != null &&
    retail != null &&
    retail > 0 &&
    storedTrade === retail;

  const save = (request: { vendorId?: string; tradePriceCents?: number }) =>
    commercials
      .mutateAsync({ itemId: item.id, projectId, ...request })
      .then(() => {
        void qc.invalidateQueries({ queryKey: ['document-state'] });
      });

  const chooseMaker = (option: MakerOption | VendorMatch) => {
    if (pending) return;
    setError(null);
    let resolve: Promise<VendorMatch | null>;
    if ('id' in option) {
      addMaker.clearMatch();
      resolve = Promise.resolve({ id: option.id, name: option.name });
    } else {
      resolve = addMaker.add(option.name);
    }
    resolve
      .then((vendor) => {
        // A match waits on "Use it".
        if (!vendor) return;
        if (vendor.id === item.vendor_id) {
          setChanging(false);
          return;
        }
        return save({ vendorId: vendor.id }).then(() => {
          setPicked(vendor);
          setChanging(false);
        });
      })
      .catch((e: Error) => setError(e.message || 'The maker could not be saved.'));
  };

  const commitTrade = () => {
    if (pending) return;
    const raw = trade.replace(/[$,\s]/g, '');
    if (!raw) {
      // The RPC records a cost; it does not clear one.
      setTrade(centsToInput(storedTrade));
      return;
    }
    const cents = parseDollarsToCents(raw);
    if (cents === null) {
      setError('Enter the trade cost in dollars, e.g. 1200 or 1200.50.');
      return;
    }
    if (cents === storedTrade) return;
    setError(null);
    save({ tradePriceCents: cents }).catch((e: Error) =>
      setError(e.message || 'The trade cost could not be saved.'),
    );
  };

  const makerName =
    picked && picked.id === item.vendor_id ? picked.name : item.vendor_name;
  const poLabel = onPo
    ? (po?.po_number ?? po?.vendor_po_number ?? po?.sidemark ?? 'a purchase order')
    : null;

  const searching = changing || !item.vendor_id;
  const makerField = (
    <div className="flex min-w-0 flex-1 basis-full items-baseline gap-2">
      <span className={LABEL_CLS}>Maker</span>
      {searching ? (
        <MakerSearch
          disabled={pending}
          autoFocus={changing}
          onChoose={chooseMaker}
          onCancel={
            item.vendor_id
              ? () => {
                  addMaker.clearMatch();
                  setChanging(false);
                }
              : undefined
          }
        />
      ) : (
        <>
          <span className="min-w-0 text-[11.5px] text-[var(--color-charcoal)]">
            {makerName || 'Selected'}
          </span>
          <DocumentAction
            actionKey="change-ffe-line-maker"
            surfaceKey="project"
            regionKey="ffe-commercials"
            variant="tertiary"
            disabled={pending}
            onClick={() => setChanging(true)}
          >
            Change
          </DocumentAction>
        </>
      )}
    </div>
  );
  const makerNotes = (
    <>
      {searching && addMaker.match && (
        <MakerMatchLine match={addMaker.match} disabled={pending} onUse={chooseMaker} />
      )}
      {pending && (
        <p aria-live="polite" className="text-[11px] text-[var(--text-muted)]">
          Saving…
        </p>
      )}
    </>
  );
  const errorNote = error && !pending && (
    <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
      {error}
    </p>
  );

  if (!editable) {
    return (
      <div data-testid="line-commercials" className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {makerLanding ? (
          makerField
        ) : (
          <p className="text-[11px] text-[var(--color-charcoal)]">
            <span className={LABEL_CLS}>Maker</span> {makerName || 'Not recorded'}
          </p>
        )}
        <p className="text-[11px] text-[var(--color-charcoal)]">
          <span className={LABEL_CLS}>Trade cost</span>{' '}
          {storedTrade != null ? fmtUsd(storedTrade) : 'Not recorded'}
        </p>
        {poLabel && (
          <p className={LABEL_CLS}>On {poLabel}</p>
        )}
        {makerLanding && (
          <div className="basis-full">
            {makerNotes}
            {errorNote}
          </div>
        )}
      </div>
    );
  }

  return (
    <div data-testid="line-commercials">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
        {makerField}
        <label className="flex items-baseline gap-2">
          <span className={LABEL_CLS}>Trade cost</span>
          <span className="text-[11px] text-[var(--text-muted)]">$</span>
          <input
            aria-label="Trade cost"
            inputMode="decimal"
            value={trade}
            placeholder="0"
            disabled={pending}
            onChange={(e) => setTrade(e.target.value)}
            onBlur={commitTrade}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitTrade();
              }
            }}
            className={`w-24 ${FIELD_CLS}`}
          />
        </label>
      </div>
      {makerNotes}
      {tradeMatchesRetail && (
        <p className="text-[11px] text-[var(--color-charcoal)]">
          Trade cost matches retail. Confirm the studio&rsquo;s cost with the maker.
        </p>
      )}
      {errorNote}
    </div>
  );
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The spec facts the line carries: the configuration chosen (the same
 * `spec.configuration_snapshot` the artifact plate reads) and the count.
 */
function specFacts(item: FFERow): string {
  const rawSpec = Array.isArray(item.spec) ? item.spec[0] : item.spec;
  const snapshot = isRecord(rawSpec) ? rawSpec.configuration_snapshot : null;
  const selections: unknown[] =
    isRecord(snapshot) && Array.isArray(snapshot.selections)
      ? snapshot.selections
      : [];
  const values = selections.flatMap((s) =>
    isRecord(s) && typeof s.valueLabel === 'string' && s.valueLabel.trim()
      ? [s.valueLabel.trim()]
      : [],
  );
  return [...values, `×${item.quantity ?? 1}`].join(' · ');
}

/** C-14 cell 1 — the buy: maker, trade cost (the P0-7 editor), spec facts. */
export function TheBuyCell({
  item,
  po,
  projectId,
  canEdit,
}: {
  item: FFERow;
  po: FFERow | null;
  projectId: string;
  canEdit: boolean;
}) {
  return (
    <UnfoldCell head="The buy" testId="line-buy-cell">
      <LineCommercials
        item={item}
        po={po}
        projectId={projectId}
        canEdit={canEdit}
      />
      <div className="mt-1">
        <CellSub>{specFacts(item)}</CellSub>
      </div>
      {/* C-24: the frame-and-fabric pair, the COM facts, the submittals. */}
      <ComPiece item={item} projectId={projectId} canEdit={canEdit} />
      {/* C-35: memo/sample requests against this line, with a return-by. */}
      <LineSamples
        projectId={projectId}
        itemId={item.id}
        vendorId={item.vendor_id ?? null}
        vendorName={item.vendor_name ?? null}
        canEdit={canEdit}
      />
    </UnfoldCell>
  );
}
