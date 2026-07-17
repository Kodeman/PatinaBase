/**
 * Client evidence-upload page (Back of House S7).
 *
 * A login-less, mobile-first page a client opens from a one-time link a
 * designer minted against a receiving exception (fulfillment_mint_evidence_
 * token, 00364). No session: the token is resolved SERVER-SIDE through
 * fulfillment_evidence_token_context() using the service client, per the
 * proven apps/client-portal/src/app/field/[token]/page.tsx pattern —
 * force-dynamic, service client, single RPC read. Unlike /field and /share,
 * an invalid/expired token here renders a quiet "This link has expired" page
 * rather than a bare 404 — a client who taps a stale link from an old text
 * or email deserves an explanation, not a dead end. A malformed token (wrong
 * shape entirely — never minted, not just expired) still 404s: that's not a
 * real link at all.
 *
 * The actual upload happens client-side in ./evidence-uploader.tsx, which
 * posts directly to the fulfillment-evidence edge function (public,
 * token-gated in-code) — there is no server action here, mirroring how the
 * token itself (not a session) is the authority for the whole flow.
 */

import { notFound } from 'next/navigation';
import { createServiceClient } from '@patina/supabase/server';
import { EvidenceUploader } from './evidence-uploader';

// The token context (already_uploaded count, expiry) is read fresh every
// request — never static.
export const dynamic = 'force-dynamic';

const EVIDENCE_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

interface EvidenceTokenContext {
  valid: boolean;
  exception_id?: string;
  exception_type?: string;
  order_no?: number;
  item_name?: string | null;
  already_uploaded?: number;
  expires_at?: string;
}

export default async function EvidenceUploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Cheap format gate before any DB round-trip — a malformed token was never
  // a real link, so it 404s rather than getting the friendlier "expired" copy.
  if (!EVIDENCE_TOKEN_PATTERN.test(token)) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createServiceClient() as any;
  const { data, error } = await admin.rpc('fulfillment_evidence_token_context', { p_token: token });
  const ctx = data as EvidenceTokenContext | null;

  if (error || !ctx?.valid) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="type-body">This link has expired.</p>
        <p className="type-body-small mt-2 text-[var(--text-muted)]">
          Ask your designer for a new one if you still need to add photos.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-[var(--bg-primary)] px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="type-page-title" style={{ fontSize: 'clamp(1.5rem, 6vw, 2rem)' }}>
          Add photos for order #{ctx.order_no}
        </h1>
        {ctx.item_name && <p className="type-body mt-2">{ctx.item_name}</p>}
        <p className="type-body-small mt-3 text-[var(--text-muted)]">
          Open and inspect before signing; photograph any damage.
        </p>
      </header>

      <EvidenceUploader token={token} />
    </div>
  );
}
