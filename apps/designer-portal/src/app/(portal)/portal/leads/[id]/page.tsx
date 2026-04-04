'use client';

import { use } from 'react';
import Link from 'next/link';
import { useLead, useAcceptLead, useDeclineLead, useMarkLeadViewed, useUpdateLeadStatus } from '@patina/supabase';
import { useEffect } from 'react';
import { StrataMark } from '@/components/portal/strata-mark';
import { ScoreCircle } from '@/components/portal/score-circle';
import { FieldGroup } from '@/components/portal/field-group';
import { DetailRow } from '@/components/portal/detail-row';
import { StyleTag } from '@/components/portal/style-tag';
import { PortalButton } from '@/components/portal/button';
import { LoadingStrata } from '@/components/portal/loading-strata';

export default function LeadBriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead, isLoading } = useLead(id) as { data: any; isLoading: boolean };
  const markViewed = useMarkLeadViewed();
  const acceptLead = useAcceptLead();
  const declineLead = useDeclineLead();
  const updateStatus = useUpdateLeadStatus();

  useEffect(() => {
    if (id) {
      markViewed.mutate(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (isLoading) return <LoadingStrata />;
  if (!lead) {
    return (
      <p className="type-body py-16 text-center text-[var(--text-muted)]">
        Lead not found.
      </p>
    );
  }

  const clientName = lead.homeowner?.full_name || 'Anonymous Client';
  const location = [lead.location_city, lead.location_state]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="pt-8">
      {/* Breadcrumb */}
      <div className="type-meta mb-6">
        <Link
          href="/portal/leads"
          className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]"
        >
          Leads
        </Link>
        <span className="mx-2">&rarr;</span>
        <span>{clientName}</span>
      </div>

      {/* Hero Block */}
      <div className="flex flex-col gap-6 border-b border-[var(--border-default)] pb-8 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="type-page-title mb-2">{clientName}</h1>
          <p className="type-label-secondary">
            {[lead.project_type, location].filter(Boolean).join(' \u00B7 ')}
          </p>
          {(lead.budget_range || lead.timeline) && (
            <p className="type-label-secondary mt-1">
              {[
                lead.budget_range ? `Budget: ${lead.budget_range}` : null,
                lead.timeline ? `Timeline: ${lead.timeline}` : null,
              ]
                .filter(Boolean)
                .join(' \u00B7 ')}
            </p>
          )}
        </div>
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
              <p className="type-body-small">{lead.timeline}</p>
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
        <div className="flex flex-wrap gap-4">
          <PortalButton
            variant="primary"
            onClick={() => acceptLead.mutate(id)}
            disabled={acceptLead.isPending}
          >
            Accept &amp; Introduce Yourself
          </PortalButton>
          <PortalButton
            variant="secondary"
            onClick={() => updateStatus.mutate({ leadId: id, status: 'contacted' })}
            disabled={updateStatus.isPending}
          >
            {updateStatus.isPending ? 'Requesting...' : 'Request More Context'}
          </PortalButton>
          <PortalButton
            variant="ghost"
            onClick={() => declineLead.mutate({ leadId: id })}
            disabled={declineLead.isPending}
          >
            Pass on This Lead
          </PortalButton>
        </div>
      </div>
    </div>
  );
}
