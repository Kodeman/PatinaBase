'use client';

import { useNurtureTouchpoints, useUpdateTouchpoint } from '@patina/supabase';
import type { ClientNurtureTouchpoint } from '@patina/supabase';
import { NurtureCard } from '@/components/portal/nurture-card';
import { LoadingStrata } from '@/components/portal/loading-strata';

function formatLastContact(date: string | null): string {
  if (!date) return 'Unknown';
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 7) return `${diff} day${diff !== 1 ? 's' : ''} ago`;
  if (diff < 30) return `${Math.floor(diff / 7)} week${Math.floor(diff / 7) !== 1 ? 's' : ''} ago`;
  return `${Math.floor(diff / 30)} month${Math.floor(diff / 30) !== 1 ? 's' : ''} ago`;
}

function getSuggestedTiming(date: string | null): string {
  if (!date) return 'This Month';
  const target = new Date(date);
  const now = new Date();
  const diff = Math.floor((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return 'Overdue';
  if (diff <= 7) return 'This Week';
  if (diff <= 14) return 'Next Week';
  return 'This Month';
}

export default function NurtureQueuePage() {
  const { data: touchpoints, isLoading } = useNurtureTouchpoints({
    status: ['suggested', 'scheduled'],
  });
  const updateTouchpoint = useUpdateTouchpoint();

  const handleDismiss = (id: string) => {
    updateTouchpoint.mutate({ touchpointId: id, status: 'dismissed' });
  };

  const handleSend = (id: string) => {
    updateTouchpoint.mutate({ touchpointId: id, status: 'sent' });
  };

  const handleSchedule = (id: string) => {
    updateTouchpoint.mutate({ touchpointId: id, status: 'scheduled' });
  };

  return (
    <div className="pt-8">
      <div className="mb-6">
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.5rem',
            fontWeight: 400,
            color: 'var(--text-primary)',
            marginBottom: '0.15rem',
          }}
        >
          Nurture Queue
        </h1>
        <p className="type-label-secondary">
          Suggested touchpoints for past clients
        </p>
      </div>

      {isLoading ? (
        <LoadingStrata />
      ) : (touchpoints ?? []).length > 0 ? (
        <div>
          {(touchpoints ?? []).map((tp: ClientNurtureTouchpoint) => {
            const clientName =
              tp.designer_client?.client?.full_name ||
              tp.designer_client?.client_name ||
              tp.designer_client?.client_email ||
              'Client';
            const lastContact = tp.designer_client?.last_contacted_at || tp.designer_client?.last_project_at;
            const timing = getSuggestedTiming(tp.suggested_date);
            const isPriority = timing === 'This Week' || timing === 'Overdue';

            return (
              <NurtureCard
                key={tp.id}
                clientName={clientName}
                projectContext={`${tp.designer_client?.status || ''} \u00B7 $${((tp.designer_client?.total_revenue || 0) / 100).toLocaleString()} lifetime`}
                lastContact={formatLastContact(lastContact || null)}
                suggestedTiming={timing}
                reason={tp.reason || 'A great time for a personal check-in.'}
                isPriority={isPriority}
                onSendNote={() => handleSend(tp.id)}
                onSchedule={() => handleSchedule(tp.id)}
                onDismiss={() => handleDismiss(tp.id)}
              />
            );
          })}
        </div>
      ) : (
        <p className="type-body py-16 text-center italic text-[var(--text-muted)]">
          No nurture touchpoints suggested. Past clients will appear here after project completion.
        </p>
      )}
    </div>
  );
}
