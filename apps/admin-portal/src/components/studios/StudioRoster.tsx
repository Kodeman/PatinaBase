'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Mail, UserPlus, Crown } from 'lucide-react';
import { Section, LoadingStrata, StatusDot, type StatusVariant } from '@/components/portal';
import { useStudioMembers } from '@/hooks/use-studios';
import { AddStudioMemberDialog } from '@/components/studios/AddStudioMemberDialog';
import { InviteStudioMemberDialog } from '@/components/studios/InviteStudioMemberDialog';
import { EditStudioMemberDialog } from '@/components/studios/EditStudioMemberDialog';
import { RemoveStudioMemberDialog } from '@/components/studios/RemoveStudioMemberDialog';
import { TransferOwnershipDialog } from '@/components/studios/TransferOwnershipDialog';
import { formatDate } from '@/lib/utils';
import type { StudioMember, StudioMemberRole } from '@/types';

interface StudioRosterProps {
  studioId: string;
  studioName: string;
}

function statusVariantFor(status: string): StatusVariant {
  switch (status) {
    case 'active':
      return 'success';
    case 'invited':
      return 'info';
    case 'suspended':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function StudioRoster({ studioId, studioName }: StudioRosterProps) {
  const { data: members, isLoading } = useStudioMembers(studioId);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [resendFor, setResendFor] = useState<{ email: string; role: StudioMemberRole; staffRole?: string } | undefined>();
  const [editMember, setEditMember] = useState<StudioMember | null>(null);
  const [removeMember, setRemoveMember] = useState<StudioMember | null>(null);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<StudioMember | undefined>();

  if (isLoading) return <LoadingStrata />;

  const active = (members ?? []).filter((m) => m.status === 'active' || m.status === 'suspended');
  const invited = (members ?? []).filter((m) => m.status === 'invited');

  return (
    <div className="space-y-8">
      <Section
        title="Members"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setResendFor(undefined);
                setInviteDialogOpen(true);
              }}
            >
              <Mail className="mr-2 h-4 w-4" />
              Invite by Email
            </Button>
            <Button size="sm" onClick={() => setAddDialogOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add Existing User
            </Button>
          </div>
        }
      >
        {active.length === 0 ? (
          <p className="type-body py-8 text-center italic text-[var(--text-muted)]">
            No members yet.
          </p>
        ) : (
          <div>
            {active.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between border-b border-[var(--border-subtle)] py-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    {member.role === 'owner' && (
                      <Crown className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                    )}
                    <span className="type-item-name">
                      {member.profile?.displayName || member.profile?.email || member.userId}
                    </span>
                    <Badge variant="outline">{member.role}</Badge>
                  </div>
                  <div className="type-label-secondary mt-0.5">
                    {member.staffRole || member.jobTitle || 'No title'}
                    {member.joinedAt && ` · Joined ${formatDate(member.joinedAt)}`}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <StatusDot variant={statusVariantFor(member.status)} label={member.status} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditMember(member)}>
                        Change Tier / Set Title
                      </DropdownMenuItem>
                      {member.role !== 'owner' && (
                        <>
                          <DropdownMenuItem
                            onClick={() => {
                              setTransferTarget(member);
                              setTransferDialogOpen(true);
                            }}
                          >
                            Transfer Ownership To…
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setRemoveMember(member)}
                          >
                            Remove
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Pending Invites">
        {invited.length === 0 ? (
          <p className="type-body py-8 text-center italic text-[var(--text-muted)]">
            No pending invites.
          </p>
        ) : (
          <div>
            {invited.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between border-b border-[var(--border-subtle)] py-4"
              >
                <div>
                  <div className="type-item-name">
                    {member.profile?.email || member.userId}
                  </div>
                  <div className="type-label-secondary mt-0.5">
                    Invited as {member.role}
                    {member.invitationExpiresAt &&
                      ` · Expires ${formatDate(member.invitationExpiresAt)}`}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <StatusDot variant="info" label="invited" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setResendFor({
                            email: member.profile?.email ?? '',
                            role: member.role,
                            staffRole: member.staffRole,
                          });
                          setInviteDialogOpen(true);
                        }}
                      >
                        Resend Invite
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setRemoveMember(member)}
                      >
                        Cancel Invite
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <AddStudioMemberDialog studioId={studioId} open={addDialogOpen} onOpenChange={setAddDialogOpen} />
      <InviteStudioMemberDialog
        studioId={studioId}
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        resendFor={resendFor}
      />
      {editMember && (
        <EditStudioMemberDialog
          studioId={studioId}
          member={editMember}
          open={!!editMember}
          onOpenChange={(open) => !open && setEditMember(null)}
        />
      )}
      {removeMember && (
        <RemoveStudioMemberDialog
          studioId={studioId}
          member={removeMember}
          open={!!removeMember}
          onOpenChange={(open) => !open && setRemoveMember(null)}
        />
      )}
      <TransferOwnershipDialog
        studioId={studioId}
        studioName={studioName}
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        initialMember={transferTarget}
      />
    </div>
  );
}
