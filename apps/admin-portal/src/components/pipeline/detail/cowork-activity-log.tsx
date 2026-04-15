import { formatDistanceToNow } from 'date-fns';
import type { VendorPipeline } from '@patina/types';
import { cn } from '@/lib/utils';

type CoworkTask = VendorPipeline.CoworkTask;

const STATUS_COLORS: Record<VendorPipeline.CoworkTaskStatus, string> = {
  pending: 'border-muted-foreground/40',
  picked_up: 'border-patina-info',
  running: 'border-patina-info',
  completed: 'border-patina-success',
  failed: 'border-patina-error',
  cancelled: 'border-muted-foreground/40',
};

function describeTask(task: CoworkTask): string {
  switch (task.task_type) {
    case 'auto_score':
      return 'Auto-scored dimensions 1–4';
    case 'rescore':
      return 'Re-scored vendor';
    case 'generate_brief':
      return 'Generated outreach brief';
    case 'draft_email':
      return 'Drafted outreach email';
    case 'ingest_feed':
      return 'Ingested product feed';
    case 'feed_sync':
      return 'Synced vendor feed';
    case 'normalize_data':
      return 'Normalized vendor data';
    case 'image_audit':
      return 'Audited product imagery';
    case 'prospect_scan':
      return 'Ran prospect scan';
    default:
      return task.task_type;
  }
}

export function CoworkActivityLog({ tasks }: { tasks: CoworkTask[] }) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-sm border border-dashed py-8 text-center text-sm text-muted-foreground">
        No Cowork activity yet.
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {tasks.map((t) => (
        <li
          key={t.id}
          className={cn(
            'border-l-2 pl-4 py-1',
            STATUS_COLORS[t.status] ?? 'border-muted',
          )}
        >
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-semibold">{describeTask(t)}</div>
            <div className="font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground">
              {t.status}
            </div>
          </div>
          <div className="font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground">
            {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
            {t.completed_at && (
              <>
                {' · completed '}
                {formatDistanceToNow(new Date(t.completed_at), { addSuffix: true })}
              </>
            )}
          </div>
          {t.error_message && (
            <p className="mt-1 text-xs text-patina-error">{t.error_message}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
