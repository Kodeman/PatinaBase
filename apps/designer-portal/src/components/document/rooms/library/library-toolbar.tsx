"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { LayerProductLayer } from "@patina/supabase";
import { DocumentAction } from "../../document-action";
import { FilterPill } from "@/components/ui/controls";
import type { LibraryCapabilityFilter } from "./library-configuration-summary";

interface LayerCounts {
  personal: number;
  studio: number;
  catalog: number;
}

const LENSES: Array<{
  layer: LayerProductLayer;
  label: string;
  countKey: keyof LayerCounts;
}> = [
  { layer: "personal", label: "Mine", countKey: "personal" },
  { layer: "studio", label: "Studio", countKey: "studio" },
  { layer: "catalog", label: "Patina", countKey: "catalog" },
];

const CAPABILITY_FILTERS: Array<{
  value: LibraryCapabilityFilter;
  label: string;
}> = [
  { value: "all", label: "All pieces" },
  { value: "standard", label: "One spec" },
  { value: "variant", label: "Variants" },
  { value: "configured", label: "Options" },
  { value: "modular", label: "Modular" },
  { value: "custom", label: "Custom" },
];

function ActiveStrata() {
  return (
    <span
      aria-hidden
      className="inline-flex w-3 flex-col gap-[2px] text-[var(--color-clay-ink)]"
    >
      <i className="h-px w-3 bg-current" />
      <i className="h-px w-2 bg-current opacity-65" />
      <i className="h-px w-1 bg-current opacity-35" />
    </span>
  );
}

export function LibraryToolbar({
  activeLayer,
  counts,
  onLayerChange,
  onCompose,
  onImport,
  activeCapability = "all",
  onCapabilityChange,
}: {
  activeLayer: LayerProductLayer;
  counts?: LayerCounts | null;
  onLayerChange: (layer: LayerProductLayer) => void;
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
    <div
      data-library-toolbar
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-[var(--doc-ink-border)] px-6 py-3 sm:px-9"
    >
      <div
        role="tablist"
        aria-label="Library shelf lens"
        className="flex min-w-0 flex-wrap items-center gap-1"
      >
        {LENSES.map((lens, index) => {
          const selected = activeLayer === lens.layer;
          const count = counts?.[lens.countKey] ?? null;
          return (
            <DocumentAction
              key={lens.layer}
              id={`library-lens-${lens.layer}`}
              actionKey={`open-${lens.layer}-library`}
              surfaceKey="library"
              regionKey="shelf-lenses"
              variant="tertiary"
              role="tab"
              aria-selected={selected}
              aria-controls="library-shelf-panel"
              aria-label={`${lens.label}${count == null ? "" : `, ${count} pieces`}`}
              tabIndex={selected ? 0 : -1}
              leading={selected ? <ActiveStrata /> : undefined}
              data-library-lens={lens.layer}
              className={
                selected
                  ? "font-medium text-[var(--color-charcoal)]"
                  : "text-[var(--text-body)]"
              }
              onClick={() => onLayerChange(lens.layer)}
              onKeyDown={(event) => moveLens(event, index)}
            >
              {lens.label}
              {count != null && (
                <span className="ml-1 font-normal text-[var(--text-body)]">
                  · {count}
                </span>
              )}
            </DocumentAction>
          );
        })}
      </div>

      <div ref={addRootRef} className="relative ml-auto">
        <DocumentAction
          ref={addTriggerRef}
          actionKey="toggle-library-add"
          surfaceKey="library"
          regionKey="library-toolbar"
          variant="secondary"
          aria-expanded={addOpen}
          aria-controls="library-add-options"
          trailing={addOpen ? "↑" : "↓"}
          data-library-add-trigger
          onClick={() => setAddOpen((value) => !value)}
        >
          Add to Library
        </DocumentAction>

        {addOpen && (
          <div
            id="library-add-options"
            role="region"
            aria-label="Add to Library options"
            data-library-add-options
            className="absolute right-0 top-[calc(100%+4px)] z-30 w-[min(260px,calc(100vw-3rem))] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] px-4 py-3 motion-safe:animate-[doc-fade_200ms_ease-out] motion-reduce:animate-none"
          >
            <p className="mb-1 text-[14px] leading-relaxed text-[var(--color-charcoal)]">
              Start a piece by hand, or bring in a list.
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
                Compose a piece
              </DocumentAction>
              <DocumentAction
                actionKey="import-pieces"
                surfaceKey="library"
                regionKey="library-add"
                variant="secondary"
                trailing="→"
                onClick={() => chooseAddAction(onImport)}
              >
                Import a list
              </DocumentAction>
            </div>
          </div>
        )}
      </div>

      <div
        role="group"
        aria-label="Filter by configuration capability"
        className="order-last flex w-full flex-wrap items-center gap-1.5 border-t border-[var(--doc-ink-border)] pt-2"
      >
        <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-quiet-ink)]">
          Can be ordered as
        </span>
        {CAPABILITY_FILTERS.map((filter) => (
          <FilterPill
            key={filter.value}
            active={activeCapability === filter.value}
            onClick={() => onCapabilityChange?.(filter.value)}
          >
            {filter.label}
          </FilterPill>
        ))}
      </div>
    </div>
  );
}
