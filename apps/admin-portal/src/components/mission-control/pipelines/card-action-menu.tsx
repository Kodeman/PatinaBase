'use client';

import { MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Per-card (⋯) action menu — the primary way to move a card on mobile, where
// touch drag is unreliable (dnd-kit's PointerSensor distance-activation
// fights scroll gestures on a touch column). Always rendered, not just on
// small screens: it's also a keyboard-reachable alternative to drag on
// desktop.

interface CardActionMenuProps {
  currentStage: string;
  stages: { id: string; label: string }[];
  onMove: (toStage: string) => void;
  disabled?: boolean;
}

export function CardActionMenu({ currentStage, stages, onMove, disabled }: CardActionMenuProps) {
  const targets = stages.filter((s) => s.id !== currentStage);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          data-testid="card-action-menu-trigger"
          aria-label="Card actions"
          className="rounded-sm p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Move to…</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {targets.map((s) => (
              <DropdownMenuItem key={s.id} onSelect={() => onMove(s.id)}>
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
