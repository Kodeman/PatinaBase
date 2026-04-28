'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Breadcrumb } from '@/components/portal/breadcrumb';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useCreateProject, useUpdateProject } from '@/hooks/use-projects';
import { useActivationWizard } from '@/stores/project-activation-store';
import { WizardShell } from '@/components/portal/activation-wizard/wizard-shell';
import {
  Step01Basics,
  Step02Scope,
  Step03Schedule,
  Step04Financials,
  Step05Team,
  Step06Access,
  Step07Review,
} from '@/components/portal/activation-wizard/steps';

export default function NewProjectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const wizard = useActivationWizard();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Proposal fast-path: ?fromProposal=<id>&projectId=<newId> (the project has
  // already been created via activate_proposal_as_project; we're filling in
  // schedule/financials/team/access/review)
  const fromProposalId = searchParams.get('fromProposal');
  const proposalProjectId = searchParams.get('projectId');

  useEffect(() => {
    if (fromProposalId && proposalProjectId && wizard.fromProposalId !== fromProposalId) {
      // Hydrate the wizard with the proposal-created project and jump to step 03
      wizard.hydrateFromProposal({
        ...wizard,
        fromProposalId,
        draftProjectId: proposalProjectId,
        // Steps 01–02 are pre-populated by the RPC; the user mostly reviews schedule onward
      });
    }
  }, [fromProposalId, proposalProjectId, wizard]);

  const canAdvance = (() => {
    switch (wizard.step) {
      case 1: return wizard.name.trim().length > 0;
      case 2: return wizard.rooms.length > 0
        && wizard.rooms.every(r => r.name.trim().length > 0 && r.roomType.trim().length > 0);
      case 3: return wizard.kickoffDate.length > 0 && wizard.phases.length > 0;
      case 4: return wizard.budgetTotalCents > 0;
      default: return true;
    }
  })();

  const handleActivate = async () => {
    setActivating(true);
    setError(null);
    try {
      // If we have an existing draft (or proposal-derived project), update it.
      if (wizard.draftProjectId) {
        await updateProject.mutateAsync({
          id: wizard.draftProjectId,
          data: {
            name: wizard.name,
            status: 'active',
            budget_cents: wizard.budgetTotalCents,
            design_fee_cents: wizard.designFeeCents,
            start_date: wizard.kickoffDate,
            client_visibility_tier: wizard.visibilityTier,
          },
        });
        router.push(`/portal/projects/${wizard.draftProjectId}`);
        return;
      }

      // Manual creation path — calls activate_project_v2 RPC (cascade insert)
      const result = await createProject.mutateAsync({
        name: wizard.name,
        budget_total_cents: wizard.budgetTotalCents,
        design_fee_cents: wizard.designFeeCents,
        kickoff_date: wizard.kickoffDate,
        client_visibility_tier: wizard.visibilityTier,
        client_id: wizard.clientId || undefined,
        lead_designer_id: wizard.leadDesignerId || undefined,
        studio_id: wizard.studioId || undefined,
        rooms: wizard.rooms.map((r, i) => ({
          name: r.name,
          room_type: r.roomType,
          dimensions: r.dimensions,
          budget_cents: r.budgetCents,
          ffe_categories: r.ffeCategories,
          notes: r.notes,
          sort_order: i,
        })),
        phases: wizard.phases.map((p, i) => ({
          name: p.name,
          duration_weeks: p.durationWeeks,
          fee_cents: p.feeCents,
          gate_condition: p.gateCondition,
          sort_order: i,
        })),
        milestones: wizard.milestones.map((m, i) => ({
          label: m.label,
          percentage: m.percentage,
          amount_cents: m.amountCents,
          trigger_condition: m.triggerCondition,
          sort_order: i,
        })),
        team: wizard.team
          .filter((t) => t.userId)
          .map((t) => ({ user_id: t.userId, role: t.role })),
      });
      const id = (result as { id?: string })?.id ?? '';
      wizard.markSaved();
      router.push(`/portal/projects/${id}`);
    } catch (err) {
      console.error('Activation failed:', err);
      setError(err instanceof Error ? err.message : 'Activation failed. Please try again.');
      setActivating(false);
    }
  };

  if (activating) return <LoadingStrata />;

  const stepTitles: Record<number, { title: string; subtitle: string }> = {
    1: { title: 'Project basics', subtitle: 'Name, address, client, and lead designer.' },
    2: { title: 'Scope and rooms', subtitle: 'Add rooms with budget allocations. FF&E categories per room.' },
    3: { title: 'Schedule and phases', subtitle: 'Set the kickoff date. Adjust phase durations as needed.' },
    4: { title: 'Financials', subtitle: 'Total budget, design fee, and payment milestones.' },
    5: { title: 'Team and vendors', subtitle: 'Optional. Add support designers and pre-assigned vendors.' },
    6: { title: 'Client access', subtitle: 'How much will your client see?' },
    7: { title: 'Review and activate', subtitle: 'One last look before the project goes live.' },
  };

  return (
    <div className="pt-8">
      <Breadcrumb
        items={[
          { label: 'Projects', href: '/portal/projects' },
          { label: 'New Project' },
        ]}
      />

      {error && (
        <div
          className="mb-4 rounded-md border-2 p-3"
          style={{
            borderColor: 'var(--color-terracotta, #D4A090)',
            background: 'rgba(212, 160, 144, 0.08)',
          }}
        >
          <p className="type-body text-[0.82rem] text-[var(--text-primary)]">{error}</p>
        </div>
      )}

      <WizardShell
        title={stepTitles[wizard.step].title}
        subtitle={stepTitles[wizard.step].subtitle}
        canAdvance={canAdvance}
        onActivate={handleActivate}
        isActivating={activating}
      >
        {wizard.step === 1 && <Step01Basics />}
        {wizard.step === 2 && <Step02Scope />}
        {wizard.step === 3 && <Step03Schedule />}
        {wizard.step === 4 && <Step04Financials />}
        {wizard.step === 5 && <Step05Team />}
        {wizard.step === 6 && <Step06Access />}
        {wizard.step === 7 && <Step07Review />}
      </WizardShell>
    </div>
  );
}
