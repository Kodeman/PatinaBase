'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PhaseTimeline,
  type PhaseTimelineItem,
  ProjectCompletionCelebration,
} from '@patina/design-system';
import { CheckCircle, FileText } from 'lucide-react';
import { getPhaseLabel, getPhaseSlugFromLabel } from '@patina/types';

import { StrataMark } from '@/components/strata-mark';
import type { MilestoneDetail } from '@/types/project';
import { useWebSocket, useMilestoneWebSocket } from '@/lib/websocket';
import { WebSocketMilestoneUpdate } from '@/lib/websocket';
import { postMessageAction } from '@/app/projects/[projectId]/actions';
import { formatRelativeTime } from '@/lib/utils/format';
import type { ProjectApprovalReview } from '@patina/supabase';
import { ProjectApprovalSummary } from '@/components/approvals/project-approval-summary';

interface EnhancedTimelineProps {
  projectId: string;
  milestones: MilestoneDetail[];
  onMilestoneUpdate?: (milestone: MilestoneDetail) => void;
  projectApprovals?: ProjectApprovalReview[];
  projectApprovalsLoading?: boolean;
  projectApprovalsError?: boolean;
}

const CONCURRENT_WORKSTREAM_TAG = 'Concurrent workstream';

/**
 * Compact, deterministic identity for the server-owned timeline snapshot.
 * Phase updated_at is the primary authority token; the remaining displayed
 * fields keep fixtures and non-phase milestones refreshable without relying
 * on a full JSON serialization or a React remount.
 */
export function timelineAuthorityFingerprint(
  projectId: string,
  milestones: MilestoneDetail[],
): string {
  let hash = 0x811c9dc5;
  const add = (value: unknown) => {
    const text = value == null ? '' : String(value);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= 0xff;
    hash = Math.imul(hash, 0x01000193);
  };

  add(projectId);
  add(milestones.length);
  for (const milestone of milestones) {
    add(milestone.id);
    add(milestone.index);
    add(milestone.authorityVersion);
    add(milestone.title);
    add(milestone.phase);
    add(milestone.status);
    add(milestone.startDate);
    add(milestone.targetDate);
    add(milestone.completionDate);
    add(milestone.progressPercentage);
    for (const tag of milestone.tags ?? []) add(tag);
    for (const item of milestone.checklist) {
      add(item.id);
      add(item.label);
      add(item.completed);
      add(item.completedAt);
    }
    for (const document of milestone.documents) {
      add(document.id);
      add(document.title);
      add(document.url);
      add(document.uploadedAt);
    }
    for (const message of milestone.messages) {
      add(message.id);
      add(message.body);
      add(message.createdAt);
    }
  }

  return `${milestones.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** A compatibility wrapper for the server-authoritative timeline boundary. */
export function AuthoritativeEnhancedTimeline(props: EnhancedTimelineProps) {
  return <EnhancedTimeline {...props} />;
}

// Map milestone status to PhaseTimeline status
function mapStatus(status: string): PhaseTimelineItem['status'] {
  switch (status) {
    case 'completed': return 'completed';
    case 'in_progress': return 'active';
    case 'attention': return 'active';
    case 'blocked': return 'blocked';
    default: return 'pending';
  }
}

// Convert milestones to PhaseTimelineItems
function milestoneToPhase(milestone: MilestoneDetail): PhaseTimelineItem {
  // Try to resolve the phase field to a canonical slug
  const phaseSlug = milestone.phase
    ? getPhaseSlugFromLabel(milestone.phase) || milestone.phase.toLowerCase().replace(/\s+/g, '_')
    : '';
  // Use the canonical client label if we matched a slug, otherwise use the milestone title
  const canonicalLabel = getPhaseLabel(phaseSlug, 'client') || milestone.title;
  const label = milestone.tags?.includes(CONCURRENT_WORKSTREAM_TAG)
    ? `${canonicalLabel} · Concurrent workstream`
    : canonicalLabel;
  return {
    id: milestone.id,
    slug: phaseSlug,
    label,
    status: mapStatus(milestone.status),
    startDate: milestone.startDate,
    endDate: milestone.completionDate || milestone.targetDate,
    progress: milestone.progressPercentage,
    gateStatus: milestone.status === 'completed' ? 'passed' : undefined,
  };
}

export function EnhancedTimeline({
  projectId,
  milestones: initialMilestones,
  onMilestoneUpdate,
  projectApprovals = [],
  projectApprovalsLoading = false,
  projectApprovalsError = false,
}: EnhancedTimelineProps) {
  const [milestones, setMilestones] = useState<MilestoneDetail[]>(initialMilestones);
  const authorityFingerprint = useMemo(
    () => timelineAuthorityFingerprint(projectId, initialMilestones),
    [projectId, initialMilestones],
  );
  const [acceptedAuthority, setAcceptedAuthority] = useState(authorityFingerprint);
  const [activeMilestoneId, setActiveMilestoneId] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);

  // Adopt a changed canonical phase snapshot during reconciliation. React
  // discards this render and retries before committing, so PhaseTimeline stays
  // mounted and keeps its manually expanded row.
  if (acceptedAuthority !== authorityFingerprint) {
    setAcceptedAuthority(authorityFingerprint);
    setMilestones(initialMilestones);
  }

  // WebSocket hooks
  const { isConnected, onMilestoneUpdate: subscribeMilestoneUpdate, onMilestoneCompleted } = useWebSocket();
  const { messages: realtimeMessages } = useMilestoneWebSocket(activeMilestoneId || '');
  const visibleMilestones = useMemo(() => {
    if (!activeMilestoneId || realtimeMessages.length === 0) return milestones;
    return milestones.map((milestone) => {
      if (milestone.id !== activeMilestoneId) return milestone;
      const existingIds = new Set(milestone.messages.map((message) => message.id));
      const newMessages = realtimeMessages.filter(
        (message) => !existingIds.has(message.id),
      );
      return newMessages.length === 0
        ? milestone
        : { ...milestone, messages: [...milestone.messages, ...newMessages] };
    });
  }, [activeMilestoneId, milestones, realtimeMessages]);
  const activeMilestone = useMemo(
    () => visibleMilestones.find((milestone) => milestone.id === activeMilestoneId),
    [activeMilestoneId, visibleMilestones],
  );

  // Subscribe to WebSocket milestone updates
  useEffect(() => {
    const unsubscribeMilestone = subscribeMilestoneUpdate((update: WebSocketMilestoneUpdate) => {
      setMilestones(prev => prev.map(m => {
        if (m.id === update.id) {
          const updated: MilestoneDetail = {
            ...m,
            status: update.status as MilestoneDetail['status'],
            progressPercentage: update.progress ?? m.progressPercentage,
            completionDate: update.completedAt ?? m.completionDate,
          };
          onMilestoneUpdate?.(updated);
          return updated;
        }
        return m;
      }));
    });

    const unsubscribeCompletion = onMilestoneCompleted(() => {
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 5000);
    });

    return () => {
      unsubscribeMilestone();
      unsubscribeCompletion();
    };
  }, [subscribeMilestoneUpdate, onMilestoneCompleted, onMilestoneUpdate]);

  // Convert milestones to phase items
  const phases = useMemo(
    () => visibleMilestones.map(milestoneToPhase),
    [visibleMilestones],
  );

  // Find active phase (first in_progress or attention milestone)
  const defaultActiveId = useMemo(() => {
    return visibleMilestones.find(
      (milestone) =>
        milestone.status === 'in_progress' || milestone.status === 'attention',
    )?.id;
  }, [visibleMilestones]);

  // Render expanded content for a phase
  const renderExpandedContent = useCallback((phase: PhaseTimelineItem) => {
    const milestone = visibleMilestones.find((row) => row.id === phase.id);
    if (!milestone) return null;
    const phaseApprovals = projectApprovals.filter(
      (approval) => approval.phaseId === milestone.id,
    );

    return (
      <div className="space-y-0">
        {/* Description */}
        {milestone.description && (
          <>
            <p className="type-body-small py-4">{milestone.description}</p>
            <StrataMark variant="micro" />
          </>
        )}

        {/* Checklist */}
        {milestone.checklist.length > 0 && (
          <div className="py-4">
            <h4 className="type-meta mb-3">Progress checklist</h4>
            {milestone.checklist.map((item) => (
              <div key={item.id} className="flex items-center gap-2 border-b border-[var(--border-subtle)] py-2">
                {item.completed ? (
                  <CheckCircle className="h-4 w-4 text-patina-sage" />
                ) : (
                  <div className="h-4 w-4 rounded-full border border-[var(--border-default)]" />
                )}
                <span className={`text-sm ${item.completed ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}`}>
                  {item.label}
                </span>
              </div>
            ))}
            <StrataMark variant="micro" />
          </div>
        )}

        {phaseApprovals.length > 0 && (
          <section className="py-4" aria-label={`Approvals for ${milestone.title}`}>
            <h4 className="type-meta mb-2">Project approvals</h4>
            {phaseApprovals.map((approval) => (
              <ProjectApprovalSummary key={approval.decisionId} approval={approval} compact />
            ))}
            <StrataMark variant="micro" />
          </section>
        )}

        {/* Documents */}
        {milestone.documents.length > 0 && (
          <div className="py-4">
            <h4 className="type-meta mb-3">Documents</h4>
            {milestone.documents.map((doc) => (
              <a
                key={doc.id}
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 border-b border-[var(--border-subtle)] py-3 transition hover:bg-[rgba(196,165,123,0.04)]"
              >
                <FileText className="h-4 w-4 text-[var(--text-muted)]" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{doc.title}</p>
                  {doc.description && <p className="type-meta-small mt-0.5">{doc.description}</p>}
                </div>
              </a>
            ))}
            <StrataMark variant="micro" />
          </div>
        )}

        {/* Messages */}
        {milestone.messages.length > 0 && (
          <div className="py-4">
            <h4 className="type-meta mb-3">Messages</h4>
            <div className="space-y-0 max-h-96 overflow-y-auto">
              {milestone.messages.map((message) => (
                <div key={message.id} className="flex gap-3 border-b border-[var(--border-subtle)] py-3">
                  <div className="h-8 w-8 rounded-full bg-[var(--border-default)] flex items-center justify-center text-xs font-medium text-[var(--text-muted)]">
                    {message.authorName?.[0] || 'U'}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--text-primary)]">{message.authorName}</span>
                      <span className="type-meta-small">{formatRelativeTime(message.createdAt)}</span>
                    </div>
                    <p className="type-body-small mt-1">{message.body}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Inline composer */}
            <div className="border-t border-[var(--border-default)] pt-4 mt-4">
              <textarea
                className="w-full rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none focus-visible:focus-ring"
                rows={3}
                placeholder="Write a message..."
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    const textarea = e.currentTarget;
                    const message = textarea.value.trim();
                    if (message) {
                      await postMessageAction({ projectId, threadId: milestone.id, body: message });
                      textarea.value = '';
                    }
                  }
                }}
              />
              <p className="type-meta-small mt-1">Press Ctrl+Enter to send</p>
            </div>
          </div>
        )}
      </div>
    );
  }, [projectApprovals, projectId, visibleMilestones]);

  const milestoneIds = useMemo(
    () => new Set(visibleMilestones.map((milestone) => milestone.id)),
    [visibleMilestones],
  );
  const unlinkedApprovals = useMemo(
    () => projectApprovals.filter((approval) => !milestoneIds.has(approval.phaseId)),
    [milestoneIds, projectApprovals],
  );

  return (
    <div className="relative">
      {/* WebSocket Connection Indicator */}
      {isConnected && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 type-meta text-patina-sage">
          <div className="h-1.5 w-1.5 bg-patina-sage rounded-full animate-pulse" />
          Live
        </div>
      )}

      {projectApprovalsLoading && (
        <p role="status" className="type-body-small border-b border-[var(--border-default)] py-4">
          Loading project approvals…
        </p>
      )}
      {projectApprovalsError && (
        <p role="alert" className="type-body-small border-b border-[var(--border-default)] py-4 text-[var(--color-error)]">
          Project approvals could not be loaded. Refresh before taking action.
        </p>
      )}
      {unlinkedApprovals.length > 0 && (
        <section aria-labelledby="project-level-approvals" className="mb-6">
          <h3 id="project-level-approvals" className="type-meta">Project-level approvals</h3>
          {unlinkedApprovals.map((approval) => (
            <ProjectApprovalSummary key={approval.decisionId} approval={approval} compact />
          ))}
        </section>
      )}

      {/* Phase Timeline */}
      <PhaseTimeline
        phases={phases}
        activePhaseId={defaultActiveId}
        onPhaseSelect={(phase) => setActiveMilestoneId(phase.id)}
        renderExpandedContent={renderExpandedContent}
        showProgressBar={true}
      />

      {/* Celebration Animation */}
      {showCelebration && (
        <ProjectCompletionCelebration
          isActive={showCelebration}
          projectName={activeMilestone?.title || 'Milestone'}
          onComplete={() => setShowCelebration(false)}
        />
      )}
    </div>
  );
}
