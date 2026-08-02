import type { ProductConfigurationMode } from "@patina/types";

export type ConfigurationMode = ProductConfigurationMode;

export type DimensionValue = string | number | null;

export interface PieceOptionValueView {
  id: string;
  code?: string;
  label: string;
  sku?: string | null;
  swatch?: string | null;
  retailPriceDeltaCents?: number | null;
  tradePriceDeltaCents?: number | null;
  leadTimeDeltaWeeks?: number | null;
  dimensions?: Record<string, DimensionValue> | null;
}

export interface PieceOptionGroupView {
  id: string;
  code?: string;
  name: string;
  required: boolean;
  selectionType?: "single" | "multiple";
  minSelections?: number | null;
  maxSelections?: number | null;
  values: PieceOptionValueView[];
}

export interface PieceVariantView {
  id: string;
  name?: string | null;
  sku?: string | null;
  optionValueIds: string[];
  retailPriceCents?: number | null;
  tradePriceCents?: number | null;
  leadTimeWeeks?: number | null;
  dimensions?: Record<string, DimensionValue> | null;
  active?: boolean;
}

export type PieceComponentHandedness = "none" | "left" | "right" | "either";

export interface PieceComponentView {
  id: string;
  name: string;
  sku?: string | null;
  retailPriceCents?: number | null;
  tradePriceCents?: number | null;
  leadTimeWeeks?: number | null;
  minQuantity: number;
  maxQuantity: number;
  defaultQuantity: number;
  handedness: PieceComponentHandedness;
}

export type PieceConfigurationRuleKind = "requires" | "excludes";

export interface PieceConfigurationRuleView {
  id: string;
  kind: PieceConfigurationRuleKind;
  sourceValueId: string;
  targetValueId: string;
  message: string;
}

export interface PieceConfigurationDefinitionView {
  productId: string;
  mode: ConfigurationMode;
  revision: number;
  pricingStrategy?: "base_plus_adjustments" | "component_sum";
  optionGroups: PieceOptionGroupView[];
  variants: PieceVariantView[];
  components: PieceComponentView[];
  rules: PieceConfigurationRuleView[];
}

export interface FlatPieceConfigurationSource {
  id: string;
  name: string;
  configurationMode?: ConfigurationMode | null;
  sku?: string | null;
  priceRetailCents?: number | null;
  priceTradeCents?: number | null;
  leadTimeWeeks?: number | null;
  dimensions?: Record<string, DimensionValue> | null;
  materials?: string[] | null;
  colors?: string[] | null;
  availableColors?: string[] | null;
  finish?: string | null;
}

export interface PieceConfigurationSelectionView {
  optionValueIds: string[];
  components: Array<{
    componentId: string;
    quantity: number;
    handedness?: "left" | "right" | null;
  }>;
}

export interface PieceConfigurationResolutionView {
  valid: boolean;
  complete: boolean;
  errors: string[];
  warnings: string[];
  variantId: string | null;
  sku: string | null;
  retailPriceCents: number | null;
  tradePriceCents: number | null;
  leadTimeWeeks: number | null;
  dimensions: Record<string, DimensionValue> | null;
  snapshot: {
    productId: string;
    mode: ConfigurationMode;
    definitionRevision: number;
    variantId: string | null;
    optionValueIds: string[];
    components: PieceConfigurationSelectionView["components"];
    sku: string | null;
    retailPriceCents: number | null;
    tradePriceCents: number | null;
    leadTimeWeeks: number | null;
    dimensions: Record<string, DimensionValue> | null;
  };
}

export interface SuggestedOptionGroup {
  id: string;
  name: string;
  values: string[];
  selected: boolean;
}

export const CONFIGURATION_MODE_COPY: Record<
  ConfigurationMode,
  { label: string; short: string }
> = {
  standard: {
    label: "One specification",
    short: "One known piece, ready as shown.",
  },
  variant: {
    label: "Exact variants",
    short: "A finite set of maker SKUs, such as bed sizes.",
  },
  configured: {
    label: "Made to configure",
    short: "Options, rules, and modular parts resolve one buildable piece.",
  },
  custom: {
    label: "Custom commission",
    short: "A project-specific brief, drawings, quote, and approvals.",
  },
};

export function flatDefinition(
  piece: FlatPieceConfigurationSource,
): PieceConfigurationDefinitionView {
  return {
    productId: piece.id,
    mode: piece.configurationMode ?? "standard",
    revision: 1,
    optionGroups: [],
    variants: [],
    components: [],
    rules: [],
  };
}

export function suggestedGroupsFromFlatPiece(
  piece: FlatPieceConfigurationSource,
): SuggestedOptionGroup[] {
  const groups: SuggestedOptionGroup[] = [];
  const materialValues = uniqueClean(piece.materials ?? []);
  if (materialValues.length > 0) {
    groups.push({
      id: "suggest-material",
      name: "Material",
      values: materialValues,
      selected: false,
    });
  }

  const colorValues = uniqueClean([
    ...(piece.availableColors ?? []),
    ...(piece.colors ?? []),
  ]);
  if (colorValues.length > 0) {
    groups.push({
      id: "suggest-color",
      name: "Color",
      values: colorValues,
      selected: false,
    });
  }

  if (piece.finish?.trim()) {
    groups.push({
      id: "suggest-finish",
      name: "Finish",
      values: [piece.finish.trim()],
      selected: false,
    });
  }

  return groups;
}

export function createDefinitionFromSuggestions({
  piece,
  mode,
  suggestions,
}: {
  piece: FlatPieceConfigurationSource;
  mode: Exclude<ConfigurationMode, "standard">;
  suggestions: SuggestedOptionGroup[];
}): PieceConfigurationDefinitionView {
  return {
    productId: piece.id,
    mode,
    revision: 1,
    optionGroups: suggestions
      .filter((group) => group.selected)
      .map((group, groupIndex) => ({
        id: localId(`group-${groupIndex + 1}`),
        name: group.name,
        required: true,
        selectionType: "single",
        values: group.values.map((label, valueIndex) => ({
          id: localId(`value-${groupIndex + 1}-${valueIndex + 1}`),
          label,
        })),
      })),
    variants: [],
    components: [],
    rules: [],
  };
}

export function initialSelection(
  definition: PieceConfigurationDefinitionView,
): PieceConfigurationSelectionView {
  return {
    optionValueIds: [],
    components: definition.components
      .filter((component) => component.defaultQuantity > 0)
      .map((component) => ({
        componentId: component.id,
        quantity: clamp(
          component.defaultQuantity,
          component.minQuantity,
          component.maxQuantity,
        ),
        handedness:
          component.handedness === "left" || component.handedness === "right"
            ? component.handedness
            : null,
      })),
  };
}

/**
 * Immediate, deterministic feedback for the selector. The server evaluator
 * remains authoritative; this keeps required choices and obvious compatibility
 * errors legible while a fresh evaluation is in flight.
 */
export function resolvePieceConfiguration({
  piece,
  definition,
  selection,
}: {
  piece: FlatPieceConfigurationSource;
  definition: PieceConfigurationDefinitionView;
  selection: PieceConfigurationSelectionView;
}): PieceConfigurationResolutionView {
  const chosen = new Set(selection.optionValueIds);
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const group of definition.optionGroups) {
    const chosenInGroup = group.values.filter((value) => chosen.has(value.id));
    const minimum = group.minSelections ?? (group.required ? 1 : 0);
    const maximum =
      group.selectionType === "multiple"
        ? (group.maxSelections ?? group.values.length)
        : 1;
    if (chosenInGroup.length < minimum) {
      errors.push(`Choose ${group.name.toLowerCase()}.`);
    }
    if (chosenInGroup.length > maximum) {
      errors.push(
        maximum === 1
          ? `Choose only one ${group.name.toLowerCase()}.`
          : `Choose no more than ${maximum} ${group.name.toLowerCase()} options.`,
      );
    }
  }

  for (const rule of definition.rules) {
    if (!chosen.has(rule.sourceValueId)) continue;
    if (rule.kind === "excludes" && chosen.has(rule.targetValueId)) {
      errors.push(rule.message || "Those choices are not offered together.");
    }
    if (rule.kind === "requires" && !chosen.has(rule.targetValueId)) {
      errors.push(rule.message || "That choice requires another option.");
    }
  }

  const selectedComponents = selection.components
    .map((selected) => ({
      selected,
      definition: definition.components.find(
        (component) => component.id === selected.componentId,
      ),
    }))
    .filter(
      (
        item,
      ): item is {
        selected: PieceConfigurationSelectionView["components"][number];
        definition: PieceComponentView;
      } => !!item.definition,
    );

  for (const { selected, definition: component } of selectedComponents) {
    if (
      selected.quantity < component.minQuantity ||
      selected.quantity > component.maxQuantity
    ) {
      errors.push(
        `${component.name} must be between ${component.minQuantity} and ${component.maxQuantity}.`,
      );
    }
    if (
      component.handedness === "either" &&
      selected.quantity > 0 &&
      !selected.handedness
    ) {
      errors.push(`${component.name} needs a left or right side.`);
    }
  }

  let variant: PieceVariantView | null = null;
  if (definition.mode === "variant" && errors.length === 0) {
    variant =
      definition.variants.find(
        (candidate) =>
          candidate.active !== false &&
          sameSet(candidate.optionValueIds, selection.optionValueIds),
      ) ?? null;
    if (!variant) errors.push("That combination is not an offered variant.");
  }

  const chosenValues = definition.optionGroups.flatMap((group) =>
    group.values.filter((value) => chosen.has(value.id)),
  );
  const optionRetailDelta = sumNullable(
    chosenValues.map((value) => value.retailPriceDeltaCents),
  );
  const optionTradeDelta = sumNullable(
    chosenValues.map((value) => value.tradePriceDeltaCents),
  );
  const componentRetail = weightedComponentTotal(
    selectedComponents.map(({ selected, definition: component }) =>
      component.retailPriceCents == null
        ? null
        : component.retailPriceCents * selected.quantity,
    ),
  );
  const componentTrade = weightedComponentTotal(
    selectedComponents.map(({ selected, definition: component }) =>
      component.tradePriceCents == null
        ? null
        : component.tradePriceCents * selected.quantity,
    ),
  );
  const optionLead = Math.max(
    0,
    ...chosenValues.map((value) => value.leadTimeDeltaWeeks ?? 0),
  );
  const componentLead = Math.max(
    0,
    ...selectedComponents.map(({ selected, definition: component }) =>
      selected.quantity > 0 ? (component.leadTimeWeeks ?? 0) : 0,
    ),
  );
  const dimensions =
    variant?.dimensions ??
    chosenValues.find((value) => value.dimensions)?.dimensions ??
    piece.dimensions ??
    null;

  const isCustom = definition.mode === "custom";
  const hasAssembly = selectedComponents.some(
    ({ selected }) => selected.quantity > 0,
  );
  const componentOnlyAssembly =
    hasAssembly && definition.pricingStrategy !== "base_plus_adjustments";
  const retailPriceCents = isCustom
    ? null
    : (variant?.retailPriceCents ??
      (componentOnlyAssembly
        ? addAssemblyPrice(componentRetail, optionRetailDelta)
        : addNullable(
            piece.priceRetailCents,
            optionRetailDelta,
            componentRetail ?? 0,
          )));
  const tradePriceCents = isCustom
    ? null
    : (variant?.tradePriceCents ??
      (componentOnlyAssembly
        ? addAssemblyPrice(componentTrade, optionTradeDelta)
        : addNullable(
            piece.priceTradeCents,
            optionTradeDelta,
            componentTrade ?? 0,
          )));
  const leadTimeWeeks = isCustom
    ? null
    : (variant?.leadTimeWeeks ??
      addNullable(piece.leadTimeWeeks, Math.max(optionLead, componentLead)));
  const complete = errors.length === 0;
  const sku = variant?.sku ?? piece.sku ?? null;

  if (
    definition.mode === "configured" &&
    definition.components.length > 0 &&
    selectedComponents.every(({ selected }) => selected.quantity === 0)
  ) {
    warnings.push("No modular pieces have been added yet.");
  }

  return {
    valid: errors.length === 0,
    complete,
    errors: uniqueClean(errors),
    warnings: uniqueClean(warnings),
    variantId: variant?.id ?? null,
    sku,
    retailPriceCents,
    tradePriceCents,
    leadTimeWeeks,
    dimensions,
    snapshot: {
      productId: piece.id,
      mode: definition.mode,
      definitionRevision: definition.revision,
      variantId: variant?.id ?? null,
      optionValueIds: [...selection.optionValueIds],
      components: selection.components.map((component) => ({ ...component })),
      sku,
      retailPriceCents,
      tradePriceCents,
      leadTimeWeeks,
      dimensions,
    },
  };
}

export function formatMoney(cents: number | null | undefined): string | null {
  if (cents == null) return null;
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

export function formatDimensions(
  dimensions: Record<string, DimensionValue> | null | undefined,
): string | null {
  if (!dimensions) return null;
  const entries = Object.entries(dimensions).filter(
    ([, value]) => value !== null && value !== "",
  );
  if (entries.length === 0) return null;
  return entries
    .map(([key, value]) => `${humanize(key)} ${String(value)}`)
    .join(" · ");
}

export function localId(prefix: string): string {
  return `draft-${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function uniqueClean(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((value) => set.has(value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sumNullable(values: Array<number | null | undefined>): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function weightedComponentTotal(
  values: Array<number | null | undefined>,
): number | null {
  const known = values.filter((value): value is number => value != null);
  return known.length === 0
    ? null
    : known.reduce((total, value) => total + value, 0);
}

function addAssemblyPrice(
  componentTotal: number | null,
  optionDelta: number,
): number | null {
  return componentTotal == null ? null : componentTotal + optionDelta;
}

function addNullable(
  base: number | null | undefined,
  ...deltas: number[]
): number | null {
  if (base == null && deltas.every((value) => value === 0)) return null;
  return (base ?? 0) + deltas.reduce((total, value) => total + value, 0);
}

function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
