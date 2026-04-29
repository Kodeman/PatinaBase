'use client';

import { useState, useRef, useEffect } from 'react';
import { createBrowserClient, useReassignLead } from '@patina/supabase';
import { PortalButton } from '../button';

interface ReassignLeadModalProps {
  projectId: string;
  currentDesignerId: string;
  open: boolean;
  onClose: () => void;
}

export function ReassignLeadModal({
  projectId,
  currentDesignerId,
  open,
  onClose,
}: ReassignLeadModalProps) {
  const [email, setEmail] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [foundProfile, setFoundProfile] = useState<{ id: string; email: string; full_name: string } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLooking, setIsLooking] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  const reassignLead = useReassignLead();

  useEffect(() => {
    if (open) {
      emailRef.current?.focus();
    }
  }, [open]);

  // Reset on open/close
  useEffect(() => {
    setEmail('');
    setConfirming(false);
    setFoundProfile(null);
    setSuccessMessage(null);
    setErrorMessage(null);
  }, [open]);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setFoundProfile(null);
    setConfirming(false);
    setIsLooking(true);

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

    // Edge case: email is already the current lead
    if (profile.id === currentDesignerId) {
      setErrorMessage(`${profile.full_name || profile.email} is already the lead designer.`);
      return;
    }

    setFoundProfile(profile);
    setConfirming(true);
  };

  const handleConfirm = () => {
    if (!foundProfile) return;
    setErrorMessage(null);

    reassignLead.mutate(
      {
        projectId,
        newDesignerId: foundProfile.id,
        oldDesignerId: currentDesignerId,
      },
      {
        onSuccess: () => {
          const displayName = foundProfile.full_name || foundProfile.email;
          setSuccessMessage(`${displayName} is now the lead designer.`);
          setConfirming(false);
          setTimeout(() => {
            setSuccessMessage(null);
            onClose();
          }, 2500);
        },
        onError: (err: Error) => {
          setErrorMessage(err.message || 'Something went wrong. Please try again.');
          setConfirming(false);
        },
      }
    );
  };

  if (!open) return null;

  const isPending = isLooking || reassignLead.isPending;

  return (
    <div
      className="mb-8 border-b border-[var(--border-default)] pb-8"
      style={{ animation: 'collapsible-down 200ms var(--ease-default)' }}
    >
      <h2 className="type-item-name mb-6">Reassign Lead Designer</h2>

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

      {confirming && foundProfile ? (
        <div className="space-y-4 max-w-md">
          <div
            className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900"
            role="alert"
          >
            <p className="font-medium mb-1">Confirm reassignment</p>
            <p>
              This will move you off as lead designer.{' '}
              <strong>{foundProfile.full_name || foundProfile.email}</strong> will become the lead.
              The reassignment will be logged.
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <PortalButton
              variant="primary"
              type="button"
              disabled={reassignLead.isPending}
              onClick={handleConfirm}
            >
              {reassignLead.isPending ? 'Reassigning…' : 'Confirm reassignment'}
            </PortalButton>
            <PortalButton
              variant="ghost"
              type="button"
              onClick={() => {
                setConfirming(false);
                setFoundProfile(null);
              }}
            >
              Back
            </PortalButton>
          </div>
        </div>
      ) : (
        <form onSubmit={handleLookup} className="space-y-4 max-w-md">
          <div className="flex flex-col gap-1">
            <label className="type-meta">New lead designer email *</label>
            <input
              ref={emailRef}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="designer@example.com"
              className="type-body rounded-sm border-0 border-b border-[var(--border-default)] bg-transparent px-0 py-2 text-[0.85rem] outline-none focus:border-[var(--accent-primary)]"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <PortalButton variant="primary" type="submit" disabled={isPending || !email.trim()}>
              {isLooking ? 'Looking up…' : 'Find designer'}
            </PortalButton>
            <PortalButton variant="ghost" type="button" onClick={onClose}>
              Cancel
            </PortalButton>
          </div>
        </form>
      )}
    </div>
  );
}
