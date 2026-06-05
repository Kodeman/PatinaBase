'use client';

import { useState } from 'react';
import {
  useProposalTeamMembers,
  useAddProposalTeamMember,
  useRemoveProposalTeamMember,
  type ProposalRole,
} from '@patina/supabase';
import { createBrowserClient } from '@patina/supabase';
import { Button, Input, Select } from '@/components/ui/controls';

const ASSIGNABLE_ROLES: Array<{ value: ProposalRole; label: string }> = [
  { value: 'support_designer', label: 'Support designer' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'bookkeeper', label: 'Bookkeeper' },
  { value: 'client', label: 'Client (additional)' },
];

const ROLE_LABEL: Record<ProposalRole, string> = {
  lead_designer: 'Lead designer',
  support_designer: 'Support designer',
  vendor: 'Vendor',
  client: 'Client',
  bookkeeper: 'Bookkeeper',
};

interface ProposalTeamPickerProps {
  proposalId: string;
}

export function ProposalTeamPicker({ proposalId }: ProposalTeamPickerProps) {
  const { data: members = [], isLoading } = useProposalTeamMembers(proposalId);
  const addMember = useAddProposalTeamMember();
  const removeMember = useRemoveProposalTeamMember();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ProposalRole>('support_designer');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleAdd = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError('Enter an email address');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createBrowserClient() as any;
      const { data: profile, error: lookupError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', trimmed)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!profile) {
        setError(`No user found for ${trimmed}`);
        return;
      }
      await addMember.mutateAsync({
        proposalId,
        userId: profile.id,
        role,
        sortOrder: members.length,
      });
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {isLoading ? (
        <p className="type-body-small text-[var(--text-muted)]">Loading…</p>
      ) : members.length === 0 ? (
        <p className="type-body-small mb-3 text-[var(--text-muted)]">
          No team members added yet. Lead designer and primary client are implicit.
        </p>
      ) : (
        <ul className="mb-3 divide-y divide-[var(--border-default)] rounded-[3px] border border-[var(--border-default)]">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate font-body text-sm text-[var(--text-primary)]">
                  {m.user?.full_name || m.user?.email || m.user_id}
                </div>
                <div className="type-meta text-[var(--text-muted)]">
                  {ROLE_LABEL[m.role]}
                  {m.user?.email && m.user?.full_name ? ` · ${m.user.email}` : ''}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeMember.mutate({ memberId: m.id, proposalId })}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label
            htmlFor="proposal-team-email"
            className="mb-1 block font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]"
          >
            Email
          </label>
          <Input
            id="proposal-team-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@example.com"
          />
        </div>
        <div className="sm:w-44">
          <label
            htmlFor="proposal-team-role"
            className="mb-1 block font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]"
          >
            Role
          </label>
          <Select
            id="proposal-team-role"
            value={role}
            onChange={(e) => setRole(e.target.value as ProposalRole)}
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
        <Button
          variant="secondary"
          onClick={handleAdd}
          disabled={busy}
        >
          {busy ? 'Adding…' : 'Add'}
        </Button>
      </div>
      {error ? (
        <p className="mt-2 type-body-small text-[var(--color-terracotta,#c45a3f)]">{error}</p>
      ) : null}
    </div>
  );
}
