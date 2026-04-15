'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StageTag } from './stage-tag';
import { ScoreBadge } from './score-badge';
import { useVendors } from '@/hooks/use-pipeline';
import type { VendorListFilters } from '@/services/vendor-pipeline';
import type { VendorPipeline } from '@patina/types';

type SortBy = NonNullable<VendorListFilters['sort_by']>;

export function VendorTable({
  filters,
  onSortChange,
  emptyLabel = 'No vendors match these filters yet.',
}: {
  filters: VendorListFilters;
  onSortChange: (sortBy: SortBy) => void;
  emptyLabel?: string;
}) {
  const { data: vendors, isLoading } = useVendors(filters);
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (!vendors || vendors.length === 0) {
    return (
      <div className="rounded-sm border border-dashed py-12 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  const headerCell = (label: string, key: SortBy, align: 'left' | 'right' = 'left') => (
    <TableHead className={align === 'right' ? 'text-right' : undefined}>
      <button
        type="button"
        onClick={() => onSortChange(key)}
        className="font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        {label}
      </button>
    </TableHead>
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {headerCell('Vendor', 'name')}
          {headerCell('Score', 'total_score', 'right')}
          {headerCell('Stage', 'stage')}
          {headerCell('Last Activity', 'updated_at')}
          <TableHead className="text-right">
            <span className="font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground">
              Next
            </span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vendors.map((v) => (
          <TableRow
            key={v.id}
            className="cursor-pointer"
            onClick={() => router.push(`/pipeline/${v.slug}` as any)}
          >
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium">{v.name}</span>
                <span className="text-xs text-muted-foreground">
                  {[v.location_city, v.location_state].filter(Boolean).join(', ') || '—'}
                  {v.product_categories?.length > 0 && (
                    <>
                      {' · '}
                      {v.product_categories.slice(0, 3).join(', ')}
                    </>
                  )}
                </span>
              </div>
            </TableCell>
            <TableCell className="text-right">
              <ScoreBadge score={v.total_score} triage={v.triage_level} size="sm" />
            </TableCell>
            <TableCell>
              <StageTag stage={v.stage} />
            </TableCell>
            <TableCell>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(v.updated_at), { addSuffix: true })}
              </span>
            </TableCell>
            <TableCell className="text-right">
              <VendorNextStep vendor={v} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function VendorNextStep({ vendor }: { vendor: VendorPipeline.Vendor }) {
  if (vendor.awaiting_leah_review) {
    return (
      <Link
        href="/pipeline/review"
        onClick={(e) => e.stopPropagation()}
        className="font-mono text-[0.65rem] uppercase tracking-wide text-patina-clay-beige hover:underline"
      >
        Leah review
      </Link>
    );
  }
  if (vendor.stage === 'discovery' && !vendor.scored_by_kody) {
    return (
      <span className="font-mono text-[0.65rem] uppercase tracking-wide text-patina-info">
        cowork score
      </span>
    );
  }
  if (vendor.stage === 'onboarding') {
    return (
      <span className="font-mono text-[0.65rem] uppercase tracking-wide text-patina-success">
        onboarding
      </span>
    );
  }
  return (
    <span className="font-mono text-[0.65rem] uppercase tracking-wide text-muted-foreground">
      —
    </span>
  );
}
