'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ImmersiveTimeline,
  type TimelineSegmentData,
  MediaCarousel,
  ApprovalTheater,
  ProjectCompletionCelebration,
} from '@patina/design-system';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, CheckCircle, Clock, AlertCircle, XCircle, FileText, MessageSquare, Camera } from 'lucide-react';

import { StrataMark } from '@/components/strata-mark';
import type { MilestoneDetail } from '@/types/project';
import { useWebSocket, useMilestoneWebSocket } from '@/lib/websocket';
import { WebSocketMilestoneUpdate, WebSocketMessage, WebSocketActivityUpdate } from '@/lib/websocket';
import { submitApprovalAction, postMessageAction } from '@/app/projects/[projectId]/actions';
import { formatRelativeTime, formatCurrency } from '@/lib/utils/format';

interface EnhancedTimelineProps {
  projectId: string;
  milestones: MilestoneDetail[];
  onMilestoneUpdate?: (milestone: MilestoneDetail) => void;
}

// Map milestone status to timeline segment status
const mapMilestoneStatus = (status: string): TimelineSegmentData['status'] => {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'in_progress':
    case 'attention':
      return 'active';
    case 'blocked':
      return 'blocked';
    default:
      return 'upcoming';
  }
};

// Map milestone to timeline segment data
const mapMilestoneToSegment = (milestone: MilestoneDetail): TimelineSegmentData => {
  return {
    id: milestone.id,
    type: milestone.approval ? 'approval' : 'milestone',
    status: mapMilestoneStatus(milestone.status),
    title: milestone.title,
    description: milestone.description,
    date: milestone.targetDate,
    media: [],
    icon: getStatusIcon(milestone.status),
    metadata: {
      phase: milestone.phase,
      progress: milestone.progressPercentage,
      checklist: milestone.checklist,
      documents: milestone.documents,
      approval: milestone.approval,
      messages: milestone.messages,
      sequenceNumber: milestone.index + 1,
      totalMilestones: undefined,
    }
  };
};

// Get status icon based on milestone status
const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-5 w-5 text-patina-sage" />;
    case 'in_progress':
      return <Clock className="h-5 w-5 text-patina-clay" />;
    case 'attention':
      return <AlertCircle className="h-5 w-5 text-patina-terracotta" />;
    case 'blocked':
      return <XCircle className="h-5 w-5 text-patina-terracotta" />;
    default:
      return <Calendar className="h-5 w-5 text-patina-aged-oak" />;
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'completed': return 'Completed';
    case 'active': return 'In Progress';
    case 'blocked': return 'Blocked';
    default: return 'Upcoming';
  }
};

const statusTextClass = (status: string) => {
  switch (status) {
    case 'completed': return 'text-patina-sage';
    case 'active': return 'text-patina-clay';
    case 'blocked': return 'text-patina-terracotta';
    default: return 'text-patina-aged-oak';
  }
};

export function EnhancedTimeline({ projectId, milestones: initialMilestones, onMilestoneUpdate }: EnhancedTimelineProps) {
  const [milestones, setMilestones] = useState<MilestoneDetail[]>(initialMilestones);
  const [activeMilestoneId, setActiveMilestoneId] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showApprovalTheater, setShowApprovalTheater] = useState(false);
  const [currentApproval, setCurrentApproval] = useState<any>(null);

  // WebSocket hooks
  const { isConnected, onMilestoneUpdate: subscribeMilestoneUpdate, onMilestoneCompleted, onActivityUpdate } = useWebSocket();
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

    const unsubscribeCompletion = onMilestoneCompleted((milestone: WebSocketMilestoneUpdate) => {
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 5000);
    });

    return () => {
      unsubscribeMilestone();
      unsubscribeCompletion();
    };
  }, [subscribeMilestoneUpdate, onMilestoneCompleted, onMilestoneUpdate]);

  // Merge real-time messages with existing messages
  useEffect(() => {
    if (activeMilestoneId && realtimeMessages.length > 0) {
      setMilestones(prev => prev.map(m => {
        if (m.id === activeMilestoneId) {
          const existingIds = new Set(m.messages.map(msg => msg.id));
          const newMessages = realtimeMessages.filter(msg => !existingIds.has(msg.id));
          return {
            ...m,
            messages: [...m.messages, ...newMessages]
          };
        }
        return m;
      }));
    }
  }, [realtimeMessages, activeMilestoneId]);

  // Convert milestones to timeline segments
  const segments = useMemo(() => {
    return milestones.map(mapMilestoneToSegment);
  }, [milestones]);

  // Handle segment change (when user scrolls to a new milestone)
  const handleSegmentChange = useCallback((segment: TimelineSegmentData) => {
    setActiveMilestoneId(segment.id);
  }, []);

  // Handle approval action
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
          return {
            ...m,
            approval: {
              ...m.approval,
              status: decision === 'approved' ? 'approved' : 'needs_discussion'
            }
          };
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

  // Typography-first render for segments
  const renderSegment = useCallback((segment: TimelineSegmentData) => {
    const metadata = segment.metadata as any;
    const isActive = segment.id === activeMilestoneId;

    return (
      <div className={`py-6 transition ${isActive ? 'border-l-2 border-[var(--accent-primary)] pl-6' : 'border-b border-[var(--border-default)]'}`}>
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3">
            {segment.icon}
            <div>
              <h3 className="type-item-name">{segment.title}</h3>
              <div className="flex flex-wrap items-center gap-3 mt-1">
                <span className={`type-meta font-medium ${statusTextClass(segment.status)}`}>
                  {statusLabel(segment.status)}
                </span>
                {metadata?.phase && <span className="type-meta">{metadata.phase}</span>}
                {metadata?.sequenceNumber && (
                  <span className="type-meta">
                    Milestone {metadata.sequenceNumber}
                  </span>
                )}
              </div>
            </div>
          </div>
          {segment.date && (
            <span className="type-meta">
              {formatRelativeTime(segment.date instanceof Date ? segment.date.toISOString() : segment.date)}
            </span>
          )}
        </div>

        {/* Progress — thin line */}
        {metadata?.progress !== undefined && (
          <div className="mb-6">
            <div className="flex justify-between mb-1">
              <span className="type-meta">Progress</span>
              <span className="font-heading text-lg font-bold text-[var(--text-primary)]">{metadata.progress}%</span>
            </div>
            <div className="h-[2px] bg-[var(--border-default)] overflow-hidden">
              <motion.div
                className="h-full bg-[var(--accent-primary)]"
                initial={{ width: 0 }}
                animate={{ width: `${metadata.progress}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}

        {/* All sections visible (no tabs) when active */}
        {isActive && (
          <div className="space-y-0">
            {/* Description */}
            {segment.description && (
              <>
                <p className="type-body-small py-4">{segment.description}</p>
                <StrataMark variant="micro" />
              </>
            )}

            {/* Checklist */}
            {metadata?.checklist && metadata.checklist.length > 0 && (
              <div className="py-4">
                <h4 className="type-meta mb-3">Progress checklist</h4>
                {metadata.checklist.map((item: any) => (
                  <div key={item.id} className="flex items-center gap-2 border-b border-[var(--border-subtle)] py-2">
                    {item.completed ? (
                      <CheckCircle className="h-4 w-4 text-patina-sage" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border border-[var(--border-default)]" />
                    )}
                    <span className={`text-sm ${item.completed ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}`}>
                      {item.title}
                    </span>
                  </div>
                ))}
                <StrataMark variant="micro" />
              </div>
            )}

            {/* Approval */}
            {metadata?.approval && metadata.approval.status === 'pending' && (
              <div className="py-4 border-l-2 border-patina-terracotta pl-4">
                <p className="type-meta text-patina-terracotta mb-2">Approval required</p>
                <p className="type-body-small mb-3">{metadata.approval.description}</p>
                {metadata.approval.value && (
                  <p className="type-data-large mb-3">
                    {formatCurrency(metadata.approval.value, metadata.approval.currency || 'USD')}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setCurrentApproval({ milestoneId: segment.id, ...metadata.approval });
                    setShowApprovalTheater(true);
                  }}
                  className="rounded-[3px] bg-patina-charcoal px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
                >
                  Review and Approve
                </button>
                <StrataMark variant="micro" />
              </div>
            )}

            {/* Media */}
            {segment.media && segment.media.length > 0 && (
              <div className="py-4">
                <h4 className="type-meta mb-3">Media</h4>
                <MediaCarousel
                  items={segment.media as any[]}
                  autoPlay={0}
                  showThumbnails
                  className="rounded-[3px]"
                />
                <StrataMark variant="micro" />
              </div>
            )}

            {/* Documents */}
            {metadata?.documents && metadata.documents.length > 0 && (
              <div className="py-4">
                <h4 className="type-meta mb-3">Documents</h4>
                {metadata.documents.map((doc: any) => (
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
                      {doc.description && (
                        <p className="type-meta-small mt-0.5">{doc.description}</p>
                      )}
                    </div>
                  </a>
                ))}
                <StrataMark variant="micro" />
              </div>
            )}

            {/* Messages */}
            {metadata?.messages && metadata.messages.length > 0 && (
              <div className="py-4">
                <h4 className="type-meta mb-3">Messages</h4>
                <div className="space-y-0 max-h-96 overflow-y-auto">
                  {metadata.messages.map((message: any) => (
                    <div key={message.id} className="flex gap-3 border-b border-[var(--border-subtle)] py-3">
                      <div className="h-8 w-8 rounded-full bg-[var(--border-default)] flex items-center justify-center text-xs font-medium text-[var(--text-muted)]">
                        {message.authorName?.[0] || 'U'}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[var(--text-primary)]">{message.authorName}</span>
                          <span className="type-meta-small">
                            {formatRelativeTime(message.createdAt)}
                          </span>
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
                          await postMessageAction({
                            projectId,
                            threadId: segment.id,
                            body: message
                          });
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
        )}
      </div>
    );
  }, [activeMilestoneId, projectId]);

  return (
    <div className="relative">
      {/* WebSocket Connection Indicator */}
      <AnimatePresence>
        {isConnected && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 right-4 z-50 flex items-center gap-2 type-meta text-patina-sage"
          >
            <div className="h-1.5 w-1.5 bg-patina-sage rounded-full animate-pulse" />
            Live
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Timeline */}
      <ImmersiveTimeline
        segments={segments}
        showProgress={true}
        progressPosition="fixed-right"
        enableKeyboardNav={true}
        onSegmentChange={handleSegmentChange}
        layout="wide"
        spacing="comfortable"
        renderSegment={renderSegment}
        scrollAnimations={{
          header: {
            fadeOut: true,
            fadeRange: [0, 200],
            darkMode: true,
            darkModeThreshold: 100,
            opacity: 0,
            easing: 'ease-out'
          },
          background: {
            darkOverlay: true,
            maxOpacity: 0.7,
            gradient: 'linear-gradient(to bottom, rgba(0,0,0,0.8), rgba(0,0,0,0.4))',
            transitionDuration: 300
          },
          cards: {
            entrance: 'fade-scale-slide',
            fadeFrom: 0,
            scaleFrom: 0.95,
            slideDistance: 20,
            duration: 300,
            easing: 'ease-out',
            threshold: 0.25,
            stagger: 50
          },
          expansion: {
            method: 'height',
            duration: 300,
            easing: 'ease-in-out',
            iconRotation: true
          }
        }}
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
            costImpact: currentApproval.value ? {
              amount: currentApproval.value,
              currency: currentApproval.currency || 'USD',
            } : undefined,
          }}
          onApprove={(approvalId) => handleApproval(currentApproval.milestoneId, 'approved')}
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
