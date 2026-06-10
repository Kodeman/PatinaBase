'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import { useAllDecisions } from '@patina/supabase';
import { useCommandPalette } from '@/contexts/command-palette-context';
import { useProjects } from '@/hooks/use-projects';
import { useRunningTimer, useStartTimer } from '@/hooks/use-time-tracking';
import { useToast } from '@/components/portal/toast-provider';
import { StopTimerDialog } from '@/components/portal/time/stop-timer-dialog';

// Mock fixture projects use slug ids ('olsen-residence') — timers need a real
// projects row, so only UUID-backed projects are startable.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [stopTimerOpen, setStopTimerOpen] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 150);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setDebouncedSearch('');
    }
  }, [isOpen]);

  const { data: decisionResults } = useAllDecisions(
    debouncedSearch.length >= 2 ? { q: debouncedSearch } : undefined
  );
  const decisions = debouncedSearch.length >= 2 ? (decisionResults ?? []).slice(0, 6) : [];

  // ── Time group — stop the running timer, or start one on an active project ──
  const { data: runningTimer } = useRunningTimer();
  const { data: projects } = useProjects();
  const startTimer = useStartTimer();
  const { toast } = useToast();

  const timerProjects = useMemo(() => {
    if (runningTimer) return [];
    const q = search.trim().toLowerCase();
    return ((projects ?? []) as Array<{ id: string; name?: string | null; status?: string | null }>)
      .filter(
        (p) =>
          UUID_RE.test(p.id) &&
          (p.status === 'active' || p.status === 'planning')
      )
      .filter((p) => !q || (p.name ?? '').toLowerCase().includes(q))
      .slice(0, 6);
  }, [projects, runningTimer, search]);

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
        placeholder="Search projects, products, clients, decisions..."
        value={search}
        onValueChange={setSearch}
      />
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
          <CommandItem onSelect={() => navigate('/portal/settings')}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>

    {/* Stop-timer dialog (palette-owned instance — the chip owns its own).
        Mount-conditional so state re-initializes from the timer each open. */}
    {runningTimer && stopTimerOpen && (
      <StopTimerDialog timer={runningTimer} onClose={() => setStopTimerOpen(false)} />
    )}
    </>
  );
}
