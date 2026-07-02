'use client';

/**
 * Add a person (Track A · Track 9) — a quiet paper sheet over the People Room
 * for bringing someone onto the roster. Two person kinds, chosen in DM-mono
 * page-link grammar (never tabs):
 *
 *  · client — the proven `useAddClient` mutation (auth-guarded server route,
 *    optional magic-link invite, audit row).
 *  · maker  — R78 / PRC-03: the vendor-creation door. Finds-or-creates the
 *    vendor (`useFindOrCreateVendor`, same path the extension links makers
 *    through), then SAVES it (`useSaveVendor`) — saved is admission: the
 *    people_directory view (00221) lists a maker only when saved or engaged.
 *
 * On success both paths invalidate the directory read model and hand the Room
 * a quiet inline confirmation (R51 grammar — no toast, R83). Errors render
 * inline at the act site.
 *
 * A lead still arrives through lead intake; the sheet links out rather than
 * re-implementing it.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAddClient,
  useFindOrCreateVendor,
  useSaveVendor,
  peopleKeys,
} from '@patina/supabase';
import { RoomSheet } from '../../rooms/room-sheet';

export type AddedPersonKind = 'client' | 'maker';

const FIELD_LABEL =
  'mb-1 block font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';
const FIELD_INPUT =
  'w-full rounded-[7px] border border-[var(--color-pearl)] bg-white px-3.5 py-2.5 text-[0.82rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none';

/** The quiet kind choice — DM-mono page links, never tabs (R28 grammar). */
function KindChoice({
  kind,
  onKind,
}: {
  kind: AddedPersonKind;
  onKind: (k: AddedPersonKind) => void;
}) {
  const kinds: Array<[AddedPersonKind, string]> = [
    ['client', 'a client'],
    ['maker', 'a maker'],
  ];
  return (
    <p className="mb-5 flex items-baseline gap-x-3 border-b border-[var(--color-pearl)] pb-2.5">
      {kinds.map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => onKind(k)}
          aria-current={kind === k ? 'true' : undefined}
          className={`font-mono text-[9.5px] uppercase tracking-[0.1em] transition-colors ${
            kind === k
              ? 'text-[var(--color-clay)]'
              : 'text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]'
          }`}
        >
          {label}
        </button>
      ))}
    </p>
  );
}

export function AddPersonSheet({
  open,
  onClose,
  onAdded,
  onGoToLeads,
}: {
  open: boolean;
  onClose: () => void;
  /** Fired with a confirmation line + the kind, so the Room can land the
   *  directory on the right role filter and show the line inline (no toast). */
  onAdded?: (message: string, kind: AddedPersonKind) => void;
  /** Walk out to lead intake (the pipeline) for a prospect rather than a client. */
  onGoToLeads?: () => void;
}) {
  const queryClient = useQueryClient();
  const addClient = useAddClient();
  // R83: this sheet renders failures inline — keep the global toast silent.
  const findOrCreateVendor = useFindOrCreateVendor({ errorSurface: 'inline' });
  const saveVendor = useSaveVendor({ errorSurface: 'inline' });

  const [kind, setKind] = useState<AddedPersonKind>('client');
  // Client fields.
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [invite, setInvite] = useState(true);
  // Maker fields (R78: name · specialty · orders email · website).
  const [makerName, setMakerName] = useState('');
  const [category, setCategory] = useState('');
  const [ordersEmail, setOrdersEmail] = useState('');
  const [website, setWebsite] = useState('');

  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setKind('client');
    setName('');
    setEmail('');
    setInvite(true);
    setMakerName('');
    setCategory('');
    setOrdersEmail('');
    setWebsite('');
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submitClient = async () => {
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
      onAdded?.(message, 'client');
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add them just now. Try again.');
    }
  };

  const submitMaker = async () => {
    setError(null);
    const trimmedName = makerName.trim();
    if (!trimmedName) {
      setError('A maker needs at least a name — the shop you order from.');
      return;
    }
    try {
      // Find-or-create keeps the vendor book de-duplicated (name / trade name /
      // website domain matching) — a shop that already exists is linked, never
      // duplicated.
      const result = await findOrCreateVendor.mutateAsync({
        name: trimmedName,
        website: website.trim() || undefined,
        primaryCategory: category.trim() || undefined,
        ordersEmail: ordersEmail.trim() || undefined,
      });
      // Saved = admission (00221): without this the new vendor exists but never
      // enters people_directory. Idempotent — an already-saved match stays saved.
      await saveVendor.mutateAsync({ vendorId: result.vendorId });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });

      const message = result.isNew
        ? `${result.vendor.name} added — a new maker on your roster.`
        : `${result.vendor.name} was already in the book — now on your roster.`;
      onAdded?.(message, 'maker');
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the maker just now. Try again.');
    }
  };

  const pending = addClient.isPending || findOrCreateVendor.isPending || saveVendor.isPending;
  const submit = kind === 'client' ? submitClient : submitMaker;

  return (
    <RoomSheet open={open} onClose={close} title="Add someone to your people">
      <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--color-clay)]">
        Add · to your roster
      </div>
      <h2 className="mt-1 font-heading text-[1.6rem] font-medium text-[var(--color-charcoal)]">
        Bring someone in
      </h2>
      <p className="mb-4 mt-1 text-[0.74rem] text-[var(--color-aged-oak)]">
        {kind === 'client'
          ? 'Add a client to your directory. They appear on your roster at once; an optional invite gives them a Patina login.'
          : 'Add a maker — a shop you order through. They join your roster and the Orders book can route POs to them.'}
      </p>

      <KindChoice kind={kind} onKind={(k) => { setKind(k); setError(null); }} />

      {kind === 'client' ? (
        <>
          <label className={FIELD_LABEL}>
            Full name <span className="opacity-60">(optional)</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sarah Whitfield"
            className={`${FIELD_INPUT} mb-4`}
          />

          <label className={FIELD_LABEL}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
            placeholder="sarah@whitfield.com"
            className={FIELD_INPUT}
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
        </>
      ) : (
        <>
          <label className={FIELD_LABEL}>Maker name</label>
          <input
            type="text"
            value={makerName}
            onChange={(e) => setMakerName(e.target.value)}
            placeholder="e.g. Dunes & Grain Workshop"
            className={`${FIELD_INPUT} mb-4`}
          />

          <label className={FIELD_LABEL}>
            Specialty <span className="opacity-60">(optional)</span>
          </label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. upholstery, casegoods, lighting"
            className={`${FIELD_INPUT} mb-4`}
          />

          <label className={FIELD_LABEL}>
            Orders email <span className="opacity-60">(where POs go · optional)</span>
          </label>
          <input
            type="email"
            value={ordersEmail}
            onChange={(e) => setOrdersEmail(e.target.value)}
            placeholder="orders@dunesandgrain.com"
            className={`${FIELD_INPUT} mb-4`}
          />

          <label className={FIELD_LABEL}>
            Website <span className="opacity-60">(optional)</span>
          </label>
          <input
            type="text"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
            placeholder="dunesandgrain.com"
            className={FIELD_INPUT}
          />
        </>
      )}

      {error && <p className="mt-3 text-[0.72rem] text-[var(--color-terracotta)]">{error}</p>}

      <div className="mt-5 flex items-center gap-2.5 border-t border-[var(--color-pearl)] pt-4">
        <button
          type="button"
          disabled={pending}
          onClick={() => void submit()}
          className="rounded-[5px] bg-[var(--color-charcoal)] px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-off-white)] disabled:opacity-50"
        >
          {pending ? 'Adding…' : 'Add to roster'}
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
