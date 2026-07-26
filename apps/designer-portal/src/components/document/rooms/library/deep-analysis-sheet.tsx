'use client';

/**
 * Deep Analysis — the ~15-minute sitting (R32/R40). A paper sheet over the Room
 * that relocates the proven deep-teaching flow (style attribution + the style
 * spectrum + client matching) without leaving the Library. Saves through the
 * real useSubmitTeaching path — the same write the dedicated deep page uses.
 * The richest teaching there is; nothing is required to leave.
 *
 * Wave 3B (§5.2): the spectrum prefills canonical-else-draft — a designer-
 * confirmed row when one exists, else the Engine's newest draft read, quietly
 * marked as "the Engine's first read" (copy law: never a model name, never
 * "AI"). A save writes the canonical row and the marker retires itself.
 */

import { useEffect, useRef, useState } from 'react';
import {
  useSubmitTeaching,
  useProductSpectrum,
  useProductDnaDraft,
  resolveSpectrumPrefill,
} from '@patina/supabase';
import type { SpectrumValues } from '@patina/types';
import { DocumentAction, DocumentActionGroup } from '../../document-action';
import { RoomSheet } from '../room-sheet';
import { StyleAttributionPanel } from '@/components/teaching/StyleAttributionPanel';
import { ClientMatchingPanel } from '@/components/teaching/ClientMatchingPanel';

export function DeepAnalysisSheet({
  productId,
  productName,
  onClose,
  onSaved,
}: {
  productId: string;
  productName: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const submit = useSubmitTeaching();
  const [primaryStyleId, setPrimaryStyleId] = useState<string | null>(null);
  const [secondaryStyleId, setSecondaryStyleId] = useState<string | null>(null);
  const [spectrum, setSpectrum] = useState<Partial<SpectrumValues>>({});
  const [idealClientIds, setIdealClientIds] = useState<string[]>([]);
  const [avoidanceClientIds, setAvoidanceClientIds] = useState<string[]>([]);
  const [appealSignalIds, setAppealSignalIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // §5.2 canonical-else-draft prefill. Frozen once the designer touches a
  // slider so late-arriving data never fights their hand.
  const { data: canonical } = useProductSpectrum(productId) as {
    data: Partial<SpectrumValues> | null | undefined;
  };
  const { data: dnaDraft } = useProductDnaDraft(productId);
  const spectrumTouchedRef = useRef(false);
  const prefill = resolveSpectrumPrefill(
    canonical ?? null,
    dnaDraft?.draft ?? null,
  );

  useEffect(() => {
    if (spectrumTouchedRef.current) return;
    if (prefill.source === 'none') return;
    setSpectrum(prefill.values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canonical, dnaDraft]);

  const save = async () => {
    setError(null);
    try {
      await submit.mutateAsync({
        productId,
        teaching: {
          primaryStyleId: primaryStyleId ?? undefined,
          secondaryStyleId: secondaryStyleId ?? undefined,
          spectrum,
          idealClientIds,
          avoidanceClientIds,
          appealSignalIds,
        },
      });
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the analysis.');
    }
  };

  return (
    <RoomSheet open onClose={onClose} title={`Deep analysis — ${productName}`}>
      <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--color-clay)]">
        Deep analysis · the 15-minute sitting
      </div>
      <h2 className="mt-1 font-heading text-[1.6rem] font-medium text-[var(--color-charcoal)]">
        Map {productName}
      </h2>
      <p className="mb-2 mt-1 text-[0.74rem] text-[var(--color-aged-oak)]">
        Full intelligence mapping. The more you give, the better the Engine
        matches — for every designer after you, too. Nothing is required; save
        what you know.
      </p>
      {prefill.source === 'draft' && (
        <p className="mb-4 border-l-2 border-[var(--color-clay)] pl-2.5 text-[0.7rem] italic text-[var(--color-aged-oak)]">
          The spectrum starts at the Engine&apos;s first read of this piece —
          adjust anything and save to confirm it in your hand.
        </p>
      )}
      {prefill.source !== 'draft' && <div className="mb-4" />}

      <div className="space-y-7">
        <StyleAttributionPanel
          primaryStyleId={primaryStyleId}
          secondaryStyleId={secondaryStyleId}
          spectrumValues={spectrum}
          onPrimaryChange={setPrimaryStyleId}
          onSecondaryChange={setSecondaryStyleId}
          onSpectrumChange={(v) => {
            spectrumTouchedRef.current = true;
            setSpectrum((prev) => ({ ...prev, ...v }));
          }}
          showSpectrum
        />
        <ClientMatchingPanel
          idealClientIds={idealClientIds}
          avoidanceClientIds={avoidanceClientIds}
          appealSignalIds={appealSignalIds}
          onIdealClientsChange={setIdealClientIds}
          onAvoidanceClientsChange={setAvoidanceClientIds}
          onAppealSignalsChange={setAppealSignalIds}
        />
      </div>

      {error && (
        <p className="mt-4 text-[0.72rem] text-[var(--color-terracotta)]">
          {error}
        </p>
      )}

      <DocumentActionGroup
        surfaceKey="library"
        regionKey="deep-analysis-sheet"
        className="mt-6 border-t border-[var(--color-pearl)] pt-4"
      >
        <DocumentAction
          actionKey="save-full-analysis"
          variant="primary"
          loading={submit.isPending}
          loadingLabel="Saving…"
          onClick={() => void save()}
        >
          Save full analysis
        </DocumentAction>
        <DocumentAction
          actionKey="save-analysis-later"
          variant="tertiary"
          onClick={onClose}
        >
          Later
        </DocumentAction>
      </DocumentActionGroup>
    </RoomSheet>
  );
}
