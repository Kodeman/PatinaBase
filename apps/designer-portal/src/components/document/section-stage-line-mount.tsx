"use client";

import { useMemo } from "react";
import { useProjectWorkflow } from "@patina/supabase";

import { SectionStageLine } from "./workflow/section-stage-line";
import type { SectionKey } from "@/lib/document/desk-derivation";
import {
  deriveSectionWorkflowStageDocument,
  deriveWorkflowStageDocument,
} from "@/lib/document/workflow-stage-derivation";
import { deriveSectionStageLine } from "@/lib/document/section-stage-line";

export interface SectionStageLineMountProps {
  projectId: string | null;
  activeSection: SectionKey;
}

export function SectionStageLineMount({
  projectId,
  activeSection,
}: SectionStageLineMountProps) {
  const workflow = useProjectWorkflow(projectId);
  const model = useMemo(
    () =>
      deriveSectionStageLine(
        projectId
          ? deriveWorkflowStageDocument(workflow.data ?? [])
          : deriveSectionWorkflowStageDocument(activeSection),
      ),
    [activeSection, projectId, workflow.data],
  );

  if (projectId && workflow.isLoading) {
    return (
      <section
        aria-label="Workflow stage"
        aria-busy="true"
        data-workflow-document
        data-section-stage-line
        className="mb-1 min-w-0"
      >
        <p className="font-mono text-[12px] uppercase tracking-[0.09em] text-[var(--text-muted)]">
          Reading project workflow…
        </p>
      </section>
    );
  }

  if (projectId && workflow.isError) {
    return (
      <section
        aria-label="Workflow stage"
        data-workflow-document
        data-section-stage-line
        className="mb-1 min-w-0"
      >
        <p
          role="status"
          className="font-mono text-[12px] uppercase tracking-[0.09em] text-[var(--text-muted)]"
        >
          Stage position unavailable · the schedule itself is unchanged
        </p>
      </section>
    );
  }

  return <SectionStageLine model={model} />;
}
