'use client';

import { useState, useRef, useEffect } from 'react';
import { createBrowserClient, useAddProjectTeamMember } from '@patina/supabase';
import { Button, Input, Select, Textarea } from '@/components/ui/controls';

type DesignerRole = 'support_designer' | 'lead_designer';

interface InviteDesignerModalProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
}

export function InviteDesignerModal({ projectId, open, onClose }: InviteDesignerModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<DesignerRole>('support_designer');
  const [notes, setNotes] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLooking, setIsLooking] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  const addTeamMember = useAddProjectTeamMember();

  useEffect(() => {
    if (open) {
      emailRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    setSuccessMessage(null);
    setErrorMessage(null);
    setEmail('');
    setRole('support_designer');
    setNotes('');
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLooking(true);

    // Look up the profile by email client-side
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createBrowserClient() as any;
    const { data: profile, error: lookupError } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();

    setIsLooking(false);

    if (lookupError) {
      setErrorMessage('Error looking up designer. Please try again.');
      return;
    }

    if (!profile) {
      setErrorMessage('No designer found with that email — they must register first.');
      return;
    }

    addTeamMember.mutate(
      {
        projectId,
        userId: profile.id,
        role,
        permissions: notes.trim() ? { notes: notes.trim() } : {},
      },
      {
        onSuccess: () => {
          const displayName = profile.full_name || profile.email;
          setSuccessMessage(`${displayName} added to project team.`);
          setEmail('');
          setRole('support_designer');
          setNotes('');
          setTimeout(() => {
            setSuccessMessage(null);
            onClose();
          }, 2500);
        },
        onError: (err: Error) => {
          const msg = err.message ?? '';
          if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('already')) {
            setErrorMessage('Already a team member on this project.');
          } else {
            setErrorMessage(msg || 'Something went wrong. Please try again.');
          }
        },
      }
    );
  };

  if (!open) return null;

  const isPending = isLooking || addTeamMember.isPending;

  return (
    <div
      className="mb-8 border-b border-[var(--border-default)] pb-8"
      style={{ animation: 'collapsible-down 200ms var(--ease-default)' }}
    >
      <h2 className="type-item-name mb-6">Invite Designer</h2>

      {successMessage && (
        <div
          role="status"
          className="mb-4 rounded-sm border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
        >
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="mb-4 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div className="flex flex-col gap-1">
          <label className="type-meta">Email *</label>
          <Input
            ref={emailRef}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="designer@example.com"
            variant="underline"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="type-meta">Role</label>
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value as DesignerRole)}
          >
            <option value="support_designer">Support Designer</option>
            <option value="lead_designer">Lead Designer</option>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="type-meta">Notes (optional)</label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Any notes about this collaboration..."
            variant="underline"
            className="resize-vertical"
          />
        </div>

        <div className="flex gap-3 pt-4">
          <Button variant="primary" type="submit" disabled={isPending || !email.trim()}>
            {isLooking ? 'Looking up…' : addTeamMember.isPending ? 'Adding…' : 'Add to Team'}
          </Button>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
