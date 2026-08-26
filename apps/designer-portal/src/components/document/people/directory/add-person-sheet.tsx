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
 */

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAddClient,
  useAddProjectParty,
  useFindOrCreateVendor,
  useSaveVendor,
  peopleKeys,
  type PartyKind,
} from '@patina/supabase';
import { ALL_FIELD_TRADES, FIELD_TRADE_LABELS } from '@patina/types';
import { useProjects } from '@/hooks/use-projects';
import { DocumentAction, DocumentActionGroup } from '../../document-action';
import { RoomSheet } from '../../rooms/room-sheet';
import type { DirectoryRole } from '../views/directory-view';

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
  'mb-1 block font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';
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
          className={`min-h-11 rounded-[3px] font-mono text-[9.5px] uppercase tracking-[0.1em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] ${
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
}) {
  const queryClient = useQueryClient();
  const addClient = useAddClient();
  // R83: this sheet renders failures inline — keep the global toast silent.
  const findOrCreateVendor = useFindOrCreateVendor({ errorSurface: 'inline' });
  const saveVendor = useSaveVendor({ errorSurface: 'inline' });
  const addParty = useAddProjectParty();

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
    setPartyName('');
    setCompany('');
    setTrade('');
    setPhone('');
    setPartyEmail('');
    setProjectId('');
    setTextUpdates(false);
    setConsentSource('');
    setConsentEvidence('');
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
      });
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

  const pending =
    addClient.isPending ||
    findOrCreateVendor.isPending ||
    saveVendor.isPending ||
    addParty.isPending;

  const submit = isFieldKind(kind)
    ? submitParty
    : kind === 'client'
      ? submitClient
      : submitMaker;

  const intro =
    kind === 'client'
      ? 'Add a client to your directory. They appear on your roster at once; an optional invite gives them a Patina login.'
      : kind === 'maker'
        ? 'Add a maker — a shop you order through. They join your roster and the Orders book can route POs to them.'
        : `Add a ${KIND_NOUN[kind as PartyKind]} to a project. With a phone and a text opt-in, you can coordinate them over SMS — and they land on your People roster.`;

  return (
    <RoomSheet open={open} onClose={close} title="Add someone to your people">
      <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--color-clay-ink)]">
        Add · to your roster
      </div>
      <h2 className="mt-1 font-heading text-[1.6rem] font-medium text-[var(--color-charcoal)]">
        Bring someone in
      </h2>
      <p className="mb-4 mt-1 text-[0.74rem] text-[var(--color-aged-oak)]">
        {intro}
      </p>

      <KindChoice
        kind={kind}
        onKind={(k) => {
          setKind(k);
          setError(null);
        }}
      />

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
        regionKey="add-person-sheet"
        className="mt-5 border-t border-[var(--color-pearl)] pt-4"
      >
        <DocumentAction
          actionKey="add-person"
          variant="primary"
          loading={pending}
          loadingLabel="Adding…"
          onClick={() => void submit()}
        >
          Add to roster
        </DocumentAction>
        <DocumentAction
          actionKey="cancel-add-person"
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
