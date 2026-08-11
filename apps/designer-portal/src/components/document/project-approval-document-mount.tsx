'use client';

import {
  ProjectApprovalDocument,
  type ProjectApprovalPhase,
} from './approvals/project-approval-document';

export function toProjectApprovalPhases(rows: unknown): ProjectApprovalPhase[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const row = value as { id?: unknown; name?: unknown; status?: unknown };
    return typeof row.id === 'string' &&
      typeof row.name === 'string' &&
      typeof row.status === 'string'
      ? [{ id: row.id, name: row.name, status: row.status }]
      : [];
  });
}

export function ProjectApprovalDocumentMount({
  projectId,
  clientProfileId,
  phases,
}: {
  projectId: string | null;
  clientProfileId: string | null;
  phases: unknown;
}) {
  if (!projectId) return null;
  return (
    <ProjectApprovalDocument
      projectId={projectId}
      clientProfileId={clientProfileId}
      phases={toProjectApprovalPhases(phases)}
    />
  );
}
