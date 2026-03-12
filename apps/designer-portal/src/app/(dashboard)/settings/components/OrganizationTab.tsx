'use client';

import { useState } from 'react';
import {
  useOrganizations,
  useOrganizationMembers,
  usePendingInvitations,
  useCreateOrganization,
  useInviteMember,
  useAcceptInvitation,
  useDeclineInvitation,
  useUpdateMemberRole,
  useRemoveMember,
  useLeaveOrganization,
} from '@patina/supabase';
import type {
  OrganizationType,
  MemberRole,
  OrganizationWithMembership,
  OrganizationMemberWithProfile,
} from '@patina/supabase';
import {
  Button,
  Input,
  Alert,
  Badge,
  Select,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@patina/design-system';
import {
  Building2,
  Users,
  UserPlus,
  Crown,
  Shield,
  User,
  Mail,
  MoreVertical,
  Check,
  X,
} from 'lucide-react';

const ORG_TYPE_LABELS: Record<OrganizationType, string> = {
  design_studio: 'Design Studio',
  manufacturer: 'Manufacturer',
  contractor: 'Contractor',
  admin_team: 'Admin Team',
};

const ROLE_ICONS: Record<MemberRole, typeof Crown> = {
  owner: Crown,
  admin: Shield,
  member: User,
  guest: User,
};

const ROLE_COLORS: Record<MemberRole, string> = {
  owner: 'bg-amber-100 text-amber-800',
  admin: 'bg-blue-100 text-blue-800',
  member: 'bg-gray-100 text-gray-800',
  guest: 'bg-gray-50 text-gray-500',
};

function RoleBadge({ role }: { role: MemberRole }) {
  const Icon = ROLE_ICONS[role];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[role]}`}
    >
      <Icon className="h-3 w-3" />
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  );
}

// ─── Create Organization Dialog ──────────────────────────────────────────────

function CreateOrganizationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createOrg = useCreateOrganization();
  const [name, setName] = useState('');
  const [type, setType] = useState<OrganizationType>('design_studio');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Organization name is required');
      return;
    }
    try {
      await createOrg.mutateAsync({ name: name.trim(), type, description, website });
      setName('');
      setType('design_studio');
      setDescription('');
      setWebsite('');
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || 'Failed to create organization');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Organization</DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="mt-2">
            {error}
          </Alert>
        )}

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Organization Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
              placeholder="My Design Studio"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Type</label>
            <Select
              value={type}
              onValueChange={(val) => setType(val as OrganizationType)}
              options={[
                { value: 'design_studio', label: 'Design Studio' },
                { value: 'manufacturer', label: 'Manufacturer' },
                { value: 'contractor', label: 'Contractor' },
                { value: 'admin_team', label: 'Admin Team' },
              ]}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1"
              placeholder="A brief description of your organization"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Website</label>
            <Input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="mt-1"
              placeholder="https://example.com"
            />
          </div>
        </div>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createOrg.isPending}>
            {createOrg.isPending ? 'Creating...' : 'Create Organization'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Invite Member Form ──────────────────────────────────────────────────────

function InviteMemberForm({ organizationId }: { organizationId: string }) {
  const inviteMember = useInviteMember();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('member');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleInvite = async () => {
    setError(null);
    setSuccess(false);
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    try {
      await inviteMember.mutateAsync({ organizationId, email: email.trim(), role });
      setEmail('');
      setRole('member');
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to invite member');
    }
  };

  return (
    <div className="mt-4 rounded-md border p-4">
      <h4 className="flex items-center gap-2 text-sm font-medium text-gray-900">
        <UserPlus className="h-4 w-4" />
        Invite Member
      </h4>

      {error && (
        <Alert variant="destructive" className="mt-2">
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" className="mt-2">
          Invitation sent successfully!
        </Alert>
      )}

      <div className="mt-3 flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600">Email</label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1"
            placeholder="colleague@example.com"
          />
        </div>
        <div className="w-36">
          <label className="block text-xs font-medium text-gray-600">Role</label>
          <Select
            value={role}
            onValueChange={(val) => setRole(val as MemberRole)}
            options={[
              { value: 'admin', label: 'Admin' },
              { value: 'member', label: 'Member' },
              { value: 'guest', label: 'Guest' },
            ]}
          />
        </div>
        <Button onClick={handleInvite} disabled={inviteMember.isPending} size="sm">
          {inviteMember.isPending ? 'Sending...' : 'Invite'}
        </Button>
      </div>
    </div>
  );
}

// ─── Member Row ──────────────────────────────────────────────────────────────

function MemberRow({
  member,
  currentUserRole,
}: {
  member: OrganizationMemberWithProfile;
  currentUserRole: MemberRole;
}) {
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const [showActions, setShowActions] = useState(false);

  const canManage =
    (currentUserRole === 'owner' || currentUserRole === 'admin') &&
    member.role !== 'owner';

  const handleRoleChange = async (newRole: MemberRole) => {
    try {
      await updateRole.mutateAsync({ memberId: member.id, role: newRole });
    } catch (err: any) {
      console.error('Failed to update role:', err);
    }
    setShowActions(false);
  };

  const handleRemove = async () => {
    if (!confirm('Are you sure you want to remove this member?')) return;
    try {
      await removeMember.mutateAsync(member.id);
    } catch (err: any) {
      console.error('Failed to remove member:', err);
    }
    setShowActions(false);
  };

  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
          {member.profiles?.display_name?.[0]?.toUpperCase() ||
            member.profiles?.email?.[0]?.toUpperCase() ||
            '?'}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">
            {member.profiles?.display_name || 'Unknown User'}
          </p>
          <p className="text-xs text-gray-500">{member.profiles?.email}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <RoleBadge role={member.role} />
        {member.status === 'invited' && (
          <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
            Invited
          </span>
        )}

        {canManage && (
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowActions(!showActions)}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>

            {showActions && (
              <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-md border bg-white py-1 shadow-lg">
                {member.role !== 'admin' && (
                  <button
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                    onClick={() => handleRoleChange('admin')}
                  >
                    Make Admin
                  </button>
                )}
                {member.role !== 'member' && (
                  <button
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                    onClick={() => handleRoleChange('member')}
                  >
                    Make Member
                  </button>
                )}
                {member.role !== 'guest' && (
                  <button
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                    onClick={() => handleRoleChange('guest')}
                  >
                    Make Guest
                  </button>
                )}
                <button
                  className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                  onClick={handleRemove}
                >
                  Remove Member
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Organization Detail ─────────────────────────────────────────────────────

function OrganizationDetail({ org }: { org: OrganizationWithMembership }) {
  const { data: members, isLoading: membersLoading } = useOrganizationMembers(org.id);
  const leaveOrg = useLeaveOrganization();

  const canManageMembers =
    org.membership.role === 'owner' || org.membership.role === 'admin';

  const handleLeave = async () => {
    if (org.membership.role === 'owner') {
      alert('Owners cannot leave their organization. Transfer ownership first.');
      return;
    }
    if (!confirm(`Are you sure you want to leave ${org.name}?`)) return;
    try {
      await leaveOrg.mutateAsync(org.id);
    } catch (err: any) {
      console.error('Failed to leave organization:', err);
    }
  };

  return (
    <div className="space-y-4">
      {/* Organization Info */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <Building2 className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{org.name}</h3>
              <div className="mt-1 flex items-center gap-2">
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  {ORG_TYPE_LABELS[org.type]}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    org.status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {org.status}
                </span>
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
                  {org.subscription_tier}
                </span>
              </div>
            </div>
          </div>
          <RoleBadge role={org.membership.role} />
        </div>

        {org.description && (
          <p className="mt-3 text-sm text-gray-600">{org.description}</p>
        )}

        {org.website && (
          <p className="mt-2 text-sm text-blue-600">
            <a href={org.website} target="_blank" rel="noopener noreferrer">
              {org.website}
            </a>
          </p>
        )}

        {org.membership.role !== 'owner' && (
          <div className="mt-4 border-t pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLeave}
              disabled={leaveOrg.isPending}
              className="text-red-600 hover:text-red-700"
            >
              {leaveOrg.isPending ? 'Leaving...' : 'Leave Organization'}
            </Button>
          </div>
        )}
      </div>

      {/* Members */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Users className="h-5 w-5" />
              Members
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              {members?.length ?? 0} member{(members?.length ?? 0) !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {membersLoading ? (
            <p className="text-sm text-gray-500">Loading members...</p>
          ) : members && members.length > 0 ? (
            members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                currentUserRole={org.membership.role}
              />
            ))
          ) : (
            <p className="text-sm text-gray-500">No members found</p>
          )}
        </div>

        {canManageMembers && <InviteMemberForm organizationId={org.id} />}
      </div>
    </div>
  );
}

// ─── Pending Invitations ─────────────────────────────────────────────────────

function PendingInvitations() {
  const { data: invitations, isLoading } = usePendingInvitations();
  const acceptInvitation = useAcceptInvitation();
  const declineInvitation = useDeclineInvitation();

  if (isLoading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="text-lg font-semibold text-gray-900">Pending Invitations</h2>
        <p className="mt-2 text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!invitations || invitations.length === 0) return null;

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
        <Mail className="h-5 w-5" />
        Pending Invitations
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        You have been invited to join the following organizations
      </p>

      <div className="mt-4 space-y-3">
        {invitations.map((invitation) => (
          <div
            key={invitation.id}
            className="flex items-center justify-between rounded-md border p-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <Building2 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {(invitation.organizations as any)?.name || 'Unknown Organization'}
                </p>
                <p className="text-xs text-gray-500">
                  {ORG_TYPE_LABELS[(invitation.organizations as any)?.type as OrganizationType] ||
                    'Organization'}{' '}
                  &middot; Invited as {invitation.role}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => declineInvitation.mutateAsync(invitation.id)}
                disabled={declineInvitation.isPending}
              >
                <X className="mr-1 h-3 w-3" />
                Decline
              </Button>
              <Button
                size="sm"
                onClick={() => acceptInvitation.mutateAsync(invitation.id)}
                disabled={acceptInvitation.isPending}
              >
                <Check className="mr-1 h-3 w-3" />
                Accept
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Organization Tab ───────────────────────────────────────────────────

export function OrganizationTab() {
  const { data: organizations, isLoading } = useOrganizations();
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const selectedOrg = organizations?.find((o) => o.id === selectedOrgId) || null;

  return (
    <div className="space-y-6">
      {/* Pending Invitations */}
      <PendingInvitations />

      {/* Organizations List */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Your Organizations</h2>
            <p className="mt-1 text-sm text-gray-600">
              Organizations you belong to
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} size="sm">
            <Building2 className="mr-2 h-4 w-4" />
            Create Organization
          </Button>
        </div>

        <div className="mt-4">
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading organizations...</p>
          ) : organizations && organizations.length > 0 ? (
            <div className="space-y-2">
              {organizations.map((org) => (
                <button
                  key={org.id}
                  onClick={() =>
                    setSelectedOrgId(selectedOrgId === org.id ? null : org.id)
                  }
                  className={`w-full rounded-md border p-4 text-left transition-colors ${
                    selectedOrgId === org.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                        <Building2 className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{org.name}</p>
                        <p className="text-xs text-gray-500">
                          {ORG_TYPE_LABELS[org.type]}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <RoleBadge role={org.membership.role} />
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          org.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {org.status}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-8 text-center">
              <Building2 className="mx-auto h-8 w-8 text-gray-400" />
              <p className="mt-2 text-sm font-medium text-gray-900">
                No organizations yet
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Create an organization to collaborate with your team
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setShowCreateDialog(true)}
              >
                Create Your First Organization
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Selected Organization Detail */}
      {selectedOrg && <OrganizationDetail org={selectedOrg} />}

      {/* Create Organization Dialog */}
      <CreateOrganizationDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />
    </div>
  );
}
