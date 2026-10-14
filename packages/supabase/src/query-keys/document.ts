/** Stable keys for the designer Document and its shared Desk cache. */
export const docKeys = {
  all: ['document-state'] as const,
  // One Desk entry per signed-in user; studio drafts are filtered per observer in `select`.
  desk: () => ['document-state', 'desk'] as const,
  engagement: (id: string | null) => ['document-state', 'engagement', id] as const,
  sectionTasks: (projectId: string | null) => ['section-tasks', projectId] as const,
  sectionGates: (projectId: string | null) => ['section-gates', projectId] as const,
};
