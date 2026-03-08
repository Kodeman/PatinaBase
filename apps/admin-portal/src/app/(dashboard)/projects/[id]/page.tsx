'use client';

'use client';

import {
  ProjectStatusBadge,
  ProgressRing,
  TaskBoard,
  RFICard,
  ChangeOrderCard,
  IssueCard,
  MilestoneCard,
  MessageComposer,
  MessageThread,
  type Task,
  type TaskStatus,
  type Column,
  type ThreadMessage,
  type MessageAttachment,
} from '@patina/design-system';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  Users,
  Activity,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  Search,
  FileEdit,
  Flag,
  Settings,
  Plus,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useThreads as useCommsThreads, useThread as useCommsThread, useSendMessage as useSendCommsMessage, useMarkRead as useCommsMarkRead, normalizeThreads } from '@/hooks/use-comms';
import { projectsApi } from '@/lib/api-client';
import { cn, getInitials } from '@/lib/utils';

interface Project {
  id: string;
  title: string;
  description?: string;
  status: 'draft' | 'active' | 'on-hold' | 'completed' | 'cancelled';
  progress: number;
  budget: number;
  spent: number;
  startDate: string;
  dueDate?: string;
  completedAt?: string;
  designer?: {
    id: string;
    name: string;
    avatar?: string;
  };
  client?: {
    id: string;
    name: string;
  };
}

function ProjectHeader({ project }: { project: Project }) {
  const router = useRouter();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-4">
      {/* Back Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/projects')}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Projects
      </Button>

      {/* Project Title & Status */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold tracking-tight truncate">
              {project.title}
            </h1>
            <ProjectStatusBadge status={project.status} size="lg" />
          </div>
          {project.description && (
            <p className="text-muted-foreground">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ProgressRing value={project.progress} size="lg" />
          <Button variant="outline">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Budget</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(project.budget)}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(project.spent)} spent (
              {Math.round((project.spent / project.budget) * 100)}%)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Progress</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{project.progress}%</div>
            <p className="text-xs text-muted-foreground">Overall completion</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Timeline</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-bold">{formatDate(project.startDate)}</div>
            <p className="text-xs text-muted-foreground">
              {project.dueDate ? `Due ${formatDate(project.dueDate)}` : 'No due date'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Team</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-bold">
              {project.designer?.name || 'Unassigned'}
            </div>
            <p className="text-xs text-muted-foreground">
              Client: {project.client?.name || 'N/A'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TasksTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['projects', projectId, 'tasks'],
    queryFn: async () => {
      const response = await projectsApi.getTasks(projectId);
      return (response as any).data as Task[];
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: TaskStatus }) => {
      return projectsApi.updateTask(taskId, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'tasks'] });
      toast.success('Task updated successfully');
    },
    onError: () => {
      toast.error('Failed to update task');
    },
  });

  const columns: Column[] = [
    { id: 'pending', title: 'To Do', status: 'pending', color: 'bg-gray-500' },
    { id: 'in-progress', title: 'In Progress', status: 'in-progress', color: 'bg-blue-500' },
    { id: 'blocked', title: 'Blocked', status: 'blocked', color: 'bg-red-500' },
    { id: 'completed', title: 'Done', status: 'completed', color: 'bg-green-500' },
  ];

  const handleTaskMove = (taskId: string, fromStatus: TaskStatus, toStatus: TaskStatus) => {
    updateTaskMutation.mutate({ taskId, status: toStatus });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Task Board</h3>
          <p className="text-sm text-muted-foreground">
            Drag and drop tasks to update their status
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Task
        </Button>
      </div>

      {tasks && tasks.length > 0 ? (
        <TaskBoard
          columns={columns}
          tasks={tasks}
          onTaskMove={handleTaskMove}
          enableDragDrop={true}
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-1">No tasks yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first task to get started
            </p>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Task
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RFIsTab({ projectId }: { projectId: string }) {
  const { data: rfis, isLoading } = useQuery({
    queryKey: ['projects', projectId, 'rfis'],
    queryFn: async () => {
      const response = await projectsApi.getRFIs(projectId);
      return (response as any).data;
    },
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Requests for Information</h3>
          <p className="text-sm text-muted-foreground">
            Track and respond to project clarifications
          </p>
        </div>
        <Button>
          <MessageSquare className="mr-2 h-4 w-4" />
          New RFI
        </Button>
      </div>

      {rfis && rfis.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {rfis.map((rfi: any) => (
            <RFICard
              key={rfi.id}
              {...rfi}
              onView={(id) => console.log('View RFI', id)}
              onAnswer={(id) => console.log('Answer RFI', id)}
              onClose={(id) => console.log('Close RFI', id)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-1">No RFIs yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create an RFI when clarification is needed
            </p>
            <Button>
              <MessageSquare className="mr-2 h-4 w-4" />
              New RFI
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ChangeOrdersTab({ projectId }: { projectId: string }) {
  const { data: changeOrders, isLoading } = useQuery({
    queryKey: ['projects', projectId, 'change-orders'],
    queryFn: async () => {
      const response = await projectsApi.getChangeOrders(projectId);
      return (response as any).data;
    },
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Change Orders</h3>
          <p className="text-sm text-muted-foreground">
            Track scope and budget changes
          </p>
        </div>
        <Button>
          <FileEdit className="mr-2 h-4 w-4" />
          New Change Order
        </Button>
      </div>

      {changeOrders && changeOrders.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {changeOrders.map((co: any) => (
            <ChangeOrderCard
              key={co.id}
              {...co}
              onView={(id) => console.log('View CO', id)}
              onApprove={(id) => console.log('Approve CO', id)}
              onReject={(id) => console.log('Reject CO', id)}
              onEdit={(id) => console.log('Edit CO', id)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileEdit className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-1">No change orders yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create change orders for scope or budget modifications
            </p>
            <Button>
              <FileEdit className="mr-2 h-4 w-4" />
              New Change Order
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function IssuesTab({ projectId }: { projectId: string }) {
  const { data: issues, isLoading } = useQuery({
    queryKey: ['projects', projectId, 'issues'],
    queryFn: async () => {
      // This would be a real API call
      return [];
    },
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Issues & Blockers</h3>
          <p className="text-sm text-muted-foreground">
            Track and resolve project issues
          </p>
        </div>
        <Button>
          <AlertTriangle className="mr-2 h-4 w-4" />
          Report Issue
        </Button>
      </div>

      {issues && issues.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {issues.map((issue: any) => (
            <IssueCard
              key={issue.id}
              {...issue}
              onView={(id) => console.log('View Issue', id)}
              onResolve={(id) => console.log('Resolve Issue', id)}
              onAssign={(id) => console.log('Assign Issue', id)}
              onClose={(id) => console.log('Close Issue', id)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-1">No issues reported</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Report issues or blockers as they arise
            </p>
            <Button>
              <AlertTriangle className="mr-2 h-4 w-4" />
              Report Issue
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MilestonesTab({ projectId }: { projectId: string }) {
  const { data: milestones, isLoading } = useQuery({
    queryKey: ['projects', projectId, 'milestones'],
    queryFn: async () => {
      const response = await projectsApi.getMilestones(projectId);
      return (response as any).data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Milestones</h3>
          <p className="text-sm text-muted-foreground">
            Track major project deliverables
          </p>
        </div>
        <Button>
          <Flag className="mr-2 h-4 w-4" />
          Add Milestone
        </Button>
      </div>

      {milestones && milestones.length > 0 ? (
        <div className="space-y-4">
          {milestones.map((milestone: any) => (
            <MilestoneCard
              key={milestone.id}
              {...milestone}
              onView={(id: string) => console.log('View Milestone', id)}
              onEdit={(id: string) => console.log('Edit Milestone', id)}
              onComplete={(id: string) => console.log('Complete Milestone', id)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Flag className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-1">No milestones yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create milestones to track major deliverables
            </p>
            <Button>
              <Flag className="mr-2 h-4 w-4" />
              Add Milestone
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MessagesTab({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const currentUserId = user?.id ?? '';
  const [search, setSearch] = useState('');
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const { data: threadsResponse, isLoading: threadsLoading } = useCommsThreads({ projectId });
  const threads = normalizeThreads(threadsResponse);
  const { data: threadDetail, isLoading: threadLoading } = useCommsThread(activeThreadId);
  const markRead = useCommsMarkRead();
  const sendMessage = useSendCommsMessage();
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeThreadId && threads.length > 0) {
      setActiveThreadId(threads[0].id as string);
    }
  }, [activeThreadId, threads]);

  useEffect(() => {
    if (!activeThreadId || !threadDetail?.messages?.length) return;
    const latestMessage = threadDetail.messages[0];
    markRead.mutate({
      threadId: activeThreadId,
      lastReadMessageId: latestMessage.id,
    });
  }, [activeThreadId, threadDetail?.messages, markRead]);

  const filteredThreads = useMemo(() => {
    if (!search.trim()) return threads;
    const query = search.toLowerCase();
    return threads.filter((thread: any) => {
      const participants = extractParticipants(thread);
      const participantNames = participants.map((participant) => participant.name?.toLowerCase());
      return (
        thread.title?.toLowerCase().includes(query) ||
        participantNames.some((name) => name?.includes(query)) ||
        thread.projectId?.toLowerCase().includes(query)
      );
    });
  }, [threads, search]);

  const conversationMessages = useMemo(
    () => mapThreadMessages(threadDetail?.messages ?? [], currentUserId),
    [threadDetail?.messages, currentUserId]
  );

  const selectedParticipants = extractParticipants(threadDetail);
  const handleSendMessage = async ({ body }: { body: string }) => {
    if (!activeThreadId) return;
    try {
      await sendMessage.mutateAsync({
        threadId: activeThreadId,
        data: { bodyText: body },
      });
      setSendError(null);
    } catch (error) {
      const message = 'Failed to send message.';
      setSendError(message);
      toast.error(message);
      throw error;
    }
  };

  const threadTitle =
    threadDetail?.title ||
    buildThreadTitle(selectedParticipants, currentUserId) ||
    'Conversation';
  const lastUpdated = threadDetail?.lastMessageAt ?? threadDetail?.updatedAt;

  return (
    <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
      <Card className="h-[620px] overflow-hidden">
        <CardHeader className="space-y-4">
          <div>
            <CardTitle>Project threads</CardTitle>
            <CardDescription>Collaborate with clients and designers</CardDescription>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by participant or subject"
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent className="h-full overflow-y-auto p-0">
          {threadsLoading ? (
            <div className="space-y-4 p-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : filteredThreads.length > 0 ? (
            <div className="divide-y divide-border">
              {filteredThreads.map((thread: any) => {
                const participants = extractParticipants(thread);
                const names = buildThreadTitle(participants, currentUserId);
                const preview = thread.messages?.[0]?.text || thread.messages?.[0]?.bodyText || 'No messages yet';
                const isActive = thread.id === activeThreadId;

                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => setActiveThreadId(thread.id)}
                    className={cn(
                      'w-full p-4 text-left transition hover:bg-muted/40 focus-visible:focus-ring',
                      isActive && 'bg-muted/60'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                          {getInitials(names || 'Thread')}
                        </div>
                        <div>
                          <p className="text-sm font-semibold leading-tight">{names}</p>
                          <p className="text-xs text-muted-foreground">{preview}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {thread.status && (
                          <Badge variant="outline" className="text-[10px] uppercase tracking-widest">
                            {thread.status}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTimestamp(thread.lastMessageAt || thread.updatedAt)}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-sm text-muted-foreground">
              No threads found for this project.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card className="flex-1 overflow-hidden">
          {activeThreadId && threadDetail ? (
            <>
              <CardHeader className="flex flex-col gap-2 border-b bg-muted/30">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg">{threadTitle}</CardTitle>
                  {threadDetail.status && (
                    <Badge variant="secondary" className="text-[10px] uppercase tracking-widest">
                      {threadDetail.status}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Updated {formatRelativeTimestamp(lastUpdated)}
                </p>
              </CardHeader>
              <CardContent className="h-[420px] p-0">
                {threadLoading ? (
                  <div className="space-y-4 p-6">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (
                  <MessageThread
                    className="h-full rounded-none border-0"
                    messages={conversationMessages}
                    currentUserId={currentUserId}
                    emptyState={
                      <div className="text-center text-sm text-muted-foreground">
                        No messages yet. Be the first to respond.
                      </div>
                    }
                  />
                )}
              </CardContent>
            </>
          ) : (
            <div className="flex h-[500px] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <MessageSquare className="h-10 w-10" />
              <p className="text-sm font-medium text-foreground">Select a thread</p>
              <p className="text-xs text-muted-foreground">
                Choose a conversation from the left to view messages.
              </p>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reply</CardTitle>
            <CardDescription>Share an update or answer client questions</CardDescription>
          </CardHeader>
          <CardContent>
            <MessageComposer
              disabled={!activeThreadId}
              busy={sendMessage.isPending}
              placeholder={activeThreadId ? 'Type your message…' : 'Select a thread to start messaging'}
              onSend={handleSendMessage}
            />
            {sendError && <p className="mt-2 text-sm text-destructive">{sendError}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function extractParticipants(source: any): Array<{ id: string; name: string; avatar?: string; role?: string }> {
  if (!source) return [];
  let raw = source.participants ?? source.metadata?.participants ?? [];

  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [];
    }
  }

  if (!Array.isArray(raw)) return [];

  return raw.map((participant: any) => {
    if (typeof participant === 'string') {
      return { id: participant, name: participant };
    }

    const id = participant.id || participant.userId || participant.email || participant.name || 'participant';
    return {
      id,
      name: participant.name || participant.displayName || participant.email || id,
      avatar: participant.avatar || participant.avatarUrl,
      role: participant.role || participant.title,
    };
  });
}

function mapThreadMessages(messages: any[], currentUserId: string): ThreadMessage[] {
  return messages
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((message): ThreadMessage => ({
      id: message.id,
      author: {
        id: message.authorId,
        name: message.authorName || message.metadata?.authorName || message.authorId,
        avatarUrl: message.authorAvatar || message.metadata?.authorAvatar,
        role: message.authorRole || message.metadata?.authorRole,
      },
      timestamp: new Date(message.createdAt),
      body: message.bodyText || message.text || message.body || '',
      attachments: mapAttachments(message),
      status: message.status,
      variant: (message.isSystem
        ? 'system'
        : message.authorId && currentUserId && message.authorId === currentUserId
          ? 'outgoing'
          : 'incoming') as 'incoming' | 'outgoing' | 'system',
    }));
}

function mapAttachments(message: any): MessageAttachment[] {
  const attachments: MessageAttachment[] = [];

  if (Array.isArray(message.richAttachments) && message.richAttachments.length > 0) {
    message.richAttachments.forEach((attachment: any) => {
      attachments.push({
        id: attachment.id,
        name: attachment.filename,
        size: attachment.size ? `${Math.round(attachment.size / 1024)} KB` : undefined,
        url: attachment.url,
        type: attachment.mimeType,
      });
    });
  } else if (Array.isArray(message.attachments) && message.attachments.length > 0) {
    message.attachments.forEach((attachment: any, index: number) => {
      attachments.push({
        id: attachment.id || `${message.id}-attachment-${index}`,
        name: attachment.name || 'Attachment',
        url: attachment.url,
        type: attachment.type,
      });
    });
  }

  return attachments;
}

function buildThreadTitle(participants: Array<{ id: string; name: string }>, currentUserId: string) {
  const names = participants
    .filter((participant) => participant.id !== currentUserId)
    .map((participant) => participant.name);
  return names.join(', ');
}

function formatRelativeTimestamp(timestamp?: string | Date) {
  if (!timestamp) return 'just now';
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const diffInSeconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

function ActivityTab({ projectId }: { projectId: string }) {
  const { data: activities, isLoading } = useQuery({
    queryKey: ['projects', projectId, 'activity'],
    queryFn: async () => {
      const response = await projectsApi.getActivityFeed(projectId, { limit: 50 });
      return (response as any).data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Activity Feed</h3>
        <p className="text-sm text-muted-foreground">
          Recent project updates and changes
        </p>
      </div>

      {activities && activities.length > 0 ? (
        <div className="space-y-4">
          {activities.map((activity: any) => (
            <Card key={activity.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Activity className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm">{activity.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(activity.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Activity className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-1">No activity yet</h3>
            <p className="text-sm text-muted-foreground">
              Activity will appear here as work progresses
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;

  const { data: project, isLoading } = useQuery({
    queryKey: ['projects', projectId],
    queryFn: async () => {
      const response = await projectsApi.getProject(projectId);
      return (response as any).data as Project;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!project) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-1">Project not found</h3>
          <p className="text-sm text-muted-foreground">
            The project you're looking for doesn't exist or has been deleted
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <ProjectHeader project={project} />

      <Tabs defaultValue="tasks" className="space-y-6">
        <TabsList className="grid w-full grid-cols-7 lg:w-auto">
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="rfis">RFIs</TabsTrigger>
          <TabsTrigger value="change-orders">Change Orders</TabsTrigger>
          <TabsTrigger value="issues">Issues</TabsTrigger>
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks">
          <TasksTab projectId={projectId} />
        </TabsContent>

        <TabsContent value="rfis">
          <RFIsTab projectId={projectId} />
        </TabsContent>

        <TabsContent value="change-orders">
          <ChangeOrdersTab projectId={projectId} />
        </TabsContent>

        <TabsContent value="issues">
          <IssuesTab projectId={projectId} />
        </TabsContent>

        <TabsContent value="milestones">
          <MilestonesTab projectId={projectId} />
        </TabsContent>

        <TabsContent value="activity">
          <ActivityTab projectId={projectId} />
        </TabsContent>

        <TabsContent value="messages">
          <MessagesTab projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
