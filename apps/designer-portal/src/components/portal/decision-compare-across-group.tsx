'use client';

/**
 * "Compare across a group" (P1-6) — the decisions bridge.
 *
 * A decision is how a designer asks the client to choose. When the piece is a
 * family — exact variants or a made-to-configure body — the choice the client
 * is really being asked to make is usually ONE group of that family: which
 * finish, which size, which fabric. Building those cards by hand means retyping
 * the same piece three times and doing delta arithmetic in your head.
 *
 * So: pick one option group, tick the values worth putting in front of the
 * client, and the builder writes the sibling options for you — named for the
 * value, priced off the piece's resolved price, deltas measured against the
 * baseline, and each one carrying the FULL selection snapshot with just that
 * group's entry swapped. That snapshot is what `apply_decision` (00413) reads
 * to carry the winner's finish and material into `project_ffe_specs`.
 *
 * Everything it emits is a normal, editable option. Nothing is locked; the
 * deltas are a starting point, not a live formula fighting the designer's
 * subsequent edits.
 */

import { useMemo, useState } from 'react';
import { useProductConfigurationDefinition } from '@patina/supabase';
import type {
  ProductConfigurationDefinition,
  ProductConfigurationSelection,
  ProductOptionGroup,
  ProductOptionValue,
} from '@patina/types';
import { Button } from '@/components/ui/controls';
import type { DecisionOptionValue } from './decision-option-builder';

/** Configuration modes whose pieces have a group worth comparing across. */
export const COMPARABLE_CONFIGURATION_MODES = ['variant', 'configured'] as const;

export function isComparableConfigurationMode(mode: string | null | undefined): boolean {
  return mode === 'variant' || mode === 'configured';
}

// ─── Pure derivation (unit-tested directly) ──────────────────────────────────

const byPosition = <T extends { position?: number }>(a: T, b: T) =>
  (a.position ?? 0) - (b.position ?? 0);

const activeValues = (group: ProductOptionGroup): ProductOptionValue[] =>
  [...(group.values ?? [])].filter((v) => v.isActive !== false).sort(byPosition);

/**
 * The groups worth offering. A single-value group cannot be compared across —
 * there is nothing to put beside it.
 */
export function comparableGroups(
  definition: ProductConfigurationDefinition | undefined,
): ProductOptionGroup[] {
  return [...(definition?.optionGroups ?? [])]
    .sort(byPosition)
    .filter((group) => activeValues(group).length >= 2);
}

/** One chosen value in the ONE snapshot vocabulary (picker → decisions → spec). */
export function toSelectionEntry(
  group: ProductOptionGroup,
  value: ProductOptionValue,
): ProductConfigurationSelection {
  return {
    optionGroupId: group.id,
    optionValueId: value.id,
    groupCode: group.code,
    valueCode: value.code,
    groupName: group.name,
    valueLabel: value.label,
    retailPriceDeltaCents: value.retailPriceDeltaCents ?? 0,
    tradePriceDeltaCents: value.tradePriceDeltaCents ?? 0,
    leadTimeDeltaWeeks: value.leadTimeDeltaWeeks ?? 0,
    allowsCom: value.allowsCom ?? false,
  };
}

/**
 * The piece's base configuration, for an option that never carried a resolved
 * specification ("Decide later", or a legacy row saved before 00413). Prefers
 * the maker's default variant; otherwise takes the first offered value of every
 * required group. Optional groups stay unspecified — inventing a choice the
 * designer never made would be worse than leaving the group silent.
 */
export function deriveBaseSelections(
  definition: ProductConfigurationDefinition | undefined,
): ProductConfigurationSelection[] {
  if (!definition) return [];
  const defaultVariant = (definition.variants ?? []).find(
    (variant) => variant.isDefault && variant.status !== 'discontinued',
  );
  const fromVariant = new Set(defaultVariant?.optionValueIds ?? []);

  const out: ProductConfigurationSelection[] = [];
  for (const group of [...(definition.optionGroups ?? [])].sort(byPosition)) {
    const offered = activeValues(group);
    if (offered.length === 0) continue;
    const chosen =
      offered.find((value) => fromVariant.has(value.id)) ??
      (group.required ? offered[0] : undefined);
    if (!chosen) continue;
    out.push(toSelectionEntry(group, chosen));
  }
  return out;
}

/** True when the option already carries a resolved specification to build on. */
export function hasStashedSelection(source: DecisionOptionValue): boolean {
  return (source.configurationSelections?.length ?? 0) > 0;
}

/**
 * Swap one group's entry in a snapshot, preserving the ordinality of every
 * other entry. A group the base selection never spoke to is appended.
 */
export function swapSelection(
  selections: ProductConfigurationSelection[],
  entry: ProductConfigurationSelection,
): ProductConfigurationSelection[] {
  const index = selections.findIndex(
    (selection) => selection.optionGroupId === entry.optionGroupId,
  );
  if (index === -1) return [...selections, entry];
  const next = [...selections];
  next[index] = entry;
  return next;
}

/** First usable image on a value's swatch or media, if the maker gave one. */
export function optionValueImageUrl(value: ProductOptionValue): string | null {
  return firstUrl(value.swatch) ?? firstUrl(value.media?.[0]) ?? null;
}

function firstUrl(record: Record<string, unknown> | null | undefined): string | null {
  if (!record) return null;
  for (const key of ['imageUrl', 'image_url', 'url', 'src']) {
    const raw = record[key];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return null;
}

/** "+200" / "-50" — the sign the designer and the client both read. */
function signedDollars(cents: number): string {
  const dollars = cents / 100;
  return `${dollars > 0 ? '+' : ''}${dollars}`;
}

function signedInteger(value: number): string {
  return `${value > 0 ? '+' : ''}${value}`;
}

/**
 * The family name, without the specification suffix the picker appended. The
 * definition is the honest source; splitting the option's own name is the
 * fallback for a piece whose schema no longer names itself.
 */
function familyName(
  source: DecisionOptionValue,
  definition: ProductConfigurationDefinition | undefined,
): string {
  const fromDefinition = definition?.productName?.trim();
  if (fromDefinition) return fromDefinition;
  return source.name.split(' — ')[0].trim() || source.name.trim();
}

export interface BuildComparisonSiblingsArgs {
  /** The linked option the comparison is built from. */
  source: DecisionOptionValue;
  definition: ProductConfigurationDefinition | undefined;
  /** The ONE group being compared across. */
  groupId: string;
  /** The values the designer ticked. */
  valueIds: string[];
  /**
   * The option's resolved retail price in cents — the configured price when the
   * pick carried a specification, otherwise whatever the designer sees in the
   * price field. Falls back to the piece's base retail.
   */
  basePriceCents?: number;
}

/**
 * Build one sibling option per ticked value.
 *
 * Baseline = the value the option is already specified to (so the deltas read
 * as "what changes from what you have"); failing that, the first ticked value
 * in the maker's own order. Prices and deltas are computed ONCE, as plain
 * editable strings — this never re-runs behind a designer's later edits.
 */
export function buildComparisonSiblings({
  source,
  definition,
  groupId,
  valueIds,
  basePriceCents,
}: BuildComparisonSiblingsArgs): DecisionOptionValue[] {
  const group = (definition?.optionGroups ?? []).find((g) => g.id === groupId);
  if (!group) return [];

  const ticked = new Set(valueIds);
  const values = activeValues(group).filter((value) => ticked.has(value.id));
  if (values.length === 0) return [];

  const baseSelections = hasStashedSelection(source)
    ? (source.configurationSelections as ProductConfigurationSelection[])
    : deriveBaseSelections(definition);
  const current = baseSelections.find(
    (selection) => selection.optionGroupId === group.id,
  );
  const baseline =
    values.find((value) => value.id === current?.optionValueId) ?? values[0];

  const base = basePriceCents ?? definition?.baseRetailPriceCents ?? null;
  const name = familyName(source, definition);

  return values.map((value) => {
    const priceCents =
      base == null
        ? null
        : base +
          (value.retailPriceDeltaCents ?? 0) -
          (baseline.retailPriceDeltaCents ?? 0);
    const costDeltaCents =
      (value.tradePriceDeltaCents ?? 0) - (baseline.tradePriceDeltaCents ?? 0);
    const leadTimeDays =
      ((value.leadTimeDeltaWeeks ?? 0) - (baseline.leadTimeDeltaWeeks ?? 0)) * 7;

    return {
      ...source,
      name: `${name} — ${value.label}`,
      imageUrl: optionValueImageUrl(value) ?? source.imageUrl,
      // The note belongs to the option it was written on, not to its siblings.
      designerNote: '',
      // The builder's array owner clears this when another option already
      // carries the recommendation.
      isRecommended: value.id === baseline.id,
      price: priceCents == null ? '' : String(priceCents / 100),
      costDelta: costDeltaCents === 0 ? '' : signedDollars(costDeltaCents),
      leadTimeDelta: leadTimeDays === 0 ? '' : signedInteger(leadTimeDays),
      manualMode: false,
      saveAsDraft: false,
      configurationSelections: swapSelection(
        baseSelections,
        toSelectionEntry(group, value),
      ),
      // A generated sibling is intent, not a configuration of record — the
      // saved configuration is written later, at placement.
      savedConfigurationId: undefined,
      configurationPending: false,
    };
  });
}

// ─── Panel ───────────────────────────────────────────────────────────────────

const metaStyle = {
  fontFamily: 'var(--font-meta)',
  fontSize: '0.55rem',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
  color: 'var(--text-muted)',
};

const bodyStyle = {
  fontFamily: 'var(--font-body)',
  fontSize: '0.78rem',
  color: 'var(--text-primary)',
};

export interface CompareAcrossGroupPanelProps {
  source: DecisionOptionValue;
  /** Option index, for stable test ids alongside the builder's own. */
  index: number;
  /** The option's current price in cents, already parsed by the builder. */
  basePriceCents?: number;
  onGenerate: (siblings: DecisionOptionValue[]) => void;
  onClose: () => void;
}

export function CompareAcrossGroupPanel({
  source,
  index,
  basePriceCents,
  onGenerate,
  onClose,
}: CompareAcrossGroupPanelProps) {
  const query = useProductConfigurationDefinition(source.productId ?? null);
  const definition = query.data;
  const groups = useMemo(() => comparableGroups(definition), [definition]);

  const [pickedGroupId, setPickedGroupId] = useState<string | null>(null);
  const [tickedByGroup, setTickedByGroup] = useState<Record<string, string[]>>({});

  // Open on the group the option is already specified to — that is the choice
  // the designer is most likely putting in front of the client.
  const currentGroupId = source.configurationSelections?.[0]?.optionGroupId;
  const activeGroup =
    groups.find((group) => group.id === pickedGroupId) ??
    groups.find((group) => group.id === currentGroupId) ??
    groups[0] ??
    null;

  const currentValueId = activeGroup
    ? source.configurationSelections?.find(
        (selection) => selection.optionGroupId === activeGroup.id,
      )?.optionValueId
    : undefined;

  // The option's own value starts ticked so the baseline is present by default.
  const ticked = activeGroup
    ? (tickedByGroup[activeGroup.id] ??
      (currentValueId ? [currentValueId] : []))
    : [];

  const toggle = (valueId: string) => {
    if (!activeGroup) return;
    setTickedByGroup((prev) => {
      const existing = prev[activeGroup.id] ?? ticked;
      const next = existing.includes(valueId)
        ? existing.filter((id) => id !== valueId)
        : [...existing, valueId];
      return { ...prev, [activeGroup.id]: next };
    });
  };

  const generate = () => {
    if (!activeGroup) return;
    const siblings = buildComparisonSiblings({
      source,
      definition,
      groupId: activeGroup.id,
      valueIds: ticked,
      basePriceCents,
    });
    if (siblings.length === 0) return;
    onGenerate(siblings);
    onClose();
  };

  return (
    <div
      className="mb-3 flex flex-col gap-3 rounded-sm p-3"
      style={{ border: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}
      data-testid={`option-${index}-compare-panel`}
    >
      <div className="flex items-center justify-between">
        <span style={metaStyle}>Compare across a group</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          data-testid={`option-${index}-compare-close`}
          className="px-0 py-0 text-[0.72rem]"
        >
          Close
        </Button>
      </div>

      {query.isLoading ? (
        <span style={metaStyle}>Reading the options…</span>
      ) : groups.length === 0 || !activeGroup ? (
        <span style={bodyStyle} data-testid={`option-${index}-compare-empty`}>
          This piece has no option group with alternatives to compare.
        </span>
      ) : (
        <>
          {groups.length > 1 && (
            <div className="flex flex-col gap-1">
              <span style={metaStyle}>Group</span>
              <div className="flex flex-wrap gap-3">
                {groups.map((group) => (
                  <label key={group.id} className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="radio"
                      name={`option-${index}-compare-group-choice`}
                      checked={group.id === activeGroup.id}
                      onChange={() => setPickedGroupId(group.id)}
                    />
                    <span style={bodyStyle}>{group.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <span style={metaStyle}>{activeGroup.name}</span>
            <div className="flex flex-col gap-1">
              {activeValues(activeGroup).map((value) => (
                <label key={value.id} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={ticked.includes(value.id)}
                    onChange={() => toggle(value.id)}
                    aria-label={value.label}
                  />
                  <span style={bodyStyle}>{value.label}</span>
                </label>
              ))}
            </div>
          </div>

          {!hasStashedSelection(source) && (
            <span style={metaStyle} data-testid={`option-${index}-compare-base-note`}>
              Using the piece&rsquo;s base configuration
            </span>
          )}

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={generate}
              disabled={ticked.length === 0}
              data-testid={`option-${index}-compare-generate`}
            >
              Generate options
            </Button>
            <span style={metaStyle}>
              {ticked.length === 0
                ? 'Pick at least one value'
                : `${ticked.length} option${ticked.length === 1 ? '' : 's'}`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
