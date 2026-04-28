'use client';

import { useState, useRef, useEffect } from 'react';
import { useAddClient } from '@patina/supabase';
import { PortalButton } from './button';

interface AddClientFormProps {
  open: boolean;
  onClose: () => void;
}

export function AddClientDialog({ open, onClose }: AddClientFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [source, setSource] = useState<'direct' | 'referral'>('direct');
  const [notes, setNotes] = useState('');
  const [sendInvite, setSendInvite] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const addClient = useAddClient();

  useEffect(() => {
    if (open && containerRef.current) {
      containerRef.current.querySelector('input')?.focus();
    }
  }, [open]);

  // Clear messages when dialog opens/closes
  useEffect(() => {
    setSuccessMessage(null);
    setErrorMessage(null);
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    addClient.mutate(
      {
        clientEmail: email.trim(),
        clientName: name.trim() || undefined,
        source,
        notes: notes.trim() || undefined,
        invite: sendInvite,
      },
      {
        onSuccess: (result) => {
          const displayLabel = name.trim() || email.trim();
          let msg: string;
          if (result.alreadyExists) {
            msg = `${displayLabel} is already on Patina — linked to their existing account.`;
          } else if (result.invited) {
            msg = `${displayLabel} invited — they'll get a magic-link email shortly.`;
          } else {
            msg = `Client added without invite.`;
          }
          setSuccessMessage(msg);
          setName('');
          setEmail('');
          setSource('direct');
          setNotes('');
          setSendInvite(true);

          // Close after a brief moment so the user sees the confirmation
          setTimeout(() => {
            setSuccessMessage(null);
            onClose();
          }, 2500);
        },
        onError: (err: Error) => {
          setErrorMessage(err.message ?? 'Something went wrong. Please try again.');
        },
      }
    );
  };

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className="mb-8 border-b border-[var(--border-default)] pb-8"
      style={{ animation: 'collapsible-down 200ms var(--ease-default)' }}
    >
      <h2 className="type-item-name mb-6">Add Client</h2>

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
          <label className="type-meta">Full Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="James & Lin Chen"
            className="type-body rounded-sm border-0 border-b border-[var(--border-default)] bg-transparent px-0 py-2 text-[0.85rem] outline-none focus:border-[var(--accent-primary)]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="type-meta">Email *</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="james@example.com"
            className="type-body rounded-sm border-0 border-b border-[var(--border-default)] bg-transparent px-0 py-2 text-[0.85rem] outline-none focus:border-[var(--accent-primary)]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="type-meta">Source</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as 'direct' | 'referral')}
            className="type-body rounded-sm border-0 border-b border-[var(--border-default)] bg-transparent px-0 py-2 text-[0.85rem] outline-none focus:border-[var(--accent-primary)]"
          >
            <option value="direct">Direct</option>
            <option value="referral">Referral</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="type-meta">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Initial notes about this client..."
            className="type-body resize-vertical border-0 border-b border-[var(--border-default)] bg-transparent px-0 py-2 text-[0.85rem] outline-none focus:border-[var(--accent-primary)]"
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            id="send-invite-toggle"
            type="checkbox"
            checked={sendInvite}
            onChange={(e) => setSendInvite(e.target.checked)}
            className="h-4 w-4 cursor-pointer rounded border-[var(--border-default)] accent-[var(--accent-primary)]"
          />
          <label
            htmlFor="send-invite-toggle"
            className="type-meta cursor-pointer select-none"
          >
            Invite to Patina (sends magic-link email)
          </label>
        </div>

        <div className="flex gap-3 pt-4">
          <PortalButton variant="primary" type="submit" disabled={addClient.isPending || !email.trim()}>
            {addClient.isPending ? 'Adding...' : 'Add Client'}
          </PortalButton>
          <PortalButton variant="ghost" type="button" onClick={onClose}>
            Cancel
          </PortalButton>
        </div>
      </form>
    </div>
  );
}
