import type { ProductConfigurationMode } from "@patina/types";

export type ConfigurationMode = ProductConfigurationMode;

export type DimensionValue = string | number | null;

/**
 * What the maker asks of a COM order, authored on the option value (00413
 * `product_option_values.com_requirements`). Both fields are free text: this is
 * an instruction to a human at the vendor, not a computed quantity.
 */
export interface PieceComRequirementsView {
  /** Yardage the maker needs for the standard body — "14 yds", "18–20". */
  yardage?: string | null;
  /** Railroading, backing, ship-to, dye-lot — whatever the vendor must know. */
  notes?: string | null;
}

export interface PieceOptionValueView {
  id: string;
  code?: string;
  label: string;
  active?: boolean;
  sku?: string | null;
  swatch?: string | null;
  retailPriceDeltaCents?: number | null;
  tradePriceDeltaCents?: number | null;
  leadTimeDeltaWeeks?: number | null;
  dimensions?: Record<string, DimensionValue> | null;
  /** Choosing this value means the designer supplies the material (COM/COL). */
  allowsCom?: boolean;
  comRequirements?: PieceComRequirementsView | null;
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
  active?: boolean;
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

export interface FlatPieceCaptureOptions {
  colors?: string[];
  finishes?: string[];
  materials?: string[];
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
  /**
   * Scraped option lists from the capture source (extension `capture_provenance
   * .captureOptions`, P2-8) — a superset of the flat scalar fields above that
   * suggestedGroupsFromFlatPiece unions in so a captured product with multiple
   * available finishes/colors/materials still seeds a full suggestion set.
   */
  captureOptions?: FlatPieceCaptureOptions | null;
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

/**
 * The COM/COL fabric the designer is specifying, as the form holds it. Every
 * field is a string because every field is optional and hand-entered — a
 * half-known fabric ("Rogers & Goffigon, name TBD") must still be recordable.
 * The adapter narrows it to the wire shape at save time.
 */
export interface PieceComDetailsView {
  /** Which selected COM-capable value this fabric fills. */
  optionValueId: string | null;
  fabricName: string;
  mill: string;
  pattern: string;
  yardage: string;
  railroaded: boolean;
  shipTo: string;
  sidemark: string;
  secondLeadTimeWeeks: string;
  notes: string;
}

export const EMPTY_COM_DETAILS: PieceComDetailsView = {
  optionValueId: null,
  fabricName: "",
  mill: "",
  pattern: "",
  yardage: "",
  railroaded: false,
  shipTo: "",
  sidemark: "",
  secondLeadTimeWeeks: "",
  notes: "",
};

/**
 * A COM order's clock does not start when the PO is cut — it starts when the
 * fabric lands at the maker. The designer is told so at the moment they specify
 * it, in the same words the vendor PO prints.
 */
export const COM_LEAD_TIME_WARNING =
  "Lead time provisional until COM fabric is received.";

/** True once the designer has said anything at all about the fabric. */
export function comDetailsHaveContent(
  details: PieceComDetailsView | null | undefined,
): boolean {
  if (!details) return false;
  return (
    details.railroaded ||
    [
      details.fabricName,
      details.mill,
      details.pattern,
      details.yardage,
      details.shipTo,
      details.sidemark,
      details.secondLeadTimeWeeks,
      details.notes,
    ].some((value) => value.trim().length > 0)
  );
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

/**
 * Convert an authoring draft into the structural shape supported by a mode.
 * This is deliberately lossy: hidden structures must never survive a mode
 * change and continue affecting server evaluation behind the designer's back.
 */
export function definitionForConfigurationMode(
  definition: PieceConfigurationDefinitionView,
  mode: ConfigurationMode,
): PieceConfigurationDefinitionView {
  if (mode === "standard" || mode === "custom") {
    return {
      ...definition,
      mode,
      pricingStrategy: "base_plus_adjustments",
      optionGroups: [],
      variants: [],
      components: [],
      rules: [],
    };
  }

  if (mode === "variant") {
    return {
      ...definition,
      mode,
      pricingStrategy: "base_plus_adjustments",
      components: [],
    };
  }

  return {
    ...definition,
    mode,
    variants: [],
  };
}

export function configurationModeRemovalCount(
  definition: PieceConfigurationDefinitionView,
  mode: ConfigurationMode,
): number {
  const next = definitionForConfigurationMode(definition, mode);
  return (
    definition.optionGroups.length -
    next.optionGroups.length +
    definition.variants.length -
    next.variants.length +
    definition.components.length -
    next.components.length +
    definition.rules.length -
    next.rules.length
  );
}

export function suggestedGroupsFromFlatPiece(
  piece: FlatPieceConfigurationSource,
): SuggestedOptionGroup[] {
  const groups: SuggestedOptionGroup[] = [];
  const materialValues = uniqueClean([
    ...(piece.materials ?? []),
    ...(piece.captureOptions?.materials ?? []),
  ]);
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
    ...(piece.captureOptions?.colors ?? []),
  ]);
  if (colorValues.length > 0) {
    groups.push({
      id: "suggest-color",
      name: "Color",
      values: colorValues,
      selected: false,
    });
  }

  const finishValues = uniqueClean([
    ...(piece.finish ? [piece.finish] : []),
    ...(piece.captureOptions?.finishes ?? []),
  ]);
  if (finishValues.length > 0) {
    groups.push({
      id: "suggest-finish",
      name: "Finish",
      values: finishValues,
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
      .filter(
        (component) =>
          component.active !== false && component.defaultQuantity > 0,
      )
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
    const offeredValues = group.values.filter(
      (value) => value.active !== false,
    );
    const chosenInGroup = offeredValues.filter((value) => chosen.has(value.id));
    const minimum = group.minSelections ?? (group.required ? 1 : 0);
    const maximum =
      group.selectionType === "multiple"
        ? (group.maxSelections ?? offeredValues.length)
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
      } => !!item.definition && item.definition.active !== false,
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
    group.values.filter(
      (value) => value.active !== false && chosen.has(value.id),
    ),
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
