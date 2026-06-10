'use client';

import { useCallback, useState } from 'react';
import { Timer } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@patina/design-system';
import { IconButton, Input } from '@/components/ui/controls';
import { useHydrated } from '@/hooks/use-hydrated';
import { useRunningTimer, useStartTimer } from '@/hooks/use-time-tracking';
import { useStartableProjects } from '@/hooks/use-startable-projects';
import { useToast } from '@/components/portal/toast-provider';
import { RunningTimerChip } from './running-timer-chip';
import { LogTimeGlobal } from './log-time-global';

/**
 * The single header timer affordance. While a timer runs it delegates to
 * RunningTimerChip (elapsed clock, click-to-stop); when idle it's a Timer
 * icon opening a start-timer popover (project search → start) with a manual
 * log-time escape hatch. The ⌘K Time group is the keyboard path to the same
 * mutations — both read queryKeys.time.runningTimer(), so they can't disagree.
 */
export function TimerButton() {
  // Pre-hydration we can't know whether a timer runs; render the static idle
  // icon (never null → button swap) so SSR and first client paint match.
  const hydrated = useHydrated();
  const { data: runningTimer } = useRunningTimer();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [logTimeOpen, setLogTimeOpen] = useState(false);

  const projects = useStartableProjects(search);
  const startTimer = useStartTimer();
  const { toast } = useToast();

  const handleStart = useCallback(
    (projectId: string, projectName: string) => {
      startTimer.mutate(
        { projectId },
        // Failure toasts (incl. the 23505 already-running case) live in the hook.
        { onSuccess: () => toast(`Timer started on ${projectName}`, 'success') }
      );
      setOpen(false);
      setSearch('');
    },
    [startTimer, toast]
  );

  if (hydrated && runningTimer) {
    return <RunningTimerChip />;
  }

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch('');
        }}
      >
        <PopoverTrigger asChild>
          <IconButton variant="ghost" size="md" label="Start timer">
            <Timer className="h-4 w-4" />
          </IconButton>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-0">
          <div className="border-b border-[var(--border-default)] px-4 py-3">
            <h3 className="font-heading text-sm font-medium text-[var(--text-primary)]">
              Start a timer
            </h3>
          </div>

          <div className="p-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects…"
              aria-label="Search projects"
              className="h-8 text-sm"
            />

            <div className="mt-1.5" role="listbox" aria-label="Startable projects">
              {projects.length === 0 ? (
                <p className="px-2.5 py-3 text-center text-xs text-[var(--text-muted)]">
                  {search ? 'No matching projects.' : 'No active projects to track time on.'}
                </p>
              ) : (
                projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => handleStart(p.id, p.name ?? 'project')}
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-[var(--text-body)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  >
                    <Timer className="h-3.5 w-3.5 flex-shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
                    <span className="truncate">{p.name ?? 'Untitled project'}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="border-t border-[var(--border-default)] px-1.5 py-1.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setLogTimeOpen(true);
              }}
              className="w-full rounded-md px-2.5 py-2 text-left text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              Log time manually…
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <LogTimeGlobal open={logTimeOpen} onClose={() => setLogTimeOpen(false)} />
    </>
  );
}
