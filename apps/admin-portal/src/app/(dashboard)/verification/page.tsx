'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { AlertCircle, Check, X, Eye, Clock } from 'lucide-react';
import {
  PageHeader,
  FilterTabs,
  ListRow,
  Section,
  EmptyState,
  StatusDot,
  ActionButton,
  LoadingStrata,
} from '@/components/portal';
import { usersService } from '@/services/users';
import { formatDate } from '@/lib/utils';
import type { DesignerProfile } from '@/types';

type VerificationStatus = 'submitted' | 'in_review' | 'approved' | 'rejected';

export default function VerificationPage() {
  const [selectedStatus, setSelectedStatus] = useState<VerificationStatus>('in_review');
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['verification-queue', selectedStatus],
    queryFn: () => usersService.getVerificationQueue({ status: selectedStatus, pageSize: 50 }),
  });

  const approveMutation = useMutation({
    mutationFn: ({ userId, notes }: { userId: string; notes?: string }) =>
      usersService.approveDesigner(userId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verification-queue'] });
      toast.success('Designer approved successfully');
    },
    onError: () => toast.error('Failed to approve designer'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ userId, notes }: { userId: string; notes: string }) =>
      usersService.rejectDesigner(userId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verification-queue'] });
      toast.success('Designer rejected');
    },
    onError: () => toast.error('Failed to reject designer'),
  });

  const profiles = data?.data || [];

  const statuses = [
    { value: 'submitted' as const, label: 'Submitted' },
    { value: 'in_review' as const, label: 'In Review' },
    { value: 'approved' as const, label: 'Approved' },
    { value: 'rejected' as const, label: 'Rejected' },
  ];

  const statusVariant = (s: string) =>
    s === 'approved' ? 'success' : s === 'rejected' ? 'error' : 'warning';

  return (
    <div>
      <PageHeader
        title="Designer"
        accent="Verification"
        description="Review and approve designer applications."
      />

      <div className="mt-8">
        <FilterTabs items={statuses} value={selectedStatus} onChange={setSelectedStatus} />
      </div>

      <Section className="mt-8">
        {isError ? (
          <EmptyState
            label="Error"
            message={
              error instanceof Error ? error.message : 'Failed to load verification queue.'
            }
          />
        ) : isLoading ? (
          <LoadingStrata />
        ) : profiles.length === 0 ? (
          <EmptyState message="No designers in this status." />
        ) : (
          profiles.map((profile: DesignerProfile & { email?: string }) => (
            <div key={profile.userId} className="border-b border-[var(--border-subtle)] py-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="type-item-name">
                    {profile.businessName || 'Unnamed Business'}
                  </div>
                  <div className="type-label-secondary mt-0.5">
                    {profile.email || profile.userId}
                  </div>
                </div>
                <StatusDot variant={statusVariant(profile.status)} label={profile.status} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4 md:max-w-2xl">
                <div>
                  <div className="type-meta-small mb-1">Website</div>
                  <div className="type-body-small text-[var(--text-body)]">
                    {profile.website || 'Not provided'}
                  </div>
                </div>
                <div>
                  <div className="type-meta-small mb-1">Submitted</div>
                  <div className="type-body-small flex items-center gap-1.5 text-[var(--text-body)]">
                    <Clock className="h-3 w-3" />
                    {formatDate(profile.createdAt)}
                  </div>
                </div>
              </div>

              {profile.documents && profile.documents.length > 0 && (
                <div className="mt-4">
                  <div className="type-meta-small mb-2">Documents</div>
                  <div className="flex flex-wrap gap-3">
                    {profile.documents.map((doc, idx) => (
                      <ActionButton
                        key={idx}
                        variant="accent"
                        onClick={() => window.open(doc.url, '_blank')}
                      >
                        <Eye className="h-3 w-3" />
                        {doc.name}
                      </ActionButton>
                    ))}
                  </div>
                </div>
              )}

              {profile.notes && (
                <div className="mt-4">
                  <div className="type-meta-small mb-1">Notes</div>
                  <div className="type-body-small rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-hover)] p-3 text-[var(--text-body)]">
                    {profile.notes}
                  </div>
                </div>
              )}

              {selectedStatus === 'in_review' && (
                <div className="mt-5 flex gap-6">
                  <ActionButton
                    variant="success"
                    onClick={() =>
                      approveMutation.mutate({
                        userId: profile.userId,
                        notes: 'Approved from admin portal',
                      })
                    }
                    disabled={approveMutation.isPending}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approve
                  </ActionButton>
                  <ActionButton
                    variant="danger"
                    onClick={() =>
                      rejectMutation.mutate({
                        userId: profile.userId,
                        notes: 'Rejected from admin portal',
                      })
                    }
                    disabled={rejectMutation.isPending}
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </ActionButton>
                </div>
              )}
            </div>
          ))
        )}
      </Section>
    </div>
  );
}
