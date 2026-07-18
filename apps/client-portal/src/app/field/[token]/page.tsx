/**
 * Field guest route (Field Coordination · Wave 4).
 *
 * A login-less, mobile-first page for a contractor to tap through their open
 * items. No session: the token is resolved SERVER-SIDE through
 * resolve_field_link() (the ONLY guest read path, 00283) using the service
 * client, per the proven apps/client-portal/src/app/share/[token]/page.tsx
 * pattern — force-dynamic, service client, single RPC read, 404 on any miss
 * (invalid / revoked / expired) so a dead link never leaks whether it once
 * existed.
 *
 * All mutations (Done / Problem / Confirm) are server actions in ./actions.ts
 * that re-resolve the token themselves and funnel through apply_field_effect()
 * — the same choke point SMS and Desk triage use, so behavior can't diverge
 * by rail.
 */

import { notFound } from 'next/navigation';
import { createServiceClient } from '@patina/supabase/server';
import { getFieldTradeLabel, getPartyKindLabel } from '@patina/types';
import { FieldWorkBody } from './field-actions';
import { bootstrapSiteRequest } from './site-request-api';
import { SiteRequestGuest } from './site-request-guest';
import { isLikelySiteRequestToken } from './site-request-types';
import { firstName, isLikelyFieldToken, type FieldLinkDTO } from './types';

// The token is resolved per request (and bumps last_used_at) — never static.
export const dynamic = 'force-dynamic';

export default async function FieldLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Site Request tokens may be base64url while the older Field Coordination
  // rail uses 64 lowercase hex. Reject path-like/malformed values before
  // either lookup, but keep the old format and behavior intact.
  if (!isLikelySiteRequestToken(token)) notFound();

  let dto: FieldLinkDTO | null = null;
  if (isLikelyFieldToken(token)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createServiceClient() as any;
    const { data, error } = await admin.rpc('resolve_field_link', { p_token: token });
    dto = error ? null : (Array.isArray(data) ? data[0] : data) as FieldLinkDTO | null;
  }

  if (!dto?.party?.id) {
    let siteRequest = null;
    let temporarilyUnavailable = false;
    try {
      siteRequest = await bootstrapSiteRequest(token);
    } catch {
      temporarilyUnavailable = true;
    }
    if (!siteRequest?.request?.id) {
      // Preserve the legacy hex-token rail's indistinguishable 404. A valid
      // Site Request credential uses the base64url form, so its guest gets an
      // actionable but still non-enumerating error screen.
      if (isLikelyFieldToken(token)) notFound();
      return (
        <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-10">
          <p className="type-meta">Patina · Site Request</p>
          <h1 className="type-page-title mt-2">
            {temporarilyUnavailable
              ? 'Patina could not open this request.'
              : 'This request link is no longer active.'}
          </h1>
          <p className="type-body mt-4 text-[var(--text-muted)]">
            {temporarilyUnavailable
              ? 'Check your connection, then refresh this page. Your designer can resend the link if the problem continues.'
              : 'Ask your designer to resend the request. For privacy, expired, revoked, and unknown links all look the same.'}
          </p>
        </main>
      );
    }
    return <SiteRequestGuest token={token} initial={siteRequest} />;
  }

  // NOTE (PostHog): the plan asks for a server-side field_link_opened capture
  // here. client-portal has no server-side PostHog client today (only the
  // browser posthog-js in src/lib/analytics/posthog.ts) — deliberately not
  // wiring one up here per the mission's "don't invent infra" instruction.
  // Flagged in the delivery report for whoever owns the PostHog integration
  // wave (Wave 6).

  const { project, studio_name, party, tasks, items, punch, deliveries } = dto;
  const chipLabel = party.trade ? getFieldTradeLabel(party.trade) : getPartyKindLabel(party.party_kind);

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-[var(--bg-primary)] px-4 py-8 sm:px-6">
      <header className="mb-8">
        <p className="type-meta">{studio_name ?? 'Your designer'}</p>
        <h1 className="type-page-title mt-1" style={{ fontSize: 'clamp(1.6rem, 6vw, 2.2rem)' }}>
          {project.name}
        </h1>
        <div className="mt-3 flex items-center gap-2">
          <p className="type-body">Hi {firstName(party.display_name)}</p>
          {chipLabel && (
            <span className="type-body-small inline-flex items-center rounded-full bg-[var(--color-pearl)] px-2.5 py-0.5">
              {chipLabel}
            </span>
          )}
        </div>
      </header>

      <FieldWorkBody token={token} tasks={tasks} items={items} punch={punch} deliveries={deliveries} />
    </div>
  );
}
