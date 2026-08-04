'use client';

import { useState, useEffect } from 'react';
import {
  useProducts,
  useCreateDraftProduct,
  useProposalCaptures,
  useLayerProducts,
  useLayerCounts,
  useCrossLayerSearch,
  useCaptureFromUrl,
  useCaptureProduct,
  type ProposalCapture,
  type LayerProductLayer,
  type LayerProductRow,
} from '@patina/supabase';
import type {
  ProductConfigurationComDetails,
  ProductConfigurationComponentSelection,
  ProductConfigurationMode,
  ProductConfigurationSelection,
  ProductConfigurationSummary,
} from '@patina/types';
import { useAuth } from '@/hooks/use-auth';
import { Button, FilterPill, IconButton, Input, Select } from '@/components/ui/controls';
import { PickerConfigureStep } from './picker-configure-step';

// ─── Types ────────────────────────────────────────────────────────────────────

/** A room the picked item can be targeted at. */
export interface ProductPickerRoom {
  id: string;
  name: string;
}

/**
 * One resolved specification carried out of the picker's configure step
 * (P0-2). Deliberately light: the picker confirms a selection with the server
 * but saves NO `product_configurations` row, so `savedConfigurationId` is null
 * until a project placement writes one. `selections` / `components` use the ONE
 * snapshot vocabulary shared by picker → decisions → spec → PO.
 */
export interface ProductPickConfigurationSelection {
  savedConfigurationId: string | null;
  variantId: string | null;
  optionValueIds: string[];
  selections: ProductConfigurationSelection[];
  components: ProductConfigurationComponentSelection[];
  /** Server-confirmed resolved prices — not the product's list price. */
  retailPriceCents: number | null;
  tradePriceCents: number | null;
  leadTimeWeeks: number | null;
  /** The raw server snapshot, for consumers that persist provenance. */
  snapshot: Record<string, unknown> | null;
  /**
   * COM/COL fabric the designer specified during the configure step (00413).
   * The picker saves no configuration, so this travels with the pick as intent
   * and is written for real when the piece is placed.
   */
  comDetails?: ProductConfigurationComDetails | null;
  /** Human label for the resolution — "King · Walnut". '' when unnameable. */
  label: string;
}

/**
 * Everything a caller needs to denormalize a picked product onto its own row
 * (a decision option, an FF&E line, …) without a follow-up fetch. The picking
 * tab already holds these fields, so we surface them rather than throwing them
 * away and re-querying by id.
 *
 * Every configuration key below is OPTIONAL and additive: none of the four call
 * sites spread the pick into a DB insert, so an extra key is wire-safe.
 */
export interface ProductPickResult {
  productId: string;
  name: string;
  imageUrl: string | null; // images?.[0] ?? null
  priceCents: number | null; // products.price_retail (already cents)
  /**
   * Catalog trade (vendor) unit cost in cents — products.price_trade (00185
   * dual pricing). null = unknown (drafts, captures, and rows without trade
   * data). Optional so existing consumers are untouched; none spread the pick
   * into a DB insert, so the extra key is wire-safe.
   */
  priceTradeCents?: number | null;
  vendorName: string | null; // brand ?? vendor.name ?? null
  /** Library layer the product was picked from, when known (for a badge). */
  layer?: LayerProductLayer;
  /**
   * Set when the pick originated from the Captures tab — the id of the
   * `proposal_captures` row. Callers that distinguish capture-sourced picks
   * (e.g. mood-board 'capture' items) can key off this.
   */
  captureId?: string;
  /** Room selected in the modal (or the default it opened with), null = Unassigned. */
  scopeRoomId: string | null;
  /**
   * The piece's denormalized configuration mode (00403). Absent on drafts,
   * captures, and URL adds — all of which produce `standard` pieces.
   */
  configurationMode?: ProductConfigurationMode;
  /** Denormalized option/variant counts + price range for the picked piece. */
  configurationSummary?: ProductConfigurationSummary | null;
  /** Present when the designer resolved a specification in the configure step. */
  configurationSelection?: ProductPickConfigurationSelection;
  /**
   * True when an optioned piece was taken WITHOUT resolving a specification
   * ("Decide later"). Warn, never block — the consuming surface shows the debt.
   */
  configurationSkipped?: boolean;
}

/** What an individual tab emits; the modal shell folds in `scopeRoomId`. */
type TabPick = Omit<ProductPickResult, 'scopeRoomId'>;

export interface ProductPickerModalProps {
  open: boolean;
  onClose: () => void;
  /** Called when the user picks a product (catalog/library item or fresh draft). */
  onPick: (result: ProductPickResult) => void;
  /**
   * Default category slug to attach to the picked item — surfaced as a
   * subtle hint above the catalog list. (Catalog scope only; not used in library.)
   */
  defaultCategorySlug?: string;
  /**
   * Scope rooms the picked item can be targeted at. When non-empty a room
   * selector is rendered above the tabs.
   */
  rooms?: ProductPickerRoom[];
  /** Room to pre-select in the selector (null/undefined → Unassigned). */
  defaultScopeRoomId?: string | null;
  /** Show the Quick-create draft tab. Defaults to true. */
  allowDraftCreate?: boolean;
  /**
   * Where the first tab looks for products:
   *  - 'catalog' (default): published Patina catalog (`useProducts`). Used by proposals.
   *  - 'library': the designer's full 3-layer library (personal/studio/catalog) with
   *    per-layer browse + cross-layer search. Used by decisions ("library-first").
   */
  scope?: 'catalog' | 'library';
  /**
   * Stop on an optioned piece (variant/configured/custom) and resolve ONE
   * specification before emitting. Default true — a family of SKUs is not
   * orderable as "the product". Surfaces that only pin an image (the mood
   * board) pass false and keep the one-click grammar.
   */
  configureStep?: boolean;
}

type Tab = 'browse' | 'captures' | 'draft';

interface CatalogProductRow {
  id: string;
  name: string;
  brand: string | null;
  price_retail: number | null;
  price_trade: number | null;
  vendor?: { name?: string | null } | null;
  images: string[];
  configuration_mode?: ProductConfigurationMode | null;
  configuration_summary?: ProductConfigurationSummary | null;
}

const LAYER_LABEL: Record<LayerProductLayer, string> = {
  personal: 'Personal',
  studio: 'Studio',
  catalog: 'Catalog',
};

// ─── Shared result grid ─────────────────────────────────────────────────────────

interface GridRow {
  id: string;
  name: string;
  brand: string | null;
  price_retail: number | null;
  /** Trade cost in cents when the source query carries it (00185). */
  price_trade?: number | null;
  images: string[] | null;
  /** Catalog rows carry a joined vendor; library rows only have `brand`. */
  vendorName?: string | null;
  layer?: LayerProductLayer;
  /** Denormalized configuration mode (00403) — drives the configure step. */
  configuration_mode?: ProductConfigurationMode | null;
  configuration_summary?: ProductConfigurationSummary | null;
}

function LayerBadge({ layer }: { layer: LayerProductLayer }) {
  return (
    <span
      className="absolute right-1 top-1 rounded-sm px-1.5 py-0.5"
      style={{
        fontFamily: 'var(--font-meta)',
        fontSize: '0.5rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--text-primary)',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
      }}
    >
      {LAYER_LABEL[layer]}
    </span>
  );
}

function ProductResultGrid({
  rows,
  onPick,
}: {
  rows: GridRow[];
  onPick: (pick: TabPick) => void;
}) {
  return (
    <div className="grid max-h-[380px] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
      {rows.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() =>
            onPick({
              productId: p.id,
              name: p.name,
              imageUrl: p.images?.[0] ?? null,
              priceCents: p.price_retail ?? null,
              priceTradeCents: p.price_trade ?? null,
              vendorName: p.vendorName ?? p.brand ?? null,
              layer: p.layer,
              configurationMode: p.configuration_mode ?? undefined,
              configurationSummary: p.configuration_summary ?? null,
            })
          }
          data-testid="product-picker-result"
          data-product-id={p.id}
          className="group flex cursor-pointer flex-col items-stretch gap-2 rounded-sm border border-[var(--border-default)] p-2 text-left transition-colors hover:border-[var(--accent-primary)]"
        >
          <div
            className="relative w-full overflow-hidden rounded-sm bg-[var(--bg-surface)]"
            style={{ aspectRatio: '1 / 1' }}
          >
            {p.images?.[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.images[0]}
                alt={p.name}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center"
                style={{ color: 'var(--text-muted)', fontSize: '0.62rem' }}
              >
                No image
              </div>
            )}
            {p.layer && <LayerBadge layer={p.layer} />}
          </div>
          <div className="flex flex-col gap-0.5">
            <div
              className="line-clamp-2"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.78rem',
                color: 'var(--text-primary)',
              }}
            >
              {p.name}
            </div>
            {(p.brand || p.vendorName) && (
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.68rem',
                  fontStyle: 'italic',
                  color: 'var(--color-aged-oak)',
                }}
              >
                {p.brand ?? p.vendorName}
              </div>
            )}
            {typeof p.price_retail === 'number' && (
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 500,
                  fontSize: '0.78rem',
                  color: 'var(--text-primary)',
                }}
              >
                ${(p.price_retail / 100).toLocaleString()}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

const messageStyle = {
  fontSize: '0.82rem',
  color: 'var(--text-muted)',
} as const;

// ─── Catalog tab (proposals / scope='catalog') ──────────────────────────────────

function CatalogTab({
  defaultCategorySlug,
  onPick,
}: {
  defaultCategorySlug?: string;
  onPick: (pick: TabPick) => void;
}) {
  const [search, setSearch] = useState('');
  // useProducts defaults to status='published' — exactly what we want.
  const { data, isLoading, isError, error } = useProducts(
    { search: search.trim() || undefined },
    { page: 1, pageSize: 24 }
  );

  const products: CatalogProductRow[] = (data?.data ?? []) as CatalogProductRow[];
  const rows: GridRow[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    price_retail: p.price_retail,
    price_trade: p.price_trade,
    images: p.images,
    vendorName: p.vendor?.name ?? null,
    layer: 'catalog',
    configuration_mode: p.configuration_mode ?? null,
    configuration_summary: p.configuration_summary ?? null,
  }));

  return (
    <div className="flex flex-col gap-3">
      <Input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search the catalog by product name…"
      />

      {defaultCategorySlug && (
        <div
          className="rounded-sm border border-dashed px-3 py-2 text-[0.72rem]"
          style={{ borderColor: 'var(--border-default)', color: 'var(--text-muted)' }}
        >
          Picking for category{' '}
          <span style={{ color: 'var(--text-primary)' }}>{defaultCategorySlug}</span>
        </div>
      )}

      {isLoading && (
        <div className="py-8 text-center type-body" style={messageStyle}>
          Loading catalog…
        </div>
      )}
      {isError && (
        <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {(error as Error)?.message ?? 'Failed to load catalog.'}
        </div>
      )}
      {!isLoading && !isError && rows.length === 0 && (
        <div className="py-8 text-center type-body" style={messageStyle}>
          No products found. Try a different search or quick-create a draft.
        </div>
      )}
      {!isLoading && rows.length > 0 && <ProductResultGrid rows={rows} onPick={onPick} />}
    </div>
  );
}

// ─── Library tab (decisions / scope='library') ──────────────────────────────────

function LibraryTab({ onPick }: { onPick: (pick: TabPick) => void }) {
  const [search, setSearch] = useState('');
  const [activeLayer, setActiveLayer] = useState<LayerProductLayer>('personal');
  const trimmed = search.trim();
  const isSearching = trimmed.length > 0;

  const { data: counts } = useLayerCounts();
  // Default browse (blank query) of the active layer — useCrossLayerSearch
  // returns empty on a blank query, so the per-layer browse fills that gap.
  const browse = useLayerProducts({ layer: activeLayer, enabled: !isSearching });
  // Typing switches to one cross-layer query, grouped by layer below.
  const searchRes = useCrossLayerSearch({ query: trimmed, enabled: isSearching });

  const layers: LayerProductLayer[] = ['personal', 'studio', 'catalog'];
  const toGridRows = (items: LayerProductRow[], layer: LayerProductLayer): GridRow[] =>
    items.map((r) => ({
      id: r.id,
      name: r.name,
      brand: r.brand,
      price_retail: r.price_retail,
      price_trade: r.price_trade,
      images: r.images,
      layer,
      configuration_mode: r.configuration_mode,
      configuration_summary: r.configuration_summary,
    }));

  return (
    <div className="flex flex-col gap-3">
      <Input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search your library and the catalog…"
      />

      {/* Layer chips — select the active layer to browse; counts are caller-scoped. */}
      <div className="flex flex-wrap gap-2">
        {layers.map((l) => {
          const active = !isSearching && activeLayer === l;
          return (
            <FilterPill
              key={l}
              active={active}
              onClick={() => {
                setActiveLayer(l);
                setSearch('');
              }}
              data-testid={`library-layer-${l}`}
            >
              {LAYER_LABEL[l]}
              {counts ? ` · ${counts[l]}` : ''}
            </FilterPill>
          );
        })}
      </div>

      {/* Browse the active layer (blank query) */}
      {!isSearching && (
        <>
          {browse.isLoading && (
            <div className="py-8 text-center type-body" style={messageStyle}>
              Loading {LAYER_LABEL[activeLayer].toLowerCase()} library…
            </div>
          )}
          {browse.isError && (
            <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {(browse.error as Error)?.message ?? 'Failed to load library.'}
            </div>
          )}
          {!browse.isLoading && !browse.isError && (browse.data?.length ?? 0) === 0 && (
            <div className="py-8 text-center type-body" style={messageStyle}>
              Nothing in your {LAYER_LABEL[activeLayer].toLowerCase()} library yet. Search
              the catalog, capture with the extension, or quick-create a draft.
            </div>
          )}
          {(browse.data?.length ?? 0) > 0 && (
            <ProductResultGrid rows={toGridRows(browse.data ?? [], activeLayer)} onPick={onPick} />
          )}
        </>
      )}

      {/* Cross-layer search results, grouped by layer */}
      {isSearching && (
        <>
          {searchRes.isLoading && (
            <div className="py-8 text-center type-body" style={messageStyle}>
              Searching…
            </div>
          )}
          {searchRes.isError && (
            <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {(searchRes.error as Error)?.message ?? 'Search failed.'}
            </div>
          )}
          {searchRes.data && searchRes.data.total === 0 && (
            <div className="py-8 text-center type-body" style={messageStyle}>
              No matches in your library or the catalog. Quick-create a draft instead.
            </div>
          )}
          {searchRes.data &&
            layers.map((l) => {
              const items = searchRes.data!.byLayer[l];
              if (!items || items.length === 0) return null;
              return (
                <div key={l} className="flex flex-col gap-2">
                  <div
                    style={{
                      fontFamily: 'var(--font-meta)',
                      fontSize: '0.6rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {LAYER_LABEL[l]} · {items.length}
                  </div>
                  <ProductResultGrid rows={toGridRows(items, l)} onPick={onPick} />
                </div>
              );
            })}
        </>
      )}
    </div>
  );
}

// ─── Quick-create draft tab ────────────────────────────────────────────────────

function DraftTab({ onPick }: { onPick: (pick: TabPick) => void }) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [priceDollars, setPriceDollars] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const create = useCreateDraftProduct();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setErrorMessage(null);
    try {
      const parsed = priceDollars ? Number(priceDollars) : undefined;
      const priceRetailDollars =
        parsed !== undefined && !Number.isNaN(parsed) ? parsed : undefined;
      const result = await create.mutateAsync({
        name,
        brand: brand || undefined,
        sourceUrl: sourceUrl || undefined,
        priceRetailDollars,
      });
      onPick({
        productId: result.id,
        name: name.trim(),
        imageUrl: null,
        priceCents:
          priceRetailDollars !== undefined ? Math.round(priceRetailDollars * 100) : null,
        priceTradeCents: null, // drafts carry no trade cost
        vendorName: brand.trim() || null,
        layer: 'personal',
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create draft');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p
        className="type-body"
        style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}
      >
        Create a stub product so you can spec it now. You can fill in catalog details
        later — it stays in <span style={{ color: 'var(--text-primary)' }}>draft</span> in your
        personal library until you publish it.
      </p>

      <label className="block">
        <span className="type-meta mb-1 block">Product Name *</span>
        <Input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Holly Hunt Cardamom Lounge Chair"
        />
      </label>

      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <label className="block">
          <span className="type-meta mb-1 block">Brand</span>
          <Input
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="e.g. Holly Hunt"
          />
        </label>
        <label className="block">
          <span className="type-meta mb-1 block">Retail Price</span>
          <div className="relative">
            <span
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-body text-[0.88rem]"
              style={{ color: 'var(--text-muted)' }}
            >
              $
            </span>
            <Input
              type="number"
              min="0"
              step="1"
              value={priceDollars}
              onChange={(e) => setPriceDollars(e.target.value)}
              placeholder="0"
              className="pl-7"
            />
          </div>
        </label>
      </div>

      <label className="block">
        <span className="type-meta mb-1 block">Source URL</span>
        <Input
          type="url"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://…"
        />
      </label>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {errorMessage}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="primary"
          type="submit"
          disabled={!name.trim() || create.isPending}
        >
          {create.isPending ? 'Creating…' : 'Create draft + use'}
        </Button>
      </div>
    </form>
  );
}

// ─── Captures tab ──────────────────────────────────────────────────────────────

function captureName(c: ProposalCapture): string {
  const payload = c.raw_payload ?? {};
  const fromKey = (key: string) => {
    const v = (payload as Record<string, unknown>)[key];
    return typeof v === 'string' && v.trim() ? v : null;
  };
  return fromKey('name') ?? fromKey('productName') ?? fromKey('title') ?? 'Untitled capture';
}

function captureVendorName(c: ProposalCapture): string | null {
  const payload = c.raw_payload ?? {};
  const fromKey = (key: string) => {
    const v = (payload as Record<string, unknown>)[key];
    return typeof v === 'string' && v.trim() ? v : null;
  };
  const direct = fromKey('vendor_name') ?? fromKey('vendorName');
  if (direct) return direct;
  const vendor = (payload as Record<string, unknown>).vendor;
  if (vendor && typeof vendor === 'object') {
    const name = (vendor as Record<string, unknown>).name;
    if (typeof name === 'string' && name.trim()) return name;
  }
  return fromKey('manufacturer') ?? fromKey('brand');
}

function capturePriceCents(c: ProposalCapture): number | null {
  const payload = (c.raw_payload ?? {}) as Record<string, unknown>;
  const priceRaw = payload['price_retail_cents'] ?? payload['priceRetailCents'];
  if (typeof priceRaw === 'number' && Number.isFinite(priceRaw)) return priceRaw;
  const dollars = payload['priceRetailDollars'] ?? payload['price'];
  if (typeof dollars === 'number' && Number.isFinite(dollars)) return Math.round(dollars * 100);
  return null;
}

/**
 * Add-from-URL (A3, capture mode). Reads a pasted product page server-side
 * behind the SSRF-guarded `capture-from-url` edge function, drops a personal
 * draft via `captureProduct`, then picks it — mirroring the CapturesTab's own
 * promote-then-pick flow. Inline error only (R83: no toast).
 */
function AddFromUrl({ onPick }: { onPick: (pick: TabPick) => void }) {
  const { user } = useAuth();
  const captureFromUrl = useCaptureFromUrl();
  const captureProduct = useCaptureProduct();
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const busy = captureFromUrl.isPending || captureProduct.isPending;

  const handleAdd = async () => {
    const trimmed = url.trim();
    if (!trimmed || busy) return;
    setError(null);
    if (!user?.id) {
      setError('Sign in to add a product from a URL.');
      return;
    }
    try {
      const extracted = await captureFromUrl.mutateAsync({ url: trimmed, mode: 'capture' });
      const result = await captureProduct.mutateAsync({
        name: extracted.name ?? undefined,
        images: extracted.images ?? undefined,
        sourceUrl: extracted.sourceUrl ?? trimmed,
        priceRetailCents: extracted.priceRetailCents ?? undefined,
        description: extracted.description ?? undefined,
        detectedVendorName: extracted.brand ?? undefined,
        ownerUserId: user.id,
        captureSource: 'url_paste',
      });
      setUrl('');
      onPick({
        productId: result.productId,
        name: extracted.name?.trim() || trimmed,
        imageUrl: extracted.images?.[0] ?? null,
        priceCents: extracted.priceRetailCents ?? null,
        priceTradeCents: null, // URL captures carry no trade cost
        vendorName: extracted.brand ?? null,
        layer: 'personal',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That URL could not be read.');
    }
  };

  return (
    <div
      className="flex flex-col gap-2 rounded-sm border border-dashed p-3"
      style={{ borderColor: 'var(--border-default)' }}
    >
      <span className="type-meta">Add from URL</span>
      <div className="flex gap-2">
        <Input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleAdd();
            }
          }}
          placeholder="https://… paste a product page"
          disabled={busy}
          data-testid="add-from-url-input"
        />
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={() => void handleAdd()}
          disabled={busy || !url.trim()}
          data-testid="add-from-url-submit"
        >
          {busy ? 'Reading…' : 'Add'}
        </Button>
      </div>
      <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
        We read the page for name, image, and price, then drop a draft in your personal library.
      </p>
      {error && (
        <div
          role="alert"
          className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </div>
      )}
    </div>
  );
}

function CapturesTab({ onPick }: { onPick: (pick: TabPick) => void }) {
  const { data: captures = [], isLoading, isError, error } = useProposalCaptures({
    status: 'inbox',
  });
  const createDraft = useCreateDraftProduct();
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  const handlePromoteAndPick = async (capture: ProposalCapture) => {
    setPromoteError(null);
    setPromotingId(capture.id);
    try {
      const priceCents = capturePriceCents(capture);
      const result = await createDraft.mutateAsync({
        name: captureName(capture),
        brand: captureVendorName(capture) ?? undefined,
        sourceUrl: capture.source_url,
        priceRetailDollars: priceCents != null ? priceCents / 100 : undefined,
      });
      onPick({
        productId: result.id,
        name: captureName(capture),
        imageUrl: capture.thumbnail_url ?? null,
        priceCents,
        priceTradeCents: null, // captures carry no trade cost
        vendorName: captureVendorName(capture),
        layer: 'personal',
        captureId: capture.id,
      });
    } catch (err) {
      setPromoteError(err instanceof Error ? err.message : 'Failed to promote draft');
    } finally {
      setPromotingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <AddFromUrl onPick={onPick} />

      {isLoading && (
        <div className="py-8 text-center type-body" style={messageStyle}>
          Loading captures…
        </div>
      )}

      {isError && (
        <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {(error as Error)?.message ?? 'Failed to load captures.'}
        </div>
      )}

      {!isLoading && !isError && captures.length === 0 && (
        <div className="py-8 text-center type-body" style={messageStyle}>
          No captures yet. Use the Patina extension to capture products from the web,
          then return here to add them.
        </div>
      )}

      {promoteError && (
        <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {promoteError}
        </div>
      )}

      {!isLoading && captures.length > 0 && (
        <div className="flex max-h-[380px] flex-col gap-2 overflow-y-auto pr-1">
          {captures.map((capture) => {
            const name = captureName(capture);
            const vendor = captureVendorName(capture);
            const isPromoting = promotingId === capture.id;
            const handleClick = () => {
              if (capture.product_id) {
                onPick({
                  productId: capture.product_id,
                  name,
                  imageUrl: capture.thumbnail_url ?? null,
                  priceCents: capturePriceCents(capture),
                  priceTradeCents: null, // captures carry no trade cost
                  vendorName: vendor,
                  captureId: capture.id,
                });
              } else {
                void handlePromoteAndPick(capture);
              }
            };
            const sourceLabel = (() => {
              try {
                return new URL(capture.source_url).hostname.replace(/^www\./, '');
              } catch {
                return capture.source_url;
              }
            })();

            return (
              <button
                key={capture.id}
                type="button"
                disabled={isPromoting || createDraft.isPending}
                onClick={handleClick}
                className="group flex cursor-pointer items-center gap-3 rounded-sm border border-[var(--border-default)] p-2 text-left transition-colors hover:border-[var(--accent-primary)] disabled:opacity-50"
              >
                <div
                  className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-sm"
                  style={{ backgroundColor: 'var(--bg-surface)' }}
                >
                  {capture.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={capture.thumbnail_url}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center"
                      style={{ color: 'var(--text-muted)', fontSize: '0.55rem' }}
                    >
                      No img
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div
                    className="truncate"
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.82rem',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {name}
                  </div>
                  <div
                    className="mt-0.5 flex items-center gap-2"
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.68rem',
                      color: 'var(--color-aged-oak)',
                    }}
                  >
                    {vendor && <span className="truncate italic">{vendor}</span>}
                    <span style={{ color: 'var(--text-muted)' }}>· {sourceLabel}</span>
                  </div>
                </div>

                <span
                  style={{
                    fontFamily: 'var(--font-meta)',
                    fontSize: '0.58rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: capture.product_id ? 'var(--color-sage)' : 'var(--color-golden-hour)',
                  }}
                >
                  {isPromoting
                    ? 'Promoting…'
                    : capture.product_id
                      ? 'Library'
                      : 'Promote draft'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Modal shell ─────────────────────────────────────────────────────────────

/** Modes whose pieces cannot enter a project without a resolved selection. */
function needsConfiguration(mode: ProductConfigurationMode | undefined): boolean {
  return mode === 'variant' || mode === 'configured' || mode === 'custom';
}


export function ProductPickerModal({
  open,
  onClose,
  onPick,
  defaultCategorySlug,
  rooms = [],
  defaultScopeRoomId = null,
  allowDraftCreate = true,
  scope = 'catalog',
  configureStep = true,
}: ProductPickerModalProps) {
  const [tab, setTab] = useState<Tab>('browse');
  const [scopeRoomId, setScopeRoomId] = useState<string | null>(defaultScopeRoomId ?? null);
  // Non-null while an optioned pick is being resolved — the configure pane
  // replaces the grid instead of the modal closing behind the designer.
  const [pendingConfigure, setPendingConfigure] = useState<ProductPickResult | null>(
    null,
  );

  // Reset to the browse tab and the default room whenever the modal opens.
  useEffect(() => {
    if (open) {
      setTab('browse');
      setScopeRoomId(defaultScopeRoomId ?? null);
      setPendingConfigure(null);
    }
  }, [open, defaultScopeRoomId]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const emit = (result: ProductPickResult) => {
    setPendingConfigure(null);
    onPick(result);
    onClose();
  };

  const handlePick = (pick: TabPick) => {
    const result: ProductPickResult = { ...pick, scopeRoomId };
    // A family of SKUs (variant/configured) or a commission (custom) is not
    // orderable as "the product" — stop and resolve one specification first.
    if (configureStep && needsConfiguration(result.configurationMode)) {
      setPendingConfigure(result);
      return;
    }
    emit(result);
  };

  const browseLabel = scope === 'library' ? 'Library' : 'Catalog';

  const tabButton = (key: Tab, label: string) => (
    <button
      role="tab"
      type="button"
      aria-selected={tab === key}
      onClick={() => setTab(key)}
      className={`cursor-pointer px-3 py-2 font-body text-[0.82rem] font-medium transition-colors ${
        tab === key
          ? 'border-b-2 border-[var(--accent-primary)] text-[var(--text-primary)]'
          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-picker-title"
      data-testid="product-picker-modal"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[720px] rounded-md border bg-[var(--bg-surface)] p-6 shadow-xl"
        style={{ borderColor: 'var(--border-default)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-baseline justify-between">
          <h3 id="product-picker-title" className="type-section-head" style={{ fontSize: '1.2rem' }}>
            {pendingConfigure ? 'Choose the specification' : 'Add a product'}
          </h3>
          <IconButton
            label="Close"
            variant="ghost"
            size="sm"
            onClick={onClose}
          >
            ×
          </IconButton>
        </div>

        {/* The configure step takes over the body: one specification is being
            resolved, so the grid and its tabs would only invite a mis-click. */}
        {pendingConfigure ? (
          <PickerConfigureStep
            pick={pendingConfigure}
            pickerScope={scope}
            onBack={() => setPendingConfigure(null)}
            onConfirm={emit}
            onSkip={emit}
          />
        ) : (
        <>
          {/* Room targeting */}
          {rooms.length > 0 && (
            <label className="mb-4 block">
              <span className="type-meta mb-1 block">Add to room</span>
              <Select
                value={scopeRoomId ?? ''}
                onChange={(e) => setScopeRoomId(e.target.value || null)}
                data-testid="product-picker-room"
              >
                <option value="">Unassigned</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </label>
          )}

          {/* Tabs */}
          <div
            role="tablist"
            aria-label="Product picker"
            className="mb-4 flex gap-1 border-b"
            style={{ borderColor: 'var(--border-default)' }}
          >
            {tabButton('browse', browseLabel)}
            {tabButton('captures', 'Captures')}
            {allowDraftCreate && tabButton('draft', 'Quick-create draft')}
          </div>

          {/* Panels */}
          {tab === 'browse' &&
            (scope === 'library' ? (
              <LibraryTab onPick={handlePick} />
            ) : (
              <CatalogTab defaultCategorySlug={defaultCategorySlug} onPick={handlePick} />
            ))}
          {tab === 'captures' && <CapturesTab onPick={handlePick} />}
          {tab === 'draft' && allowDraftCreate && <DraftTab onPick={handlePick} />}
        </>
        )}
      </div>
    </div>
  );
}
