'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  FolderPlus,
  FileText,
  Package,
  UserPlus,
  Receipt,
  GitBranch,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@patina/design-system';
import { Button } from '@/components/ui/controls';
import { LogTimeGlobal } from './time/log-time-global';

interface QuickCreateLink {
  label: string;
  href: string;
  icon: LucideIcon;
}

// Routes to the existing create flows — the zone sub-nav "+ Add" actions
// cover the in-zone case; this menu makes them reachable from anywhere.
const QUICK_CREATE_LINKS: QuickCreateLink[] = [
  { label: 'New Project', href: '/portal/projects/new', icon: FolderPlus },
  { label: 'New Proposal', href: '/portal/proposals/new', icon: FileText },
  { label: 'Add Product', href: '/portal/catalog/new', icon: Package },
  { label: 'Add Client', href: '/portal/clients?add=1', icon: UserPlus },
  { label: 'New Invoice', href: '/portal/billing/invoices/new', icon: Receipt },
  { label: 'New Decision', href: '/portal/decisions?new=1', icon: GitBranch },
];

/**
 * Global quick-create menu (header "+ New"). Every item routes to an existing
 * create flow except Log Time, which opens the global log-time dialog
 * in place.
 */
export function QuickCreateMenu() {
  const [open, setOpen] = useState(false);
  const [logTimeOpen, setLogTimeOpen] = useState(false);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="primary"
            size="sm"
            className="h-8 gap-1 rounded-md px-2.5"
            aria-label="New"
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden lg:inline">New</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-52 p-1.5">
          <div role="menu" aria-label="Quick create">
            {QUICK_CREATE_LINKS.map(({ label, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-[var(--text-body)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <Icon className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
                {label}
              </Link>
            ))}
            <div className="mx-1 my-1 border-t border-[var(--border-default)]" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setLogTimeOpen(true);
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-[var(--text-body)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <Timer className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
              Log Time
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <LogTimeGlobal open={logTimeOpen} onClose={() => setLogTimeOpen(false)} />
    </>
  );
}
