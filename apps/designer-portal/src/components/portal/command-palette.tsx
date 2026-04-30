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
  Users,
  DollarSign,
  Settings,
  Search,
  GitBranch,
} from 'lucide-react';
import { useAllDecisions } from '@patina/supabase';
import { useCommandPalette } from '@/contexts/command-palette-context';

export function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

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

  const navigate = useCallback(
    (href: string) => {
      router.push(href);
      close();
    },
    [router, close]
  );

  return (
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

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => navigate('/portal')}>
            <CalendarDays className="mr-2 h-4 w-4" />
            Today
          </CommandItem>
          <CommandItem onSelect={() => navigate('/portal/pipeline')}>
            <TrendingUp className="mr-2 h-4 w-4" />
            Pipeline
          </CommandItem>
          <CommandItem onSelect={() => navigate('/portal/catalog')}>
            <Package className="mr-2 h-4 w-4" />
            Products
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
          <CommandItem onSelect={() => navigate('/portal/pipeline?stage=leads')}>
            <Search className="mr-2 h-4 w-4" />
            View Leads
          </CommandItem>
          <CommandItem onSelect={() => navigate('/portal/pipeline?stage=proposals')}>
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
  );
}
