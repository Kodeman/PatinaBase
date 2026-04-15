import { cn } from '@/lib/utils';
import type { VendorPipeline } from '@patina/types';

const STAGE_STYLES: Record<VendorPipeline.VendorStage, string> = {
  discovery: 'bg-muted text-muted-foreground',
  qualification: 'bg-patina-info/15 text-patina-info',
  outreach: 'bg-patina-clay-beige/20 text-patina-mocha-brown',
  negotiation: 'bg-patina-warning/20 text-patina-mocha-brown',
  onboarding: 'bg-patina-success/20 text-patina-success',
  live: 'bg-patina-success/30 text-patina-success font-semibold',
  paused: 'bg-muted text-muted-foreground',
  rejected: 'bg-patina-error/15 text-patina-error',
};

export function StageTag({
  stage,
  className,
}: {
  stage: VendorPipeline.VendorStage;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'font-mono text-[0.6rem] uppercase tracking-wide px-2 py-0.5 rounded-sm inline-block whitespace-nowrap',
        STAGE_STYLES[stage] ?? 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {stage.replace('_', ' ')}
    </span>
  );
}
