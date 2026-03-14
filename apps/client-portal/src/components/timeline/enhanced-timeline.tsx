'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ImmersiveTimeline,
  type TimelineSegmentData,
  MediaCarousel,
  ApprovalTheater,
  ProjectCompletionCelebration,
  Card,
  Badge,
  Avatar,
  AvatarGroup,
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Tag
} from '@patina/design-system';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, CheckCircle, Clock, AlertCircle, XCircle, Users, FileText, MessageSquare, Camera } from 'lucide-react';

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
      return <CheckCircle className="h-5 w-5 text-green-600" />;
    case 'in_progress':
      return <Clock className="h-5 w-5 text-blue-600" />;
    case 'attention':
      return <AlertCircle className="h-5 w-5 text-amber-600" />;
    case 'blocked':
      return <XCircle className="h-5 w-5 text-red-600" />;
    default:
      return <Calendar className="h-5 w-5 text-gray-400" />;
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

      // Update local state optimistically
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

      // Show celebration if approved
      if (decision === 'approved') {
        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 5000);
      }
    } catch (error) {
      console.error('Failed to submit approval:', error);
    }
  }, [milestones, projectId]);

  // Custom render function for segments with enhanced features
  const renderSegment = useCallback((segment: TimelineSegmentData) => {
    const metadata = segment.metadata as any;
    const isActive = segment.id === activeMilestoneId;

    return (
      <div>
        <Card className={`p-6 rounded-2xl shadow-lg ${isActive ? 'ring-2 ring-blue-500 shadow-xl' : ''}`}>
          {/* Milestone Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              {segment.icon}
              <div>
                <h3 className="text-lg font-semibold">{segment.title}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="subtle" color={segment.status === 'completed' ? 'success' : segment.status === 'active' ? 'primary' : 'neutral'}>
                    {segment.status}
                  </Badge>
                  {metadata?.phase && <Tag>{metadata.phase}</Tag>}
                  {metadata?.sequenceNumber && (
                    <span className="text-sm text-muted-foreground">
                      Milestone {metadata.sequenceNumber} of {metadata.totalMilestones}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {segment.date && (
              <div className="text-sm text-muted-foreground">
                {formatRelativeTime(segment.date instanceof Date ? segment.date.toISOString() : segment.date)}
              </div>
            )}
          </div>

          {/* Progress Bar */}
          {metadata?.progress !== undefined && (
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span>Progress</span>
                <span>{metadata.progress}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-blue-600"
                  initial={{ width: 0 }}
                  animate={{ width: `${metadata.progress}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                />
              </div>
            </div>
          )}

          {/* Tabs for Different Sections */}
          {isActive && (
            <Tabs defaultValue="overview" className="mt-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="media">Media</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
                <TabsTrigger value="communication">Messages</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="mt-4">
                {segment.description && (
                  <p className="text-sm text-muted-foreground mb-4">{segment.description}</p>
                )}

                {/* Checklist */}
                {metadata?.checklist && metadata.checklist.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Progress Checklist</h4>
                    {metadata.checklist.map((item: any) => (
                      <div key={item.id} className="flex items-center gap-2">
                        <div className={`h-4 w-4 rounded ${item.completed ? 'bg-green-500' : 'bg-gray-300'}`}>
                          {item.completed && <CheckCircle className="h-4 w-4 text-white" />}
                        </div>
                        <span className={`text-sm ${item.completed ? 'line-through text-muted-foreground' : ''}`}>
                          {item.title}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Approval Section */}
                {metadata?.approval && metadata.approval.status === 'pending' && (
                  <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <h4 className="text-sm font-medium text-amber-900 mb-2">Approval Required</h4>
                    <p className="text-sm text-amber-800 mb-3">{metadata.approval.description}</p>
                    {metadata.approval.value && (
                      <p className="text-lg font-semibold text-amber-900 mb-3">
                        Total: {formatCurrency(metadata.approval.value, metadata.approval.currency || 'USD')}
                      </p>
                    )}
                    <Button
                      onClick={() => {
                        setCurrentApproval({ milestoneId: segment.id, ...metadata.approval });
                        setShowApprovalTheater(true);
                      }}
                      className="w-full"
                    >
                      Review and Approve
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* Media Tab */}
              <TabsContent value="media" className="mt-4">
                {segment.media && segment.media.length > 0 ? (
                  <MediaCarousel
                    items={segment.media as any[]}
                    autoPlay={0}
                    showThumbnails
                    className="rounded-lg"
                  />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Camera className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No media available for this milestone</p>
                  </div>
                )}
              </TabsContent>

              {/* Documents Tab */}
              <TabsContent value="documents" className="mt-4">
                {metadata?.documents && metadata.documents.length > 0 ? (
                  <div className="space-y-2">
                    {metadata.documents.map((doc: any) => (
                      <a
                        key={doc.id}
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <FileText className="h-5 w-5 text-gray-500" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{doc.title}</p>
                          {doc.description && (
                            <p className="text-xs text-muted-foreground">{doc.description}</p>
                          )}
                        </div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No documents available for this milestone</p>
                  </div>
                )}
              </TabsContent>

              {/* Communication Tab */}
              <TabsContent value="communication" className="mt-4">
                <div className="space-y-4">
                  {metadata?.messages && metadata.messages.length > 0 ? (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {metadata.messages.map((message: any) => (
                        <div key={message.id} className="flex gap-3">
                          <Avatar size="sm">
                            <span>{message.authorName?.[0] || 'U'}</span>
                          </Avatar>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{message.authorName}</span>
                              <span className="text-xs text-muted-foreground">
                                {formatRelativeTime(message.createdAt)}
                              </span>
                            </div>
                            <p className="text-sm mt-1">{message.body}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No messages yet. Start a conversation!
                    </p>
                  )}

                  {/* Message Composer */}
                  <div className="border-t pt-4">
                    <textarea
                      className="w-full p-3 border rounded-lg resize-none"
                      rows={3}
                      placeholder="Write a message..."
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && e.ctrlKey) {
                          const textarea = e.currentTarget;
                          const message = textarea.value.trim();
                          if (message && metadata?.messages) {
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
                    <p className="text-xs text-muted-foreground mt-1">
                      Press Ctrl+Enter to send
                    </p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </Card>
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
            className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm"
          >
            <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
            Live updates enabled
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
