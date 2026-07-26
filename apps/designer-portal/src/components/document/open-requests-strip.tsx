'use client';

/**
 * Open requests strip (Designer Handoff, Wave 1B) — the Desk's pool surface.
 *
 * Client-originated design requests with no designer yet (`open_design_requests`,
 * 00286 — the view's own in-body `is_designer` gate means only designers can
 * select it at all) sit here, below "Needs your hand" and above "In motion" —
 * their own population, never folded into `desk-derivation.ts` (Shape C never
 * sees a pool request; a claimed request becomes a normal Brief folder on the
 * designer's next Desk read).
 *
 * One act: Accept claims the request atomically (`claim_design_request`) and
 * opens it directly at `/doc/{lead_id}`. A losing Accept (another designer won
 * first) shows a quiet inline note instead of a toast (R83) and refetches the
 * pool so the stale card clears. An empty pool renders nothing — a transient
 * population, not standing front matter (unlike FieldDesk's taught quiet
 * state, R94 does not apply here).
 *
 * Behind the `design-request-pool` PostHog flag, fail-closed while loading —
 * mirrors the `procurement-workspace-pilot` gate (`/portal/procurement/layout.tsx`,
 * `(portal)/portal/page.tsx`'s Today rollup card): every hook runs
 * unconditionally above the gate, only the render branches on it. Document
 * idiom throughout: paper face, hairline borders, DM Mono captions, zero
 * shadows (D4).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  useOpenDesignRequests,
  useClaimDesignRequest,
  useAcceptDesignRequest,
  type OpenDesignRequest,
  type ClaimDesignRequestResult,
  type AcceptDesignRequestResult,
} from '@patina/supabase';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { SectionEyebrow } from '@/components/document/section-eyebrow';
import { relTime } from '@/lib/document/post-derivation';
import { documentEvents } from '@/lib/analytics/document-events';
import { DocumentAction } from './document-action';

const pretty = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function RequestCard({
  request,
  ceremonyPath,
}: {
  request: OpenDesignRequest;
  ceremonyPath: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  // R83 — this card renders already_claimed inline; opt the mutation out of
  // the global error toast (see useClaimDesignRequest's doc comment).
  const claim = useClaimDesignRequest({ errorSurface: 'inline' });
  // Arrival Arc (R106) — flag-on, Accept claims via accept_design_request
  // (claim + ceremony stub + client held-state) and opens the Match Ceremony.
  const accept = useAcceptDesignRequest({ errorSurface: 'inline' });
  const [taken, setTaken] = useState(false);
  const [otherError, setOtherError] = useState(false);

  const onError = (err: Error) => {
    if (err.message === 'already_claimed') {
      // Show the quiet inline note and let it sit — do NOT force an
      // immediate pool refetch here, or the card (and the message on it)
      // vanishes before the designer can read it. The strip's own 30s
      // poll clears the stale card naturally once it's been seen.
      setTaken(true);
    } else {
      setOtherError(true);
    }
  };

  const onAccept = () => {
    setOtherError(false);
    if (ceremonyPath) {
      accept.mutate(request.id, {
        onSuccess: (result: AcceptDesignRequestResult) => {
          documentEvents.designRequestClaimed({
            lead_id: result.lead_id,
            project_type: request.project_type,
            scan_count: request.scan_count ?? 0,
          });
          void queryClient.invalidateQueries({
            queryKey: ['document-state', 'desk'],
          });
          router.push(`/ceremony/${result.lead_id}`);
        },
        onError,
      });
      return;
    }
    claim.mutate(request.id, {
      onSuccess: (result: ClaimDesignRequestResult) => {
        documentEvents.designRequestClaimed({
          lead_id: result.lead_id,
          project_type: request.project_type,
          scan_count: request.scan_count ?? 0,
        });
        // One-act-many-surfaces (spec §5), mirroring TriageBar's refreshDesk:
        // the claimed lead now needs to surface as a Brief folder without a
        // reload for whoever lands back on the Desk.
        void queryClient.invalidateQueries({
          queryKey: ['document-state', 'desk'],
        });
        router.push(`/doc/${result.lead_id}`);
      },
      onError,
    });
  };

  const chips = [
    request.budget_range,
    request.timeline ? pretty(request.timeline) : null,
  ].filter(Boolean) as string[];
  const location = [request.location_city, request.location_state]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="relative mt-[26px]">
      {/* Status tab — dusty blue: informational/awaiting, distinct from the
          mocha "new lead" tab (this isn't anyone's lead yet). */}
      <div
        className="absolute -top-[26px] left-0 flex h-[26px] items-center rounded-t-[7px] px-3.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-white"
        style={{ background: 'var(--color-dusty-blue)' }}
      >
        Open request
      </div>

      <div className="flex gap-4 rounded-[0_8px_8px_8px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-6">
        {request.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={request.thumbnail_url}
            alt=""
            className="h-20 w-20 shrink-0 rounded-[4px] border border-[var(--color-pearl)] object-cover"
          />
        ) : (
          <div className="h-20 w-20 shrink-0 rounded-[4px] border border-dashed border-[var(--color-pearl)]" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-heading text-[1.15rem] font-medium leading-tight text-[var(--text-primary)]">
              {request.project_type
                ? pretty(request.project_type)
                : 'Design request'}
            </h3>
            {request.created_at && (
              <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                {relTime(request.created_at)}
              </span>
            )}
          </div>

          {(chips.length > 0 || location) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {chips.map((c) => (
                <span
                  key={c}
                  className="rounded-[3px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-2 py-0.5 text-[11px] text-[var(--color-charcoal)]"
                >
                  {c}
                </span>
              ))}
              {location && (
                <span className="text-[11px] text-[var(--text-muted)]">
                  {location}
                </span>
              )}
            </div>
          )}

          {request.project_description && (
            <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-[var(--text-body)]">
              {request.project_description}
            </p>
          )}

          <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-[var(--border-default)] pt-3">
            <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
              {request.scan_count === 1
                ? '1 scan'
                : `${request.scan_count ?? 0} scans`}
            </span>

            {taken ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                Taken by another designer
              </span>
            ) : (
              <div className="flex items-center gap-2.5">
                {otherError && (
                  <span className="text-[11px] text-[var(--color-terracotta)]">
                    Couldn’t claim — try again.
                  </span>
                )}
                <DocumentAction
                  actionKey="accept-project-request"
                  surfaceKey="project"
                  regionKey="open-request"
                  variant="primary"
                  onClick={onAccept}
                  disabled={claim.isPending || accept.isPending}
                  loading={claim.isPending || accept.isPending}
                  loadingLabel="Accepting…"
                >
                  Accept
                </DocumentAction>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function OpenRequestsStrip() {
  // Fail-closed while the flag resolves — never flash the pool to a
  // non-pilot designer (matches procurement-workspace-pilot's gate). All
  // hooks stay above the render branch below (hook-order stability).
  const { value: enabled, isLoading: flagLoading } = useFeatureFlag(
    'design-request-pool',
  );
  // Arrival Arc (R106): flag-on, Accept opens the Match Ceremony instead of
  // landing straight in the Brief. Fail-closed — while resolving (or off),
  // the claim → /doc path below stays byte-identical.
  const { value: arrivalArc, isLoading: arcLoading } =
    useFeatureFlag('arrival-arc');
  const { data: requests } = useOpenDesignRequests({
    enabled: !flagLoading && enabled,
  });

  if (flagLoading || !enabled) return null;

  // No empty-state noise on the Desk — a transient population, not standing
  // front matter.
  if (!requests || requests.length === 0) return null;

  return (
    <section aria-labelledby="open-requests" className="mt-14">
      <SectionEyebrow count={requests.length}>
        <span id="open-requests">Open requests</span>
      </SectionEyebrow>
      <div className="grid grid-cols-1 gap-x-10 gap-y-[46px] xl:grid-cols-2">
        {requests.map((r) => (
          <RequestCard
            key={r.id}
            request={r}
            ceremonyPath={!arcLoading && arrivalArc}
          />
        ))}
      </div>
    </section>
  );
}
