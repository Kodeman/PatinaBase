'use client';

/**
 * The picker's configure step (P0-2). A piece that is a family — exact variants
 * or a made-to-configure body — must not enter a project as "the product",
 * because the product alone is not orderable. So the picker stops one beat
 * before it emits: the designer resolves ONE specification, the server confirms
 * it against the maker's rules, and the pick carries that resolution forward.
 *
 * It deliberately does NOT save a `product_configurations` row. The picker is
 * upstream of a project — a decision option or a proposal line is intent, not a
 * specification of record. What travels is a light, server-confirmed selection
 * in the ONE snapshot vocabulary; the configuration record is written later, at
 * placement, by the Piece room.
 *
 * Warn, never block: "Decide later" always exists and marks the pick
 * `configurationSkipped` so the consuming surface can show the debt.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useProduct,
  useProductConfigurationDefinition,
  useEvaluateProductConfiguration,
} from '@patina/supabase';
import type {
  ProductConfigurationComponentSelection,
  ProductConfigurationSelection,
  ProductConfigurationSnapshot,
} from '@patina/types';
import { Button } from '@/components/ui/controls';
import { StrataSweep } from '@/components/ui/strata-sweep';
import { libraryConfigurationEvents } from '@/lib/analytics/library-configuration-events';
import {
  comDetailsViewToInput,
  configurationDefinitionToView,
  evaluationToAuthoritative,
  pieceToConfigurationSource,
  selectionToEvaluationInput,
  type ConfigurationSourceProductRow,
} from '@/components/document/rooms/piece/piece-configuration-adapter';
import {
  PieceConfigurationWorkspace,
  type AuthoritativeConfigurationResolution,
} from '@/components/document/rooms/piece/piece-configuration-workspace';
import type {
  PieceComDetailsView,
  PieceConfigurationResolutionView,
  PieceConfigurationSelectionView,
} from '@/components/document/rooms/piece/piece-configuration-model';
import type {
  ProductPickConfigurationSelection,
  ProductPickResult,
} from './product-picker-modal';

/** The modes that stop the picker for a configure step. */
export const CONFIGURABLE_PICK_MODES = ['variant', 'configured', 'custom'] as const;

export interface PickerConfigureStepProps {
  /** The pick the grid emitted, already folded with the modal's scope room. */
  pick: ProductPickResult;
  /** Return to the grid without emitting anything. */
  onBack: () => void;
  /** Emit the pick carrying its confirmed selection. */
  onConfirm: (result: ProductPickResult) => void;
  /** Emit the pick unchanged, marked as configuration-pending. */
  onSkip: (result: ProductPickResult) => void;
  /** Analytics label for where the picker was mounted ('catalog' | 'library'). */
  pickerScope: string;
}

/**
 * Build the wire-safe selection from the server-confirmed snapshot, falling
 * back to the locally resolved view when the snapshot is absent (standard-ish
 * definitions that need no server round trip). Never invents pricing: a value
 * that is unknown stays null.
 */
export function buildPickConfigurationSelection(
  resolution: PieceConfigurationResolutionView,
  authoritativeSnapshot: Record<string, unknown> | undefined,
  comDetails?: PieceComDetailsView | null,
): ProductPickConfigurationSelection {
  const snapshot = authoritativeSnapshot as
    | Partial<ProductConfigurationSnapshot>
    | undefined;
  const selections: ProductConfigurationSelection[] = Array.isArray(
    snapshot?.selections,
  )
    ? (snapshot.selections as ProductConfigurationSelection[])
    : [];
  const components: ProductConfigurationComponentSelection[] = Array.isArray(
    snapshot?.components,
  )
    ? (snapshot.components as ProductConfigurationComponentSelection[])
    : [];
  const optionValueIds =
    selections.length > 0
      ? selections.map((selection) => selection.optionValueId)
      : resolution.snapshot.optionValueIds;

  return {
    // The picker never persists a configuration — a project placement does.
    savedConfigurationId: null,
    variantId: snapshot?.variant?.id ?? resolution.variantId ?? null,
    optionValueIds,
    selections,
    components,
    retailPriceCents: snapshot?.retailPriceCents ?? resolution.retailPriceCents ?? null,
    tradePriceCents: snapshot?.tradePriceCents ?? resolution.tradePriceCents ?? null,
    leadTimeWeeks: snapshot?.leadTimeWeeks ?? resolution.leadTimeWeeks ?? null,
    snapshot: authoritativeSnapshot ?? null,
    // The evaluate RPC knows nothing about COM — the fabric is merged into a
    // snapshot only by save, which the picker never calls. So carry it beside
    // the snapshot rather than forging one the server never hashed.
    comDetails: comDetailsViewToInput(comDetails),
    label: configurationLabel(selections, components, snapshot),
  };
}

/**
 * A short human label for the resolved specification — "King · Walnut". Falls
 * back to the variant's own name/SKU, then to the module count, so a resolved
 * piece is never labelled with an empty string.
 */
function configurationLabel(
  selections: ProductConfigurationSelection[],
  components: ProductConfigurationComponentSelection[],
  snapshot: Partial<ProductConfigurationSnapshot> | undefined,
): string {
  const values = selections
    .map((selection) => selection.valueLabel)
    .filter((label): label is string => !!label && label.trim().length > 0);
  if (values.length > 0) return values.join(' · ');

  const variantLabel = snapshot?.variant?.name ?? snapshot?.variant?.sku ?? null;
  if (variantLabel) return variantLabel;

  const moduleCount = components.reduce(
    (total, component) => total + (component.quantity ?? 0),
    0,
  );
  return moduleCount > 0 ? `${moduleCount} modules` : '';
}

export function PickerConfigureStep({
  pick,
  onBack,
  onConfirm,
  onSkip,
  pickerScope,
}: PickerConfigureStepProps) {
  const productId = pick.productId;
  const mode = pick.configurationMode ?? 'standard';
  const isCustom = mode === 'custom';

  const product = useProduct(productId);
  const definition = useProductConfigurationDefinition(isCustom ? null : productId);
  const evaluate = useEvaluateProductConfiguration();
  const [authoritative, setAuthoritative] =
    useState<AuthoritativeConfigurationResolution | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guards out-of-order evaluations: a fast second choice must win over a slow
  // first one (same pattern as the Piece room, :369-387).
  const evaluationSequence = useRef(0);

  useEffect(() => {
    libraryConfigurationEvents.pickerOpened(productId, mode, pickerScope);
  }, [mode, pickerScope, productId]);

  const piece = useMemo(
    () =>
      pieceToConfigurationSource(
        product.data as ConfigurationSourceProductRow | undefined,
        productId,
      ),
    [product.data, productId],
  );
  const view = useMemo(
    () => configurationDefinitionToView(definition.data, piece),
    [definition.data, piece],
  );

  const evaluateSelection = useCallback(
    (selection: PieceConfigurationSelectionView) => {
      const sequence = ++evaluationSequence.current;
      void evaluate
        .mutateAsync(selectionToEvaluationInput(productId, selection))
        .then((evaluation) => {
          if (sequence !== evaluationSequence.current) return;
          setError(null);
          setAuthoritative(evaluationToAuthoritative(evaluation, selection));
        })
        .catch(() => {
          if (sequence !== evaluationSequence.current) return;
          setAuthoritative(null);
          setError('Could not confirm the maker’s configuration rules.');
        });
    },
    [evaluate, productId],
  );

  const handleSkip = () => {
    libraryConfigurationEvents.pickerSkipped(productId, mode, pickerScope);
    onSkip({ ...pick, configurationSkipped: true });
  };

  const handlePlace = (
    _savedConfigurationId: string | null,
    resolution: PieceConfigurationResolutionView,
    authoritativeSnapshot?: Record<string, unknown>,
    comDetails?: PieceComDetailsView | null,
  ) => {
    const selection = buildPickConfigurationSelection(
      resolution,
      authoritativeSnapshot,
      comDetails,
    );
    libraryConfigurationEvents.pickerConfirmed(
      productId,
      mode,
      pickerScope,
      selection.selections.length,
    );
    onConfirm({ ...pick, configurationSelection: selection });
  };

  return (
    <div className="flex flex-col gap-3" data-testid="picker-configure-step">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            data-testid="picker-configure-back"
            aria-label="Back to results"
            className="px-0 py-0 text-[0.72rem]"
          >
            ← Back
          </Button>
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.82rem',
              color: 'var(--text-primary)',
            }}
          >
            {pick.name}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSkip}
          data-testid="picker-configure-skip"
          className="px-0 py-0 text-[0.72rem]"
        >
          Decide later
        </Button>
      </div>

      {isCustom ? (
        <CustomCommissionInterstitial
          productId={productId}
          onSkip={handleSkip}
        />
      ) : product.isLoading || definition.isLoading ? (
        <div className="py-8">
          <StrataSweep size="sm" label="Reading the specification" />
        </div>
      ) : (
        <>
          {error && (
            <div
              role="alert"
              className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {error}
            </div>
          )}
          <div className="max-h-[460px] overflow-y-auto pr-1">
            <PieceConfigurationWorkspace
              piece={piece}
              definition={view}
              // The picker configures; it never authors the maker's definition.
              // `readOnly` suppresses the authoring editor only — COM entry is
              // a selection, so it stays available here (P1-4).
              readOnly
              definitionLoading={false}
              evaluating={evaluate.isPending}
              authoritativeResolution={authoritative}
              onEvaluate={evaluateSelection}
              onPlace={handlePlace}
            />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Custom commissions have no picker-resolvable specification — scope,
 * revisions, drawings, and pricing live in the Piece room's commission
 * workshop. Say so plainly and offer both doors.
 */
function CustomCommissionInterstitial({
  productId,
  onSkip,
}: {
  productId: string;
  onSkip: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-sm border border-dashed p-4"
      style={{ borderColor: 'var(--border-default)' }}
      data-testid="picker-configure-custom"
    >
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.82rem',
          color: 'var(--text-primary)',
          lineHeight: 1.5,
        }}
      >
        Custom commission — scope, revisions, and pricing are set in the piece
        room.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => window.open(`/library/${productId}`)}
          data-testid="picker-configure-open-piece-room"
        >
          Open piece room
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSkip}
          data-testid="picker-configure-add-unconfigured"
        >
          Add unconfigured
        </Button>
      </div>
    </div>
  );
}
