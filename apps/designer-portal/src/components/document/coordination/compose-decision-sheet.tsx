'use client';

/**
 * ComposeDecisionSheet (C4) — the Drafting Room's host for escalating a flagged
 * line to a client Decision.
 *
 * The Drafting Room is its own route with no margin rail, so it mounts this
 * self-contained composer: it assembles the same project context the margin rail
 * does (designer_clients.id, phases, FF&E, parties), prefills the ItemComposer
 * with the rejected product as option A + the shortlisted taught alternatives,
 * and on creation stamps item_feedback.decision_id via
 * escalate_item_feedback_to_decision (the flag stays open — the Decision answers
 * it). Only mounted when a project + designer_client resolve — the composer's
 * existing contract. Zero shadows (D4); the DocSheet frame owns the overlay (D1).
 */

import { useMemo } from 'react';
import {
  useProjectFFEItems,
  useProjectParties,
  useProjectPhases,
  useEscalateFeedbackToDecision,
  type CoordinationItem,
} from '@patina/supabase';
import { useSectionTasks } from '@/hooks/use-section-work';
import { DocSheet } from '../overlays/doc-sheet';
import { ItemComposer, toComposerFfeItems, toComposerPhases } from './item-composer';
import { emptyOption, type DecisionOptionValue } from '@/components/portal/decision-option-builder';
import type { ComposeDecisionOption, ComposeDecisionRequest } from '@/lib/document/compose-decision';

/** Map a raw compose option to the builder's value; product-linked ones never
 *  re-materialize (they already exist). emptyOption() supplies every default. */
function toOptionValue(o: ComposeDecisionOption): DecisionOptionValue {
  return {
    ...emptyOption(),
    name: o.name,
    imageUrl: o.imageUrl ?? '',
    price: o.priceCents != null ? String(o.priceCents / 100) : '',
    productId: o.productId ?? undefined,
    brand: o.brand ?? undefined,
    layer: (o.layer as DecisionOptionValue['layer']) ?? undefined,
    saveAsDraft: !o.productId,
  };
}

export function ComposeDecisionSheet({
  proposalId,
  projectId,
  designerClientId,
  request,
  onClose,
  onLinked,
}: {
  proposalId: string;
  projectId: string;
  designerClientId: string;
  request: ComposeDecisionRequest;
  onClose: () => void;
  onLinked?: () => void;
}) {
  const { data: ffeItems } = useProjectFFEItems(projectId);
  const { data: parties } = useProjectParties(projectId);
  const { data: phaseRows } = useProjectPhases(projectId);
  const { data: tasks } = useSectionTasks(projectId);
  const escalate = useEscalateFeedbackToDecision();

  const composerFfe = useMemo(() => toComposerFfeItems(ffeItems), [ffeItems]);
  const composerPhases = useMemo(() => toComposerPhases(phaseRows), [phaseRows]);
  const initialOptions = useMemo<DecisionOptionValue[]>(
    () => [request.rejected, ...request.alternatives].map(toOptionValue),
    [request],
  );

  const onCreatedItem = (item: CoordinationItem) => {
    // Stamp the flag with the decision that now answers it. Best-effort — the
    // decision is created regardless; a lost link never blocks the compose.
    escalate.mutate({ feedbackId: request.feedbackId, decisionId: item.id, proposalId });
    onLinked?.();
  };

  return (
    <DocSheet open onClose={onClose} title="Put it to the client">
      {designerClientId && (
        <ItemComposer
          projectId={projectId}
          designerClientId={designerClientId}
          tasks={tasks ?? []}
          ffeItems={composerFfe}
          phases={composerPhases}
          parties={parties ?? []}
          initialTitle={request.title}
          initialOptions={initialOptions}
          onCreatedItem={onCreatedItem}
          onClose={onClose}
          onCreated={onClose}
        />
      )}
    </DocSheet>
  );
}
