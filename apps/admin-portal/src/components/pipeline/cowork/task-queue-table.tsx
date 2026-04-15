'use client';

import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCancelCoworkTask } from '@/hooks/use-pipeline';
import { useToast } from '@/components/ui/use-toast';
import type { VendorPipeline } from '@patina/types';

type CoworkTask = VendorPipeline.CoworkTask;

const STATUS_STYLES: Record<VendorPipeline.CoworkTaskStatus, string> = {
  pending: 'text-muted-foreground',
  picked_up: 'text-patina-info',
  running: 'text-patina-info',
  completed: 'text-patina-success',
  failed: 'text-patina-error',
  cancelled: 'text-muted-foreground',
};

type VendorLookup = Record<string, { slug: string; name: string }>;

export function TaskQueueTable({
  tasks,
  vendorLookup,
}: {
  tasks: CoworkTask[];
  vendorLookup: VendorLookup;
}) {
  const cancel = useCancelCoworkTask();
  const { toast } = useToast();

  const handleCancel = async (id: string) => {
    try {
      await cancel.mutateAsync(id);
      toast({ title: 'Task cancelled' });
    } catch (err) {
      toast({
        title: 'Failed to cancel',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  if (tasks.length === 0) {
    return (
      <div className="rounded-sm border border-dashed py-12 text-center text-sm text-muted-foreground">
        No tasks yet.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Task</TableHead>
          <TableHead>Vendor</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((t) => {
          const vendor = t.vendor_id ? vendorLookup[t.vendor_id] : null;
          const duration = t.completed_at
            ? Math.round(
                (new Date(t.completed_at).getTime() - new Date(t.created_at).getTime()) / 1000,
              )
            : null;
          const isFailed = t.status === 'failed';

          return (
            <TableRow key={t.id} className={cn(isFailed && 'border-l-2 border-patina-error')}>
              <TableCell>
                <div className="font-medium">{t.task_type.replace('_', ' ')}</div>
                {isFailed && t.error_message && (
                  <div className="mt-1 text-xs text-patina-error">{t.error_message}</div>
                )}
              </TableCell>
              <TableCell>
                {vendor ? (
                  <Link
                    href={`/pipeline/${vendor.slug}`}
                    className="hover:underline"
                  >
                    {vendor.name}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <span
                  className={cn(
                    'font-mono text-[0.65rem] uppercase tracking-wide',
                    STATUS_STYLES[t.status],
                  )}
                >
                  {t.status}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-xs text-muted-foreground">
                  {duration != null ? `${duration}s` : '—'}
                </span>
              </TableCell>
              <TableCell className="text-right">
                {t.status === 'pending' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCancel(t.id)}
                    disabled={cancel.isPending}
                  >
                    Cancel
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
