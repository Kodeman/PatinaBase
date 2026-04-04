'use client';

import type { MockTask } from '@/types/project-ui';

interface TaskChecklistProps {
  tasks: MockTask[];
  onToggle?: (taskId: string, done: boolean) => void;
  onAddTask?: () => void;
  canAdvancePhase?: boolean;
  onAdvancePhase?: () => void;
}

function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

export function TaskChecklist({
  tasks,
  onToggle,
  onAddTask,
  canAdvancePhase,
  onAdvancePhase,
}: TaskChecklistProps) {
  return (
    <div>
      {tasks.map((task) => {
        const done = task.status === 'done';
        const overdue = !done && isOverdue(task.dueDate);

        return (
          <div
            key={task.id}
            className="grid items-start gap-3 border-b py-2.5"
            style={{
              gridTemplateColumns: '20px 1fr auto',
              borderColor: 'rgba(229, 226, 221, 0.4)',
            }}
          >
            {/* Checkbox */}
            <button
              className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] border-[1.5px] ${
                done
                  ? 'border-[var(--color-sage)] bg-[rgba(122,155,118,0.1)] text-[var(--color-sage)]'
                  : 'border-[var(--border-default)]'
              }`}
              style={{ fontSize: '0.6rem', cursor: 'pointer' }}
              onClick={() => onToggle?.(task.id, !done)}
            >
              {done && '✓'}
            </button>

            {/* Task content */}
            <div>
              <div
                className={`font-body text-[0.88rem] ${
                  done
                    ? 'text-[var(--text-muted)] line-through decoration-[var(--border-default)]'
                    : 'text-[var(--text-primary)]'
                }`}
              >
                {task.title}
              </div>
              {task.description && (
                <div className="type-label-secondary mt-0.5" style={{ fontSize: '0.75rem' }}>
                  {task.description}
                </div>
              )}
            </div>

            {/* Due date */}
            {task.dueDate && (
              <span
                className="whitespace-nowrap type-meta-small"
                style={{
                  color: overdue
                    ? 'var(--color-terracotta)'
                    : done
                      ? 'var(--color-sage)'
                      : 'var(--text-muted)',
                }}
              >
                {done
                  ? task.completedAt
                    ? new Date(task.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : ''
                  : overdue
                    ? `Due ${new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                    : `Due ${new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
              </span>
            )}
          </div>
        );
      })}

      {/* Action buttons */}
      <div className="mt-3 flex gap-2">
        {onAddTask && (
          <button
            className="type-btn-text rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-1.5 text-[0.72rem] text-[var(--text-primary)]"
            onClick={onAddTask}
          >
            + Add Task
          </button>
        )}
        {canAdvancePhase && onAdvancePhase && (
          <button
            className="type-btn-text rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-1.5 text-[0.72rem] text-[var(--text-primary)]"
            onClick={onAdvancePhase}
          >
            Advance Phase →
          </button>
        )}
      </div>
    </div>
  );
}
