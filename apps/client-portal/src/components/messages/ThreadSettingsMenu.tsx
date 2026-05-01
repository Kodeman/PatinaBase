'use client';

import { Archive, ArchiveRestore, BellOff, BellRing, MoreVertical } from 'lucide-react';

import {
  useArchiveThread,
  useMuteThread,
  useUpdateThreadNotificationPref,
  type CommsParticipant,
  type NotificationPref,
} from '@patina/supabase';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@patina/design-system';

interface ThreadSettingsMenuProps {
  threadId: string;
  myParticipant: CommsParticipant | null;
  onArchived?: () => void;
}

export function ThreadSettingsMenu({
  threadId,
  myParticipant,
  onArchived,
}: ThreadSettingsMenuProps) {
  const archive = useArchiveThread();
  const mute = useMuteThread();
  const updatePref = useUpdateThreadNotificationPref();

  const isMuted = !!myParticipant?.muted_at;
  const isArchived = !!myParticipant?.archived_at;
  const currentPref: NotificationPref = myParticipant?.notification_pref ?? 'all';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Conversation settings"
          data-testid="thread-settings-trigger"
          className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[rgba(0,0,0,0.04)] hover:text-[var(--text-primary)]"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={currentPref}
          onValueChange={(value) =>
            updatePref.mutate({ threadId, pref: value as NotificationPref })
          }
        >
          <DropdownMenuRadioItem value="all">All messages</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="mentions">Mentions only</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="none">No notifications</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            mute.mutate({ threadId, muted: !isMuted });
          }}
          data-testid="thread-mute-toggle"
        >
          {isMuted ? (
            <>
              <BellRing className="mr-2 h-4 w-4" />
              Unmute conversation
            </>
          ) : (
            <>
              <BellOff className="mr-2 h-4 w-4" />
              Mute conversation
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            archive.mutate(
              { threadId, archived: !isArchived },
              { onSuccess: () => onArchived?.() }
            );
          }}
          data-testid="thread-archive-toggle"
        >
          {isArchived ? (
            <>
              <ArchiveRestore className="mr-2 h-4 w-4" />
              Unarchive
            </>
          ) : (
            <>
              <Archive className="mr-2 h-4 w-4" />
              Archive
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
