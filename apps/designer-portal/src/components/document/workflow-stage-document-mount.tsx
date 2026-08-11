'use client';

import { useMemo } from 'react';
import { useProjectWorkflow } from '@patina/supabase';

import { WorkflowStageDocument } from './workflow/workflow-stage-document';
import { ContextualHandoffBand } from './workflow/contextual-handoff-band';
import type { SectionKey } from '@/lib/document/desk-derivation';
import {
  deriveSectionWorkflowStageDocument,
  deriveWorkflowStageDocument,
} from '@/lib/document/workflow-stage-derivation';

export interface WorkflowStageDocumentMountProps {
  projectId: string | null;
  activeSection: SectionKey;
}

export function WorkflowStageDocumentMount({
  projectId,
  activeSection,
}: WorkflowStageDocumentMountProps) {
  const workflow = useProjectWorkflow(projectId);
  const state = useMemo(
    () =>
      projectId
        ? deriveWorkflowStageDocument(workflow.data ?? [])
        : deriveSectionWorkflowStageDocument(activeSection),
    [activeSection, projectId, workflow.data],
  );

  if (projectId && workflow.isLoading) {
    return (
      <>
        <ContextualHandoffBand projectId={projectId} />
        <section
          aria-label="Residential project workflow"
          aria-busy="true"
          data-workflow-document
          className="mt-8 min-w-0 border-y border-[var(--border-subtle)] py-6"
        >
          <p className="text-[11px] text-[var(--text-muted)]">
            Reading project workflow…
          </p>
        </section>
      </>
    );
  }

  if (projectId && workflow.isError) {
    return (
      <>
        <ContextualHandoffBand projectId={projectId} />
        <section
          aria-label="Residential project workflow"
          data-workflow-document
          className="mt-8 min-w-0 border-y border-[var(--border-subtle)] py-6"
        >
          <p role="status" className="text-[11px] text-[var(--text-muted)]">
            Project workflow guidance is unavailable. The schedule itself is
            unchanged.
          </p>
        </section>
      </>
    );
  }

  return (
    <>
      {projectId && <ContextualHandoffBand projectId={projectId} />}
      <WorkflowStageDocument state={state} />
    </>
  );
}
