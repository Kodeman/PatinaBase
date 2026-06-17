'use client';

/**
 * Add a person (Track A) — a quiet paper sheet over the People Room for bringing
 * a new client onto the roster. Reuses the proven `useAddClient` mutation (the
 * same server route the portal's Add Client uses: auth-guarded, optional
 * magic-link invite, audit row); on success it invalidates the directory read
 * model so the new client appears in the roster immediately.
 *
 * Scope (noted): this is the client path — the most common add. A lead arrives
 * through lead intake (the pipeline), and makers/GCs through their own surfaces;
 * the sheet links out to lead intake rather than re-implementing it.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAddClient, peopleKeys } from '@patina/supabase';
import { RoomSheet } from '../../rooms/room-sheet';

export function AddPersonSheet({
  open,
  onClose,
  onAdded,
  onGoToLeads,
}: {
  open: boolean;
  onClose: () => void;
  /** Fired with a confirmation line for the Room's toast. */
  onAdded?: (message: string) => void;
  /** Walk out to lead intake (the pipeline) for a prospect rather than a client. */
  onGoToLeads?: () => void;
}) {
  const queryClient = useQueryClient();
  const addClient = useAddClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [invite, setInvite] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setEmail('');
    setInvite(true);
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    setError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('An email brings them onto the roster — and lets you reach them.');
      return;
    }
    try {
      const result = await addClient.mutateAsync({
        clientEmail: trimmedEmail,
        clientName: name.trim() || undefined,
        source: 'direct',
        invite,
      });
      // The directory is a read model over public.people_directory — refresh it
      // so the new client appears in the roster without a reload.
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });

      const label = name.trim() || trimmedEmail;
      const message = result.alreadyExists
        ? `${label} is already on Patina — linked to their account, now on your roster.`
        : result.invited
          ? `${label} added — a magic-link invite is on its way.`
          : `${label} added to your roster.`;
      onAdded?.(message);
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add them just now. Try again.');
    }
  };

  return (
    <RoomSheet open={open} onClose={close} title="Add someone to your people">
      <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--color-clay)]">
        Add · to your roster
      </div>
      <h2 className="mt-1 font-heading text-[1.6rem] font-medium text-[var(--color-charcoal)]">
        Bring someone in
      </h2>
      <p className="mb-5 mt-1 text-[0.74rem] text-[var(--color-aged-oak)]">
        Add a client to your directory. They appear on your roster at once; an
        optional invite gives them a Patina login.
      </p>

      <label className="mb-1 block font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
        Full name <span className="opacity-60">(optional)</span>
      </label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Sarah Whitfield"
        className="mb-4 w-full rounded-[7px] border border-[var(--color-pearl)] bg-white px-3.5 py-2.5 text-[0.82rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
      />

      <label className="mb-1 block font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
        Email
      </label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit();
        }}
        placeholder="sarah@whitfield.com"
        className="w-full rounded-[7px] border border-[var(--color-pearl)] bg-white px-3.5 py-2.5 text-[0.82rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
      />

      <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-[0.74rem] text-[var(--color-mocha)]">
        <input
          type="checkbox"
          checked={invite}
          onChange={(e) => setInvite(e.target.checked)}
          className="h-4 w-4 cursor-pointer rounded border-[var(--color-pearl)] accent-[var(--color-clay)]"
        />
        Send a magic-link invite to Patina
      </label>

      {onGoToLeads && (
        <p className="mt-3 text-[0.66rem] text-[var(--color-aged-oak)]">
          Not a client yet?{' '}
          <button
            type="button"
            onClick={() => {
              close();
              onGoToLeads();
            }}
            className="font-medium text-[var(--color-clay)] underline-offset-2 hover:underline"
          >
            Add a lead in the pipeline
          </button>
          .
        </p>
      )}

      {error && <p className="mt-3 text-[0.72rem] text-[var(--color-terracotta)]">{error}</p>}

      <div className="mt-5 flex items-center gap-2.5 border-t border-[var(--color-pearl)] pt-4">
        <button
          type="button"
          disabled={addClient.isPending}
          onClick={() => void submit()}
          className="rounded-[5px] bg-[var(--color-charcoal)] px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-off-white)] disabled:opacity-50"
        >
          {addClient.isPending ? 'Adding…' : 'Add to roster'}
        </button>
        <button
          type="button"
          onClick={close}
          className="rounded-[5px] border border-[var(--color-pearl)] px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-charcoal)]"
        >
          Cancel
        </button>
      </div>
    </RoomSheet>
  );
}
