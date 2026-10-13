export function clientDigestDraftIdentity(
  userId: string,
  studioId: string,
  projectId: string,
  sinceIso: string,
) {
  return {
    refType: "client",
    refId: userId,
    dedupeKey: `digest:${userId}:${studioId}:${projectId}:${sinceIso}`,
  };
}
