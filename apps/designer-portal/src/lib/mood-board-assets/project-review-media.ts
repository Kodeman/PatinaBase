import { createBrowserClient } from '@patina/supabase';

export interface PreparedProjectReviewMedia {
  assetId: string;
  path: string;
  checksumSha256: string;
  derivativeKind: 'display';
  reused: boolean;
}

function preparedEnvelope(value: unknown, projectId: string): PreparedProjectReviewMedia {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : null;
  if (!row || typeof row.assetId !== 'string' || typeof row.path !== 'string' ||
      row.derivativeKind !== 'display' || typeof row.checksumSha256 !== 'string' ||
      typeof row.reused !== 'boolean' || !row.path.startsWith(`${projectId}/prepared/display/`)) {
    throw new Error('Review media preparation returned an invalid asset envelope.');
  }
  return row as unknown as PreparedProjectReviewMedia;
}

/** Registers the verified working object and prepares one immutable display derivative. */
export async function prepareProjectReviewMedia(options: {
  projectId: string;
  sourcePath: string;
}): Promise<PreparedProjectReviewMedia> {
  const { data, error } = await createBrowserClient().functions.invoke('project-review-media', {
    body: {
      action: 'prepare',
      projectId: options.projectId,
      sourceBucket: 'project-ffe-working',
      sourcePath: options.sourcePath,
      derivativeKind: 'display',
    },
  });
  if (error) throw new Error(error.message);
  return preparedEnvelope(data, options.projectId);
}
