'use client';

import Link from 'next/link';
import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveTaskCount } from '@/hooks/use-pipeline';

export function CoworkStatusIndicator({ className }: { className?: string }) {
  const { data: count = 0 } = useActiveTaskCount();
  const active = count > 0;

  return (
    <Link
      href="/cowork"
      className={cn(
        'inline-flex items-center gap-2 rounded-sm border px-3 py-1.5 text-xs transition-colors hover:bg-muted',
        className,
      )}
      title={active ? `${count} Cowork task${count === 1 ? '' : 's'} running` : 'Cowork idle'}
    >
      <span className="relative flex h-2 w-2">
        {active && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-patina-info/70" />
        )}
        <span
          className={cn(
            'relative inline-flex h-2 w-2 rounded-full',
            active ? 'bg-patina-info' : 'bg-muted-foreground/40',
          )}
        />
      </span>
      <Bot className="h-3.5 w-3.5" />
      <span className="font-mono text-[0.65rem] uppercase tracking-wide text-muted-foreground">
        {active ? `${count} running` : 'idle'}
      </span>
    </Link>
  );
}
