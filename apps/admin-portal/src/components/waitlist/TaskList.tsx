'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/portal';
import {
  useCreateWaitlistTask,
  useUpdateWaitlistTask,
  useWaitlistTasks,
} from '@/hooks/use-waitlist';
import type { WaitlistTask } from '@/services/waitlist';

function formatDueDate(iso: string | null): string {
  if (!iso) return 'No due date';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isOverdue(task: WaitlistTask, now: Date): boolean {
  if (task.completedAt || !task.dueDate) return false;
  return new Date(task.dueDate) < now;
}

export function TaskList({ waitlistId }: { waitlistId: string }) {
  const { data: tasks, isLoading } = useWaitlistTasks(waitlistId);
  const createTask = useCreateWaitlistTask();
  const updateTask = useUpdateWaitlistTask();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');

  const grouped = useMemo(() => {
    const now = new Date();
    const open: WaitlistTask[] = [];
    const overdue: WaitlistTask[] = [];
    const done: WaitlistTask[] = [];
    for (const t of tasks ?? []) {
      if (t.completedAt) done.push(t);
      else if (isOverdue(t, now)) overdue.push(t);
      else open.push(t);
    }
    return { open, overdue, done };
  }, [tasks]);

  const handleAdd = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    await createTask.mutateAsync({
      id: waitlistId,
      title: trimmed,
      dueDate: dueDate || null,
    });
    setTitle('');
    setDueDate('');
  };

  const renderRow = (task: WaitlistTask) => {
    const completed = !!task.completedAt;
    return (
      <li
        key={task.id}
        className="flex items-center gap-3 border-b border-[var(--border-subtle)] py-2.5"
      >
        <Checkbox
          checked={completed}
          onCheckedChange={(checked) =>
            updateTask.mutate({
              waitlistId,
              taskId: task.id,
              patch: { completed: !!checked },
            })
          }
        />
        <div className="flex-1">
          <div
            className={`text-sm ${completed ? 'text-muted-foreground line-through' : ''}`}
          >
            {task.title}
          </div>
          <div className="text-xs text-muted-foreground">{formatDueDate(task.dueDate)}</div>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Add a follow-up task…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
          }}
        />
        <Input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="sm:w-[180px]"
        />
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={!title.trim() || createTask.isPending}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading tasks…</div>
      ) : !tasks || tasks.length === 0 ? (
        <EmptyState message="No tasks yet." />
      ) : (
        <div className="space-y-4">
          {grouped.overdue.length > 0 && (
            <section>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--accent-warning,#b45309)]">
                Overdue
              </h4>
              <ul>{grouped.overdue.map(renderRow)}</ul>
            </section>
          )}
          {grouped.open.length > 0 && (
            <section>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Open
              </h4>
              <ul>{grouped.open.map(renderRow)}</ul>
            </section>
          )}
          {grouped.done.length > 0 && (
            <section>
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Done
              </h4>
              <ul>{grouped.done.map(renderRow)}</ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
