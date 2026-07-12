'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentTask } from '@patina/agent-queue';
import { EmptyState, LoadingStrata, Section } from '@/components/portal';
import { useToast } from '@/components/portal/toast-provider';
import { useAgentTasks, useReviewTask } from '@/hooks/use-agent-tasks';
import { useInboxKeyboard } from '@/hooks/use-inbox-keyboard';
import type { AgentTaskFilters } from '@/services/agent-tasks';
import { ApprovalCard } from './approval-card';
import { EditPayloadDrawer } from './edit-payload-drawer';

interface ApprovalInboxProps {
  filters?: AgentTaskFilters;
}

export function ApprovalInbox({ filters = { status: 'awaiting_review' } }: ApprovalInboxProps) {
  const { data: tasks, isLoading, isError, error } = useAgentTasks(filters);
  const review = useReviewTask();
  const { toast } = useToast();

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [rejectOpenId, setRejectOpenId] = useState<string | null>(null);
  const [editTaskId, setEditTaskId] = useState<string | null>(null);

  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const list = tasks ?? [];
  const suspended = rejectOpenId !== null || editTaskId !== null;

  // Clamp selection whenever the list shrinks (e.g. a reviewed row is removed),
  // so focus lands on the row that slid into the vacated index.
  useEffect(() => {
    setSelectedIndex((i) => {
      if (list.length === 0) return 0;
      return Math.min(i, list.length - 1);
    });
  }, [list.length]);

  const selectedTask: AgentTask | undefined = list[selectedIndex];

  // Keep the selected row in view.
  useEffect(() => {
    if (!selectedTask) return;
    rowRefs.current.get(selectedTask.id)?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, selectedTask?.id]);

  const runReview = useCallback(
    async (
      task: AgentTask,
      decision: 'approved' | 'rejected',
      opts?: { note?: string; payloadPatch?: Record<string, unknown> },
    ) => {
      try {
        await review.mutateAsync({
          id: task.id,
          decision,
          note: opts?.note ?? null,
          payloadPatch: opts?.payloadPatch ?? null,
        });
        // Drop any per-row UI state for the departed task.
        setExpandedIds((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
        toast(decision === 'approved' ? 'Task approved' : 'Task rejected', 'success');
      } catch (e) {
        toast((e as Error).message || 'Review failed', 'error');
      }
    },
    [review, toast],
  );

  // ─── keyboard handlers ───────────────────────────────────────────────────
  const onApprove = useCallback(() => {
    if (selectedTask) void runReview(selectedTask, 'approved');
  }, [selectedTask, runReview]);

  const onToggleExpand = useCallback(() => {
    if (!selectedTask) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(selectedTask.id) ? next.delete(selectedTask.id) : next.add(selectedTask.id);
      return next;
    });
  }, [selectedTask]);

  useInboxKeyboard({
    enabled: !isLoading,
    suspended,
    onNext: () => setSelectedIndex((i) => Math.min(i + 1, Math.max(0, list.length - 1))),
    onPrev: () => setSelectedIndex((i) => Math.max(i - 1, 0)),
    onToggleExpand,
    onApprove,
    onReject: () => selectedTask && setRejectOpenId(selectedTask.id),
    onEdit: () => selectedTask && setEditTaskId(selectedTask.id),
  });

  if (isLoading) return <LoadingStrata />;
  if (isError) {
    return (
      <EmptyState label="Error" message={(error as Error)?.message ?? 'Failed to load the queue'} />
    );
  }
  if (list.length === 0) {
    return (
      <EmptyState
        label="Inbox zero"
        message="Nothing is awaiting review. Agent work will surface here as it lands."
      />
    );
  }

  const editTask = editTaskId ? list.find((t) => t.id === editTaskId) ?? null : null;

  return (
    <Section>
      <div data-testid="approval-inbox" className="flex flex-col">
        {list.map((task, index) => (
          <ApprovalCard
            key={task.id}
            ref={(el) => {
              if (el) rowRefs.current.set(task.id, el);
              else rowRefs.current.delete(task.id);
            }}
            task={task}
            selected={index === selectedIndex}
            expanded={expandedIds.has(task.id)}
            rejectOpen={rejectOpenId === task.id}
            submitting={review.isPending}
            onSelect={() => setSelectedIndex(index)}
            onToggleExpand={() => {
              setSelectedIndex(index);
              setExpandedIds((prev) => {
                const next = new Set(prev);
                next.has(task.id) ? next.delete(task.id) : next.add(task.id);
                return next;
              });
            }}
            onApprove={() => {
              setSelectedIndex(index);
              void runReview(task, 'approved');
            }}
            onOpenReject={() => {
              setSelectedIndex(index);
              setRejectOpenId(task.id);
            }}
            onSubmitReject={(note) => {
              setRejectOpenId(null);
              void runReview(task, 'rejected', { note });
            }}
            onCloseReject={() => setRejectOpenId(null)}
            onOpenEdit={() => {
              setSelectedIndex(index);
              setEditTaskId(task.id);
            }}
          />
        ))}
      </div>

      <EditPayloadDrawer
        open={editTask !== null}
        task={editTask}
        submitting={review.isPending}
        onSubmit={(payloadPatch) => {
          const t = editTask;
          setEditTaskId(null);
          if (t) void runReview(t, 'approved', { payloadPatch });
        }}
        onClose={() => setEditTaskId(null)}
      />
    </Section>
  );
}
