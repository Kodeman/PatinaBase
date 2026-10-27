/**
 * Query keys for C4 service acceptance (migration 00886). A family of its own:
 * the approval keys and readers never receive acceptance rows (X08).
 */
export const serviceAcceptanceKeys = {
  all: ['service-acceptance'] as const,
  project: (projectId: string | null | undefined) =>
    ['service-acceptance', 'project', projectId ?? null] as const,
};
