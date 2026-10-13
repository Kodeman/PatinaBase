"use client";

/**
 * LibraryShelf — the Library's currently selected shelf (R32/R39) as a Section
 * (US-28 S10c): the eyebrow names the shelf, the pieces are plate and caption
 * (V20 U-Q20), and the Section closes on its own rule. Past one screen the
 * shelf folds behind one act. Reads its own layer from the real catalog
 * (useLayerProducts); no mock data. My Library = raw captures, Studio =
 * proven, Patina Catalog = the marketplace. "All shelves" (library-p1's
 * default) reads the three and lays them out newest first.
 */

import { useMemo, useState } from "react";
import {
  useLayerProducts,
  useCaptureVenueLabels,
  type LayerProductLayer,
  type LayerProductRow,
} from "@patina/supabase";
import { StrataSweep } from "@/components/ui/strata-sweep";
import { DocumentAction } from "../../document-action";
import { LibraryCard } from "./library-card";
import {
  matchesCapabilityFilter,
  readLibraryConfigurationSummary,
  type LibraryCapabilityFilter,
  type LibraryConfigurationProduct,
} from "./library-configuration-summary";
import { usePieceUsage } from "./use-piece-usage";
import type { LibraryShelfLens } from "./library-toolbar";

/** About one screen of plates: two rows at 1440, four 2-up rows at 390. */
export const SHELF_FOLD_AT = 8;

const SHELVES: LayerProductLayer[] = ["personal", "studio", "catalog"];

function shows(lens: LibraryShelfLens, shelf: LayerProductLayer): boolean {
  return lens === "all" || lens === shelf;
}

/** The shown shelves' pieces, newest first (each read is already newest first). */
function mergeShelves(
  reads: Array<LayerProductRow[] | undefined>,
): LayerProductRow[] | undefined {
  if (reads.every((rows) => rows === undefined)) return undefined;
  const rows = reads.flatMap((r) => r ?? []);
  if (reads.length === 1) return rows;
  return rows.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

export function LibraryShelf({
  layer,
  name,
  meta,
  id,
  labelledBy,
  teachingIds,
  validationIds,
  onDeep,
  onPromote,
  onNominate,
  capability = "all",
}: {
  layer: LibraryShelfLens;
  name: string;
  meta?: string;
  id: string;
  labelledBy: string;
  teachingIds: Set<string>;
  /** Pieces in the validation queue (needs_validation) — get the validate lens. */
  validationIds?: Set<string>;
  onDeep: (productId: string, name: string) => void;
  onPromote?: (productId: string) => void;
  onNominate?: (productId: string) => void;
  capability?: LibraryCapabilityFilter;
}) {
  // One read per shelf, each enabled only when this lens shows it.
  const reads = {
    personal: useLayerProducts({ layer: "personal", enabled: shows(layer, "personal") }),
    studio: useLayerProducts({ layer: "studio", enabled: shows(layer, "studio") }),
    catalog: useLayerProducts({ layer: "catalog", enabled: shows(layer, "catalog") }),
  };
  const shown = SHELVES.filter((shelf) => shows(layer, shelf)).map((shelf) => reads[shelf]);
  const isLoading = shown.some((read) => read.isLoading);
  const isError = shown.some((read) => read.isError);
  const data = useMemo(
    () => mergeShelves(shown.map((read) => read.data)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layer, reads.personal.data, reads.studio.data, reads.catalog.data],
  );
  const items = data ?? [];
  const visibleItems = items.filter((item) =>
    matchesCapabilityFilter(
      readLibraryConfigurationSummary(item as LibraryConfigurationProduct),
      capability,
    ),
  );

  // Past one screen the shelf folds: only the visible slice needs per-piece metadata.
  const [unfolded, setUnfolded] = useState(false);
  const folds = visibleItems.length > SHELF_FOLD_AT;
  const shownItems =
    folds && !unfolded ? visibleItems.slice(0, SHELF_FOLD_AT) : visibleItems;
  const shownIds = shownItems.map((item) => item.id);
  const { data: usageByPiece } = usePieceUsage(shownIds);
  const captureIds = useMemo(
    () => shownItems.map((piece) => piece.field_capture_id),
    [shownItems],
  );
  const { data: venueByCapture } = useCaptureVenueLabels(captureIds);

  return (
    <section
      id={id}
      role="tabpanel"
      aria-labelledby={labelledBy}
      tabIndex={0}
      data-library-shelf={layer}
      className="section library-shelf"
    >
      <div className="sec-head">
        <h2 className="eb">
          <svg className="orn" viewBox="0 0 34 12" aria-hidden="true" focusable="false">
            <path d="M0 2h34M0 6h28M0 10h20" />
          </svg>
          <span>{name}</span>
        </h2>
        {meta && <p className="t-body-sm library-shelf-meta">{meta}</p>}
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-6">
          <StrataSweep size="sm" label={`Reading ${name}`} />
          <span className="t-meta library-shelf-meta">reading the shelf…</span>
        </div>
      )}

      {isError && (
        <p className="empty-t">This shelf could not be read just now.</p>
      )}

      {!isLoading && !isError && visibleItems.length === 0 && (
        <p className="empty-t">
          {items.length > 0
            ? "No pieces on this shelf match that configuration capability."
            : layer === "personal" || layer === "all"
              ? "Nothing captured yet. Bring a piece in from a vendor's page with Capture, or drop a photo here — it lands raw, and you tidy it later."
              : "This shelf is empty."}
        </p>
      )}

      {shownItems.length > 0 && (
        <div className="plates-wrap">
          <ul id={`${id}-plates`} className="plates library-plates">
            {shownItems.map((it) => {
              const configured = it as typeof it & LibraryConfigurationProduct;
              return (
                <li key={it.id} className="min-w-0">
                  <LibraryCard
                    item={{
                      id: it.id,
                      name: it.name,
                      brand: it.brand,
                      images: it.images,
                      source_url: it.source_url,
                      category: it.category,
                      layer: it.layer,
                      price_retail: it.price_retail,
                      configuration_mode: configured.configuration_mode,
                      configuration_summary: configured.configuration_summary,
                      capture_source: it.capture_source,
                      captured_at: it.captured_at,
                      venue_label: it.field_capture_id
                        ? (venueByCapture?.[it.field_capture_id] ?? null)
                        : null,
                    }}
                    usedOn={usageByPiece?.[it.id]}
                    needsTeaching={teachingIds.has(it.id)}
                    needsValidation={validationIds?.has(it.id) ?? false}
                    onDeep={onDeep}
                    // Promote moves a personal piece to the studio; Nominate
                    // recommends a studio piece's maker. On All shelves each
                    // piece offers only its own shelf's move.
                    onPromote={it.layer === "personal" ? onPromote : undefined}
                    onNominate={it.layer === "studio" ? onNominate : undefined}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {folds && (
        <div className="library-shelf-fold">
          <DocumentAction
            actionKey={unfolded ? "fold-library-shelf" : "unfold-library-shelf"}
            surfaceKey="library"
            regionKey="library-shelf"
            variant="tertiary"
            aria-expanded={unfolded}
            aria-controls={`${id}-plates`}
            onClick={() => setUnfolded((value) => !value)}
          >
            {unfolded
              ? "Fold the shelf"
              : `Show all ${visibleItems.length} pieces`}
          </DocumentAction>
        </div>
      )}
    </section>
  );
}
