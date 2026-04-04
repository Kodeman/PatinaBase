'use client';

import { useCallback } from 'react';
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
import { CalendarDays, TrendingUp, Package, Users, DollarSign, Settings, Search } from 'lucide-react';
import { useCommandPalette } from '@/contexts/command-palette-context';

export function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const router = useRouter();

  const navigate = useCallback(
    (href: string) => {
      router.push(href);
      close();
    },
    [router, close]
  );

  return (
    <CommandDialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <CommandInput placeholder="Search projects, products, clients..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

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
