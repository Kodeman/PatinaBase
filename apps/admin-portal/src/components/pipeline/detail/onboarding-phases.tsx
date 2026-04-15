import { VendorPipeline } from '@patina/types';
import { cn } from '@/lib/utils';

const { ONBOARDING_PHASES } = VendorPipeline;

export function OnboardingPhases({ stage }: { stage: VendorPipeline.VendorStage }) {
  // For paused/rejected we still show progress up to their last known positive phase
  const currentIndex = ONBOARDING_PHASES.indexOf(stage);
  const effectiveIndex = currentIndex === -1 ? -1 : currentIndex;

  return (
    <ol className="flex items-center gap-2 overflow-x-auto pb-2">
      {ONBOARDING_PHASES.map((phase, i) => {
        const isCompleted = effectiveIndex > i;
        const isCurrent = effectiveIndex === i;
        return (
          <li key={phase} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold tabular-nums',
                  isCompleted && 'border-patina-success bg-patina-success/20 text-patina-success',
                  isCurrent && 'border-patina-clay-beige bg-patina-clay-beige/20 text-patina-mocha-brown',
                  !isCompleted && !isCurrent && 'border-border bg-muted text-muted-foreground',
                )}
              >
                {i + 1}
              </span>
              <span
                className={cn(
                  'font-mono text-[0.6rem] uppercase tracking-wide',
                  (isCompleted || isCurrent)
                    ? 'text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {phase}
              </span>
            </div>
            {i < ONBOARDING_PHASES.length - 1 && (
              <div
                className={cn(
                  'h-px w-8 shrink-0',
                  isCompleted ? 'bg-patina-success' : 'bg-border',
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
