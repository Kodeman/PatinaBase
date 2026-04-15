'use client';

import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';
import { useVendors } from '@/hooks/use-pipeline';

export function LeahQueueBanner() {
  const { data: vendors } = useVendors({ awaiting_leah: true, sort_by: 'updated_at', sort_dir: 'desc' });

  if (!vendors || vendors.length === 0) return null;

  const preview = vendors.slice(0, 4).map((v) => v.name).join(', ');
  const rest = vendors.length > 4 ? ` +${vendors.length - 4} more` : '';

  return (
    <Link
      href="/pipeline/review"
      className="block rounded-sm border-l-4 border-patina-clay-beige bg-patina-clay-beige/10 px-4 py-3 hover:bg-patina-clay-beige/15 transition-colors"
    >
      <div className="flex items-start gap-3">
        <ClipboardCheck className="h-5 w-5 shrink-0 text-patina-mocha-brown" />
        <div className="flex-1">
          <div className="font-semibold text-patina-mocha-brown">
            Leah&rsquo;s review queue · {vendors.length} awaiting
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            {preview}
            {rest}
          </div>
        </div>
        <span className="font-mono text-xs uppercase tracking-wide text-patina-mocha-brown">
          Review →
        </span>
      </div>
    </Link>
  );
}
