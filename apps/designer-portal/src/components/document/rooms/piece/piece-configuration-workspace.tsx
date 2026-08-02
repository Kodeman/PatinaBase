"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Select, Textarea } from "@/components/ui/controls";
import { StrataSweep } from "@/components/ui/strata-sweep";
import { libraryConfigurationEvents } from "@/lib/analytics/library-configuration-events";
import { PieceConfigurationEditor } from "./piece-configuration-editor";
import {
  CONFIGURATION_MODE_COPY,
  formatDimensions,
  formatMoney,
  initialSelection,
  resolvePieceConfiguration,
  type FlatPieceConfigurationSource,
  type PieceConfigurationDefinitionView,
  type PieceConfigurationResolutionView,
  type PieceConfigurationSelectionView,
} from "./piece-configuration-model";

export interface AuthoritativeConfigurationResolution {
  selectionKey: string;
  valid: boolean;
  complete: boolean;
  errors: string[];
  warnings: string[];
  retailPriceCents: number | null;
  tradePriceCents: number | null;
  leadTimeWeeks: number | null;
  dimensions: Record<string, string | number | null> | null;
  matchedVariant: { id: string; sku?: string | null } | null;
  snapshot: Record<string, unknown>;
}

export interface SavedConfigurationView {
  id: string;
  name: string;
  version: number;
  status: string;
  isLibraryTemplate?: boolean;
  sourceChanged?: boolean;
  selection?: PieceConfigurationSelectionView;
}

export interface SaveConfigurationDraft {
  name: string | null;
  notes: string | null;
  customRequirements: Record<string, unknown> | null;
  selection: PieceConfigurationSelectionView;
}

export interface SavedConfigurationReference {
  id: string;
  version: number;
  sourceChanged?: boolean;
}

export function PieceConfigurationWorkspace({
  piece,
  definition,
  readOnly,
  definitionLoading = false,
  evaluating = false,
  savingDefinition = false,
  savingConfiguration = false,
  authoritativeResolution = null,
  savedConfigurations = [],
  initialSavedConfigurationId = null,
  revisionMode = false,
  onDefinitionChange,
  onSaveDefinition,
  onEvaluate,
  onSaveConfiguration,
  onPlace,
  onCustomCommission,
  onResolutionChange,
}: {
  piece: FlatPieceConfigurationSource;
  definition: PieceConfigurationDefinitionView;
  readOnly: boolean;
  definitionLoading?: boolean;
  evaluating?: boolean;
  savingDefinition?: boolean;
  savingConfiguration?: boolean;
  authoritativeResolution?: AuthoritativeConfigurationResolution | null;
  savedConfigurations?: SavedConfigurationView[];
  initialSavedConfigurationId?: string | null;
  revisionMode?: boolean;
  onDefinitionChange?: (definition: PieceConfigurationDefinitionView) => void;
  onSaveDefinition?: (
    definition: PieceConfigurationDefinitionView,
  ) => Promise<void> | void;
  onEvaluate?: (selection: PieceConfigurationSelectionView) => void;
  onSaveConfiguration?: (
    draft: SaveConfigurationDraft,
    current?: SavedConfigurationReference | null,
  ) => Promise<{ id: string; version?: number } | void>;
  onPlace: (
    savedConfigurationId: string | null,
    resolution: PieceConfigurationResolutionView,
    authoritativeSnapshot?: Record<string, unknown>,
  ) => Promise<void> | void;
  onCustomCommission?: (
    savedConfigurationId: string | null,
  ) => Promise<void> | void;
  onResolutionChange?: (
    resolution: PieceConfigurationResolutionView,
    authoritativeSnapshot?: Record<string, unknown>,
  ) => void;
}) {
  const [draftDefinition, setDraftDefinition] = useState(definition);
  const [selection, setSelection] = useState(() =>
    initialSelection(definition),
  );
  const [saveName, setSaveName] = useState("");
  const [notes, setNotes] = useState("");
  const [customBrief, setCustomBrief] = useState("");
  const [customMeasurements, setCustomMeasurements] = useState("");
  const [customSiteNotes, setCustomSiteNotes] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeSavedConfiguration, setActiveSavedConfiguration] =
    useState<SavedConfigurationReference | null>(null);
  const [configurationDirty, setConfigurationDirty] = useState(false);
  const [placing, setPlacing] = useState(false);
  const definitionRef = useRef(definition);
  const evaluateRef = useRef(onEvaluate);
  const loadedInitialConfigurationRef = useRef<string | null>(null);
  definitionRef.current = definition;
  evaluateRef.current = onEvaluate;

  useEffect(() => {
    const nextDefinition = definitionRef.current;
    const nextSelection = initialSelection(nextDefinition);
    setDraftDefinition(nextDefinition);
    setSelection(nextSelection);
    setActiveSavedConfiguration(null);
    setConfigurationDirty(false);
    loadedInitialConfigurationRef.current = null;
    evaluateRef.current?.(nextSelection);
  }, [definition.productId, definition.revision]);

  useEffect(() => {
    if (!initialSavedConfigurationId) {
      loadedInitialConfigurationRef.current = null;
      return;
    }
    if (loadedInitialConfigurationRef.current === initialSavedConfigurationId) {
      return;
    }
    const item = savedConfigurations.find(
      (candidate) => candidate.id === initialSavedConfigurationId,
    );
    if (!item?.selection) return;
    loadedInitialConfigurationRef.current = initialSavedConfigurationId;
    setSelection(item.selection);
    setActiveSavedConfiguration({
      id: item.id,
      version: item.version,
      sourceChanged: item.sourceChanged,
    });
    setSaveName(item.name);
    setConfigurationDirty(false);
    onEvaluate?.(item.selection);
  }, [
    definition.revision,
    initialSavedConfigurationId,
    onEvaluate,
    savedConfigurations,
  ]);

  const localResolution = useMemo(() => {
    const resolved = resolvePieceConfiguration({
      piece,
      definition: draftDefinition,
      selection,
    });
    if (
      draftDefinition.mode !== "custom" ||
      onCustomCommission ||
      customBrief.trim()
    ) {
      return resolved;
    }
    return {
      ...resolved,
      valid: false,
      complete: false,
      errors: [...resolved.errors, "Write a commission brief."],
    };
  }, [customBrief, draftDefinition, onCustomCommission, piece, selection]);
  const currentSelectionKey = selectionKey(selection);
  const freshAuthoritative =
    authoritativeResolution?.selectionKey === currentSelectionKey
      ? authoritativeResolution
      : null;
  const effectiveResolution = useMemo(
    () => mergeAuthoritativeResolution(localResolution, freshAuthoritative),
    [freshAuthoritative, localResolution],
  );
  const authoritativeSnapshot = freshAuthoritative?.snapshot;

  useEffect(() => {
    onResolutionChange?.(effectiveResolution, authoritativeSnapshot);
  }, [authoritativeSnapshot, effectiveResolution, onResolutionChange]);

  const changeSelection = (next: PieceConfigurationSelectionView) => {
    setSelection(next);
    setConfigurationDirty(true);
    onEvaluate?.(next);
  };

  const chooseValue = (groupId: string, valueId: string) => {
    const group = draftDefinition.optionGroups.find(
      (candidate) => candidate.id === groupId,
    );
    if (!group) return;
    const groupValueIds = new Set(group.values.map((value) => value.id));
    const multiple = group.selectionType === "multiple";
    const alreadySelected = selection.optionValueIds.includes(valueId);
    changeSelection({
      ...selection,
      optionValueIds: multiple
        ? alreadySelected
          ? selection.optionValueIds.filter((id) => id !== valueId)
          : [...selection.optionValueIds, valueId]
        : [
            ...selection.optionValueIds.filter((id) => !groupValueIds.has(id)),
            valueId,
          ],
    });
    libraryConfigurationEvents.optionSelected(piece.id, groupId);
  };

  const changeComponent = (
    componentId: string,
    patch: Partial<PieceConfigurationSelectionView["components"][number]>,
  ) => {
    const current = selection.components.find(
      (component) => component.componentId === componentId,
    ) ?? { componentId, quantity: 0, handedness: null };
    const nextComponent = { ...current, ...patch };
    const components = [
      ...selection.components.filter(
        (component) => component.componentId !== componentId,
      ),
      nextComponent,
    ];
    changeSelection({ ...selection, components });
    libraryConfigurationEvents.componentChanged(piece.id, componentId);
  };

  const save = async (): Promise<string | null> => {
    if (!onSaveConfiguration) return activeSavedConfiguration?.id ?? null;
    setSaveError(null);
    try {
      const saved = await onSaveConfiguration(
        {
          name: saveName.trim() || null,
          notes: notes.trim() || null,
          customRequirements:
            draftDefinition.mode === "custom"
              ? {
                  brief: customBrief.trim() || null,
                  measurements: customMeasurements.trim() || null,
                  siteNotes: customSiteNotes.trim() || null,
                }
              : null,
          selection,
        },
        activeSavedConfiguration,
      );
      const savedId = saved?.id ?? activeSavedConfiguration?.id ?? null;
      if (savedId) {
        setActiveSavedConfiguration({
          id: savedId,
          version:
            saved?.version ??
            (activeSavedConfiguration
              ? activeSavedConfiguration.version + 1
              : 1),
          sourceChanged: false,
        });
        setConfigurationDirty(false);
      }
      libraryConfigurationEvents.saved(piece.id, draftDefinition.mode);
      return savedId;
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "The configuration could not be saved.",
      );
      return null;
    }
  };

  const place = async () => {
    setSaveError(null);
    setPlacing(true);
    try {
      let savedConfigurationId = activeSavedConfiguration?.id ?? null;
      if (revisionMode) {
        savedConfigurationId = await save();
        if (!savedConfigurationId) {
          throw new Error("Save the revised specification before applying it.");
        }
        return;
      }
      if (draftDefinition.mode === "custom" && onCustomCommission) {
        await onCustomCommission(savedConfigurationId);
        return;
      }
      if (
        draftDefinition.mode !== "standard" &&
        (!savedConfigurationId || configurationDirty)
      ) {
        savedConfigurationId = await save();
        if (!savedConfigurationId) {
          throw new Error(
            "Save this configuration before adding it to a project.",
          );
        }
      }
      await onPlace(
        savedConfigurationId,
        effectiveResolution,
        authoritativeSnapshot,
      );
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "The configured piece could not be placed.",
      );
    } finally {
      setPlacing(false);
    }
  };

  if (definitionLoading) {
    return (
      <section className="mt-8 border-y border-[var(--doc-ink-border)] py-8">
        <StrataSweep size="sm" label="Reading the configuration" />
      </section>
    );
  }

  const modeCopy = CONFIGURATION_MODE_COPY[draftDefinition.mode];
  const requiresAuthoritative = draftDefinition.mode !== "standard";
  const canPlace =
    effectiveResolution.complete &&
    effectiveResolution.valid &&
    (revisionMode || activeSavedConfiguration?.sourceChanged !== true) &&
    (!requiresAuthoritative || freshAuthoritative?.complete === true) &&
    !evaluating;
  const unresolvedCount = effectiveResolution.errors.filter((error) =>
    error.startsWith("Choose "),
  ).length;

  return (
    <section
      id="piece-configuration"
      aria-labelledby="piece-configuration-title"
      data-configuration-mode={draftDefinition.mode}
      className="mt-8 border-y border-[var(--doc-ink-border)] py-7"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-[650px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="doc-type-meta uppercase tracking-[0.1em]">
              The specification
            </span>
            <span className="rounded-[3px] border border-[var(--color-clay)] bg-[rgba(196,165,123,0.08)] px-2 py-0.5 text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-charcoal)]">
              {modeCopy.label}
            </span>
            <span className="doc-type-meta">
              r{draftDefinition.revision} · maker definition
            </span>
          </div>
          <h2
            id="piece-configuration-title"
            className="mt-2 font-heading text-[1.65rem] italic leading-tight text-[var(--color-charcoal)]"
          >
            Choose the piece that will enter the project.
          </h2>
          <p className="doc-type-body mt-2 text-[var(--color-quiet-ink)]">
            {modeCopy.short} Your chosen specification is saved with the
            project, so later Library edits cannot silently change an approved
            selection.
          </p>
        </div>
        <ResolutionStatus
          resolution={effectiveResolution}
          evaluating={evaluating}
          unresolvedCount={unresolvedCount}
          awaitingConfirmation={
            requiresAuthoritative && !freshAuthoritative && !evaluating
          }
        />
      </div>

      {draftDefinition.mode === "standard" ? (
        <StandardSelector piece={piece} />
      ) : draftDefinition.mode === "custom" && onCustomCommission ? (
        <CustomCommissionLauncher />
      ) : draftDefinition.mode === "custom" ? (
        <CustomCommissionFields
          brief={customBrief}
          measurements={customMeasurements}
          siteNotes={customSiteNotes}
          onBriefChange={(value) => {
            setCustomBrief(value);
            setConfigurationDirty(true);
          }}
          onMeasurementsChange={(value) => {
            setCustomMeasurements(value);
            setConfigurationDirty(true);
          }}
          onSiteNotesChange={(value) => {
            setCustomSiteNotes(value);
            setConfigurationDirty(true);
          }}
        />
      ) : (
        <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_310px]">
          <div className="min-w-0 space-y-7">
            {draftDefinition.optionGroups.map((group) => (
              <fieldset key={group.id}>
                <legend className="flex items-baseline gap-2 text-[0.87rem] font-semibold text-[var(--color-charcoal)]">
                  {group.name}
                  {group.required && (
                    <span className="doc-type-meta font-normal">required</span>
                  )}
                  {group.selectionType === "multiple" && (
                    <span className="doc-type-meta font-normal">
                      choose {group.minSelections ?? (group.required ? 1 : 0)}
                      {group.maxSelections
                        ? `–${group.maxSelections}`
                        : " or more"}
                    </span>
                  )}
                </legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {group.values
                    .filter(
                      (value) =>
                        value.active !== false ||
                        selection.optionValueIds.includes(value.id),
                    )
                    .map((value) => {
                      const selected = selection.optionValueIds.includes(
                        value.id,
                      );
                      const unavailable = value.active === false;
                      const priceDelta = formatMoney(
                        value.retailPriceDeltaCents,
                      );
                      return (
                        <label
                          key={value.id}
                          className={`relative flex min-h-[64px] cursor-pointer items-center gap-3 rounded-[5px] border px-3 py-2.5 transition-colors ${
                            selected
                              ? "border-[var(--color-clay)] bg-[rgba(196,165,123,0.1)]"
                              : "border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)] hover:border-[var(--color-aged-oak)]"
                          } ${unavailable ? "border-dashed opacity-70" : ""}`}
                        >
                          <input
                            type={
                              unavailable || group.selectionType === "multiple"
                                ? "checkbox"
                                : "radio"
                            }
                            name={`configuration-${group.id}`}
                            value={value.id}
                            checked={selected}
                            onChange={() =>
                              unavailable
                                ? changeSelection({
                                    ...selection,
                                    optionValueIds:
                                      selection.optionValueIds.filter(
                                        (id) => id !== value.id,
                                      ),
                                  })
                                : chooseValue(group.id, value.id)
                            }
                            className="sr-only"
                          />
                          {value.swatch && (
                            <span
                              aria-hidden
                              className="h-8 w-8 shrink-0 rounded-full border border-[var(--doc-ink-border)]"
                              style={{ background: value.swatch }}
                            />
                          )}
                          <span className="min-w-0">
                            <span className="block text-[0.82rem] font-medium text-[var(--color-charcoal)]">
                              {value.label}
                            </span>
                            <span className="mt-0.5 block text-[0.68rem] text-[var(--color-quiet-ink)]">
                              {[
                                unavailable
                                  ? "No longer offered · remove or replace"
                                  : null,
                                value.sku ? `SKU ${value.sku}` : null,
                                priceDelta
                                  ? `${(value.retailPriceDeltaCents ?? 0) >= 0 ? "+" : ""}${priceDelta}`
                                  : null,
                                value.leadTimeDeltaWeeks
                                  ? `+${value.leadTimeDeltaWeeks} wk`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ") ||
                                "No change to price or lead time"}
                            </span>
                          </span>
                          {selected && (
                            <span
                              aria-hidden
                              className="ml-auto text-[var(--color-clay)]"
                            >
                              ✓
                            </span>
                          )}
                        </label>
                      );
                    })}
                </div>
              </fieldset>
            ))}

            {draftDefinition.mode === "configured" &&
              draftDefinition.components.length > 0 && (
                <ComponentComposer
                  definition={draftDefinition}
                  selection={selection}
                  onChange={changeComponent}
                />
              )}
          </div>

          <ConfigurationSummary
            piece={piece}
            resolution={effectiveResolution}
            authoritative={!!freshAuthoritative}
          />
        </div>
      )}

      {(effectiveResolution.errors.length > 0 ||
        effectiveResolution.warnings.length > 0) && (
        <CompatibilityFeedback resolution={effectiveResolution} />
      )}

      {activeSavedConfiguration?.sourceChanged && (
        <p
          role="alert"
          className="mt-5 border-l-2 border-[var(--color-terracotta)] pl-3 text-[0.75rem] text-[var(--color-charcoal)]"
        >
          The maker changed this piece after the saved specification. Review the
          current choices and save a new revision before placing it.
        </p>
      )}

      <div className="mt-6 grid gap-4 border-t border-[var(--doc-ink-border)] pt-5 lg:grid-cols-[minmax(0,1fr)_auto]">
        {!(draftDefinition.mode === "custom" && onCustomCommission) && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label>
              <span className="doc-type-meta mb-1 block font-semibold uppercase tracking-[0.06em]">
                Configuration name
              </span>
              <Input
                value={saveName}
                onChange={(event) => {
                  setSaveName(event.target.value);
                  setConfigurationDirty(true);
                }}
                placeholder="Living room · client-approved"
              />
            </label>
            <label>
              <span className="doc-type-meta mb-1 block font-semibold uppercase tracking-[0.06em]">
                Notes
              </span>
              <Input
                value={notes}
                onChange={(event) => {
                  setNotes(event.target.value);
                  setConfigurationDirty(true);
                }}
                placeholder="COM or install notes"
              />
            </label>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2">
          {!revisionMode &&
            !(draftDefinition.mode === "custom" && onCustomCommission) && (
              <Button
                variant="secondary"
                loading={savingConfiguration}
                disabled={!onSaveConfiguration}
                onClick={() => void save()}
              >
                {activeSavedConfiguration ? "Save changes" : "Save for later"}
              </Button>
            )}
          <Button
            disabled={!canPlace}
            loading={placing}
            onClick={() => {
              libraryConfigurationEvents.placementOpened(
                piece.id,
                draftDefinition.mode,
              );
              void place();
            }}
          >
            {revisionMode
              ? "Apply project revision"
              : draftDefinition.mode === "custom"
                ? "Start commission"
                : "Add configured piece"}
          </Button>
        </div>
      </div>
      {saveError && (
        <p
          role="alert"
          className="mt-2 text-[0.75rem] text-[var(--color-terracotta)]"
        >
          {saveError}
        </p>
      )}

      {savedConfigurations.length > 0 && (
        <SavedConfigurations
          items={savedConfigurations}
          onLoad={(item) => {
            if (!item.selection) return;
            changeSelection(item.selection);
            setActiveSavedConfiguration({
              id: item.id,
              version: item.version,
              sourceChanged: item.sourceChanged,
            });
            setSaveName(item.name);
            setConfigurationDirty(false);
          }}
        />
      )}

      {!readOnly && (
        <div className="mt-8">
          <PieceConfigurationEditor
            piece={piece}
            definition={draftDefinition}
            onChange={(next) => {
              const nextSelection = initialSelection(next);
              setDraftDefinition(next);
              onDefinitionChange?.(next);
              setSelection(nextSelection);
              setActiveSavedConfiguration(null);
              setConfigurationDirty(false);
              onEvaluate?.(nextSelection);
            }}
            onSave={onSaveDefinition}
            saving={savingDefinition}
          />
        </div>
      )}
    </section>
  );
}

function StandardSelector({ piece }: { piece: FlatPieceConfigurationSource }) {
  return (
    <div className="mt-6 grid gap-3 rounded-[5px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)] p-4 sm:grid-cols-3">
      <SummaryDatum label="SKU" value={piece.sku || "Not assigned"} />
      <SummaryDatum
        label="Retail"
        value={formatMoney(piece.priceRetailCents) || "Price on request"}
      />
      <SummaryDatum
        label="Lead time"
        value={
          piece.leadTimeWeeks != null
            ? `${piece.leadTimeWeeks} weeks`
            : "Confirm with maker"
        }
      />
      {formatDimensions(piece.dimensions) && (
        <div className="sm:col-span-3">
          <SummaryDatum
            label="Dimensions"
            value={formatDimensions(piece.dimensions)!}
          />
        </div>
      )}
    </div>
  );
}

function CustomCommissionFields({
  brief,
  measurements,
  siteNotes,
  onBriefChange,
  onMeasurementsChange,
  onSiteNotesChange,
}: {
  brief: string;
  measurements: string;
  siteNotes: string;
  onBriefChange: (value: string) => void;
  onMeasurementsChange: (value: string) => void;
  onSiteNotesChange: (value: string) => void;
}) {
  return (
    <div className="mt-6 grid gap-3 lg:grid-cols-2">
      <label className="lg:col-span-2">
        <span className="doc-type-meta mb-1 block font-semibold uppercase tracking-[0.06em]">
          Commission brief
        </span>
        <Textarea
          rows={4}
          required
          value={brief}
          onChange={(event) => onBriefChange(event.target.value)}
          placeholder="What this piece needs to do, how it should feel, and the materials that matter."
        />
      </label>
      <label>
        <span className="doc-type-meta mb-1 block font-semibold uppercase tracking-[0.06em]">
          Field measurements
        </span>
        <Textarea
          rows={3}
          value={measurements}
          onChange={(event) => onMeasurementsChange(event.target.value)}
          placeholder="Opening width, finished-floor height, clearances…"
        />
      </label>
      <label>
        <span className="doc-type-meta mb-1 block font-semibold uppercase tracking-[0.06em]">
          Site conditions
        </span>
        <Textarea
          rows={3}
          value={siteNotes}
          onChange={(event) => onSiteNotesChange(event.target.value)}
          placeholder="Trim, outlets, access, install constraints…"
        />
      </label>
      <div className="lg:col-span-2 rounded-[5px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)] px-4 py-3">
        <p className="text-[0.76rem] text-[var(--color-charcoal)]">
          Price on request · Lead time follows approved drawings and maker
          quote.
        </p>
        <p className="mt-1 text-[0.7rem] text-[var(--color-quiet-ink)]">
          Starting the commission creates revision 1. Later drawing or quote
          changes preserve the prior approval instead of rewriting it.
        </p>
      </div>
    </div>
  );
}

function CustomCommissionLauncher() {
  return (
    <div className="mt-6 rounded-[5px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)] px-4 py-4">
      <p className="text-[0.82rem] font-medium text-[var(--color-charcoal)]">
        Build the commission inside its project record.
      </p>
      <p className="doc-type-body mt-1 max-w-[68ch] text-[var(--color-quiet-ink)]">
        The workshop keeps field dimensions, drawings, maker quotes, and
        designer and client approvals together. Every submitted change becomes a
        preserved revision; nothing is sent outside the studio automatically.
      </p>
    </div>
  );
}

function ComponentComposer({
  definition,
  selection,
  onChange,
}: {
  definition: PieceConfigurationDefinitionView;
  selection: PieceConfigurationSelectionView;
  onChange: (
    componentId: string,
    patch: Partial<PieceConfigurationSelectionView["components"][number]>,
  ) => void;
}) {
  return (
    <fieldset>
      <legend className="text-[0.87rem] font-semibold text-[var(--color-charcoal)]">
        Compose the piece
      </legend>
      <p className="mt-1 text-[0.72rem] text-[var(--color-quiet-ink)]">
        Add only the modules needed. A chaise or end unit may also need a side.
      </p>
      <div className="mt-2 space-y-2">
        {definition.components
          .filter(
            (component) =>
              component.active !== false ||
              selection.components.some(
                (selected) =>
                  selected.componentId === component.id &&
                  selected.quantity > 0,
              ),
          )
          .map((component) => {
            const selected = selection.components.find(
              (candidate) => candidate.componentId === component.id,
            );
            const quantity = selected?.quantity ?? 0;
            const unavailable = component.active === false;
            const minimumQuantity = unavailable ? 0 : component.minQuantity;
            return (
              <div
                key={component.id}
                className="flex flex-wrap items-center gap-3 rounded-[5px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)] px-3 py-3"
              >
                <div className="min-w-[170px] flex-1">
                  <p className="text-[0.82rem] font-medium text-[var(--color-charcoal)]">
                    {component.name}
                  </p>
                  <p className="mt-0.5 text-[0.68rem] text-[var(--color-quiet-ink)]">
                    {[
                      unavailable
                        ? "No longer offered · remove or replace"
                        : null,
                      component.sku ? `SKU ${component.sku}` : null,
                      formatMoney(component.retailPriceCents),
                      component.leadTimeWeeks
                        ? `${component.leadTimeWeeks} wk`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {component.handedness === "either" && quantity > 0 && (
                  <label className="w-[132px]">
                    <span className="sr-only">{component.name} handedness</span>
                    <Select
                      aria-label={`${component.name} handedness`}
                      value={selected?.handedness ?? ""}
                      invalid={!selected?.handedness}
                      onChange={(event) =>
                        onChange(component.id, {
                          handedness: event.target.value as "left" | "right",
                        })
                      }
                    >
                      <option value="">Choose side</option>
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                    </Select>
                  </label>
                )}
                <div
                  className="flex items-center rounded-[4px] border border-[var(--doc-ink-border)] bg-white"
                  aria-label={`${component.name} quantity`}
                >
                  <button
                    type="button"
                    aria-label={`Remove one ${component.name}`}
                    disabled={quantity <= minimumQuantity}
                    onClick={() =>
                      onChange(component.id, {
                        quantity: Math.max(minimumQuantity, quantity - 1),
                      })
                    }
                    className="h-9 w-9 text-[1rem] text-[var(--color-charcoal)] disabled:opacity-30"
                  >
                    −
                  </button>
                  <output
                    aria-live="polite"
                    className="min-w-8 text-center font-mono text-[0.76rem] text-[var(--color-charcoal)]"
                  >
                    {quantity}
                  </output>
                  <button
                    type="button"
                    aria-label={`Add one ${component.name}`}
                    disabled={unavailable || quantity >= component.maxQuantity}
                    onClick={() =>
                      onChange(component.id, {
                        quantity: Math.min(component.maxQuantity, quantity + 1),
                      })
                    }
                    className="h-9 w-9 text-[1rem] text-[var(--color-charcoal)] disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
      </div>
    </fieldset>
  );
}

function ConfigurationSummary({
  piece,
  resolution,
  authoritative,
}: {
  piece: FlatPieceConfigurationSource;
  resolution: PieceConfigurationResolutionView;
  authoritative: boolean;
}) {
  return (
    <aside
      aria-label="Configured piece summary"
      className="h-fit rounded-[6px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)] p-4 lg:sticky lg:top-5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-heading text-[1.05rem] italic text-[var(--color-charcoal)]">
          This specification
        </h3>
        <span className="doc-type-meta">
          {authoritative ? "confirmed" : "estimating"}
        </span>
      </div>
      <dl className="mt-3 divide-y divide-[var(--doc-ink-border)]">
        <SummaryRow
          label="Retail"
          value={formatMoney(resolution.retailPriceCents) || "Price on request"}
        />
        {resolution.tradePriceCents != null && (
          <SummaryRow
            label="Trade"
            value={formatMoney(resolution.tradePriceCents)!}
          />
        )}
        <SummaryRow
          label="Lead time"
          value={
            resolution.leadTimeWeeks != null
              ? `${resolution.leadTimeWeeks} weeks`
              : "Confirm with maker"
          }
        />
        <SummaryRow
          label="SKU"
          value={resolution.sku || piece.sku || "Resolves after choices"}
        />
        {formatDimensions(resolution.dimensions) && (
          <SummaryRow
            label="Dimensions"
            value={formatDimensions(resolution.dimensions)!}
          />
        )}
      </dl>
      {!authoritative && (
        <p className="mt-3 border-t border-[var(--doc-ink-border)] pt-2 text-[0.66rem] italic leading-relaxed text-[var(--color-quiet-ink)]">
          Provisional until Patina confirms this combination against the maker’s
          current rules.
        </p>
      )}
    </aside>
  );
}

function ResolutionStatus({
  resolution,
  evaluating,
  unresolvedCount,
  awaitingConfirmation,
}: {
  resolution: PieceConfigurationResolutionView;
  evaluating: boolean;
  unresolvedCount: number;
  awaitingConfirmation: boolean;
}) {
  const label = evaluating
    ? "Checking compatibility…"
    : awaitingConfirmation && resolution.complete
      ? "Waiting for maker-rule check"
      : resolution.valid && resolution.complete
        ? "Ready for a project"
        : unresolvedCount > 0
          ? `${unresolvedCount} choice${unresolvedCount === 1 ? "" : "s"} left`
          : "Needs attention";
  const tone =
    resolution.valid && resolution.complete
      ? "var(--color-sage)"
      : resolution.errors.length > unresolvedCount
        ? "var(--color-terracotta)"
        : "var(--color-aged-oak)";
  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-2 rounded-[4px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)] px-3 py-2"
    >
      <i
        aria-hidden
        className="h-2 w-2 rounded-full"
        style={{ background: tone }}
      />
      <span className="text-[0.72rem] font-medium text-[var(--color-charcoal)]">
        {label}
      </span>
    </div>
  );
}

function CompatibilityFeedback({
  resolution,
}: {
  resolution: PieceConfigurationResolutionView;
}) {
  const nonChoiceErrors = resolution.errors.filter(
    (error) => !error.startsWith("Choose "),
  );
  if (nonChoiceErrors.length === 0 && resolution.warnings.length === 0) {
    return null;
  }
  return (
    <div
      aria-live="polite"
      className="mt-5 rounded-[5px] border border-[var(--doc-ink-border)] bg-[var(--doc-sheet-2)] px-4 py-3"
    >
      {nonChoiceErrors.length > 0 && (
        <div role="alert">
          <p className="text-[0.76rem] font-semibold text-[var(--color-terracotta)]">
            This combination cannot be ordered yet.
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-[0.72rem] text-[var(--color-charcoal)]">
            {nonChoiceErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      {resolution.warnings.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.72rem] text-[var(--color-quiet-ink)]">
          {resolution.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SavedConfigurations({
  items,
  onLoad,
}: {
  items: SavedConfigurationView[];
  onLoad: (item: SavedConfigurationView) => void;
}) {
  return (
    <section className="mt-6 border-t border-[var(--doc-ink-border)] pt-4">
      <h3 className="text-[0.82rem] font-semibold text-[var(--color-charcoal)]">
        Saved specifications
      </h3>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-2 rounded-[4px] border border-[var(--doc-ink-border)] px-3 py-2"
          >
            <span className="min-w-0">
              <span className="block truncate text-[0.75rem] font-medium text-[var(--color-charcoal)]">
                {item.name}
              </span>
              <span className="doc-type-meta">
                v{item.version} · {item.status}
                {item.isLibraryTemplate ? " · Library family" : ""}
              </span>
              {item.sourceChanged && (
                <span className="mt-0.5 block text-[0.66rem] font-medium text-[var(--color-terracotta)]">
                  Source changed · review
                </span>
              )}
            </span>
            {item.selection && (
              <Button variant="ghost" size="sm" onClick={() => onLoad(item)}>
                Load
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SummaryDatum({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="doc-type-meta uppercase tracking-[0.08em]">{label}</p>
      <p className="mt-1 text-[0.8rem] text-[var(--color-charcoal)]">{value}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[86px_1fr] gap-2 py-2 text-[0.72rem]">
      <dt className="text-[var(--color-quiet-ink)]">{label}</dt>
      <dd className="text-right font-medium text-[var(--color-charcoal)]">
        {value}
      </dd>
    </div>
  );
}

export function selectionKey(
  selection: PieceConfigurationSelectionView,
): string {
  return JSON.stringify({
    optionValueIds: [...selection.optionValueIds].sort(),
    components: [...selection.components]
      .map((component) => ({ ...component }))
      .sort((a, b) => a.componentId.localeCompare(b.componentId)),
  });
}

function mergeAuthoritativeResolution(
  local: PieceConfigurationResolutionView,
  authoritative: AuthoritativeConfigurationResolution | null,
): PieceConfigurationResolutionView {
  if (!authoritative) return local;
  return {
    ...local,
    valid: authoritative.valid,
    complete: local.complete && authoritative.complete,
    errors: authoritative.errors,
    warnings: authoritative.warnings,
    retailPriceCents: authoritative.retailPriceCents,
    tradePriceCents: authoritative.tradePriceCents,
    leadTimeWeeks: authoritative.leadTimeWeeks,
    dimensions: authoritative.dimensions,
    variantId: authoritative.matchedVariant?.id ?? null,
    sku: authoritative.matchedVariant?.sku ?? local.sku,
  };
}
