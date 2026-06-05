'use client';

import { Bell } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@patina/design-system';
import { IconButton } from '@/components/ui/controls';

interface NotificationDropdownProps {
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationDropdown({ count, open, onOpenChange }: NotificationDropdownProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <IconButton variant="ghost" size="md" label="Notifications" className="relative">
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute right-1 top-1 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-[var(--color-terracotta)] px-[3px] font-mono text-[0.4rem] text-white">
              {count}
            </span>
          )}
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-[var(--border-default)] px-4 py-3">
          <h3 className="font-heading text-sm font-medium text-[var(--text-primary)]">
            Notifications
          </h3>
        </div>
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-[var(--text-muted)]">No new notifications</p>
          <p className="mt-1 font-mono text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)] opacity-60">
            Deliveries, decisions, and updates will appear here
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
