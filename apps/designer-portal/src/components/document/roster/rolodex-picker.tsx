'use client';

/**
 * From the rolodex (slides 13–14) — "search by what you need rather than by
 * what you remember", and, underneath the hits from the first frame, the way
 * out: ADD SOMEONE NEW unfolds an inline add form IN THE SAME SHEET.
 *
 * The stamp is the whole flywheel: "Save to the studio rolodex", ON BY
 * DEFAULT, a square sage tick — never a switch, never a toggle, never a pill.
 * Adding to the job feeds the book; the book feeds the next job.
 *
 * The fallback band is ALWAYS visible, not only after a search misses (mnote
 * 3). Kind chips arrive pre-scoped from wherever the sheet was opened
 * (`scopeKinds`) — "you asked for a sub on the tile line, so the sheet arrives
 * already narrowed".
 *
 * Flag-gated on `call-sheet` at this consumer.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { UserPlus } from 'lucide-react';
import {
  useAddProjectParty,
  useAddStudioContact,
  useOrganizations,
  useProjectRoster,
  useStudioContactHistory,
  useStudioContacts,
  type StudioContact,
} from '@patina/supabase';
import { getPartyKindLabel, type PartyKind } from '@patina/types';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { rosterHasIdentity } from '@/lib/document/roster-derivation';
import { DocSheet } from '../overlays/doc-sheet';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { TradeChipRow } from '../people/directory/trade-chip-row';
import { PartyMiniRow } from './party-mini-row';

/** How many hits get a history line — one grouped query covers exactly these. */
const HISTORY_PAGE = 40;

/**
 * The picker's default kind vocabulary. Every PartyKind the party CHECK admits
 * EXCEPT 'client': a project's client is set when the project is opened, not
 * picked out of a trade rolodex.
 */
const DEFAULT_SCOPE_KINDS: PartyKind[] = [
  'gc',
  'sub',
  'vendor',
  'installer',
  'receiver',
  'architect',
  'photographer',
  'stager',
  'client_rep',
  'other',
];

const WORD =
  'da-score-hover min-h-11 inline-flex items-center font-mono text-[9px] uppercase tracking-[0.1em] transition-colors';
const WORD_ON = 'da-score-on text-[var(--color-charcoal)]';
const WORD_OFF = 'text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]';
const UNDERLINE_INPUT =
  'min-h-11 w-full border-0 border-b border-[var(--color-pearl)] bg-transparent py-2 text-[0.85rem] text-[var(--color-charcoal)] outline-none transition-colors placeholder:italic placeholder:text-[var(--color-aged-oak)] focus:border-[var(--color-clay)]';
const FIELD_LABEL =
  'mb-1 block font-mono text-[8.5px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]';

/** A rolodex kind is free TEXT; anything the party CHECK doesn't admit lands
 *  on 'other' rather than failing the insert. */
function toPartyKind(kind: string | null | undefined): PartyKind {
  const allowed: readonly string[] = [...DEFAULT_SCOPE_KINDS, 'client'];
  return allowed.includes(kind ?? '') ? (kind as PartyKind) : 'other';
}

function contactName(c: StudioContact): string {
  return (
    (c.entity_kind === 'company' ? c.company_name : c.full_name) ??
    c.company_name ??
    c.full_name ??
    'Unnamed'
  );
}

/** "3 projects · last: Ellsworth" / "Never on a job yet" (slide 13). */
function historyLine(
  history: { projectCount: number; lastProjectName: string | null } | undefined,
): string {
  if (!history || history.projectCount === 0) return 'Never on a job yet';
  const count = `${history.projectCount} ${history.projectCount === 1 ? 'project' : 'projects'}`;
  return history.lastProjectName ? `${count} · last: ${history.lastProjectName}` : count;
}

export function RolodexPicker({
  open,
  onClose,
  projectId,
  scopeKinds,
  startInAdd = false,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  /** Pre-scoped kind chips — the sheet arrives already narrowed. */
  scopeKinds?: PartyKind[];
  /** Open straight into the inline-add form (the call sheet's NEW PERSON). */
  startInAdd?: boolean;
  onAdded?: (name: string) => void;
}) {
  const { value: callSheetOn } = useFeatureFlag('call-sheet');
  const kinds = scopeKinds && scopeKinds.length > 0 ? scopeKinds : DEFAULT_SCOPE_KINDS;

  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<string>('all');
  const [trade, setTrade] = useState('all');
  const [adding, setAdding] = useState(startInAdd);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Form state (inline add)
  const [form, setForm] = useState({
    name: '',
    company: '',
    kind: kinds[0] as string,
    trade: 'all',
    phone: '',
    email: '',
  });
  const [stamp, setStamp] = useState(true);

  useEffect(() => {
    if (!open) return;
    setAdding(startInAdd);
    setError(null);
    const id = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, startInAdd]);

  const { data: orgs } = useOrganizations({ enabled: open && callSheetOn });
  const organizationId = useMemo(
    () => orgs?.find((o) => o.type === 'design_studio')?.id ?? orgs?.[0]?.id ?? null,
    [orgs],
  );

  const { data: contacts } = useStudioContacts(
    open && callSheetOn ? organizationId : null,
    { kind, search },
  );

  const hits = useMemo(() => {
    let rows = contacts ?? [];
    if (trade !== 'all') {
      rows = rows.filter((c) => (c.specialties ?? []).includes(trade));
    }
    return rows.slice(0, HISTORY_PAGE);
  }, [contacts, trade]);

  const { data: history } = useStudioContactHistory(hits.map((c) => c.id));
  const { data: rosterRows, refetch: refetchRoster } = useProjectRoster(
    open && callSheetOn ? projectId : null,
  );

  const companyNames = useMemo(
    () =>
      [
        ...new Set(
          (contacts ?? [])
            .map((c) => c.company_name?.trim())
            .filter((n): n is string => !!n),
        ),
      ].sort(),
    [contacts],
  );

  const addParty = useAddProjectParty();
  const addContact = useAddStudioContact();

  const finish = (name: string) => {
    onAdded?.(name);
    setSearch('');
    setAdding(false);
    setForm({ name: '', company: '', kind: kinds[0] as string, trade: 'all', phone: '', email: '' });
    setStamp(true);
    onClose();
  };

  const addFromRolodex = async (contact: StudioContact) => {
    setError(null);
    const name = contactName(contact);
    if (
      rosterHasIdentity(rosterRows ?? [], {
        display_name: name,
        email: contact.email,
        phone: contact.phone,
        profile_id: contact.profile_id,
        studio_contact_id: contact.id,
      })
    ) {
      setError(`${name} is already on the call sheet.`);
      return;
    }
    try {
      await addParty.mutateAsync({
        projectId,
        partyKind: toPartyKind(contact.contact_kind),
        displayName: name,
        companyName: contact.company_name,
        trade: contact.specialties?.[0] ?? null,
        phone: contact.phone,
        email: contact.email,
        studioContactId: contact.id,
      });
      void refetchRoster();
      finish(name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add them to the call sheet.');
    }
  };

  const addSomeoneNew = async () => {
    const name = form.name.trim();
    if (!name) {
      setError('A name, at least.');
      return;
    }
    setError(null);
    const tradeValue = form.trade === 'all' ? null : form.trade;
    if (
      rosterHasIdentity(rosterRows ?? [], {
        display_name: name,
        email: form.email,
        phone: form.phone,
      })
    ) {
      setError(`${name} is already on the call sheet.`);
      return;
    }

    // The stamp writes the rolodex card FIRST, so the party can carry its id.
    // A rolodex hiccup must never cost the designer the add they came for —
    // the party still goes on the job, unlinked, and the error is stated.
    let studioContactId: string | null = null;
    if (stamp && organizationId) {
      try {
        const contact = await addContact.mutateAsync({
          organizationId,
          entityKind: 'person',
          contactKind: form.kind,
          fullName: name,
          companyName: form.company.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          specialties: tradeValue ? [tradeValue] : [],
        });
        studioContactId = contact.id;
      } catch {
        setError('Added to the job, but the studio rolodex did not take the card.');
      }
    }

    try {
      await addParty.mutateAsync({
        projectId,
        partyKind: toPartyKind(form.kind),
        displayName: name,
        companyName: form.company.trim() || null,
        trade: tradeValue,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        studioContactId,
      });
      void refetchRoster();
      finish(name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add them to the call sheet.');
    }
  };

  if (!callSheetOn) return null;

  return (
    <DocSheet open={open} onClose={onClose} title="From the rolodex" icon={UserPlus}>
      <input
        ref={searchRef}
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search the rolodex"
        placeholder="a name, a company, a trade…"
        className={UNDERLINE_INPUT}
      />

      <div role="group" aria-label="Filter by kind" className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1">
        <button
          type="button"
          onClick={() => {
            setKind('all');
            setTrade('all');
          }}
          aria-pressed={kind === 'all'}
          className={`${WORD} ${kind === 'all' ? WORD_ON : WORD_OFF}`}
        >
          All
        </button>
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              setTrade('all');
            }}
            aria-pressed={kind === k}
            className={`${WORD} ${kind === k ? WORD_ON : WORD_OFF}`}
          >
            {getPartyKindLabel(k)}
          </button>
        ))}
      </div>

      {kind !== 'all' && (
        <div className="mt-2">
          <TradeChipRow
            domain={kind === 'vendor' ? 'specialty' : 'trade'}
            value={trade}
            onChange={setTrade}
          />
        </div>
      )}

      {hits.length > 0 && (
        <ul className="mt-3 flex flex-col">
          {hits.map((c) => (
            <li key={c.id}>
              <PartyMiniRow
                name={contactName(c)}
                kind={c.contact_kind}
                entity={c.entity_kind}
                trade={c.specialties?.[0] ?? null}
                reach={c.profile_id ? 'account' : 'on_paper'}
                subline={historyLine(history?.[c.id])}
                onSelect={() => void addFromRolodex(c)}
                disabled={addParty.isPending}
              />
            </li>
          ))}
        </ul>
      )}

      {/* The way out sits under the hits from the first frame (mnote 3). */}
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5 border-l-2 border-[var(--color-pearl)] bg-white/40 px-3 py-2.5">
        <p className="text-[0.74rem] text-[var(--color-aged-oak)]">
          – No one by that name in the rolodex.
        </p>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={`${WORD} ${WORD_OFF}`}
          >
            Add someone new
          </button>
        )}
      </div>

      {error && (
        <p role="status" className="mt-2 text-[0.72rem] text-[var(--color-terracotta)]">
          {error}
        </p>
      )}

      {adding && (
        <div className="mt-4 border-t border-[var(--color-pearl)] pt-4">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-clay)]">
            Someone new
          </p>

          <div className="mt-3">
            <label className={FIELD_LABEL} htmlFor="rolodex-add-name">
              Name
            </label>
            <input
              id="rolodex-add-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={UNDERLINE_INPUT}
            />
          </div>

          <div className="mt-3">
            <label className={FIELD_LABEL} htmlFor="rolodex-add-company">
              Company
            </label>
            <input
              id="rolodex-add-company"
              list="rolodex-companies"
              value={form.company}
              onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              className={UNDERLINE_INPUT}
            />
            <datalist id="rolodex-companies">
              {companyNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>

          <div className="mt-4">
            <span className={FIELD_LABEL}>Kind</span>
            <div role="group" aria-label="Kind" className="flex flex-wrap gap-x-3.5 gap-y-1">
              {kinds.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, kind: k, trade: 'all' }))}
                  aria-pressed={form.kind === k}
                  className={`${WORD} ${form.kind === k ? WORD_ON : WORD_OFF}`}
                >
                  {getPartyKindLabel(k)}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <span className={FIELD_LABEL}>
              {form.kind === 'vendor' ? 'Specialty' : 'Trade'}
            </span>
            <TradeChipRow
              domain={form.kind === 'vendor' ? 'specialty' : 'trade'}
              value={form.trade}
              onChange={(v) => setForm((f) => ({ ...f, trade: v }))}
            />
          </div>

          <div className="mt-1">
            <label className={FIELD_LABEL} htmlFor="rolodex-add-phone">
              Phone
            </label>
            <input
              id="rolodex-add-phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className={UNDERLINE_INPUT}
            />
          </div>

          <div className="mt-3">
            <label className={FIELD_LABEL} htmlFor="rolodex-add-email">
              Email
            </label>
            <input
              id="rolodex-add-email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="optional"
              className={UNDERLINE_INPUT}
            />
          </div>

          {/* The stamp — square, 2px radius, sage fill, a check. Never a switch. */}
          <button
            type="button"
            role="checkbox"
            aria-checked={stamp}
            onClick={() => setStamp((s) => !s)}
            className="mt-5 flex w-full items-start gap-2.5 text-left"
          >
            <span
              aria-hidden
              className="relative top-[3px] inline-flex h-[13px] w-[13px] shrink-0 items-center justify-center rounded-[2px] border-[1.5px] text-[8px] font-bold leading-none"
              style={{
                borderColor: stamp ? 'var(--color-sage)' : 'var(--doc-ink-border)',
                background: stamp ? 'rgba(168,181,160,0.15)' : 'transparent',
                color: 'var(--color-sage)',
              }}
            >
              {stamp ? '✓' : ''}
            </span>
            <span className="min-w-0">
              <span className="block font-heading text-[0.86rem] text-[var(--color-charcoal)]">
                Save to the studio rolodex
              </span>
              <span className="mt-0.5 block text-[0.7rem] text-[var(--color-aged-oak)]">
                so the next project starts with them
              </span>
            </span>
          </button>

          <DocumentActionGroup
            surfaceKey="call-sheet"
            regionKey="rolodex-inline-add"
            className="mt-4 justify-end"
            aria-label="Add someone new"
          >
            <DocumentAction
              actionKey="add-new-person-to-call-sheet"
              variant="primary"
              onClick={() => void addSomeoneNew()}
              disabled={addParty.isPending || addContact.isPending}
              loading={addParty.isPending || addContact.isPending}
              loadingLabel="Adding…"
            >
              Add to the call sheet
            </DocumentAction>
          </DocumentActionGroup>
        </div>
      )}
    </DocSheet>
  );
}
