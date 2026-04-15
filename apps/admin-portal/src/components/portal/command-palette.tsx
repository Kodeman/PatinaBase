'use client';

import { useCallback, useEffect } from 'react';
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
  LayoutDashboard,
  Users,
  Package,
  Briefcase,
  ShieldCheck,
  Settings,
  ClipboardCheck,
  UserCheck,
  Flag,
  Activity,
} from 'lucide-react';
import { useCommandPalette } from '@/contexts/command-palette-context';

export function CommandPalette() {
  const { isOpen, close, toggle } = useCommandPalette();
  const router = useRouter();

  const navigate = useCallback(
    (href: string) => {
      router.push(href as any);
      close();
    },
    [router, close]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  return (
    <CommandDialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <CommandInput placeholder="Search users, applications, catalog, settings..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Zones">
          <CommandItem onSelect={() => navigate('/dashboard')}>
            <LayoutDashboard className="mr-2 h-4 w-4" /> Overview
          </CommandItem>
          <CommandItem onSelect={() => navigate('/users')}>
            <Users className="mr-2 h-4 w-4" /> People
          </CommandItem>
          <CommandItem onSelect={() => navigate('/catalog')}>
            <Package className="mr-2 h-4 w-4" /> Content
          </CommandItem>
          <CommandItem onSelect={() => navigate('/orders')}>
            <Briefcase className="mr-2 h-4 w-4" /> Operations
          </CommandItem>
          <CommandItem onSelect={() => navigate('/health')}>
            <ShieldCheck className="mr-2 h-4 w-4" /> System
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Quick Actions">
          <CommandItem onSelect={() => navigate('/verification')}>
            <UserCheck className="mr-2 h-4 w-4" /> Verification Queue
          </CommandItem>
          <CommandItem onSelect={() => navigate('/applications')}>
            <ClipboardCheck className="mr-2 h-4 w-4" /> Applications
          </CommandItem>
          <CommandItem onSelect={() => navigate('/catalog/new')}>
            <Package className="mr-2 h-4 w-4" /> Add Product
          </CommandItem>
          <CommandItem onSelect={() => navigate('/flags')}>
            <Flag className="mr-2 h-4 w-4" /> Feature Flags
          </CommandItem>
          <CommandItem onSelect={() => navigate('/health')}>
            <Activity className="mr-2 h-4 w-4" /> System Health
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="System">
          <CommandItem onSelect={() => navigate('/settings')}>
            <Settings className="mr-2 h-4 w-4" /> Settings
          </CommandItem>
          <CommandItem onSelect={() => navigate('/audit')}>
            <ShieldCheck className="mr-2 h-4 w-4" /> Audit Log
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
