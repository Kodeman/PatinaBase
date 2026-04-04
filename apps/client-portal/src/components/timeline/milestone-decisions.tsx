'use client';

import { useClientProjectDecisions, filterDecisionsByPhase } from '@/hooks/use-decisions-client';
import { DecisionCardClient } from '@/components/decision-card-client';

interface MilestoneDecisionsProps {
  projectId: string;
  phase: string;
}

export function MilestoneDecisions({ projectId, phase }: MilestoneDecisionsProps) {
  const { data: allDecisions } = useClientProjectDecisions(projectId);

  if (!allDecisions) return null;

  const phaseDecisions = filterDecisionsByPhase(allDecisions, phase);

  if (phaseDecisions.length === 0) return null;

  const pending = phaseDecisions.filter((d) => d.status === 'pending');
  const resolved = phaseDecisions.filter((d) => d.status === 'responded');

  return (
    <section className="space-y-3">
      <h5 className="type-meta">
        Decisions {pending.length > 0 && `(${pending.length} pending)`}
      </h5>
      {pending.map((decision) => (
        <DecisionCardClient key={decision.id} decision={decision} />
      ))}
      {resolved.map((decision) => (
        <DecisionCardClient key={decision.id} decision={decision} compact />
      ))}
    </section>
  );
}
