import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn';
import { TaskCard, type TaskCardProps } from '../TaskCard';

const taskBoardVariants = cva('flex gap-4 overflow-x-auto pb-4', {
  variants: {
    layout: {
      horizontal: 'flex-row',
      compact: 'flex-row gap-3',
    },
  },
  defaultVariants: {
    layout: 'horizontal',
  },
});

const columnVariants = cva(
  'flex flex-col rounded-lg bg-gray-50 dark:bg-gray-900 min-w-[320px] max-w-[400px]',
  {
    variants: {
      isOver: {
        true: 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-400 dark:border-blue-600',
        false: 'border border-gray-200 dark:border-gray-800',
      },
    },
    defaultVariants: {
      isOver: false,
    },
  }
);

export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'blocked' | 'cancelled';

export interface Column {
  id: string;
  title: string;
  status: TaskStatus;
  color?: string;
  icon?: React.ReactNode;
}

export interface Task extends Omit<TaskCardProps, 'variant' | 'size'> {
  id: string;
  status: TaskStatus;
}

export interface TaskBoardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onDragStart' | 'onDragEnd'>,
    VariantProps<typeof taskBoardVariants> {
  columns: Column[];
  tasks: Task[];
  onTaskMove?: (taskId: string, fromStatus: TaskStatus, toStatus: TaskStatus) => void;
  onTaskClick?: (task: Task) => void;
  onTaskEdit?: (task: Task) => void;
  onTaskDelete?: (taskId: string) => void;
  enableDragDrop?: boolean;
  emptyStateText?: string;
}

const TaskBoard = React.forwardRef<HTMLDivElement, TaskBoardProps>(
  (
    {
      className,
      layout,
      columns,
      tasks,
      onTaskMove,
      onTaskClick,
      onTaskEdit,
      onTaskDelete,
      enableDragDrop = true,
      emptyStateText = 'No tasks',
      ...props
    },
    ref
  ) => {
    const [draggedTask, setDraggedTask] = React.useState<Task | null>(null);
    const [dragOverColumn, setDragOverColumn] = React.useState<string | null>(null);

    const getTasksForColumn = (columnStatus: TaskStatus): Task[] => {
      return tasks.filter((task) => task.status === columnStatus);
    };

    const handleDragStart = (task: Task) => {
      if (!enableDragDrop) return;
      setDraggedTask(task);
    };

    const handleDragEnd = () => {
      setDraggedTask(null);
      setDragOverColumn(null);
    };

    const handleDragOver = (e: React.DragEvent, columnId: string) => {
      e.preventDefault();
      if (!enableDragDrop || !draggedTask) return;
      setDragOverColumn(columnId);
    };

    const handleDragLeave = () => {
      setDragOverColumn(null);
    };

    const handleDrop = (e: React.DragEvent, column: Column) => {
      e.preventDefault();
      if (!enableDragDrop || !draggedTask || !onTaskMove) return;

      const fromStatus = draggedTask.status;
      const toStatus = column.status;

      if (fromStatus !== toStatus) {
        onTaskMove(draggedTask.id, fromStatus, toStatus);
      }

      setDraggedTask(null);
      setDragOverColumn(null);
    };

    const getColumnColor = (column: Column): string => {
      if (column.color) return column.color;

      const colorMap: Record<TaskStatus, string> = {
        pending: 'bg-gray-500',
        'in-progress': 'bg-yellow-500',
        completed: 'bg-green-500',
        blocked: 'bg-red-500',
        cancelled: 'bg-gray-400',
      };

      return colorMap[column.status] || 'bg-gray-500';
    };

    return (
      <div ref={ref} className={cn(taskBoardVariants({ layout }), className)} {...props}>
        {columns.map((column) => {
          const columnTasks = getTasksForColumn(column.status);
          const isOver = dragOverColumn === column.id;

          return (
            <div
              key={column.id}
              className={cn(columnVariants({ isOver }), 'flex-shrink-0')}
              onDragOver={(e) => handleDragOver(e, column.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column)}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  {column.icon && <span className="text-lg">{column.icon}</span>}
                  <div className={cn('w-2 h-2 rounded-full', getColumnColor(column))} />
                  <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                    {column.title}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300">
                    {columnTasks.length}
                  </span>
                </div>
              </div>

              {/* Column Content */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px]">
                {columnTasks.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-sm text-gray-500 dark:text-gray-500 italic">
                    {emptyStateText}
                  </div>
                ) : (
                  columnTasks.map((task) => (
                    <div
                      key={task.id}
                      draggable={enableDragDrop}
                      onDragStart={() => handleDragStart(task)}
                      onDragEnd={handleDragEnd}
                      className={cn(
                        enableDragDrop && 'cursor-grab active:cursor-grabbing',
                        draggedTask?.id === task.id && 'opacity-50'
                      )}
                    >
                      <TaskCard
                        {...task}
                        variant={draggedTask?.id === task.id ? 'dragging' : 'default'}
                        size="sm"
                        onClick={() => onTaskClick?.(task)}
                        onEdit={() => onTaskEdit?.(task)}
                        onDelete={() => onTaskDelete?.(task.id)}
                        onView={() => onTaskClick?.(task)}
                      />
                    </div>
                  ))
                )}
              </div>

              {/* Column Footer (optional - for "Add Task" button) */}
              <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                <button
                  className="w-full py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors flex items-center justify-center gap-2"
                  aria-label={`Add task to ${column.title}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  <span>Add Task</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
);

TaskBoard.displayName = 'TaskBoard';

export { TaskBoard, taskBoardVariants };
