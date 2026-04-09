'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PhaseTimeline,
  type PhaseTimelineItem,
  ApprovalTheater,
  ProjectCompletionCelebration,
} from '@patina/design-system';
import { CheckCircle, FileText } from 'lucide-react';
import { getPhaseLabel, getPhaseSlugFromLabel } from '@patina/types';

import { StrataMark } from '@/components/strata-mark';
import type { MilestoneDetail } from '@/types/project';
import { useWebSocket, useMilestoneWebSocket } from '@/lib/websocket';
import { WebSocketMilestoneUpdate } from '@/lib/websocket';
import { submitApprovalAction, postMessageAction } from '@/app/projects/[projectId]/actions';
import { formatRelativeTime, formatCurrency } from '@/lib/utils/format';

interface EnhancedTimelineProps {
  projectId: string;
  milestones: MilestoneDetail[];
  onMilestoneUpdate?: (milestone: MilestoneDetail) => void;
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
  const label = getPhaseLabel(phaseSlug, 'client') || milestone.title;
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

export function EnhancedTimeline({ projectId, milestones: initialMilestones, onMilestoneUpdate }: EnhancedTimelineProps) {
  const [milestones, setMilestones] = useState<MilestoneDetail[]>(initialMilestones);
  const [activeMilestoneId, setActiveMilestoneId] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showApprovalTheater, setShowApprovalTheater] = useState(false);
  const [currentApproval, setCurrentApproval] = useState<any>(null);

  // WebSocket hooks
  const { isConnected, onMilestoneUpdate: subscribeMilestoneUpdate, onMilestoneCompleted } = useWebSocket();
  const activeMilestone = useMemo(() => milestones.find(m => m.id === activeMilestoneId), [milestones, activeMilestoneId]);
  const { messages: realtimeMessages } = useMilestoneWebSocket(activeMilestoneId || '');

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

  // Merge real-time messages
  useEffect(() => {
    if (activeMilestoneId && realtimeMessages.length > 0) {
      setMilestones(prev => prev.map(m => {
        if (m.id === activeMilestoneId) {
          const existingIds = new Set(m.messages.map(msg => msg.id));
          const newMessages = realtimeMessages.filter(msg => !existingIds.has(msg.id));
          return { ...m, messages: [...m.messages, ...newMessages] };
        }
        return m;
      }));
    }
  }, [realtimeMessages, activeMilestoneId]);

  // Convert milestones to phase items
  const phases = useMemo(() => milestones.map(milestoneToPhase), [milestones]);

  // Find active phase (first in_progress or attention milestone)
  const defaultActiveId = useMemo(() => {
    return milestones.find(m => m.status === 'in_progress' || m.status === 'attention')?.id;
  }, [milestones]);

  // Handle approval
  const handleApproval = useCallback(async (milestoneId: string, decision: 'approved' | 'rejected', comment?: string) => {
    const milestone = milestones.find(m => m.id === milestoneId);
    if (!milestone?.approval) return;

    try {
      await submitApprovalAction({
        projectId,
        approvalId: milestone.approval.id,
        decision,
        comment
      });

      setMilestones(prev => prev.map(m => {
        if (m.id === milestoneId && m.approval) {
          return { ...m, approval: { ...m.approval, status: decision === 'approved' ? 'approved' : 'needs_discussion' } };
        }
        return m;
      }));

      setShowApprovalTheater(false);
      setCurrentApproval(null);

      if (decision === 'approved') {
        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 5000);
      }
    } catch (error) {
      console.error('Failed to submit approval:', error);
    }
  }, [milestones, projectId]);

  // Render expanded content for a phase
  const renderExpandedContent = useCallback((phase: PhaseTimelineItem) => {
    const milestone = milestones.find(m => m.id === phase.id);
    if (!milestone) return null;

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

        {/* Approval */}
        {milestone.approval && milestone.approval.status === 'pending' && (
          <div className="py-4 border-l-2 border-patina-terracotta pl-4">
            <p className="type-meta text-patina-terracotta mb-2">Approval required</p>
            <p className="type-body-small mb-3">{milestone.approval.summary}</p>
            {milestone.approval.totalValue && (
              <p className="type-data-large mb-3">
                {formatCurrency(milestone.approval.totalValue, milestone.approval.currency || 'USD')}
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setCurrentApproval({ milestoneId: milestone.id, ...milestone.approval });
                setShowApprovalTheater(true);
              }}
              className="rounded-[3px] bg-patina-charcoal px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
            >
              Review and Approve
            </button>
            <StrataMark variant="micro" />
          </div>
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
  }, [milestones, projectId]);

  return (
    <div className="relative">
      {/* WebSocket Connection Indicator */}
      {isConnected && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 type-meta text-patina-sage">
          <div className="h-1.5 w-1.5 bg-patina-sage rounded-full animate-pulse" />
          Live
        </div>
      )}

      {/* Phase Timeline */}
      <PhaseTimeline
        phases={phases}
        activePhaseId={defaultActiveId}
        onPhaseSelect={(phase) => setActiveMilestoneId(phase.id)}
        renderExpandedContent={renderExpandedContent}
        showProgressBar={true}
      />

      {/* Approval Theater Modal */}
      {showApprovalTheater && currentApproval && (
        <ApprovalTheater
          open={showApprovalTheater}
          onOpenChange={(open) => {
            if (!open) {
              setShowApprovalTheater(false);
              setCurrentApproval(null);
            }
          }}
          approval={{
            id: currentApproval.id || currentApproval.milestoneId,
            title: currentApproval.title || 'Approval Required',
            description: currentApproval.description || '',
            type: 'design' as const,
            status: 'pending' as const,
            costImpact: currentApproval.totalValue ? {
              amount: currentApproval.totalValue,
              currency: currentApproval.currency || 'USD',
            } : undefined,
          }}
          onApprove={() => handleApproval(currentApproval.milestoneId, 'approved')}
        />
      )}

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
