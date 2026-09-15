/**
 * Paperwork guest route — the trade-side compliance upload door (PR-a, VISION
 * V10, build/upload-door-spec.md §3).
 *
 * The eighth bearer-token guest prefix in this portal's established family
 * (/share, /field, /rfq, /trade, /evidence, /plans, /pay). A firm's paperwork
 * contact has no Patina account and never will: the 64-hex token minted by
 * `mint_paperwork_link` against the company card IS the authority, resolved
 * SERVER-SIDE through `resolve_paperwork_link` (service-only, 00637) with the
 * service client — force-dynamic, one RPC read, 404 on any miss (malformed,
 * unknown, revoked, expired) so a dead link never confirms it once existed.
 *
 * The token is keyed to (organization_id, company_id), never to a project or a
 * seat, so it reaches exactly one firm's paper at exactly one studio. Nothing
 * on this page carries an id, a file path or another party's name.
 *
 * The rate bucket is shared with the upload function (spec §2): one rolling
 * minute per address covers BOTH this resolve and every POST to
 * `paperwork-upload`, so volume cannot be split across the two to dodge it. An
 * unreadable limiter lets the request through — this is friction on guessing,
 * not the credential.
 *
 * The upload itself happens client-side in
 * src/components/paperwork/paperwork-upload-form.tsx, which posts to the
 * `paperwork-upload` edge function — there is no server action here, mirroring
 * how the token, not a session, is the authority for the whole door.
 */

import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createServiceClient } from '@patina/supabase/server';
import { resolveClientIp } from '@/lib/utils/client-ip';
import { PaperworkSheet } from '@/components/paperwork/paperwork-sheet';
import type { PaperworkContext } from '@/components/paperwork/paperwork-model';

// The token is resolved per request (and bumps last_used_at) — never static.
export const dynamic = 'force-dynamic';

const PAPERWORK_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export default async function PaperworkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Cheap format gate before any round-trip: a malformed token was never a
  // real link.
  if (!PAPERWORK_TOKEN_PATTERN.test(token)) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createServiceClient() as any;

  const callerIp = resolveClientIp(await headers());
  const { data: withinLimit, error: limitError } = await admin.rpc(
    'paperwork_link_rate_limit_hit',
    { p_ip: callerIp },
  );

  if (!limitError && withinLimit === false) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
        <h1 className="type-page-title">Too many tries just now.</h1>
        <p className="type-body mt-3 text-[var(--text-muted)]">
          Wait a minute, then open the link again.
        </p>
      </main>
    );
  }

  const { data, error } = await admin.rpc('resolve_paperwork_link', {
    p_token: token,
  });
  const context = (Array.isArray(data) ? data[0] : data) as PaperworkContext | null;

  if (error || !context) notFound();

  const studioName = context.studio_name?.trim() || 'the studio';

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-[var(--bg-primary)] px-4 py-10 sm:px-6">
      <header className="mb-8">
        <p className="type-meta">{context.company_name}</p>
        <h1
          className="type-page-title mt-1"
          style={{ fontSize: 'clamp(1.6rem, 6vw, 2.2rem)' }}
        >
          Paperwork for {studioName}
        </h1>
      </header>

      <PaperworkSheet token={token} studioName={studioName} context={context} />
    </main>
  );
}
