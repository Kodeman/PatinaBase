"use client";

import { useMemo, useState } from "react";
import { Button, Input, Select } from "@/components/ui/controls";
import { libraryConfigurationEvents } from "@/lib/analytics/library-configuration-events";
import {
  CONFIGURATION_MODE_COPY,
  configurationModeRemovalCount,
  createDefinitionFromSuggestions,
  definitionForConfigurationMode,
  localId,
  suggestedGroupsFromFlatPiece,
  type ConfigurationMode,
  type FlatPieceConfigurationSource,
  type PieceComponentView,
  type PieceConfigurationDefinitionView,
  type PieceConfigurationRuleView,
  type PieceOptionGroupView,
  type PieceOptionValueView,
  type PieceVariantView,
} from "./piece-configuration-model";

const CONFIGURABLE_MODES: Array<Exclude<ConfigurationMode, "standard">> = [
  "variant",
  "configured",
  "custom",
];

export function PieceConfigurationEditor({
  piece,
  definition,
  onChange,
  onSave,
  saving = false,
}: {
  piece: FlatPieceConfigurationSource;
  definition: PieceConfigurationDefinitionView;
  onChange: (definition: PieceConfigurationDefinitionView) => void;
  onSave?: (
    definition: PieceConfigurationDefinitionView,
  ) => Promise<void> | void;
  saving?: boolean;
}) {
  const suggested = useMemo(() => suggestedGroupsFromFlatPiece(piece), [piece]);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupMode, setSetupMode] =
    useState<Exclude<ConfigurationMode, "standard">>("variant");
  const [setupGroups, setSetupGroups] = useState(suggested);
  const [saveError, setSaveError] = useState<string | null>(null);

  const hasConfiguration =
    definition.mode !== "standard" ||
    definition.optionGroups.length > 0 ||
    definition.variants.length > 0 ||
    definition.components.length > 0;

  const begin = () => {
    const next = createDefinitionFromSuggestions({
      piece,
      mode: setupMode,
      suggestions: setupGroups,
    });
    onChange(next);
    setSetupOpen(false);
    libraryConfigurationEvents.started(piece.id, setupMode);
  };

  const save = async () => {
    if (!onSave) return;
    setSaveError(null);
    try {
      await onSave(definition);
      libraryConfigurationEvents.definitionSaved(piece.id, definition.mode);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "The configuration could not be saved.",
      );
    }
  };

  if (!hasConfiguration) {
    return (
      <section
        aria-labelledby="configuration-authoring-title"
        className="border-t border-[var(--doc-ink-border)] pt-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[620px]">
            <p className="doc-type-meta uppercase tracking-[0.1em]">
              Library structure
            </p>
            <h3
              id="configuration-authoring-title"
              className="mt-1 font-heading text-[1.22rem] italic text-[var(--color-charcoal)]"
            >
              One piece today. More choices when you need them.
            </h3>
            <p className="doc-type-body mt-2 text-[var(--color-quiet-ink)]">
              Start a configuration to record exact sizes, buildable options,
              modular parts, or a custom commission. Existing material and
              finish notes remain descriptive until you confirm them as choices.
            </p>
          </div>
          {!setupOpen && (
            <Button variant="secondary" onClick={() => setSetupOpen(true)}>
              Start configuration
            </Button>
          )}
        </div>

        {setupOpen && (
          <div className="mt-5 border-l-2 border-[var(--color-clay)] pl-4">
            <fieldset>
              <legend className="doc-type-meta font-semibold uppercase tracking-[0.08em]">
                How is this piece offered?
              </legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {CONFIGURABLE_MODES.map((mode) => (
                  <label
                    key={mode}
                    className={`cursor-pointer rounded-[5px] border px-3 py-3 transition-colors ${
                      setupMode === mode
                        ? "border-[var(--color-clay)] bg-[rgba(196,165,123,0.1)]"
                        : "border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="configuration-mode"
                      value={mode}
                      checked={setupMode === mode}
                      onChange={() => setSetupMode(mode)}
                      className="sr-only"
                    />
                    <span className="block text-[0.82rem] font-semibold text-[var(--color-charcoal)]">
                      {CONFIGURATION_MODE_COPY[mode].label}
                    </span>
                    <span className="mt-1 block text-[0.72rem] leading-relaxed text-[var(--color-quiet-ink)]">
                      {CONFIGURATION_MODE_COPY[mode].short}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {setupGroups.length > 0 && setupMode !== "custom" && (
              <fieldset className="mt-5">
                <legend className="doc-type-meta font-semibold uppercase tracking-[0.08em]">
                  Confirm any starting choices
                </legend>
                <p className="mt-1 text-[0.75rem] text-[var(--color-quiet-ink)]">
                  These suggestions come from the current piece record. Check
                  only values the maker truly offers as selectable options.
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {setupGroups.map((group) => (
                    <label
                      key={group.id}
                      className="flex cursor-pointer gap-2 rounded-[4px] border border-[var(--doc-ink-border)] px-3 py-2.5"
                    >
                      <input
                        type="checkbox"
                        checked={group.selected}
                        onChange={(event) =>
                          setSetupGroups((current) =>
                            current.map((candidate) =>
                              candidate.id === group.id
                                ? {
                                    ...candidate,
                                    selected: event.target.checked,
                                  }
                                : candidate,
                            ),
                          )
                        }
                        className="mt-0.5 accent-[var(--color-clay)]"
                      />
                      <span>
                        <span className="block text-[0.8rem] font-medium text-[var(--color-charcoal)]">
                          {group.name}
                        </span>
                        <span className="mt-0.5 block text-[0.7rem] text-[var(--color-quiet-ink)]">
                          {group.values.join(" · ")}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={begin}>Create draft</Button>
              <Button variant="ghost" onClick={() => setSetupOpen(false)}>
                Keep one specification
              </Button>
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <section
      aria-labelledby="configuration-authoring-title"
      className="border-t border-[var(--doc-ink-border)] pt-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="doc-type-meta uppercase tracking-[0.1em]">
            Configuration authoring
          </p>
          <h3
            id="configuration-authoring-title"
            className="mt-1 font-heading text-[1.22rem] italic text-[var(--color-charcoal)]"
          >
            Define what can actually be ordered.
          </h3>
        </div>
        <label className="w-full max-w-[260px]">
          <span className="doc-type-meta mb-1 block font-semibold uppercase tracking-[0.08em]">
            Offering model
          </span>
          <Select
            aria-label="Offering model"
            value={definition.mode}
            onChange={(event) => {
              const mode = event.target.value as ConfigurationMode;
              const removalCount = configurationModeRemovalCount(
                definition,
                mode,
              );
              if (
                removalCount > 0 &&
                !window.confirm(
                  `Changing the offering model removes ${removalCount} incompatible ${removalCount === 1 ? "entry" : "entries"} from this draft. Continue?`,
                )
              ) {
                return;
              }
              onChange(definitionForConfigurationMode(definition, mode));
            }}
          >
            {Object.entries(CONFIGURATION_MODE_COPY).map(([mode, copy]) => (
              <option key={mode} value={mode}>
                {copy.label}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {definition.mode !== "custom" && (
        <>
          <OptionGroupsEditor definition={definition} onChange={onChange} />
          {definition.mode === "variant" && (
            <VariantsEditor definition={definition} onChange={onChange} />
          )}
          {definition.mode === "configured" && (
            <ComponentsEditor definition={definition} onChange={onChange} />
          )}
          {(definition.mode === "variant" ||
            definition.mode === "configured") && (
            <RulesEditor definition={definition} onChange={onChange} />
          )}
        </>
      )}

      {definition.mode === "custom" && (
        <div className="mt-5 rounded-[5px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)] px-4 py-4">
          <p className="text-[0.82rem] font-medium text-[var(--color-charcoal)]">
            The product becomes a starting point for a project-specific
            commission.
          </p>
          <p className="doc-type-body mt-1 text-[var(--color-quiet-ink)]">
            Measurements, drawings, maker quotes, and approvals live with each
            commission revision. A completed design can later be promoted back
            into the Library as a reusable piece.
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-[var(--doc-ink-border)] pt-4">
        <Button loading={saving} disabled={!onSave} onClick={() => void save()}>
          Save choices
        </Button>
        <span className="doc-type-meta">Revision {definition.revision}</span>
      </div>
      {saveError && (
        <p
          role="alert"
          className="mt-2 text-[0.75rem] text-[var(--color-terracotta)]"
        >
          {saveError}
        </p>
      )}
      {!onSave && (
        <p className="mt-2 text-[0.72rem] italic text-[var(--color-quiet-ink)]">
          Configuration authoring is unavailable while this record is read only.
        </p>
      )}
    </section>
  );
}

function OptionGroupsEditor({
  definition,
  onChange,
}: {
  definition: PieceConfigurationDefinitionView;
  onChange: (definition: PieceConfigurationDefinitionView) => void;
}) {
  const addGroup = () =>
    onChange({
      ...definition,
      optionGroups: [
        ...definition.optionGroups,
        {
          id: localId("group"),
          name: `Option ${definition.optionGroups.length + 1}`,
          required: true,
          selectionType: "single",
          values: [],
        },
      ],
    });

  const updateGroup = (id: string, patch: Partial<PieceOptionGroupView>) =>
    onChange({
      ...definition,
      optionGroups: definition.optionGroups.map((group) =>
        group.id === id ? { ...group, ...patch } : group,
      ),
    });

  const moveGroup = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= definition.optionGroups.length) return;
    const next = [...definition.optionGroups];
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...definition, optionGroups: next });
  };

  const removeGroup = (id: string) => {
    const valueIds = new Set(
      definition.optionGroups
        .find((group) => group.id === id)
        ?.values.map((value) => value.id) ?? [],
    );
    onChange({
      ...definition,
      optionGroups: definition.optionGroups.filter((group) => group.id !== id),
      variants: definition.variants.map((variant) => ({
        ...variant,
        optionValueIds: variant.optionValueIds.filter(
          (valueId) => !valueIds.has(valueId),
        ),
      })),
      rules: definition.rules.filter(
        (rule) =>
          !valueIds.has(rule.sourceValueId) &&
          !valueIds.has(rule.targetValueId),
      ),
    });
  };

  return (
    <EditorSection
      title="Option groups"
      note="Sizes, upholstery, materials, and finishes. Each group is one decision."
      action={
        <Button variant="secondary" size="sm" onClick={addGroup}>
          Add group
        </Button>
      }
    >
      {definition.optionGroups.length === 0 ? (
        <EmptyEditorCopy>Nothing selectable yet.</EmptyEditorCopy>
      ) : (
        <div className="space-y-3">
          {definition.optionGroups.map((group, index) => (
            <fieldset
              key={group.id}
              className="rounded-[5px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)] p-3"
            >
              <legend className="sr-only">{group.name}</legend>
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Group name" className="min-w-[180px] flex-1">
                  <Input
                    aria-label={`Group ${index + 1} name`}
                    value={group.name}
                    onChange={(event) =>
                      updateGroup(group.id, { name: event.target.value })
                    }
                  />
                </Field>
                <label className="mb-2 flex items-center gap-2 text-[0.75rem] text-[var(--color-charcoal)]">
                  <input
                    type="checkbox"
                    checked={group.required}
                    onChange={(event) =>
                      updateGroup(group.id, { required: event.target.checked })
                    }
                    className="accent-[var(--color-clay)]"
                  />
                  Required
                </label>
                <Field label="Selection">
                  <Select
                    aria-label={`${group.name} selection type`}
                    value={group.selectionType ?? "single"}
                    onChange={(event) =>
                      updateGroup(group.id, {
                        selectionType: event.target.value as
                          | "single"
                          | "multiple",
                        maxSelections:
                          event.target.value === "single"
                            ? 1
                            : group.maxSelections,
                      })
                    }
                  >
                    <option value="single">Choose one</option>
                    <option value="multiple">Choose several</option>
                  </Select>
                </Field>
                {group.selectionType === "multiple" && (
                  <>
                    <Field label="Minimum">
                      <Input
                        type="number"
                        min={0}
                        value={group.minSelections ?? (group.required ? 1 : 0)}
                        onChange={(event) =>
                          updateGroup(group.id, {
                            minSelections: inputToNumber(event.target.value),
                          })
                        }
                      />
                    </Field>
                    <Field label="Maximum">
                      <Input
                        type="number"
                        min={1}
                        value={group.maxSelections ?? ""}
                        onChange={(event) =>
                          updateGroup(group.id, {
                            maxSelections: inputToNumber(event.target.value),
                          })
                        }
                      />
                    </Field>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Move ${group.name} up`}
                  disabled={index === 0}
                  onClick={() => moveGroup(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Move ${group.name} down`}
                  disabled={index === definition.optionGroups.length - 1}
                  onClick={() => moveGroup(index, 1)}
                >
                  ↓
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeGroup(group.id)}
                >
                  Remove
                </Button>
              </div>
              <OptionValuesEditor
                group={group}
                onChange={(values) => updateGroup(group.id, { values })}
                onRemove={(valueId) =>
                  onChange({
                    ...definition,
                    optionGroups: definition.optionGroups.map((candidate) =>
                      candidate.id === group.id
                        ? {
                            ...candidate,
                            values: candidate.values.filter(
                              (value) => value.id !== valueId,
                            ),
                          }
                        : candidate,
                    ),
                    variants: definition.variants.map((variant) => ({
                      ...variant,
                      optionValueIds: variant.optionValueIds.filter(
                        (id) => id !== valueId,
                      ),
                    })),
                    rules: definition.rules.filter(
                      (rule) =>
                        rule.sourceValueId !== valueId &&
                        rule.targetValueId !== valueId,
                    ),
                  })
                }
              />
            </fieldset>
          ))}
        </div>
      )}
    </EditorSection>
  );
}

function OptionValuesEditor({
  group,
  onChange,
  onRemove,
}: {
  group: PieceOptionGroupView;
  onChange: (values: PieceOptionValueView[]) => void;
  onRemove: (valueId: string) => void;
}) {
  const update = (id: string, patch: Partial<PieceOptionValueView>) =>
    onChange(
      group.values.map((value) =>
        value.id === id ? { ...value, ...patch } : value,
      ),
    );

  return (
    <div className="mt-3 border-t border-[var(--doc-ink-border)] pt-3">
      <div className="space-y-2">
        {group.values.map((value, index) => (
          <div
            key={value.id}
            className={`grid gap-2 rounded-[4px] bg-white p-2 sm:grid-cols-2 min-[980px]:grid-cols-6 ${value.active === false ? "opacity-60" : ""}`}
          >
            <Field label="Value" className="min-[980px]:col-span-2">
              <Input
                aria-label={`${group.name} value ${index + 1}`}
                value={value.label}
                onChange={(event) =>
                  update(value.id, { label: event.target.value })
                }
              />
            </Field>
            <Field label="SKU suffix">
              <Input
                value={value.sku ?? ""}
                onChange={(event) =>
                  update(value.id, { sku: event.target.value })
                }
              />
            </Field>
            <Field label="Swatch">
              <Input
                type="color"
                value={validColor(value.swatch) ? value.swatch! : "#c4a57b"}
                aria-label={`${value.label || group.name} swatch`}
                onChange={(event) =>
                  update(value.id, { swatch: event.target.value })
                }
              />
            </Field>
            <Field label="Price +">
              <Input
                type="number"
                step="0.01"
                value={centsToInput(value.retailPriceDeltaCents)}
                onChange={(event) =>
                  update(value.id, {
                    retailPriceDeltaCents: inputToCents(event.target.value),
                  })
                }
              />
            </Field>
            <Field label="Trade +">
              <Input
                type="number"
                step="0.01"
                value={centsToInput(value.tradePriceDeltaCents)}
                onChange={(event) =>
                  update(value.id, {
                    tradePriceDeltaCents: inputToCents(event.target.value),
                  })
                }
              />
            </Field>
            <Field label="Lead + weeks">
              <Input
                type="number"
                min={0}
                value={value.leadTimeDeltaWeeks ?? ""}
                onChange={(event) =>
                  update(value.id, {
                    leadTimeDeltaWeeks: inputToNumber(event.target.value),
                  })
                }
              />
            </Field>
            <DimensionsFields
              value={value.dimensions}
              onChange={(dimensions) => update(value.id, { dimensions })}
            />
            <div className="flex items-end justify-end gap-3 min-[980px]:col-span-3">
              <label className="mb-2 flex items-center gap-2 text-[0.75rem] text-[var(--color-charcoal)]">
                <input
                  type="checkbox"
                  checked={value.active !== false}
                  onChange={(event) =>
                    update(value.id, { active: event.target.checked })
                  }
                  className="accent-[var(--color-clay)]"
                />
                Offered
              </label>
              {!isPersistedId(value.id) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(value.id)}
                >
                  Remove value
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="mt-2"
        onClick={() =>
          onChange([
            ...group.values,
            { id: localId("value"), label: "", active: true },
          ])
        }
      >
        Add value
      </Button>
    </div>
  );
}

function VariantsEditor({
  definition,
  onChange,
}: {
  definition: PieceConfigurationDefinitionView;
  onChange: (definition: PieceConfigurationDefinitionView) => void;
}) {
  const update = (id: string, patch: Partial<PieceVariantView>) =>
    onChange({
      ...definition,
      variants: definition.variants.map((variant) =>
        variant.id === id ? { ...variant, ...patch } : variant,
      ),
    });

  return (
    <EditorSection
      title="Exact variants"
      note="Materialize only combinations the maker sells. Each row resolves to one SKU."
      action={
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            onChange({
              ...definition,
              variants: [
                ...definition.variants,
                {
                  id: localId("variant"),
                  name: "",
                  sku: "",
                  optionValueIds: [],
                  active: true,
                },
              ],
            })
          }
        >
          Add variant
        </Button>
      }
    >
      {definition.variants.length === 0 ? (
        <EmptyEditorCopy>No sellable variants defined.</EmptyEditorCopy>
      ) : (
        <div className="space-y-3">
          {definition.variants.map((variant, index) => (
            <fieldset
              key={variant.id}
              className="rounded-[5px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)] p-3"
            >
              <legend className="doc-type-meta px-1 uppercase tracking-[0.08em]">
                Variant {index + 1}
              </legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Name">
                  <Input
                    value={variant.name ?? ""}
                    onChange={(event) =>
                      update(variant.id, { name: event.target.value })
                    }
                  />
                </Field>
                <Field label="SKU">
                  <Input
                    value={variant.sku ?? ""}
                    onChange={(event) =>
                      update(variant.id, { sku: event.target.value })
                    }
                  />
                </Field>
                <Field label="Retail price">
                  <Input
                    type="number"
                    step="0.01"
                    value={centsToInput(variant.retailPriceCents)}
                    onChange={(event) =>
                      update(variant.id, {
                        retailPriceCents: inputToCents(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Lead time · weeks">
                  <Input
                    type="number"
                    min={0}
                    value={variant.leadTimeWeeks ?? ""}
                    onChange={(event) =>
                      update(variant.id, {
                        leadTimeWeeks: inputToNumber(event.target.value),
                      })
                    }
                  />
                </Field>
                {definition.optionGroups.map((group) => (
                  <Field key={group.id} label={group.name}>
                    <Select
                      aria-label={`${variant.name || `Variant ${index + 1}`} ${group.name}`}
                      value={
                        group.values.find((value) =>
                          variant.optionValueIds.includes(value.id),
                        )?.id ?? ""
                      }
                      onChange={(event) => {
                        const groupValueIds = new Set(
                          group.values.map((value) => value.id),
                        );
                        update(variant.id, {
                          optionValueIds: [
                            ...variant.optionValueIds.filter(
                              (id) => !groupValueIds.has(id),
                            ),
                            ...(event.target.value ? [event.target.value] : []),
                          ],
                        });
                      }}
                    >
                      <option value="">Choose…</option>
                      {group.values.map((value) => (
                        <option key={value.id} value={value.id}>
                          {value.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ))}
                <DimensionsFields
                  value={variant.dimensions}
                  onChange={(dimensions) => update(variant.id, { dimensions })}
                />
              </div>
              <div className="mt-2 flex items-center gap-3">
                <label className="flex items-center gap-2 text-[0.75rem] text-[var(--color-charcoal)]">
                  <input
                    type="checkbox"
                    checked={variant.active !== false}
                    onChange={(event) =>
                      update(variant.id, { active: event.target.checked })
                    }
                    className="accent-[var(--color-clay)]"
                  />
                  Offered
                </label>
                {!isPersistedId(variant.id) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      onChange({
                        ...definition,
                        variants: definition.variants.filter(
                          (candidate) => candidate.id !== variant.id,
                        ),
                      })
                    }
                  >
                    Remove variant
                  </Button>
                )}
              </div>
            </fieldset>
          ))}
        </div>
      )}
    </EditorSection>
  );
}

function ComponentsEditor({
  definition,
  onChange,
}: {
  definition: PieceConfigurationDefinitionView;
  onChange: (definition: PieceConfigurationDefinitionView) => void;
}) {
  const update = (id: string, patch: Partial<PieceComponentView>) =>
    onChange({
      ...definition,
      components: definition.components.map((component) =>
        component.id === id ? { ...component, ...patch } : component,
      ),
    });

  return (
    <EditorSection
      title="Modular parts"
      note="List the sectional pieces or cabinet modules a designer can compose."
      action={
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            onChange({
              ...definition,
              components: [
                ...definition.components,
                {
                  id: localId("component"),
                  name: "",
                  sku: "",
                  minQuantity: 0,
                  maxQuantity: 12,
                  defaultQuantity: 0,
                  handedness: "none",
                  active: true,
                },
              ],
            })
          }
        >
          Add part
        </Button>
      }
    >
      {definition.components.length === 0 ? (
        <EmptyEditorCopy>No modular parts defined.</EmptyEditorCopy>
      ) : (
        <div className="space-y-3">
          {definition.components.map((component, index) => (
            <fieldset
              key={component.id}
              className="rounded-[5px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)] p-3"
            >
              <legend className="doc-type-meta px-1 uppercase tracking-[0.08em]">
                Part {index + 1}
              </legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Name">
                  <Input
                    value={component.name}
                    onChange={(event) =>
                      update(component.id, { name: event.target.value })
                    }
                  />
                </Field>
                <Field label="SKU">
                  <Input
                    value={component.sku ?? ""}
                    onChange={(event) =>
                      update(component.id, { sku: event.target.value })
                    }
                  />
                </Field>
                <Field label="Retail price">
                  <Input
                    type="number"
                    step="0.01"
                    value={centsToInput(component.retailPriceCents)}
                    onChange={(event) =>
                      update(component.id, {
                        retailPriceCents: inputToCents(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Trade price">
                  <Input
                    type="number"
                    step="0.01"
                    value={centsToInput(component.tradePriceCents)}
                    onChange={(event) =>
                      update(component.id, {
                        tradePriceCents: inputToCents(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Minimum">
                  <Input
                    type="number"
                    min={0}
                    value={component.minQuantity}
                    onChange={(event) =>
                      update(component.id, {
                        minQuantity: inputToNumber(event.target.value) ?? 0,
                      })
                    }
                  />
                </Field>
                <Field label="Starting quantity">
                  <Input
                    type="number"
                    min={0}
                    value={component.defaultQuantity}
                    onChange={(event) =>
                      update(component.id, {
                        defaultQuantity: inputToNumber(event.target.value) ?? 0,
                      })
                    }
                  />
                </Field>
                <Field label="Maximum">
                  <Input
                    type="number"
                    min={0}
                    value={component.maxQuantity}
                    onChange={(event) =>
                      update(component.id, {
                        maxQuantity: inputToNumber(event.target.value) ?? 0,
                      })
                    }
                  />
                </Field>
                <Field label="Handedness">
                  <Select
                    value={component.handedness}
                    onChange={(event) =>
                      update(component.id, {
                        handedness: event.target
                          .value as PieceComponentView["handedness"],
                      })
                    }
                  >
                    <option value="none">Not handed</option>
                    <option value="left">Left only</option>
                    <option value="right">Right only</option>
                    <option value="either">Choose left or right</option>
                  </Select>
                </Field>
                <Field label="Lead time · weeks">
                  <Input
                    type="number"
                    min={0}
                    value={component.leadTimeWeeks ?? ""}
                    onChange={(event) =>
                      update(component.id, {
                        leadTimeWeeks: inputToNumber(event.target.value),
                      })
                    }
                  />
                </Field>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <label className="flex items-center gap-2 text-[0.75rem] text-[var(--color-charcoal)]">
                  <input
                    type="checkbox"
                    checked={component.active !== false}
                    onChange={(event) =>
                      update(component.id, { active: event.target.checked })
                    }
                    className="accent-[var(--color-clay)]"
                  />
                  Offered
                </label>
                {!isPersistedId(component.id) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      onChange({
                        ...definition,
                        components: definition.components.filter(
                          (candidate) => candidate.id !== component.id,
                        ),
                      })
                    }
                  >
                    Remove part
                  </Button>
                )}
              </div>
            </fieldset>
          ))}
        </div>
      )}
    </EditorSection>
  );
}

function RulesEditor({
  definition,
  onChange,
}: {
  definition: PieceConfigurationDefinitionView;
  onChange: (definition: PieceConfigurationDefinitionView) => void;
}) {
  const values = definition.optionGroups.flatMap((group) =>
    group.values.map((value) => ({
      id: value.id,
      label: `${group.name} · ${value.label}`,
    })),
  );
  const update = (id: string, patch: Partial<PieceConfigurationRuleView>) =>
    onChange({
      ...definition,
      rules: definition.rules.map((rule) =>
        rule.id === id ? { ...rule, ...patch } : rule,
      ),
    });

  return (
    <EditorSection
      title="Compatibility rules"
      note="Say which choices require or exclude one another, in plain language."
      action={
        <Button
          variant="secondary"
          size="sm"
          disabled={values.length < 2}
          onClick={() =>
            onChange({
              ...definition,
              rules: [
                ...definition.rules,
                {
                  id: localId("rule"),
                  kind: "excludes",
                  sourceValueId: values[0]?.id ?? "",
                  targetValueId: values[1]?.id ?? "",
                  message: "",
                },
              ],
            })
          }
        >
          Add rule
        </Button>
      }
    >
      {definition.rules.length === 0 ? (
        <EmptyEditorCopy>No compatibility rules defined.</EmptyEditorCopy>
      ) : (
        <div className="space-y-2">
          {definition.rules.map((rule) => (
            <div
              key={rule.id}
              className="grid gap-2 rounded-[5px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)] p-3 sm:grid-cols-2 lg:grid-cols-[1fr_150px_1fr_2fr_auto]"
            >
              <Field label="When">
                <Select
                  value={rule.sourceValueId}
                  onChange={(event) =>
                    update(rule.id, { sourceValueId: event.target.value })
                  }
                >
                  {values.map((value) => (
                    <option key={value.id} value={value.id}>
                      {value.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Relationship">
                <Select
                  value={rule.kind}
                  onChange={(event) =>
                    update(rule.id, {
                      kind: event.target
                        .value as PieceConfigurationRuleView["kind"],
                    })
                  }
                >
                  <option value="excludes">Cannot pair with</option>
                  <option value="requires">Requires</option>
                </Select>
              </Field>
              <Field label="Choice">
                <Select
                  value={rule.targetValueId}
                  onChange={(event) =>
                    update(rule.id, { targetValueId: event.target.value })
                  }
                >
                  {values.map((value) => (
                    <option key={value.id} value={value.id}>
                      {value.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Designer-facing message">
                <Input
                  placeholder="Walnut is not offered with the whitewash finish."
                  value={rule.message}
                  onChange={(event) =>
                    update(rule.id, { message: event.target.value })
                  }
                />
              </Field>
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onChange({
                      ...definition,
                      rules: definition.rules.filter(
                        (candidate) => candidate.id !== rule.id,
                      ),
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </EditorSection>
  );
}

function EditorSection({
  title,
  note,
  action,
  children,
}: {
  title: string;
  note: string;
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h4 className="text-[0.86rem] font-semibold text-[var(--color-charcoal)]">
            {title}
          </h4>
          <p className="mt-0.5 text-[0.72rem] text-[var(--color-quiet-ink)]">
            {note}
          </p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyEditorCopy({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[5px] border border-dashed border-[var(--doc-ink-border)] px-4 py-4 text-[0.76rem] italic text-[var(--color-quiet-ink)]">
      {children}
    </p>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={className}>
      <span className="doc-type-meta mb-1 block font-semibold uppercase tracking-[0.06em]">
        {label}
      </span>
      {children}
    </label>
  );
}

function DimensionsFields({
  value,
  onChange,
}: {
  value?: Record<string, string | number | null> | null;
  onChange: (value: Record<string, string | number | null>) => void;
}) {
  return (
    <>
      {(["width", "depth", "height"] as const).map((dimension) => (
        <Field key={dimension} label={`${dimension} · in`}>
          <Input
            type="number"
            step="0.125"
            min={0}
            value={value?.[dimension] ?? ""}
            onChange={(event) =>
              onChange({
                ...(value ?? {}),
                [dimension]: inputToNumber(event.target.value),
              })
            }
          />
        </Field>
      ))}
    </>
  );
}

function inputToCents(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) : null;
}

function centsToInput(value: number | null | undefined): string {
  return value == null ? "" : String(value / 100);
}

function inputToNumber(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validColor(value: string | null | undefined): boolean {
  return !!value && /^#[0-9a-f]{6}$/i.test(value);
}

function isPersistedId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
