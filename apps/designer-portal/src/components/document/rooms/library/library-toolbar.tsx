"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { LayerProductLayer } from "@patina/supabase";
import { DocumentAction } from "../../document-action";
import type { LibraryCapabilityFilter } from "./library-configuration-summary";

/**
 * The Library's one filter grammar (US-28 S10c): shelf and type as one row of
 * underline words, never pills. The shelf words stay a tablist over the one
 * shelf panel; the type words are pressed toggles.
 */

interface LayerCounts {
  personal: number;
  studio: number;
  catalog: number;
}

/** A shelf lens: one layer, or every shelf at once (library-p1's default). */
export type LibraryShelfLens = LayerProductLayer | "all";

const LENSES: Array<{
  layer: LibraryShelfLens;
  label: string;
}> = [
  { layer: "all", label: "All shelves" },
  { layer: "personal", label: "Personal" },
  { layer: "studio", label: "Studio" },
  { layer: "catalog", label: "Patina catalog" },
];

function lensCount(counts: LayerCounts | null | undefined, lens: LibraryShelfLens) {
  if (!counts) return null;
  return lens === "all" ? counts.personal + counts.studio + counts.catalog : counts[lens];
}

const CAPABILITY_FILTERS: Array<{
  value: LibraryCapabilityFilter;
  label: string;
}> = [
  { value: "all", label: "All products" },
  { value: "standard", label: "Fixed specification" },
  { value: "variant", label: "Variants" },
  { value: "configured", label: "Configurable" },
  { value: "modular", label: "Modular" },
  { value: "custom", label: "Custom commissions" },
];

export function LibraryToolbar({
  activeLayer,
  counts,
  onLayerChange,
  onCompose,
  onImport,
  activeCapability = "all",
  onCapabilityChange,
}: {
  activeLayer: LibraryShelfLens;
  counts?: LayerCounts | null;
  onLayerChange: (layer: LibraryShelfLens) => void;
  onCompose: () => void;
  onImport: () => void;
  activeCapability?: LibraryCapabilityFilter;
  onCapabilityChange?: (capability: LibraryCapabilityFilter) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const addRootRef = useRef<HTMLDivElement>(null);
  const addTriggerRef = useRef<HTMLButtonElement>(null);
  const firstAddActionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!addOpen) return;

    const focusFrame = window.requestAnimationFrame(() =>
      firstAddActionRef.current?.focus(),
    );
    const onPointerDown = (event: PointerEvent) => {
      if (!addRootRef.current?.contains(event.target as Node))
        setAddOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setAddOpen(false);
      window.requestAnimationFrame(() => addTriggerRef.current?.focus());
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [addOpen]);

  const moveLens = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % LENSES.length;
    else if (event.key === "ArrowLeft")
      next = (index - 1 + LENSES.length) % LENSES.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = LENSES.length - 1;
    else return;

    event.preventDefault();
    const tablist = event.currentTarget.parentElement;
    onLayerChange(LENSES[next].layer);
    window.requestAnimationFrame(() => {
      const tabs = tablist?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      tabs?.[next]?.focus();
    });
  };

  const chooseAddAction = (action: () => void) => {
    setAddOpen(false);
    action();
  };

  return (
    <div data-library-toolbar className="library-filters-wrap">
      <div className="filters library-filters">
        <div
          role="tablist"
          aria-label="Library shelf lens"
          className="library-filter-run"
        >
          <span aria-hidden className="library-flabel">
            Shelf
          </span>
          {LENSES.map((lens, index) => {
            const selected = activeLayer === lens.layer;
            const count = lensCount(counts, lens.layer);
            return (
              <button
                key={lens.layer}
                type="button"
                id={`library-lens-${lens.layer}`}
                role="tab"
                aria-selected={selected}
                aria-controls="library-shelf-panel"
                aria-label={`${lens.label}${count == null ? "" : `, ${count} ${count === 1 ? "product" : "products"}`}`}
                tabIndex={selected ? 0 : -1}
                data-library-lens={lens.layer}
                onClick={() => onLayerChange(lens.layer)}
                onKeyDown={(event) => moveLens(event, index)}
              >
                {lens.label}
                {count != null && <span className="library-count"> · {count}</span>}
              </button>
            );
          })}
        </div>

        <div
          role="group"
          aria-label="Filter by configuration capability"
          className="library-filter-run"
        >
          <span aria-hidden className="library-flabel">
            Type
          </span>
          {CAPABILITY_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={activeCapability === filter.value}
              onClick={() => onCapabilityChange?.(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div ref={addRootRef} className="library-add">
          <DocumentAction
            ref={addTriggerRef}
            actionKey="toggle-library-add"
            surfaceKey="library"
            regionKey="library-toolbar"
            variant="tertiary"
            aria-expanded={addOpen}
            aria-controls="library-add-options"
            trailing={addOpen ? "↑" : "↓"}
            data-library-add-trigger
            onClick={() => setAddOpen((value) => !value)}
          >
            Add to library
          </DocumentAction>

          {addOpen && (
            <div
              id="library-add-options"
              role="region"
              aria-label="Add to Library options"
              data-library-add-options
              className="popover library-add-options motion-safe:animate-[doc-fade_200ms_ease-out] motion-reduce:animate-none"
            >
              <p className="t-body-sm mb-1">
                Add a product record or import a product list.
              </p>
              <div className="flex flex-col items-start">
                <DocumentAction
                  ref={firstAddActionRef}
                  actionKey="compose-piece"
                  surfaceKey="library"
                  regionKey="library-add"
                  variant="secondary"
                  trailing="→"
                  onClick={() => chooseAddAction(onCompose)}
                >
                  Create a product record
                </DocumentAction>
                <DocumentAction
                  actionKey="import-pieces"
                  surfaceKey="library"
                  regionKey="library-add"
                  variant="secondary"
                  trailing="→"
                  onClick={() => chooseAddAction(onImport)}
                >
                  Import product list
                </DocumentAction>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
