'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@patina/design-system';
import {
  CalendarDays,
  TrendingUp,
  Package,
  Sparkles,
  Users,
  DollarSign,
  Settings,
  Search,
  GitBranch,
  Timer,
  Image as ImageIcon,
} from 'lucide-react';
import { useAllDecisions } from '@patina/supabase';
import { useCommandPalette } from '@/contexts/command-palette-context';
import { useStartableProjects } from '@/hooks/use-startable-projects';
import { useRunningTimer, useStartTimer } from '@/hooks/use-time-tracking';
import { useToast } from '@/components/portal/toast-provider';
import { StopTimerDialog } from '@/components/portal/time/stop-timer-dialog';
import { EngineResults } from '@/components/document/engine/engine-results';

export function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [stopTimerOpen, setStopTimerOpen] = useState(false);
  // R31/R38 — the Engine speaks here too, with no mode: any query offers
  // "Ask the Engine" as a row; choosing it answers inline in paper
  // result-lines (aesthete-ask; the ask never persists — only a placement).
  const [asking, setAsking] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 150);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setDebouncedSearch('');
      setAsking(null);
    }
  }, [isOpen]);

  const { data: decisionResults } = useAllDecisions(
    debouncedSearch.length >= 2 ? { q: debouncedSearch } : undefined
  );
  const decisions = debouncedSearch.length >= 2 ? (decisionResults ?? []).slice(0, 6) : [];

  // ── Time group — stop the running timer, or start one on an active project ──
  const { data: runningTimer } = useRunningTimer();
  const startTimer = useStartTimer();
  const { toast } = useToast();

  const startableProjects = useStartableProjects(search);
  const timerProjects = runningTimer ? [] : startableProjects;

  const handleStartTimer = useCallback(
    (projectId: string, projectName: string) => {
      startTimer.mutate(
        { projectId },
        // Failure toasts (incl. the 23505 already-running case) live in the hook.
        { onSuccess: () => toast(`Timer started on ${projectName}`, 'success') }
      );
      close();
    },
    [startTimer, toast, close]
  );

  const navigate = useCallback(
    (href: string) => {
      router.push(href);
      close();
    },
    [router, close]
  );

  return (
    <>
    <CommandDialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <CommandInput
        placeholder="Search projects, products, clients, decisions — or ask the Engine..."
        value={search}
        onValueChange={(value) => {
          setSearch(value);
          if (asking) setAsking(null); // typing returns to the result list
        }}
      />
      {asking ? (
        <div className="max-h-[400px] overflow-y-auto px-4 pb-3 pt-2">
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--color-clay)]">
              The Engine · “{asking}”
            </span>
            <button
              type="button"
              onClick={() => setAsking(null)}
              className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)] hover:text-[var(--color-charcoal)]"
            >
              ← results
            </button>
          </div>
          <EngineResults
            query={asking}
            inDocument={null}
            onPlaced={(pieceName, whereName) =>
              toast(`${pieceName} placed in ${whereName}`, 'success')
            }
          />
        </div>
      ) : (
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {decisions.length > 0 && (
          <>
            <CommandGroup heading="Decisions">
              {decisions.map((decision) => {
                const clientName =
                  decision.designer_client?.client?.full_name ??
                  decision.designer_client?.client_name ??
                  null;
                const projectName = decision.project?.name ?? null;
                const subline = [clientName, projectName].filter(Boolean).join(' · ');
                return (
                  <CommandItem
                    key={decision.id}
                    value={`decision-${decision.id}-${decision.title}`}
                    onSelect={() => navigate(`/portal/decisions/${decision.id}`)}
                  >
                    <GitBranch className="mr-2 h-4 w-4" />
                    <div className="flex flex-col">
                      <span className="text-sm">{decision.title}</span>
                      {subline && (
                        <span className="type-meta-small text-[var(--text-muted)]">{subline}</span>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {(runningTimer || timerProjects.length > 0) && (
          <>
            <CommandGroup heading="Time">
              {runningTimer ? (
                <CommandItem
                  value={`stop-timer-${runningTimer.project?.name ?? 'running'}`}
                  onSelect={() => {
                    close();
                    setStopTimerOpen(true);
                  }}
                >
                  <Timer className="mr-2 h-4 w-4" />
                  Stop timer — {runningTimer.project?.name ?? 'Untitled project'}
                </CommandItem>
              ) : (
                timerProjects.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`start-timer-${p.id}-${p.name ?? ''}`}
                    onSelect={() => handleStartTimer(p.id, p.name ?? 'project')}
                  >
                    <Timer className="mr-2 h-4 w-4" />
                    Start timer: {p.name ?? 'Untitled project'}
                  </CommandItem>
                ))
              )}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => navigate('/portal')}>
            <CalendarDays className="mr-2 h-4 w-4" />
            Today
          </CommandItem>
          <CommandItem onSelect={() => navigate('/portal/pipeline')}>
            <TrendingUp className="mr-2 h-4 w-4" />
            Pipeline
          </CommandItem>
          <CommandItem onSelect={() => navigate('/portal/library/personal')}>
            <Package className="mr-2 h-4 w-4" />
            Products
          </CommandItem>
          <CommandItem onSelect={() => navigate('/portal/teaching')}>
            <Sparkles className="mr-2 h-4 w-4" />
            Aesthete
          </CommandItem>
          <CommandItem onSelect={() => navigate('/portal/clients')}>
            <Users className="mr-2 h-4 w-4" />
            Clients
          </CommandItem>
          <CommandItem onSelect={() => navigate('/portal/decisions')}>
            <GitBranch className="mr-2 h-4 w-4" />
            Decisions
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Quick Actions">
          <CommandItem onSelect={() => navigate('/portal/leads')}>
            <Search className="mr-2 h-4 w-4" />
            View Leads
          </CommandItem>
          <CommandItem onSelect={() => navigate('/portal/proposals')}>
            <Search className="mr-2 h-4 w-4" />
            View Proposals
          </CommandItem>
          <CommandItem onSelect={() => navigate('/portal/catalog/new')}>
            <Package className="mr-2 h-4 w-4" />
            Add Product
          </CommandItem>
          <CommandItem onSelect={() => navigate('/portal/teaching')}>
            <Package className="mr-2 h-4 w-4" />
            Teaching Session
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Business">
          <CommandItem onSelect={() => navigate('/portal/earnings')}>
            <DollarSign className="mr-2 h-4 w-4" />
            Earnings
          </CommandItem>
          <CommandItem onSelect={() => navigate('/portal/portfolio')}>
            <ImageIcon className="mr-2 h-4 w-4" />
            Portfolio
          </CommandItem>
          <CommandItem onSelect={() => navigate('/portal/settings')}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </CommandItem>
        </CommandGroup>

        {/* The Engine — offered for any query; destinations jump, a question
            asks (R38, no mode). The value embeds the query so cmdk's filter
            always keeps the row. */}
        {debouncedSearch.length >= 2 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="The Engine">
              <CommandItem
                value={`ask-the-engine-${debouncedSearch}`}
                onSelect={() => setAsking(debouncedSearch)}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                <div className="flex flex-col">
                  <span className="text-sm">Ask the Engine</span>
                  <span className="type-meta-small text-[var(--text-muted)]">
                    “{debouncedSearch}” · ask & place
                  </span>
                </div>
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
      )}
    </CommandDialog>

    {/* Stop-timer dialog (palette-owned instance — the chip owns its own).
        Mount-conditional so state re-initializes from the timer each open. */}
    {runningTimer && stopTimerOpen && (
      <StopTimerDialog timer={runningTimer} onClose={() => setStopTimerOpen(false)} />
    )}
    </>
  );
}
