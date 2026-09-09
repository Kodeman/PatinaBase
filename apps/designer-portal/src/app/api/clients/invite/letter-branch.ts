/**
 * The one decision the route makes before it forks. Split out so it can be
 * tested without a Supabase client.
 *
 * BODY-DRIVEN, NOT FLAG-DRIVEN. `use-feature-flag.ts` is 'use client' and is
 * the only flag file in this portal, so a route handler cannot ask PostHog.
 * When the flag resolves true the client sends `letter: true`; the route takes
 * the new path only then, and otherwise runs today's exact code. The honest
 * limit: a designer could hand-craft `letter: true` and bypass the flag — that
 * is a studio writing its own letter to its own client under its own studio's
 * identity, which is acceptable, but it means the flag controls ROLLOUT, not
 * authorization. So the note is validated here and the studio identity is
 * resolved server-side; nothing in the body is trusted for either.
 */
export type LetterVerdict =
  | { take: false }
  | { take: false; error: string }
  | { take: true; note: string | null; projectId: string | null };

export function validateLetterRequest(body: {
  letter?: boolean;
  note?: string;
  projectId?: string;
}): LetterVerdict {
  if (!body.letter) return { take: false };

  const trimmed = (body.note ?? '').trim();
  if (trimmed.length > 280) {
    return { take: false, error: 'That line is longer than 280 characters.' };
  }

  return {
    take: true,
    note: trimmed || null,
    projectId: body.projectId ?? null,
  };
}
