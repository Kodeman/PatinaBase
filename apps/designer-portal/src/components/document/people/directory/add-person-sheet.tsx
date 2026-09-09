'use client';

/**
 * Add a person (Track A · Track 9 · Field Coordination Wave 5) — a quiet paper
 * sheet over the People Room for bringing someone onto the roster. The person
 * kinds are chosen in DM-mono page-link grammar (never tabs):
 *
 *  · client — the proven `useAddClient` mutation (auth-guarded server route,
 *    optional magic-link invite, audit row).
 *  · maker  — R78 / PRC-03: the vendor-creation door. Finds-or-creates the
 *    vendor (`useFindOrCreateVendor`), then SAVES it (`useSaveVendor`).
 *  · gc / sub / installer / receiver — the field crew (00281). A per-project
 *    project_parties row with an optional phone + "Text updates" opt-in. When
 *    the opt-in is on, the row is written with consent 'pending', which fires
 *    the opt-in SMS invite server-side (Track B trigger) — the UI writes the
 *    row only, never the invite.
 *
 * On success every path invalidates the directory read model and hands the Room
 * a quiet inline confirmation (R51 grammar — no toast, R83). Errors render
 * inline at the act site.
 *
 * F3 — EDIT mode. Pass `contact` (an existing `studio_contacts` row) and this
 * same sheet opens on that card instead of creating a new one: the kind choice
 * is hidden (entity_kind/contact_kind are locked — this never re-kinds a
 * card), the Name/Company/Trade/Phone/Email fields prefill from the record,
 * the submit button reads "Save", and submit calls `useUpdateStudioContact`
 * with only the fields that actually changed. `onSaved` fires in place of
 * `onAdded` on success — there is no directory tab to land on, since the
 * caller is already sitting on the card's own profile.
 *
 * F3-R2-14 — a card with `vendor_id` set (every 00418 pass-A/B row) is the
 * studio's OWN COPY of a maker: this editor only ever writes the
 * `studio_contacts` row it was opened on, never the `vendors` row `vendor_id`
 * points at. "Makers stay read-only (vendor-owned)" governs that shared
 * `vendors` record, not the studio's private label for it — so this sheet
 * intentionally still edits a vendor-backed card's copy.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAddClient,
  useAddProjectParty,
  useFindOrCreateVendor,
  useSaveVendor,
  useStudioIdentity,
  useUpdateStudioContact,
  peopleKeys,
  type PartyKind,
  type StudioContact,
} from '@patina/supabase';
import { ALL_FIELD_TRADES, FIELD_TRADE_LABELS } from '@patina/types';
import { useProjects } from '@/hooks/use-projects';
import { useAuth } from '@/hooks/use-auth';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { clientEvents } from '@/lib/analytics/events';
import { DocumentAction, DocumentActionGroup } from '../../document-action';
import { RoomSheet } from '../../rooms/room-sheet';
import type { DirectoryRole } from '../views/directory-view';
import {
  LetterLineField,
  checkboxHelper,
  checkboxLabel,
  givenNameOf,
  sendButtonLabel,
  successLine,
} from './letter-line-field';

export type AddedPersonKind =
  | 'client'
  | 'maker'
  | 'gc'
  | 'sub'
  | 'installer'
  | 'receiver';

/** The four kinds this sheet writes as `project_parties` rows. Pinned as a
 *  literal union rather than `Extract<AddedPersonKind, PartyKind>`: the Call
 *  Sheet program widened PartyKind to include 'client' (00419), which would
 *  silently pull 'client' into this predicate's narrowing and make the
 *  maker/client branches below unreachable. FIELD_PARTY_KINDS stays four
 *  values — so does this. */
type FieldAddKind = 'gc' | 'sub' | 'installer' | 'receiver';
const FIELD_KINDS: FieldAddKind[] = ['gc', 'sub', 'installer', 'receiver'];
const isFieldKind = (k: AddedPersonKind): k is FieldAddKind =>
  (FIELD_KINDS as string[]).includes(k);
/** Trade is a meaningful field only for the trade kinds (sub / installer). */
const showsTrade = (k: AddedPersonKind) => k === 'sub' || k === 'installer';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FIELD_LABEL =
  'mb-1 block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';
const FIELD_INPUT =
  'w-full rounded-[7px] border border-[var(--color-pearl)] bg-white px-3.5 py-2.5 text-[0.82rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none';

const KIND_CHOICES: Array<[AddedPersonKind, string]> = [
  ['client', 'a client'],
  ['maker', 'a maker'],
  ['gc', 'a GC'],
  ['sub', 'a sub'],
  ['installer', 'an installer'],
  ['receiver', 'a receiver'],
];

/** The quiet kind choice — DM-mono page links, never tabs (R28 grammar). */
function KindChoice({
  kind,
  onKind,
}: {
  kind: AddedPersonKind;
  onKind: (k: AddedPersonKind) => void;
}) {
  return (
    <p className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1.5 border-b border-[var(--color-pearl)] pb-2.5">
      {KIND_CHOICES.map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => onKind(k)}
          aria-current={kind === k ? 'true' : undefined}
          className={`min-h-11 rounded-[3px] font-mono text-[11px] uppercase tracking-[0.1em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] ${
            kind === k
              ? 'text-[var(--color-clay-ink)]'
              : 'text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]'
          }`}
        >
          {label}
        </button>
      ))}
    </p>
  );
}

const KIND_NOUN: Record<PartyKind, string> = {
  gc: 'general contractor',
  sub: 'subcontractor',
  installer: 'installer',
  receiver: 'receiver',
  vendor: 'vendor',
  client_rep: 'client rep',
  other: 'contact',
  // Call Sheet (00419) widened PartyKind; this sheet only ever indexes the
  // four field kinds, but the map must stay total.
  client: 'client',
  architect: 'architect',
  photographer: 'photographer',
  stager: 'stager',
};

export function AddPersonSheet({
  open,
  onClose,
  onAdded,
  onGoToLeads,
  initialKind = 'client',
  contact = null,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** The kind the sheet opens on (⌘K "Add a maker" cold-starts on 'maker'). */
  initialKind?: AddedPersonKind;
  /** Fired with a confirmation line + the directory filter to land on, so the
   *  Room can surface the right roster with the line inline (no toast). */
  onAdded?: (message: string, landOn: DirectoryRole) => void;
  /** Walk out to lead intake (the pipeline) for a prospect rather than a client. */
  onGoToLeads?: () => void;
  /** F3 — when present, the sheet opens in EDIT mode for this existing
   *  rolodex card instead of creating a new one. See the module doc. */
  contact?: StudioContact | null;
  /** F3 — fired on a successful edit-mode save, in place of `onAdded`. */
  onSaved?: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const addClient = useAddClient();
  // R83: this sheet renders failures inline — keep the global toast silent.
  const findOrCreateVendor = useFindOrCreateVendor({ errorSurface: 'inline' });
  const saveVendor = useSaveVendor({ errorSurface: 'inline' });
  const addParty = useAddProjectParty();
  const updateContact = useUpdateStudioContact();
  const isEditMode = !!contact;

  const { data: projectsRaw } = useProjects();
  // Real (persisted) projects only — the mock fallback returns slug ids a party
  // FK can't reference; a field party is per-project so a project is required.
  const projects = useMemo(
    () =>
      ((projectsRaw ?? []) as Array<{ id: string; name?: string | null }>)
        .filter((p) => UUID_RE.test(p.id))
        .map((p) => ({ id: p.id, name: p.name ?? 'Untitled project' })),
    [projectsRaw],
  );

  const [kind, setKind] = useState<AddedPersonKind>(initialKind);
  // Re-seed the kind each time the sheet opens (⌘K may cold-start on 'maker').
  useEffect(() => {
    if (open) setKind(initialKind);
  }, [open, initialKind]);
  // Client fields.
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [invite, setInvite] = useState(true);
  const [note, setNote] = useState('');
  const { value: letterOn, isLoading: letterLoading } = useFeatureFlag('client-invite-letter');
  const { data: studioIdentity } = useStudioIdentity({ designerId: user?.id ?? null });
  const studioName = studioIdentity?.name ?? null;
  const clientGiven = givenNameOf(name);
  // Maker fields (R78: name · specialty · orders email · website).
  const [makerName, setMakerName] = useState('');
  const [category, setCategory] = useState('');
  const [ordersEmail, setOrdersEmail] = useState('');
  const [website, setWebsite] = useState('');
  // Field-party fields (00281).
  const [partyName, setPartyName] = useState('');
  const [company, setCompany] = useState('');
  const [trade, setTrade] = useState('');
  const [phone, setPhone] = useState('');
  const [partyEmail, setPartyEmail] = useState('');
  const [projectId, setProjectId] = useState('');
  const [textUpdates, setTextUpdates] = useState(false);
  const [consentSource, setConsentSource] = useState<
    '' | 'verbal' | 'written' | 'web_form' | 'other'
  >('');
  const [consentEvidence, setConsentEvidence] = useState('');

  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  // F3 — edit mode prefill. Keyed on the card's own id (not the object
  // reference): a background refetch of the same card while the sheet is
  // open must never clobber an in-progress edit.
  const contactId = contact?.id ?? null;
  // F3-R1-01/16 — a company card's "name" IS company_name; a person card's is
  // full_name. F3-R1-06 — a card whose profile_id is set belongs to someone
  // with a Patina account, who self-manages name/email/phone there (mirrors
  // HouseholdSheet's hasProfile branch); only trade, company, and notes stay
  // studio-editable for it here.
  const isCompanyContact = contact?.entity_kind === 'company';
  const hasProfile = !!contact?.profile_id;
  const contactDisplayName = contact?.full_name ?? contact?.company_name ?? 'this contact';
  // F3-R2-10 — a company card's name is a studio-book fact even when the
  // card also carries a profile_id (not a state we expect, but the primary
  // field must not vanish entirely if it occurs): render/validate/diff it
  // whenever it's the company-name field, and otherwise only when there's no
  // profile to self-manage the person's name.
  const primaryFieldRendered = isCompanyContact || !hasProfile;
  // F3-R2-09 — a seeded vendor card's specialties[0] can sit outside the
  // field-trade vocab (VendorSpecialty, not FieldTrade); shown as its own
  // option so the editor renders what the record holds instead of a blank
  // control that discards the value on any unrelated save.
  const originalSpecialty = contact?.specialties?.[0] ?? null;
  const outOfVocabSpecialty =
    originalSpecialty && !(ALL_FIELD_TRADES as readonly string[]).includes(originalSpecialty)
      ? originalSpecialty
      : null;
  useEffect(() => {
    if (!open || !contact) return;
    setPartyName(contact.full_name ?? '');
    setCompany(contact.company_name ?? '');
    setTrade(contact.specialties?.[0] ?? '');
    setPhone(contact.phone ?? '');
    setPartyEmail(contact.email ?? '');
    setNotes(contact.notes ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contactId]);

  const reset = () => {
    setKind('client');
    setName('');
    setEmail('');
    setInvite(true);
    setNote('');
    setMakerName('');
    setCategory('');
    setOrdersEmail('');
    setWebsite('');
    setPartyName('');
    setCompany('');
    setTrade('');
    setPhone('');
    setPartyEmail('');
    setProjectId('');
    setTextUpdates(false);
    setConsentSource('');
    setConsentEvidence('');
    setNotes('');
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
      setError(
        'An email brings them onto the roster — and lets you reach them.',
      );
      return;
    }
    try {
      const result = await addClient.mutateAsync({
        clientEmail: trimmedEmail,
        clientName: name.trim() || undefined,
        source: 'direct',
        invite,
        ...(letterOn && invite
          ? { letter: true as const, note: note.trim() || undefined }
          : {}),
      });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });

      const label = name.trim() || trimmedEmail;
      // The server decides whether R13's notice actually fired
      // (`kind === 'notice'`), not the designer's own checkbox — the checkbox
      // only requests a letter; branch A can still link silently underneath.
      const letterActuallySent = result.alreadyExists ? result.kind === 'notice' : invite;
      const message = letterOn
        ? successLine({
            label,
            email: trimmedEmail,
            sent: letterActuallySent,
            alreadyExisted: result.alreadyExists,
          })
        : result.alreadyExists
          ? `${label} is already on Patina — linked to their account, now on your roster.`
          : result.invited
            ? `${label} added — a magic-link invite is on its way.`
            : `${label} added to your roster.`;
      onAdded?.(message, 'client');
      clientEvents.create({ has_note: letterOn && invite && !!note.trim() });
      reset();
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not add them just now. Try again.',
      );
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
      const result = await findOrCreateVendor.mutateAsync({
        name: trimmedName,
        website: website.trim() || undefined,
        primaryCategory: category.trim() || undefined,
        ordersEmail: ordersEmail.trim() || undefined,
      });
      await saveVendor.mutateAsync({ vendorId: result.vendorId });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });

      const message = result.isNew
        ? `${result.vendor.name} added — a new maker on your roster.`
        : `${result.vendor.name} was already in the book — now on your roster.`;
      onAdded?.(message, 'maker');
      reset();
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not add the maker just now. Try again.',
      );
    }
  };

  const submitParty = async () => {
    if (!isFieldKind(kind)) return;
    setError(null);
    const trimmedName = partyName.trim();
    if (!projectId) {
      setError('Field crew work a project — pick which one they’re on.');
      return;
    }
    if (!trimmedName) {
      setError(`A ${KIND_NOUN[kind]} needs a name.`);
      return;
    }
    if (textUpdates && !phone.trim()) {
      setError(
        'Texting updates needs a phone number — or turn the toggle off.',
      );
      return;
    }
    if (textUpdates && (!consentSource || !consentEvidence.trim())) {
      setError(
        'Record how and where they gave prior consent before sending a text.',
      );
      return;
    }
    try {
      await addParty.mutateAsync({
        projectId,
        partyKind: kind,
        displayName: trimmedName,
        companyName: company,
        trade: showsTrade(kind) ? trade : null,
        phone,
        email: partyEmail,
        textUpdates,
        smsConsentSource: consentSource || undefined,
        smsConsentEvidence: consentEvidence,
      });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });

      const proj =
        projects.find((p) => p.id === projectId)?.name ?? 'the project';
      const message =
        textUpdates && phone.trim()
          ? `${trimmedName} added to ${proj} — a text confirmation is on its way.`
          : `${trimmedName} added to ${proj}.`;
      onAdded?.(message, 'field');
      reset();
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not add them just now. Try again.',
      );
    }
  };

  /** F3 — edit an existing rolodex card. Diffs the form against the record
   *  and patches only what changed; entity_kind/contact_kind are never sent
   *  (locked in edit mode). A no-op edit just closes the sheet.
   *
   *  F3-R1-01/16 — a company card's name lives in `company_name`; only a
   *  person card's uses `full_name` — sending the wrong column would
   *  overwrite one with the other on a save that touched neither.
   *  F3-R1-06 — a profile-holder's name/phone/email are never diffed (the
   *  fields are hidden in that render branch, but this guards the write
   *  itself, not just the UI). Company stays studio-owned either way (the
   *  Company field renders regardless of `hasProfile`), so it is never
   *  gated on it (F3-R2-08).
   *  F3-R1-09 — trade patches element 0 of `specialties` in place rather
   *  than replacing the whole array, so a card with more than one specialty
   *  keeps the rest.
   *  F3-R2-07 — the primary Name/Company-name field only renders when
   *  `primaryFieldRendered` (mirrors the render branch below); validating
   *  and diffing it when it's off-screen blocks saving an unrelated field
   *  (e.g. Notes) on a profile-holding person whose `full_name` is NULL.
   *  F3-R2-06 — Notes is diffed for every card, not only profile-holders. */
  const submitEditContact = async () => {
    if (!contact) return;
    setError(null);
    const trimmedCompany = company.trim();
    const trimmedName = partyName.trim();
    const primaryValue = isCompanyContact ? trimmedCompany : trimmedName;
    if (primaryFieldRendered && !primaryValue) {
      setError(
        isCompanyContact ? 'This company needs a name.' : 'This contact needs a name.',
      );
      return;
    }
    const trimmedTrade = trade.trim();
    const originalTrade = contact.specialties?.[0] ?? '';
    const trimmedNotes = notes.trim();

    const patch: Partial<{
      fullName: string;
      companyName: string | null;
      specialties: string[];
      phone: string | null;
      email: string | null;
      notes: string | null;
    }> = {};
    if (isCompanyContact) {
      if (trimmedCompany !== (contact.company_name ?? ''))
        patch.companyName = trimmedCompany || null;
    } else {
      if (!hasProfile && trimmedName !== (contact.full_name ?? ''))
        patch.fullName = trimmedName;
      if (trimmedCompany !== (contact.company_name ?? ''))
        patch.companyName = trimmedCompany || null;
    }
    if (trimmedTrade !== originalTrade) {
      const restSpecialties = (contact.specialties ?? []).slice(1);
      patch.specialties = trimmedTrade ? [trimmedTrade, ...restSpecialties] : restSpecialties;
    }
    if (trimmedNotes !== (contact.notes ?? '')) patch.notes = trimmedNotes || null;
    if (!hasProfile) {
      const trimmedPhone = phone.trim();
      const trimmedEmail = partyEmail.trim();
      if (trimmedPhone !== (contact.phone ?? '')) patch.phone = trimmedPhone || null;
      if (trimmedEmail !== (contact.email ?? '')) patch.email = trimmedEmail || null;
    }

    if (Object.keys(patch).length === 0) {
      close();
      return;
    }

    const confirmationName = primaryValue || contactDisplayName;
    try {
      await updateContact.mutateAsync({
        id: contact.id,
        organizationId: contact.organization_id,
        ...patch,
      });
      onSaved?.(`${confirmationName}’s details are saved.`);
      reset();
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not save just now. Try again.',
      );
    }
  };

  const pending =
    addClient.isPending ||
    findOrCreateVendor.isPending ||
    saveVendor.isPending ||
    addParty.isPending ||
    updateContact.isPending;

  const submit = isEditMode
    ? submitEditContact
    : isFieldKind(kind)
      ? submitParty
      : kind === 'client'
        ? submitClient
        : submitMaker;

  const intro = isEditMode
    ? `Update ${contactDisplayName}’s card — the whole studio sees the change.`
    : kind === 'client'
      ? 'Add a client to your directory. They appear on your roster at once; an optional invite gives them a Patina login.'
      : kind === 'maker'
        ? 'Add a maker — a shop you order through. They join your roster and the Orders book can route POs to them.'
        : `Add a ${KIND_NOUN[kind as PartyKind]} to a project. With a phone and a text opt-in, you can coordinate them over SMS — and they land on your People roster.`;

  return (
    <RoomSheet
      open={open}
      onClose={close}
      title={isEditMode ? `Edit ${contactDisplayName}` : 'Add someone to your people'}
    >
      <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-clay-ink)]">
        {isEditMode ? 'Edit · your rolodex' : 'Add · to your roster'}
      </div>
      <h2 className="mt-1 font-heading text-[1.6rem] font-medium text-[var(--color-charcoal)]">
        {isEditMode ? `Edit ${contactDisplayName}` : 'Bring someone in'}
      </h2>
      <p className="mb-4 mt-1 text-[0.74rem] text-[var(--color-aged-oak)]">
        {intro}
      </p>

      {!isEditMode && (
        <KindChoice
          kind={kind}
          onKind={(k) => {
            setKind(k);
            setError(null);
          }}
        />
      )}

      {isEditMode ? (
        <>
          {hasProfile && (
            <p className="mb-4 text-[0.72rem] italic leading-relaxed text-[var(--color-aged-oak)]">
              {contactDisplayName}’s name, email, and phone are managed in their
              Patina account. Trade, company, and notes still update here.
            </p>
          )}

          {primaryFieldRendered && (
            <>
              <label className={FIELD_LABEL} htmlFor="edit-contact-name">
                {isCompanyContact ? 'Company name' : 'Name'}
              </label>
              <input
                id="edit-contact-name"
                type="text"
                value={isCompanyContact ? company : partyName}
                onChange={(e) =>
                  isCompanyContact
                    ? setCompany(e.target.value)
                    : setPartyName(e.target.value)
                }
                placeholder={
                  isCompanyContact ? 'e.g. Moretti Plumbing' : 'e.g. Sal Moretti'
                }
                className={`${FIELD_INPUT} mb-4`}
              />
            </>
          )}

          {!isCompanyContact && (
            <>
              <label className={FIELD_LABEL} htmlFor="edit-contact-company">
                Company <span className="opacity-60">(optional)</span>
              </label>
              <input
                id="edit-contact-company"
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Moretti Plumbing"
                className={`${FIELD_INPUT} mb-4`}
              />
            </>
          )}

          <label className={FIELD_LABEL} htmlFor="edit-contact-trade">
            Trade <span className="opacity-60">(optional)</span>
          </label>
          <select
            id="edit-contact-trade"
            value={trade}
            onChange={(e) => setTrade(e.target.value)}
            className={`${FIELD_INPUT} mb-4`}
          >
            <option value="">Which trade…</option>
            {outOfVocabSpecialty && (
              <option value={outOfVocabSpecialty}>{outOfVocabSpecialty}</option>
            )}
            {ALL_FIELD_TRADES.map((t) => (
              <option key={t} value={t}>
                {FIELD_TRADE_LABELS[t]}
              </option>
            ))}
          </select>

          <label className={FIELD_LABEL} htmlFor="edit-contact-notes">
            Notes <span className="opacity-60">(optional)</span>
          </label>
          <textarea
            id="edit-contact-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth remembering…"
            rows={3}
            className={`${FIELD_INPUT} ${hasProfile ? '' : 'mb-4'} resize-none`}
          />

          {!hasProfile && (
            <>
              <label className={FIELD_LABEL} htmlFor="edit-contact-phone">
                Phone <span className="opacity-60">(optional)</span>
              </label>
              <input
                id="edit-contact-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                className={`${FIELD_INPUT} mb-4`}
              />

              <label className={FIELD_LABEL} htmlFor="edit-contact-email">
                Email <span className="opacity-60">(optional)</span>
              </label>
              <input
                id="edit-contact-email"
                type="email"
                value={partyEmail}
                onChange={(e) => setPartyEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit();
                }}
                placeholder="sal@morettiplumbing.com"
                className={FIELD_INPUT}
              />
            </>
          )}
        </>
      ) : kind === 'client' ? (
        <>
          <label className={FIELD_LABEL} htmlFor="client-full-name">
            Full name <span className="opacity-60">(optional)</span>
          </label>
          <input
            id="client-full-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sarah Whitfield"
            className={`${FIELD_INPUT} mb-4`}
          />

          <label className={FIELD_LABEL} htmlFor="client-email">Email</label>
          <input
            id="client-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
            placeholder="sarah@whitfield.com"
            className={FIELD_INPUT}
          />

          {/* Fail-closed: neither the old string nor the new one renders while
              PostHog is still answering, so a non-pilot studio never sees the
              letter flash past. */}
          {letterLoading ? (
            <div className="mt-4 h-[18px]" aria-hidden />
          ) : letterOn ? (
            <>
              <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-[0.74rem] text-[var(--color-mocha)]">
                <input
                  type="checkbox"
                  checked={invite}
                  onChange={(e) => setInvite(e.target.checked)}
                  className="mt-0.5 h-4 w-4 cursor-pointer rounded border-[var(--color-pearl)] accent-[var(--color-clay)]"
                  aria-label={checkboxLabel(clientGiven)}
                />
                <span>
                  {checkboxLabel(clientGiven)}
                  <span className="mt-0.5 block text-[0.64rem] leading-relaxed text-[var(--color-aged-oak)]">
                    {checkboxHelper({ givenName: clientGiven, studioName, pronoun: null })}
                  </span>
                </span>
              </label>

              <LetterLineField
                facts={{
                  clientName: name.trim() || null,
                  clientEmail: email.trim() || 'no email yet',
                  projectName: null,
                }}
                value={note}
                onChange={setNote}
                // Checkbox off folds the field to "+ A line for {given}";
                // opening it turns the letter back on. The key forces a
                // remount on every invite flip so the field's own `open`
                // state can't drift from `folded` after the first render.
                folded={!invite}
                key={invite ? 'letter-on' : 'letter-off'}
                onOpen={() => setInvite(true)}
              />
            </>
          ) : (
            <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-[0.74rem] text-[var(--color-mocha)]">
              <input
                type="checkbox"
                checked={invite}
                onChange={(e) => setInvite(e.target.checked)}
                className="h-4 w-4 cursor-pointer rounded border-[var(--color-pearl)] accent-[var(--color-clay)]"
              />
              Send a magic-link invite to Patina
            </label>
          )}

          {onGoToLeads && (
            <p className="mt-3 text-[0.66rem] text-[var(--color-aged-oak)]">
              Not a client yet?{' '}
              <DocumentAction
                actionKey="add-lead-in-pipeline"
                surfaceKey="people"
                regionKey="add-person-sheet"
                variant="tertiary"
                onClick={() => {
                  close();
                  onGoToLeads();
                }}
                className="inline-flex min-h-11 px-0 font-sans normal-case tracking-normal"
              >
                Add a lead in the pipeline
              </DocumentAction>
              .
            </p>
          )}
        </>
      ) : kind === 'maker' ? (
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
            Orders email{' '}
            <span className="opacity-60">(where POs go · optional)</span>
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
      ) : (
        <>
          <label className={FIELD_LABEL}>Project</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={`${FIELD_INPUT} mb-4`}
            aria-label="Project"
          >
            <option value="">Which project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {projects.length === 0 && (
            <p className="mb-4 -mt-2 text-[0.66rem] text-[var(--color-aged-oak)]">
              No active projects yet — field crew join from a live project.
            </p>
          )}

          <label className={FIELD_LABEL}>Name</label>
          <input
            type="text"
            value={partyName}
            onChange={(e) => setPartyName(e.target.value)}
            placeholder="e.g. Sal Moretti"
            className={`${FIELD_INPUT} mb-4`}
          />

          <label className={FIELD_LABEL}>
            Company <span className="opacity-60">(optional)</span>
          </label>
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="e.g. Moretti Plumbing"
            className={`${FIELD_INPUT} mb-4`}
          />

          {showsTrade(kind) && (
            <>
              <label className={FIELD_LABEL}>
                Trade <span className="opacity-60">(optional)</span>
              </label>
              <select
                value={trade}
                onChange={(e) => setTrade(e.target.value)}
                className={`${FIELD_INPUT} mb-4`}
                aria-label="Trade"
              >
                <option value="">Which trade…</option>
                {ALL_FIELD_TRADES.map((t) => (
                  <option key={t} value={t}>
                    {FIELD_TRADE_LABELS[t]}
                  </option>
                ))}
              </select>
            </>
          )}

          <label className={FIELD_LABEL}>
            Phone <span className="opacity-60">(for text updates)</span>
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
            className={`${FIELD_INPUT} mb-4`}
          />

          <label className={FIELD_LABEL}>
            Email <span className="opacity-60">(optional)</span>
          </label>
          <input
            type="email"
            value={partyEmail}
            onChange={(e) => setPartyEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
            placeholder="sal@morettiplumbing.com"
            className={FIELD_INPUT}
          />

          <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-[0.74rem] text-[var(--color-mocha)]">
            <input
              type="checkbox"
              checked={textUpdates}
              onChange={(e) => setTextUpdates(e.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer rounded border-[var(--color-pearl)] accent-[var(--color-clay)]"
            />
            <span>
              They gave prior express consent for text updates
              <span className="mt-0.5 block text-[0.64rem] text-[var(--color-aged-oak)]">
                Optional and never preselected. They agreed to Patina project
                texts (~1/day, rates may apply, reply STOP to quit).
              </span>
            </span>
          </label>

          {textUpdates && (
            <div className="mt-4 rounded border border-[var(--color-pearl)] bg-[var(--color-linen)]/45 p-3">
              <label className={FIELD_LABEL}>How consent was given</label>
              <select
                value={consentSource}
                onChange={(e) =>
                  setConsentSource(
                    e.target.value as
                      | ''
                      | 'verbal'
                      | 'written'
                      | 'web_form'
                      | 'other',
                  )
                }
                className={`${FIELD_INPUT} mb-3`}
                aria-label="SMS consent method"
              >
                <option value="">Choose a method…</option>
                <option value="verbal">Verbal agreement</option>
                <option value="written">Written agreement</option>
                <option value="web_form">Website or form</option>
                <option value="other">Other documented consent</option>
              </select>

              <label className={FIELD_LABEL}>Consent record</label>
              <textarea
                value={consentEvidence}
                onChange={(e) => setConsentEvidence(e.target.value)}
                placeholder="Where and when they agreed, e.g. signed site kickoff form on Aug 8"
                rows={3}
                className={`${FIELD_INPUT} resize-none`}
              />
              <p className="mt-2 text-[0.62rem] leading-relaxed text-[var(--color-aged-oak)]">
                Keep the underlying form, message, or signed record. Patina stores
                this note, time, disclosure version, and the person recording it.
              </p>
            </div>
          )}
        </>
      )}

      {error && (
        <p className="mt-3 text-[0.72rem] text-[var(--color-terracotta-ink)]">
          {error}
        </p>
      )}

      <DocumentActionGroup
        surfaceKey="people"
        regionKey={isEditMode ? 'edit-person-sheet' : 'add-person-sheet'}
        className="mt-5 border-t border-[var(--color-pearl)] pt-4"
      >
        <DocumentAction
          actionKey={isEditMode ? 'save-person' : 'add-person'}
          variant="primary"
          loading={pending}
          loadingLabel={isEditMode ? 'Saving…' : 'Adding…'}
          onClick={() => void submit()}
        >
          {isEditMode
            ? 'Save'
            : kind === 'client' && letterOn && !letterLoading
              ? sendButtonLabel(invite)
              : 'Add to roster'}
        </DocumentAction>
        <DocumentAction
          actionKey={isEditMode ? 'cancel-edit-person' : 'cancel-add-person'}
          variant="tertiary"
          onClick={close}
        >
          Cancel
        </DocumentAction>
      </DocumentActionGroup>

      {/* Clearance for the fixed Studio drawer (D8, ≥980px, ~60px tall at the
          viewport bottom): keep the action row above it so the tall field-party
          form's buttons stay clickable. */}
      <div aria-hidden className="h-4 min-[980px]:h-20" />
    </RoomSheet>
  );
}
