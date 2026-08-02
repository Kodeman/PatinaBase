import type {
  CustomCommissionBrief,
  EvaluateProductConfigurationInput,
  ProductConfigurationDefinition,
  ProductConfigurationEvaluation,
  ProductConfigurationRule,
  ProductOptionGroup,
  SaveProductConfigurationInput,
  SavedProductConfiguration,
  UpsertProductConfigurationDefinitionInput,
} from "@patina/types";
import {
  definitionForConfigurationMode,
  flatDefinition,
  type DimensionValue,
  type FlatPieceConfigurationSource,
  type PieceConfigurationDefinitionView,
  type PieceConfigurationRuleView,
  type PieceConfigurationSelectionView,
} from "./piece-configuration-model";
import {
  selectionKey,
  type AuthoritativeConfigurationResolution,
  type SaveConfigurationDraft,
  type SavedConfigurationView,
} from "./piece-configuration-workspace";

export function configurationDefinitionToView(
  definition: ProductConfigurationDefinition | null | undefined,
  piece: FlatPieceConfigurationSource,
): PieceConfigurationDefinitionView {
  if (!definition) return flatDefinition(piece);
  return {
    productId: definition.productId,
    mode: definition.mode,
    pricingStrategy: definition.pricingStrategy,
    revision: definition.revision,
    optionGroups: definition.optionGroups.map((group) => ({
      id: group.id,
      code: group.code,
      name: group.name,
      required: group.required,
      selectionType: group.selectionType,
      minSelections: group.minSelections,
      maxSelections: group.maxSelections,
      values: group.values.map((value) => ({
        id: value.id,
        code: value.code,
        label: value.label,
        active: value.isActive,
        sku: readString(value.metadata, "sku") ?? value.code,
        swatch: readSwatch(value.swatch),
        retailPriceDeltaCents: value.retailPriceDeltaCents,
        tradePriceDeltaCents: value.tradePriceDeltaCents,
        leadTimeDeltaWeeks: value.leadTimeDeltaWeeks,
        dimensions: readDimensions(value.metadata),
      })),
    })),
    variants: definition.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      optionValueIds: variant.optionValueIds,
      retailPriceCents: variant.retailPriceCents,
      tradePriceCents: variant.tradePriceCents,
      leadTimeWeeks: variant.leadTimeWeeks,
      dimensions: toDimensions(variant.dimensions),
      active: variant.status === "active",
    })),
    components: definition.components.map((component) => ({
      id: component.id,
      name: component.name,
      active: component.isActive,
      sku: component.code,
      retailPriceCents: component.retailPriceCents,
      tradePriceCents: component.tradePriceCents,
      leadTimeWeeks: component.leadTimeWeeks,
      minQuantity: component.minQuantity,
      maxQuantity: component.maxQuantity ?? 99,
      defaultQuantity: component.defaultQuantity,
      handedness: component.handedness,
    })),
    rules: definition.rules.flatMap((rule) => {
      const view = ruleToView(rule, definition.optionGroups);
      return view ? [view] : [];
    }),
  };
}

export function configurationViewToUpsertInput(
  view: PieceConfigurationDefinitionView,
  source?: ProductConfigurationDefinition | null,
): UpsertProductConfigurationDefinitionInput {
  const canonicalView = definitionForConfigurationMode(view, view.mode);
  const sourceGroups = new Map(
    (source?.optionGroups ?? []).map((group) => [group.id, group]),
  );
  const sourceVariants = new Map(
    (source?.variants ?? []).map((variant) => [variant.id, variant]),
  );
  const sourceComponents = new Map(
    (source?.components ?? []).map((component) => [component.id, component]),
  );
  const sourceRules = new Map(
    (source?.rules ?? []).map((rule) => [rule.id, rule]),
  );
  const representedRuleIds = new Set(
    canonicalView.rules.map((rule) => rule.id),
  );

  return {
    mode: canonicalView.mode,
    pricingStrategy:
      canonicalView.pricingStrategy ??
      (canonicalView.components.length > 0
        ? "component_sum"
        : "base_plus_adjustments"),
    expectedRevision: canonicalView.revision,
    optionGroups: canonicalView.optionGroups.map((group, groupIndex) => {
      const original = sourceGroups.get(group.id);
      const originalValues = new Map(
        (original?.values ?? []).map((value) => [value.id, value]),
      );
      const code =
        group.code ??
        original?.code ??
        slugCode(group.name, `option-${groupIndex + 1}`);
      return {
        ...(persistedId(group.id) ? { id: group.id } : {}),
        code,
        name: group.name,
        description: original?.description ?? null,
        selectionType: group.selectionType ?? "single",
        required: group.required,
        minSelections: group.minSelections ?? (group.required ? 1 : 0),
        maxSelections:
          group.selectionType === "multiple"
            ? (group.maxSelections ?? Math.max(1, group.values.length))
            : 1,
        position: groupIndex,
        values: [
          ...group.values.map((value, valueIndex) => {
            const originalValue = originalValues.get(value.id);
            return {
              ...(persistedId(value.id) ? { id: value.id } : {}),
              code:
                value.code ??
                originalValue?.code ??
                slugCode(value.label, `value-${valueIndex + 1}`),
              label: value.label,
              description: originalValue?.description ?? null,
              swatch: value.swatch
                ? { hex: value.swatch }
                : (originalValue?.swatch ?? null),
              media: originalValue?.media ?? [],
              retailPriceDeltaCents: value.retailPriceDeltaCents ?? 0,
              tradePriceDeltaCents: value.tradePriceDeltaCents ?? 0,
              leadTimeDeltaWeeks: value.leadTimeDeltaWeeks ?? 0,
              metadata: {
                ...(originalValue?.metadata ?? {}),
                ...(value.sku ? { sku: value.sku } : {}),
                ...(value.dimensions ? { dimensions: value.dimensions } : {}),
              },
              position: valueIndex,
              isActive: value.active !== false,
            };
          }),
          ...(original?.values ?? [])
            .filter(
              (value) =>
                !value.isActive &&
                !group.values.some((candidate) => candidate.id === value.id),
            )
            .map((value) => ({
              id: value.id,
              code: value.code,
              label: value.label,
              description: value.description ?? null,
              swatch: value.swatch ?? null,
              media: value.media ?? [],
              retailPriceDeltaCents: value.retailPriceDeltaCents,
              tradePriceDeltaCents: value.tradePriceDeltaCents,
              leadTimeDeltaWeeks: value.leadTimeDeltaWeeks,
              metadata: value.metadata,
              position: value.position,
              isActive: false,
            })),
        ],
      };
    }),
    variants: canonicalView.variants.map((variant) => {
      const original = sourceVariants.get(variant.id);
      return {
        ...(persistedId(variant.id) ? { id: variant.id } : {}),
        code:
          original?.code ??
          slugCode(variant.name || variant.sku || "", "variant"),
        name: variant.name || variant.sku || "Variant",
        sku: variant.sku ?? null,
        vendorSku: original?.vendorSku ?? null,
        status: variant.active === false ? "discontinued" : "active",
        retailPriceCents: variant.retailPriceCents ?? null,
        tradePriceCents: variant.tradePriceCents ?? null,
        leadTimeWeeks: variant.leadTimeWeeks ?? null,
        dimensions: variant.dimensions ?? null,
        weight: original?.weight ?? null,
        metadata: original?.metadata ?? {},
        isDefault: original?.isDefault ?? false,
        // New option values only have UI-local ids until this transaction
        // inserts them. Stable group:value codes let the RPC resolve both new
        // and persisted choices in the same first save.
        optionValueIds: variant.optionValueIds.map((valueId) =>
          stableOptionValueReference(valueId, canonicalView, source),
        ),
      };
    }),
    components: [
      ...canonicalView.components.map((component, componentIndex) => {
        const original = sourceComponents.get(component.id);
        return {
          ...(persistedId(component.id) ? { id: component.id } : {}),
          code:
            original?.code ??
            slugCode(
              component.sku || component.name,
              `part-${componentIndex + 1}`,
            ),
          name: component.name,
          description: original?.description ?? null,
          componentType: original?.componentType ?? "module",
          handedness: component.handedness,
          minQuantity: component.minQuantity,
          maxQuantity: component.maxQuantity,
          defaultQuantity: component.defaultQuantity,
          retailPriceCents: component.retailPriceCents ?? 0,
          tradePriceCents: component.tradePriceCents ?? 0,
          leadTimeWeeks: component.leadTimeWeeks ?? 0,
          dimensions: original?.dimensions ?? null,
          metadata: original?.metadata ?? {},
          position: original?.position ?? componentIndex,
          isActive: component.active !== false,
        };
      }),
      ...(canonicalView.mode === "configured"
        ? (source?.components ?? [])
            .filter(
              (component) =>
                !component.isActive &&
                !canonicalView.components.some(
                  (candidate) => candidate.id === component.id,
                ),
            )
            .map((component) => ({
              id: component.id,
              code: component.code,
              name: component.name,
              description: component.description ?? null,
              componentType: component.componentType,
              handedness: component.handedness,
              minQuantity: component.minQuantity,
              maxQuantity: component.maxQuantity ?? null,
              defaultQuantity: component.defaultQuantity,
              retailPriceCents: component.retailPriceCents,
              tradePriceCents: component.tradePriceCents,
              leadTimeWeeks: component.leadTimeWeeks,
              dimensions: component.dimensions ?? null,
              metadata: component.metadata,
              position: component.position,
              isActive: false,
            }))
        : []),
    ],
    rules: [
      ...canonicalView.rules.map((rule, index) =>
        ruleViewToCanonical(
          rule,
          canonicalView,
          sourceRules.get(rule.id),
          index,
        ),
      ),
      ...(canonicalView.mode === "variant" ||
      canonicalView.mode === "configured"
        ? (source?.rules ?? []).filter(
            (rule) =>
              !representedRuleIds.has(rule.id) &&
              (!rule.isActive ||
                ruleToView(rule, source?.optionGroups ?? []) === null),
          )
        : []),
    ],
  };
}

export function selectionToEvaluationInput(
  productId: string,
  selection: PieceConfigurationSelectionView,
): EvaluateProductConfigurationInput {
  return {
    productId,
    optionValueIds: selection.optionValueIds,
    components: selection.components
      .filter((component) => component.quantity > 0)
      .map((component) => ({
        componentId: component.componentId,
        quantity: component.quantity,
        handedness: component.handedness ?? null,
      })),
  };
}

export function evaluationToAuthoritative(
  evaluation: ProductConfigurationEvaluation,
  selection: PieceConfigurationSelectionView,
): AuthoritativeConfigurationResolution {
  return {
    selectionKey: selectionKey(selection),
    valid: evaluation.valid,
    complete: evaluation.complete,
    errors: evaluation.violations,
    warnings: evaluation.warnings,
    retailPriceCents: evaluation.retailPriceCents,
    tradePriceCents: evaluation.tradePriceCents,
    leadTimeWeeks: evaluation.leadTimeWeeks,
    dimensions: toDimensions(evaluation.dimensions),
    matchedVariant: evaluation.matchedVariant
      ? {
          id: evaluation.matchedVariant.id,
          sku: evaluation.matchedVariant.sku,
        }
      : null,
    snapshot: evaluation.snapshot as unknown as Record<string, unknown>,
  };
}

export function configurationDraftToSaveInput({
  piece,
  definition,
  draft,
  configurationId,
  expectedVersion,
  projectId,
  ffeItemId,
}: {
  piece: FlatPieceConfigurationSource;
  definition: PieceConfigurationDefinitionView;
  draft: SaveConfigurationDraft;
  configurationId?: string;
  expectedVersion?: number;
  projectId?: string;
  ffeItemId?: string;
}): SaveProductConfigurationInput {
  const selected = new Set(draft.selection.optionValueIds);
  const selections = Object.fromEntries(
    definition.optionGroups
      .map((group) => [
        group.id,
        group.values
          .filter((value) => selected.has(value.id))
          .map((value) => value.id),
      ])
      .filter(([, valueIds]) => (valueIds as string[]).length > 0),
  ) as Record<string, string[]>;
  return {
    productId: piece.id,
    ...(configurationId ? { configurationId } : {}),
    ...(expectedVersion != null ? { expectedVersion } : {}),
    ...(projectId ? { projectId } : {}),
    ...(ffeItemId ? { ffeItemId } : {}),
    ...(draft.name ? { name: draft.name } : {}),
    ...(draft.notes ? { notes: draft.notes } : {}),
    selections,
    components: draft.selection.components
      .filter((component) => component.quantity > 0)
      .map((component) => ({
        componentId: component.componentId,
        quantity: component.quantity,
        handedness: component.handedness ?? null,
      })),
    ...(draft.customRequirements
      ? {
          customBrief: customRequirementsToBrief(
            draft.customRequirements,
            piece.name,
          ),
        }
      : {}),
  };
}

export function savedConfigurationToView(
  saved: SavedProductConfiguration,
  currentSchemaRevision?: number | null,
): SavedConfigurationView {
  const handedness = new Map(
    saved.snapshot.components.map((component) => [
      component.componentId,
      component.handedness ?? null,
    ]),
  );
  return {
    id: saved.id,
    name: saved.name || `Configuration ${saved.version}`,
    version: saved.version,
    status: saved.status,
    isLibraryTemplate: saved.isLibraryTemplate,
    sourceChanged:
      currentSchemaRevision != null &&
      saved.schemaRevision !== currentSchemaRevision,
    selection: {
      optionValueIds: saved.snapshot.selections.map(
        (selection) => selection.optionValueId,
      ),
      components: saved.snapshot.components.map((component) => ({
        componentId: component.componentId,
        quantity: component.quantity,
        handedness: handedness.get(component.componentId) ?? null,
      })),
    },
  };
}

export function pieceRoomConfigurationRows(
  configurations: SavedProductConfiguration[],
  revisionConfiguration?: SavedProductConfiguration | null,
): SavedProductConfiguration[] {
  const reusable = configurations.filter(
    (configuration) => configuration.projectId == null,
  );
  if (
    revisionConfiguration &&
    !reusable.some(
      (configuration) => configuration.id === revisionConfiguration.id,
    )
  ) {
    reusable.push(revisionConfiguration);
  }
  return reusable;
}

function ruleToView(
  rule: ProductConfigurationRule,
  groups: ProductOptionGroup[],
): PieceConfigurationRuleView | null {
  if (!rule.isActive) return null;
  const selected = recordOfStringArrays(rule.condition.selectedOptionValues);
  const source = firstValueReference(selected, groups);
  if (!source) return null;

  if (rule.ruleType === "requirement") {
    const required = recordOfStringArrays(rule.effect.requiredOptionValues);
    const target = firstValueReference(required, groups);
    if (!target) return null;
    return {
      id: rule.id,
      kind: "requires",
      sourceValueId: source,
      targetValueId: target,
      message: rule.message ?? "",
    };
  }

  if (rule.ruleType === "exclusion" || rule.ruleType === "compatibility") {
    const references = allValueReferences(selected, groups);
    const target = references.find((id) => id !== source);
    if (!target) return null;
    return {
      id: rule.id,
      kind: "excludes",
      sourceValueId: source,
      targetValueId: target,
      message: rule.message ?? "",
    };
  }
  return null;
}

function ruleViewToCanonical(
  rule: PieceConfigurationRuleView,
  definition: PieceConfigurationDefinitionView,
  original: ProductConfigurationRule | undefined,
  index: number,
): Omit<ProductConfigurationRule, "id" | "productId"> & { id?: string } {
  const source = optionReference(rule.sourceValueId, definition);
  const target = optionReference(rule.targetValueId, definition);
  const code = original?.code ?? `rule-${index + 1}`;
  const condition = {
    selectedOptionValues:
      rule.kind === "excludes"
        ? mergeReferences(source, target)
        : referenceRecord(source),
  };
  const effect =
    rule.kind === "excludes"
      ? { allowed: false }
      : { requiredOptionValues: referenceRecord(target) };
  return {
    ...(persistedId(rule.id) ? { id: rule.id } : {}),
    code,
    name: original?.name ?? (rule.message || `Rule ${index + 1}`),
    ruleType: rule.kind === "excludes" ? "exclusion" : "requirement",
    condition,
    effect,
    message: rule.message || null,
    priority: original?.priority ?? index,
    isActive: true,
  };
}

function optionReference(
  valueId: string,
  definition: PieceConfigurationDefinitionView,
): { groupCode: string; valueCode: string } | null {
  for (const group of definition.optionGroups) {
    const valueIndex = group.values.findIndex((value) => value.id === valueId);
    if (valueIndex < 0) continue;
    return {
      groupCode: group.code ?? slugCode(group.name, "option"),
      valueCode:
        group.values[valueIndex].code ??
        slugCode(group.values[valueIndex].label, `value-${valueIndex + 1}`),
    };
  }
  return null;
}

function stableOptionValueReference(
  valueId: string,
  definition: PieceConfigurationDefinitionView,
  source?: ProductConfigurationDefinition | null,
): string {
  const draftReference = optionReference(valueId, definition);
  if (draftReference) {
    return `${draftReference.groupCode}:${draftReference.valueCode}`;
  }
  for (const group of source?.optionGroups ?? []) {
    const value = group.values.find((candidate) => candidate.id === valueId);
    if (value) return `${group.code}:${value.code}`;
  }
  return valueId;
}

function referenceRecord(
  reference: { groupCode: string; valueCode: string } | null,
): Record<string, string[]> {
  return reference ? { [reference.groupCode]: [reference.valueCode] } : {};
}

function mergeReferences(
  ...references: Array<{ groupCode: string; valueCode: string } | null>
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const reference of references) {
    if (!reference) continue;
    result[reference.groupCode] = [
      ...(result[reference.groupCode] ?? []),
      reference.valueCode,
    ];
  }
  return result;
}

function firstValueReference(
  references: Record<string, string[]>,
  groups: ProductOptionGroup[],
): string | null {
  return allValueReferences(references, groups)[0] ?? null;
}

function allValueReferences(
  references: Record<string, string[]>,
  groups: ProductOptionGroup[],
): string[] {
  const ids: string[] = [];
  for (const [groupCode, valueCodes] of Object.entries(references)) {
    const group = groups.find((candidate) => candidate.code === groupCode);
    if (!group) continue;
    for (const valueCode of valueCodes) {
      const value = group.values.find(
        (candidate) => candidate.code === valueCode,
      );
      if (value) ids.push(value.id);
    }
  }
  return ids;
}

function customRequirementsToBrief(
  requirements: Record<string, unknown>,
  productName: string,
): CustomCommissionBrief {
  return {
    summary: readString(requirements, "brief") ?? `Custom ${productName}`,
    siteConditions: readString(requirements, "siteNotes") ?? undefined,
    notes: readString(requirements, "measurements") ?? undefined,
    priceOnRequest: true,
  };
}

function readDimensions(
  metadata: Record<string, unknown>,
): Record<string, DimensionValue> | null {
  return toDimensions(metadata.dimensions);
}

function toDimensions(value: unknown): Record<string, DimensionValue> | null {
  if (!isRecord(value)) return null;
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, item]) =>
        typeof item === "string" || typeof item === "number" || item === null,
    ),
  ) as Record<string, DimensionValue>;
}

function readSwatch(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return readString(value, "hex", "color", "value");
}

function readString(
  record: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function recordOfStringArrays(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      Array.isArray(item)
        ? item.filter((entry): entry is string => typeof entry === "string")
        : [],
    ]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function persistedId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function slugCode(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || fallback;
}
