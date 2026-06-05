'use client';

import { use, useState } from 'react';
import { useLead, useAcceptLead, useDeclineLead, useMarkLeadViewed, useUpdateLeadStatus } from '@patina/supabase';
import { useEffect } from 'react';
import { StrataMark } from '@/components/portal/strata-mark';
import { ScoreCircle } from '@/components/portal/score-circle';
import { FieldGroup } from '@/components/portal/field-group';
import { DetailRow } from '@/components/portal/detail-row';
import { StyleTag } from '@/components/portal/style-tag';
import { PortalButton } from '@/components/portal/button';
import { PageActionBar } from '@/components/portal/page-action-bar';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';
import {
  formatBudgetRange,
  formatProjectType,
  formatTimeline,
} from '@/lib/lead-format';

export default function LeadBriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const hydrated = useHydrated();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead, isLoading } = useLead(id) as { data: any; isLoading: boolean };
  const markViewed = useMarkLeadViewed();
  const acceptLead = useAcceptLead();
  const declineLead = useDeclineLead();
  const updateStatus = useUpdateLeadStatus();

  // This portal mounts no Toaster, so action feedback is rendered inline.
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetFeedback = () => {
    setSuccessMessage(null);
    setErrorMessage(null);
  };

  const handleAccept = () => {
    resetFeedback();
    acceptLead.mutate(id, {
      onSuccess: () => setSuccessMessage('Lead accepted — added to your clients.'),
      onError: (err: Error) =>
        setErrorMessage(err.message ?? 'Something went wrong. Please try again.'),
    });
  };

  const handleRequestContext = () => {
    resetFeedback();
    updateStatus.mutate(
      { leadId: id, status: 'contacted' },
      {
        onSuccess: () => setSuccessMessage('Requested more context.'),
        onError: (err: Error) =>
          setErrorMessage(err.message ?? 'Something went wrong. Please try again.'),
      }
    );
  };

  const handleDecline = () => {
    resetFeedback();
    declineLead.mutate(
      { leadId: id },
      {
        onSuccess: () => setSuccessMessage('Passed on this lead.'),
        onError: (err: Error) =>
          setErrorMessage(err.message ?? 'Something went wrong. Please try again.'),
      }
    );
  };

  useEffect(() => {
    if (id) {
      markViewed.mutate(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || isLoading) return <LoadingStrata />;
  if (!lead) {
    return (
      <p className="type-body py-16 text-center text-[var(--text-muted)]">
        Lead not found.
      </p>
    );
  }

  const location = [lead.location_city, lead.location_state]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="pt-8">
      {/* Page action bar \u2014 the global SubNav breadcrumb carries the lead name,
          so there is no h1. The project-type \u00B7 location \u00B7 budget \u00B7 timeline
          summary moves into the meta cluster. The match score is substantial
          context and stays in the hero body below. */}
      <PageActionBar
        meta={
          <span className="type-label-secondary">
            {[
              formatProjectType(lead.project_type),
              location,
              lead.budget_range ? `Budget: ${formatBudgetRange(lead.budget_range)}` : null,
              lead.timeline ? `Timeline: ${formatTimeline(lead.timeline)}` : null,
            ]
              .filter(Boolean)
              .join(' \u00B7 ')}
          </span>
        }
      />

      {/* Hero Block \u2014 match score */}
      <div className="flex flex-col gap-6 border-b border-[var(--border-default)] pb-8 md:flex-row md:items-start md:justify-end">
        <div className="shrink-0">
          <ScoreCircle score={lead.match_score || 0} />
        </div>
      </div>

      {/* Two-Column Detail */}
      <div className="mt-8 grid gap-12 md:grid-cols-2">
        {/* Left Column */}
        <div>
          {lead.match_reasons && lead.match_reasons.length > 0 && (
            <FieldGroup label="Style Profile">
              <div className="flex flex-wrap gap-2">
                {lead.match_reasons.map((reason: string) => (
                  <StyleTag key={reason} label={reason} />
                ))}
              </div>
            </FieldGroup>
          )}

          {lead.project_description && (
            <FieldGroup label="What they're looking for">
              <p className="type-body prose-body">
                {lead.project_description}
              </p>
            </FieldGroup>
          )}

          {lead.timeline && (
            <FieldGroup label="Timeline">
              <p className="type-body-small">{formatTimeline(lead.timeline)}</p>
            </FieldGroup>
          )}
        </div>

        {/* Right Column */}
        <div>
          {lead.room_scan && (
            <>
              <FieldGroup label="Room Scan">
                <div
                  className="flex h-[200px] items-center justify-center rounded-lg bg-patina-pearl"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(196,165,123,0.05) 10px, rgba(196,165,123,0.05) 20px)',
                  }}
                >
                  <span className="type-body-small text-[var(--text-muted)]">
                    3D Room Preview
                  </span>
                </div>
              </FieldGroup>

              <FieldGroup label="Room Details">
                {lead.room_scan.dimensions && (
                  <DetailRow label="Dimensions" value={lead.room_scan.dimensions} />
                )}
                {lead.room_scan.windows && (
                  <DetailRow label="Windows" value={lead.room_scan.windows} />
                )}
                {lead.room_scan.flooring && (
                  <DetailRow label="Flooring" value={lead.room_scan.flooring} />
                )}
                {lead.room_scan.lighting && (
                  <DetailRow label="Light" value={lead.room_scan.lighting} />
                )}
                {lead.room_scan.ceilingHeight && (
                  <DetailRow label="Ceiling" value={lead.room_scan.ceilingHeight} />
                )}
              </FieldGroup>
            </>
          )}
        </div>
      </div>

      {/* Action Bar */}
      <div className="mt-8 border-t border-[var(--border-default)] pt-8">
        {successMessage && (
          <div
            role="status"
            className="mb-4 rounded-sm border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
          >
            {successMessage}
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="mb-4 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {errorMessage}
          </div>
        )}

        <div className="flex flex-wrap gap-4">
          <PortalButton
            variant="primary"
            onClick={handleAccept}
            disabled={acceptLead.isPending}
          >
            {acceptLead.isPending ? 'Accepting…' : 'Accept & Introduce Yourself'}
          </PortalButton>
          <PortalButton
            variant="secondary"
            onClick={handleRequestContext}
            disabled={updateStatus.isPending}
          >
            {updateStatus.isPending ? 'Requesting...' : 'Request More Context'}
          </PortalButton>
          <PortalButton
            variant="ghost"
            onClick={handleDecline}
            disabled={declineLead.isPending}
          >
            Pass on This Lead
          </PortalButton>
        </div>
      </div>
    </div>
  );
}
