"use client";

/**
 * A pure, controlled W/D/H + unit editor for the `selected_dimensions` JSONB
 * shape (and its kin — `dimensions`, `resolved_dimensions`) — the
 * FacetDimensions visual idiom (rooms/piece/facet-field.tsx:610-699), lifted
 * out so the spec-book SelectionEditor can bind it to a parsed-object draft
 * instead of a raw JSON textarea.
 *
 * The dimensions shape is NOT uniform across writers: the capture extension
 * writes eleven keys, some fixtures carry a bare `length`, and rule effects
 * can add more. This component never assumes the shape is exactly
 * {width,depth,height,unit} — every change spread-preserves whatever else was
 * already on the object, and a muted hint surfaces how many such fields are
 * along for the ride rather than silently dropping them.
 */

import type { ChangeEvent } from "react";

const DIMENSION_KEYS = ["width", "depth", "height"] as const;
type DimensionKey = (typeof DIMENSION_KEYS)[number];
const KNOWN_DIMENSION_KEYS = new Set<string>([...DIMENSION_KEYS, "unit"]);

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  width: "width",
  depth: "depth",
  height: "height",
};

const DIMENSION_PLACEHOLDERS: Record<DimensionKey, string> = {
  width: '72"',
  depth: '38"',
  height: '30"',
};

export interface DimensionFieldsProps {
  /** The stored dimensions object, or null when nothing has been captured. */
  value: Record<string, unknown> | null;
  /** Called with the next value — null only once width/depth/height are all
   *  cleared AND no unrecognized keys remain on the object. */
  onChange: (next: Record<string, unknown> | null) => void;
  /** Static "W × D × H unit" rendering — used for catalog/frozen rows. */
  readOnly?: boolean;
  /** Disables the inputs without switching to the static readOnly render
   *  (e.g. while a save is in flight). */
  disabled?: boolean;
}

function stringField(value: Record<string, unknown> | null, key: string): string {
  if (!value) return "";
  const raw = value[key];
  return raw == null ? "" : String(raw);
}

function unitField(value: Record<string, unknown> | null): string {
  const raw = value?.unit;
  return typeof raw === "string" && raw.trim() ? raw : "in";
}

function unknownKeys(value: Record<string, unknown> | null): string[] {
  if (!value) return [];
  return Object.keys(value).filter((key) => !KNOWN_DIMENSION_KEYS.has(key));
}

const FIELD_CLS =
  "w-full rounded-[6px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-2.5 py-2 text-center text-[0.82rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:bg-white focus:outline-none disabled:opacity-50";

const UNIT_CLS =
  "rounded-[6px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-2 py-2 text-[0.82rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none disabled:opacity-50";

const MINI_LABEL_CLS =
  "mb-1 block text-center font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]";

function PreservedHint({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <p className="mt-2 text-[11px] italic text-[var(--text-muted)]">
      +{count} captured field{count === 1 ? "" : "s"} preserved
    </p>
  );
}

export function DimensionFields({
  value,
  onChange,
  readOnly,
  disabled,
}: DimensionFieldsProps) {
  const width = stringField(value, "width");
  const depth = stringField(value, "depth");
  const height = stringField(value, "height");
  const unit = unitField(value);
  const extra = unknownKeys(value);

  if (readOnly) {
    const has = width.trim() || depth.trim() || height.trim();
    return (
      <div>
        <p
          className={`text-[0.86rem] leading-relaxed ${
            has
              ? "text-[var(--color-charcoal)]"
              : "italic text-[var(--text-muted)] opacity-70"
          }`}
        >
          {has
            ? `${width || "—"} × ${depth || "—"} × ${height || "—"} ${unit}`
            : "not yet measured"}
        </p>
        <PreservedHint count={extra.length} />
      </div>
    );
  }

  const emit = (overrides: Partial<Record<DimensionKey | "unit", string>>) => {
    const nextWidth = overrides.width ?? width;
    const nextDepth = overrides.depth ?? depth;
    const nextHeight = overrides.height ?? height;
    const nextUnit = overrides.unit ?? unit;
    const cleared = !nextWidth.trim() && !nextDepth.trim() && !nextHeight.trim();
    if (cleared && extra.length === 0) {
      onChange(null);
      return;
    }
    onChange({
      ...(value ?? {}),
      width: nextWidth,
      depth: nextDepth,
      height: nextHeight,
      unit: nextUnit,
    });
  };

  const fieldValue = (key: DimensionKey): string =>
    key === "width" ? width : key === "depth" ? depth : height;

  return (
    <div>
      <div className="flex items-end gap-2">
        {DIMENSION_KEYS.map((key) => (
          <label key={key} className="flex-1">
            <span className={MINI_LABEL_CLS}>{DIMENSION_LABELS[key]}</span>
            <input
              aria-label={DIMENSION_LABELS[key]}
              value={fieldValue(key)}
              placeholder={DIMENSION_PLACEHOLDERS[key]}
              disabled={disabled}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                emit({ [key]: event.target.value })
              }
              className={FIELD_CLS}
            />
          </label>
        ))}
        <label className="shrink-0">
          <span className={MINI_LABEL_CLS}>unit</span>
          <select
            aria-label="unit"
            value={unit}
            disabled={disabled}
            onChange={(event) => emit({ unit: event.target.value })}
            className={UNIT_CLS}
          >
            <option value="in">in</option>
            <option value="cm">cm</option>
          </select>
        </label>
      </div>
      <PreservedHint count={extra.length} />
    </div>
  );
}
