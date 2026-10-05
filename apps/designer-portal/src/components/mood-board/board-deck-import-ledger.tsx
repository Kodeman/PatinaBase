'use client';

/**
 * Bring in a Deck (US-15 W3) — the review ledger: a wide DocSheet drawer,
 * grouped by slide, that sets each piece the resolver found against her
 * picture and lets her decide it (Keep · Swap · Paste a link · Keep as
 * reference · Unkeep). The canvas inspector shows the same acts for a
 * selected to-confirm pin (DeckPieceActs): the ledger and the canvas are two
 * views of one state. The foot puts the kept pieces on the schedule; nothing
 * is ever sent to a vendor from here.
 */

import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { Presentation } from 'lucide-react';
import type { BoardOwnerRef, DeckImportItem, EditableMoodBoardItem } from '@patina/types';
import { usePromoteBoardReferenceToSelection } from '@patina/supabase';
import { DocSheet } from '@/components/document/overlays/doc-sheet';
import { LedgerFrontMatter } from '@/components/document/ledger-front-matter';
import { ProductPickerModal } from '@/components/portal/proposals/product-picker-modal';
import { Button, Input } from '@/components/ui/controls';
import {
  DECK_REVIEW_COPY,
  candidateView,
  captionSearchText,
  frontMatterStats,
  howPhrase,
  isBulkKeepEligible,
  reviewPieces,
  rowState,
  shownCandidate,
  type DeckImportDecisions,
  type DeckProductMap,
} from '@/hooks/use-board-deck-import-review';
import {
  WEB_MATCH_COPY,
  WEB_MATCH_MAX_ITEMS,
  useBoardWebMatch,
  type BoardWebMatch,
} from '@/hooks/use-board-web-match';
import { deckPinsToSchedule } from '@/lib/scope/board-schedule';
import {
  pinName,
  promotePinsInOrder,
  type PromoteAllResult,
  type PromoteDisposition,
} from './board-promote-all-panel';

type ActsMode = 'idle' | 'swap' | 'link' | 'pick';

const price = (cents: number | null) =>
  cents == null ? null : `$${Math.round(cents / 100).toLocaleString('en-US')}`;

function cropUrl(pin: EditableMoodBoardItem | undefined): string | null {
  if (!pin) return null;
  const original = pin.data?.original_image_url;
  return (typeof original === 'string' && original) || pin.imageUrl || null;
}

function deckOf(pin: EditableMoodBoardItem): { import_id?: unknown; slide_index?: unknown; state?: unknown } {
  const deck = pin.data?.deck_import;
  return deck && typeof deck === 'object' ? (deck as Record<string, unknown>) : {};
}

/** Her pictures on one slide that a link could still take. */
export function slideCrops(
  pins: readonly EditableMoodBoardItem[],
  importId: string,
  slideIndex: number,
): EditableMoodBoardItem[] {
  return pins.filter((pin) => {
    const deck = deckOf(pin);
    return deck.import_id === importId && deck.slide_index === slideIndex &&
      (pin.type === 'capture' || pin.type === 'image') && deck.state !== 'kept' && Boolean(cropUrl(pin));
  });
}

/**
 * The acts for one piece. Used by each ledger row and by the canvas
 * inspector; `mode` is controlled by the ledger (keyboard) and local when
 * the inspector renders it.
 */
export function DeckPieceActs({
  item,
  products,
  decisions,
  pins,
  mode: controlledMode,
  onModeChange,
  pickIndex = 0,
  compact = false,
}: {
  item: DeckImportItem;
  products: DeckProductMap;
  decisions: DeckImportDecisions;
  pins: readonly EditableMoodBoardItem[];
  mode?: ActsMode;
  onModeChange?: (mode: ActsMode) => void;
  pickIndex?: number;
  compact?: boolean;
}) {
  const [localMode, setLocalMode] = useState<ActsMode>('idle');
  const mode = controlledMode ?? localMode;
  const setMode = onModeChange ?? setLocalMode;
  const [url, setUrl] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const state = rowState(item);
  const busy = decisions.busyItemId === item.id;
  const error = decisions.error?.itemId === item.id ? decisions.error.message : null;
  const shown = shownCandidate(item);
  const alternates = item.candidates.filter((c) => c !== shown).slice(0, 2);
  const crops = state === 'needs_picture' ? slideCrops(pins, item.importId, item.slideIndex) : [];

  if (state === 'finding') {
    return <p className="font-mono text-[10px] text-[var(--text-muted)]">{DECK_REVIEW_COPY.finding}</p>;
  }

  const act = (label: string, onClick: () => void, extra: { disabled?: boolean; title?: string; key?: string } = {}) => (
    <Button
      size="sm"
      variant={label === DECK_REVIEW_COPY.keep ? 'secondary' : 'ghost'}
      disabled={busy || extra.disabled}
      title={extra.title}
      data-deck-act={extra.key ?? label}
      onClick={onClick}
    >
      {label}
    </Button>
  );

  return (
    <div className="space-y-2" data-deck-piece-acts={item.id}>
      <div className={`flex flex-wrap gap-1 ${compact ? '' : 'justify-end'}`}>
        {state === 'needs_picture' && (
          <>
            {act(DECK_REVIEW_COPY.whichPicture, () => setMode(mode === 'pick' ? 'idle' : 'pick'), { key: 'which-picture' })}
            {act(DECK_REVIEW_COPY.keepWithoutPicture, () => void decisions.choose(item), { key: 'keep-without-picture' })}
          </>
        )}
        {state === 'to_confirm' && act(DECK_REVIEW_COPY.keep, () => void decisions.choose(item), { key: 'keep' })}
        {(state === 'to_confirm' || state === 'not_found' || state === 'kept') &&
          act(DECK_REVIEW_COPY.swap, () => setMode(mode === 'swap' ? 'idle' : 'swap'), { key: 'swap' })}
        {state !== 'kept' && state !== 'reference' &&
          act(DECK_REVIEW_COPY.pasteLink, () => setMode(mode === 'link' ? 'idle' : 'link'), { key: 'paste-link' })}
        {(state === 'to_confirm' || state === 'not_found') &&
          act(DECK_REVIEW_COPY.keepAsReference, () => void decisions.reference(item), { key: 'reference' })}
        {(state === 'kept' || state === 'reference') &&
          act(DECK_REVIEW_COPY.unkeep, () => void decisions.unkeep(item), { key: 'unkeep' })}
      </div>

      {mode === 'swap' && (
        <div className="space-y-1 border-t border-[var(--border-default)] pt-2" data-deck-swap>
          {alternates.map((candidate) => {
            const view = candidateView(candidate, products);
            return (
              <div key={candidate.rank} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="min-w-0 truncate text-[var(--text-primary)]">
                  {[view?.name ?? 'Unnamed piece', view?.maker].filter(Boolean).join(' · ')}
                  {view?.host && <span className="text-[var(--text-muted)]"> · {view.host}</span>}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void decisions.choose(item, { candidateRank: candidate.rank }).then((ok) => ok && setMode('idle'))}
                >
                  {DECK_REVIEW_COPY.keep}
                </Button>
              </div>
            );
          })}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPickerOpen(true)}>
            {DECK_REVIEW_COPY.searchLibrary}
          </Button>
        </div>
      )}

      {mode === 'link' && (
        <form
          className="flex gap-1 border-t border-[var(--border-default)] pt-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!url.trim()) return;
            void decisions.pasteLink(item, url).then((ok) => {
              if (ok) {
                setUrl('');
                setMode('idle');
              }
            });
          }}
        >
          <Input
            type="url"
            autoFocus
            value={url}
            placeholder="https://"
            aria-label={`${DECK_REVIEW_COPY.pasteLink} for this piece`}
            onChange={(event) => setUrl(event.target.value)}
          />
          <Button size="sm" variant="secondary" type="submit" disabled={busy || !url.trim()}>
            {DECK_REVIEW_COPY.keep}
          </Button>
        </form>
      )}

      {mode === 'pick' && (
        <div className="flex flex-wrap gap-1 border-t border-[var(--border-default)] pt-2" role="listbox" aria-label="Her pictures on this slide">
          {crops.length === 0 && (
            <p className="text-[11px] text-[var(--text-muted)]">No pictures left on this slide.</p>
          )}
          {crops.map((pin, index) => (
            <button
              key={pin.id}
              type="button"
              role="option"
              aria-selected={index === pickIndex}
              aria-label={`Picture ${index + 1} on slide ${item.slideIndex + 1}`}
              disabled={busy}
              data-deck-crop={pin.id}
              onClick={() => void decisions.choose(item, undefined, pin.id).then((ok) => ok && setMode('idle'))}
              className={`h-14 w-14 overflow-hidden rounded-[3px] border ${index === pickIndex ? 'border-[var(--color-clay)]' : 'border-[var(--border-default)]'} focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-clay)]`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cropUrl(pin) ?? undefined} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {error && <p role="alert" className="text-[10px] text-[var(--color-clay-ink)]">{error}</p>}

      <ProductPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        scope="library"
        initialTab="library"
        initialSearch={captionSearchText(item)}
        allowDraftCreate={false}
        configureStep={false}
        onPick={(pick) => {
          setPickerOpen(false);
          void decisions.choose(item, { productId: pick.productId }).then((ok) => ok && setMode('idle'));
        }}
      />
    </div>
  );
}

/** A piece the web search can still help: unsettled, with her picture, room for more. */
export function canSearchWeb(item: DeckImportItem): boolean {
  const state = rowState(item);
  return (state === 'not_found' || state === 'to_confirm') && item.boardItemId != null && item.candidates.length < 5;
}

/**
 * "Search the web…" — designer-pressed only. Renders nothing unless the
 * `board-web-match` flag is on and the function has a key. Reusable for
 * "Find this piece" (SQ-360): pass its useBoardWebMatch result and the item id.
 */
export function SearchTheWebButton({
  webMatch,
  itemIds,
  label = WEB_MATCH_COPY.searchPiece,
}: {
  webMatch: BoardWebMatch;
  itemIds: readonly string[];
  label?: string;
}) {
  if (!webMatch.available || itemIds.length === 0) return null;
  const searching = itemIds.some((id) => webMatch.isSearching(id));
  const nothing = itemIds.length === 1 && webMatch.nothingFound(itemIds[0]);
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={searching || nothing || webMatch.capReached}
      data-deck-web-search
      onClick={() => void webMatch.search(itemIds)}
    >
      {searching ? WEB_MATCH_COPY.searching : nothing ? WEB_MATCH_COPY.nothingFound : label}
    </Button>
  );
}

function FoundCell({ item, products }: { item: DeckImportItem; products: DeckProductMap }) {
  const view = candidateView(shownCandidate(item), products);
  if (!view) return <span className="text-[11px] text-[var(--text-muted)]">—</span>;
  return (
    <div className="flex min-w-0 items-start gap-2">
      {view.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={view.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-[3px] object-cover" />
      ) : (
        <span className="h-14 w-14 shrink-0 rounded-[3px] border border-dashed border-[var(--border-default)]" />
      )}
      <div className="min-w-0 text-[11px] leading-4">
        <p className="truncate text-[var(--text-primary)]">{view.name ?? 'Unnamed piece'}</p>
        {view.maker && <p className="truncate text-[var(--text-muted)]">{view.maker}</p>}
        <p className="truncate font-mono text-[10px] text-[var(--text-muted)]">
          {[price(view.priceCents), view.host].filter(Boolean).join(' · ')}
        </p>
      </div>
    </div>
  );
}

export function BoardDeckImportLedger({
  open,
  onClose,
  owner,
  scopeRoomId,
  importId,
  items,
  products,
  decisions,
  pins,
  onPromoted,
  sendToSchedule,
}: {
  open: boolean;
  onClose: () => void;
  owner: BoardOwnerRef;
  scopeRoomId: string | null;
  importId: string | null;
  items: readonly DeckImportItem[];
  products: DeckProductMap;
  decisions: DeckImportDecisions;
  pins: readonly EditableMoodBoardItem[];
  onPromoted: (itemId: string, selectionId: string) => void;
  /** The room's own send-to-schedule path (proposal boards). */
  sendToSchedule: (pin: EditableMoodBoardItem) => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  const pieces = useMemo(() => reviewPieces(items), [items]);
  const [active, setActive] = useState(0);
  // The mode belongs to one row: moving to another row lands in idle, and a
  // row's own act can open its mode in the same click that makes it active.
  const [heldMode, setHeldMode] = useState<{ itemId: string | null; mode: ActsMode }>({ itemId: null, mode: 'idle' });
  const [pickIndex, setPickIndex] = useState(0);
  const [disposition, setDisposition] = useState<PromoteDisposition>('selected');
  const [scheduling, setScheduling] = useState(false);
  const [scheduled, setScheduled] = useState<PromoteAllResult | null>(null);
  const [bulkKeeping, setBulkKeeping] = useState(false);
  const promote = usePromoteBoardReferenceToSelection();
  const webMatch = useBoardWebMatch(importId);
  const notFoundForWeb = pieces
    .filter((item) => rowState(item) === 'not_found' && canSearchWeb(item))
    .slice(0, WEB_MATCH_MAX_ITEMS);
  const choiceName = useId();

  const activeItem = pieces[Math.min(active, pieces.length - 1)] ?? null;
  const bulkEligible = pieces.filter(isBulkKeepEligible);
  const toSchedule = deckPinsToSchedule(pins, owner.kind);
  const pinById = useMemo(() => new Map(pins.map((pin) => [pin.id, pin])), [pins]);

  const mode: ActsMode = heldMode.itemId === activeItem?.id ? heldMode.mode : 'idle';
  const setModeFor = (itemId: string | undefined, next: ActsMode | ((current: ActsMode) => ActsMode)) =>
    setHeldMode((held) => {
      const current = held.itemId === itemId ? held.mode : 'idle';
      return { itemId: itemId ?? null, mode: typeof next === 'function' ? next(current) : next };
    });
  const setMode = (next: ActsMode | ((current: ActsMode) => ActsMode)) => setModeFor(activeItem?.id, next);
  /** Make a row active; another row's mode and picture choice are let go. */
  const activate = (index: number) => {
    const itemId = pieces[index]?.id ?? null;
    setActive(index);
    setHeldMode((held) => (held.itemId === itemId ? held : { itemId: null, mode: 'idle' }));
    if (itemId !== (activeItem?.id ?? null)) setPickIndex(0);
  };
  const activeIndex = Math.min(active, pieces.length - 1);

  const slides = useMemo(() => {
    const groups = new Map<number, DeckImportItem[]>();
    for (const item of pieces) groups.set(item.slideIndex, [...(groups.get(item.slideIndex) ?? []), item]);
    return [...groups.entries()];
  }, [pieces]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.matches('input, textarea, select') || target.isContentEditable) return;
    if (event.metaKey || event.ctrlKey || event.altKey || !activeItem) return;
    const crops = mode === 'pick' ? slideCrops(pins, activeItem.importId, activeItem.slideIndex) : [];
    const handled = (() => {
      switch (event.key) {
        case 'j':
          if (mode === 'pick') setPickIndex((i) => Math.min(i + 1, Math.max(0, crops.length - 1)));
          else activate(Math.min(activeIndex + 1, pieces.length - 1));
          return true;
        case 'k':
          if (mode === 'pick') setPickIndex((i) => Math.max(i - 1, 0));
          else activate(Math.max(activeIndex - 1, 0));
          return true;
        case 'Enter': {
          if (mode === 'pick') {
            const crop = crops[pickIndex];
            if (crop) void decisions.choose(activeItem, undefined, crop.id).then((ok) => ok && setMode('idle'));
            return true;
          }
          const state = rowState(activeItem);
          if (state === 'to_confirm') void decisions.choose(activeItem);
          else if (state === 'needs_picture') setMode('pick');
          return true;
        }
        case 's':
          if (rowState(activeItem) !== 'needs_picture') setMode((m) => (m === 'swap' ? 'idle' : 'swap'));
          return true;
        case 'l':
          setMode((m) => (m === 'link' ? 'idle' : 'link'));
          return true;
        case 'r':
          if (['to_confirm', 'not_found'].includes(rowState(activeItem))) void decisions.reference(activeItem);
          return true;
        case 'u':
          if (['kept', 'reference'].includes(rowState(activeItem))) void decisions.unkeep(activeItem);
          return true;
        default:
          return false;
      }
    })();
    if (handled) event.preventDefault();
  };

  const putOnSchedule = async () => {
    setScheduling(true);
    setScheduled(null);
    const batch = toSchedule;
    try {
      if (owner.kind === 'project') {
        setScheduled(await promotePinsInOrder({
          pins: batch,
          projectId: owner.id,
          scopeRoomId,
          disposition,
          promote: promote.mutateAsync,
          onPromoted,
        }));
      } else {
        const failures: Array<{ id: string; name: string; message: string }> = [];
        for (const pin of batch) {
          const outcome = await sendToSchedule(pin);
          if (!outcome.ok) failures.push({ id: pin.id, name: pinName(pin), message: outcome.message });
        }
        setScheduled({ attempted: batch.length, failures });
      }
    } finally {
      setScheduling(false);
    }
  };

  const orderHref = owner.kind === 'project' ? `/doc/${owner.id}` : `/drafting/${owner.id}`;

  return (
    <DocSheet open={open} onClose={onClose} title="From the deck" icon={Presentation} wide kind="deck-import-ledger">
      <div className="space-y-4 outline-none" data-deck-import-ledger tabIndex={-1} onKeyDown={onKeyDown}>
        <LedgerFrontMatter caption="The deck" stats={frontMatterStats(items)} />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
            j / k to move · Enter keep · s swap · l paste a link · r reference · u unkeep
          </p>
          {bulkEligible.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              disabled={bulkKeeping || decisions.busyItemId !== null}
              data-deck-bulk-keep
              onClick={() => {
                setBulkKeeping(true);
                void decisions.keepEveryLink(bulkEligible).finally(() => setBulkKeeping(false));
              }}
            >
              {`${DECK_REVIEW_COPY.bulkKeepLinks} · ${bulkEligible.length}`}
            </Button>
          )}
        </div>

        {slides.map(([slideIndex, rows]) => {
          const preview = importId ? slideCrops(pins, importId, slideIndex).slice(0, 4) : [];
          return (
            <section key={slideIndex} aria-label={rows[0]?.slideTitle ?? `Slide ${slideIndex + 1}`}>
              <header className="mb-1 flex items-center gap-2 border-b border-[var(--border-default)] pb-1">
                <span className="flex gap-0.5" aria-hidden>
                  {preview.map((pin) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={pin.id} src={cropUrl(pin) ?? undefined} alt="" className="h-6 w-6 rounded-[2px] object-cover" />
                  ))}
                </span>
                <h3 className="font-heading text-[13px] text-[var(--text-primary)]">
                  {rows[0]?.slideTitle ?? `Slide ${slideIndex + 1}`}
                </h3>
              </header>
              <ul>
                {rows.map((item) => {
                  const index = pieces.indexOf(item);
                  const isActive = activeItem?.id === item.id;
                  const crop = cropUrl(item.boardItemId ? pinById.get(item.boardItemId) : undefined);
                  return (
                    <li
                      key={item.id}
                      data-deck-row={item.id}
                      data-deck-row-state={rowState(item)}
                      aria-current={isActive ? 'true' : undefined}
                      onClick={() => activate(index)}
                      className={`grid grid-cols-[64px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.6fr)] items-start gap-3 border-l-2 py-2 pl-2 ${isActive ? 'border-[var(--color-clay)]' : 'border-transparent'}`}
                    >
                      {crop ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={crop} alt="Her picture from the deck" className="h-14 w-14 rounded-[3px] object-cover" />
                      ) : (
                        <span className="h-14 w-14 rounded-[3px] border border-dashed border-[var(--border-default)]" />
                      )}
                      <FoundCell item={item} products={products} />
                      <span
                        className="justify-self-start rounded-[2px] border border-[var(--border-default)] px-1.5 py-0.5 text-[10px] leading-4 text-[var(--text-muted)]"
                        data-deck-how
                      >
                        {howPhrase(item)}
                      </span>
                      <div className="space-y-1">
                        <DeckPieceActs
                          item={item}
                          products={products}
                          decisions={decisions}
                          pins={pins}
                          mode={isActive ? mode : 'idle'}
                          onModeChange={(next) => {
                            activate(index);
                            setModeFor(item.id, next);
                          }}
                          pickIndex={pickIndex}
                        />
                        {canSearchWeb(item) && (
                          <div className="flex justify-end">
                            <SearchTheWebButton webMatch={webMatch} itemIds={[item.id]} />
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        {webMatch.available && (notFoundForWeb.length > 0 || webMatch.capLine || webMatch.error) && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-default)] pt-3" data-deck-web-foot>
            <div className="text-[11px]" role="status">
              {webMatch.capLine && <p className="text-[var(--text-muted)]">{webMatch.capLine}</p>}
              {webMatch.error && <p className="text-[var(--color-clay-ink)]">{webMatch.error}</p>}
            </div>
            {notFoundForWeb.length > 0 && (
              <SearchTheWebButton
                webMatch={webMatch}
                itemIds={notFoundForWeb.map((item) => item.id)}
                label={WEB_MATCH_COPY.searchNotFound(notFoundForWeb.length)}
              />
            )}
          </div>
        )}

        {(toSchedule.length > 0 || scheduled) && (
          <footer className="space-y-2 border-t border-[var(--border-default)] pt-3" data-deck-ledger-foot>
            {toSchedule.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                {owner.kind === 'project' ? (
                  <fieldset className="flex items-center gap-3" disabled={scheduling}>
                    <legend className="sr-only">How these pieces enter the project</legend>
                    <label className="flex min-h-8 items-center gap-1.5 text-[11px] text-[var(--text-primary)]">
                      <input
                        type="radio"
                        name={choiceName}
                        checked={disposition === 'selected'}
                        onChange={() => setDisposition('selected')}
                      />
                      {DECK_REVIEW_COPY.selections}
                    </label>
                    <label className="flex min-h-8 items-center gap-1.5 text-[11px] text-[var(--text-primary)]">
                      <input
                        type="radio"
                        name={choiceName}
                        checked={disposition === 'candidate'}
                        onChange={() => setDisposition('candidate')}
                      />
                      {DECK_REVIEW_COPY.options}
                    </label>
                  </fieldset>
                ) : <span />}
                <Button variant="primary" size="sm" disabled={scheduling} onClick={() => void putOnSchedule()}>
                  {scheduling
                    ? 'Putting on the schedule…'
                    : `Put ${toSchedule.length} ${toSchedule.length === 1 ? 'piece' : 'pieces'} on the schedule`}
                </Button>
              </div>
            )}
            {scheduled && (
              <div className="space-y-1 text-[11px]">
                {scheduled.failures.length > 0 && (
                  <p role="alert" className="text-[var(--color-clay-ink)]">
                    {scheduled.failures.length} of {scheduled.attempted} could not go on the schedule:{' '}
                    {scheduled.failures.map((failure) => failure.name).join(', ')}
                  </p>
                )}
                {scheduled.attempted > scheduled.failures.length && (
                  <p className="text-[var(--text-muted)]">
                    {scheduled.attempted - scheduled.failures.length} on the schedule. Nothing is sent to a vendor from here.{' '}
                    <Link href={orderHref} className="text-[var(--color-clay-ink)] underline underline-offset-2">
                      {DECK_REVIEW_COPY.orderFromSchedule}
                    </Link>
                  </p>
                )}
              </div>
            )}
          </footer>
        )}
      </div>
    </DocSheet>
  );
}
