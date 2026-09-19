'use client';

/**
 * Field party profile (Field Coordination Wave 5) — a paper sheet over the
 * People Room for a GC / sub / installer / receiver (00281). It gathers the
 * whole field relationship in one place:
 *   · a contact card (name / company / trade / phone / email / project),
 *   · the SMS-consent chip (Not asked / Invited / Texting / Opted out),
 *   · the no-auth field link (Copy / Regenerate → create_field_link; the raw
 *     token is shown ONCE at mint, 00283),
 *   · the SMS thread (inbound/outbound bubbles, MMS thumbnails via signed URLs,
 *     template provenance on outbound),
 *   · a "Send text" composer, disabled with explanatory copy until the party
 *     has opted in (consent 'granted').
 *   · F3 — an "Edit" action turns the contact card into a form (Name /
 *     Company / Trade / Phone / Email); Kind and Project stay read-only, and
 *     Save patches only the changed fields via `useUpdateProjectParty`. This
 *     never rewrites a project's historical roster rows — it edits the one
 *     live `project_parties` row this sheet is already open on.
 *
 * Zero shadows (D4); typography-first; the Room beneath never unmounts (D1).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  usePerson,
  usePersonSeat,
  usePartySmsThread,
  useSendPartySms,
  smsResultWords,
  type PartySmsResult,
  useActiveFieldLink,
  useCreateFieldLink,
  useRevokeFieldLink,
  useFieldMediaUrl,
  useProjectRecordedStudio,
  useProjectParties,
  useRecordPartySmsConsent,
  useUpdateProjectParty,
  normalizePartyPhoneForCompare,
  fieldLinkUrl,
  usePartyOptinChallenge,
  usePartyPhoneSuppressed,
  useResendPartyInvite,
  partySmsChipState,
  resendUnavailableReason,
  resendRefusalWords,
  useExplainSmsDelivery,
  smsDeliveryLines,
  PARTY_SMS_CHIP_WORDS,
  FIELD_SMS_DISCLOSURE_VERSION,
  type PartyInviteSource,
  type PartyRole,
  type PartySmsMessage,
  type UpdateProjectPartyPatch,
} from '@patina/supabase';
import {
  ALL_FIELD_TRADES,
  FIELD_TRADE_LABELS,
  SMS_CONSENT_DISPLAY,
  getFieldTradeLabel,
  getPartyKindLabel,
  type SmsConsentStatus,
} from '@patina/types';
import { fmtDay } from '@/lib/document/format';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { RoomSheet } from '../rooms/room-sheet';
import { DocumentAction, DocumentActionRow } from '../document-action';
import { PromoteBand } from './promote-band';

const META =
  'font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';
const EDIT_LABEL =
  'mb-1 block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';
const EDIT_INPUT =
  'w-full rounded-[7px] border border-[var(--color-pearl)] bg-white px-3 py-2 text-[0.82rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none';

const PARTY_WRITE_DENIED = "Only this project's designer can edit its crew.";
const PARTY_WRITE_RACED = "This person's record just changed — refresh to see it.";

/** A zero-row write. `useUpdateProjectParty` ends `.update().select().single()`,
 *  so when RLS's USING clause hides the row from the WRITE, PostgREST updates
 *  nothing and `.single()` returns PGRST116 — not 42501, which needs a WITH
 *  CHECK violation or a missing GRANT, and `project_parties_studio_update`
 *  (00584) uses one predicate for both clauses. The refusal is reachable:
 *  `project_parties_studio_comember_select` (00421) admits an active member of
 *  the project's studio, while the UPDATE policy admits only a co-member of
 *  the project's DESIGNER — so a teammate on a project whose designer has
 *  since left the org reads this sheet and cannot save it. A vanished row
 *  reads the same way, which is why the sentence is chosen by asking the read
 *  side (`saveParty`) rather than by the code alone. */
function isZeroRowWrite(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  const msg =
    err instanceof Error
      ? err.message
      : (((err as { message?: unknown } | null)?.message as string | undefined) ?? '');
  return /PGRST116/i.test(`${typeof code === 'string' ? code : ''} ${msg}`);
}

/** Everything else, in plain words — the same translation idiom
 *  friendlyRolodexError does for the rolodex. 42501 keeps its own leg: an RLS
 *  message or a missing GRANT is a permission refusal however it arrives. */
function friendlyPartyWriteError(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  const msg =
    err instanceof Error
      ? err.message
      : (((err as { message?: unknown } | null)?.message as string | undefined) ?? '');
  const haystack = `${typeof code === 'string' ? code : ''} ${msg}`;
  if (/row-level security|permission denied|42501/i.test(haystack)) {
    return PARTY_WRITE_DENIED;
  }
  return msg || 'Could not save just now. Try again.';
}

function ConsentChip({ status }: { status: string | null | undefined }) {
  const cfg =
    SMS_CONSENT_DISPLAY[(status ?? 'not_asked') as SmsConsentStatus] ??
    SMS_CONSENT_DISPLAY.not_asked;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-[var(--color-pearl)] px-2 py-1 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-mocha)]">
      <span
        aria-hidden
        className={`inline-block h-2 w-2 rounded-full ${cfg.dotClass}`}
      />
      {cfg.label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// THE FIELD LINE BAND (Phase 1, P1-01) — behind `field-line-trades`
//
// Both pieces below are MOUNTED ONLY WHEN THE FLAG IS ON. That is not a style
// choice: their hooks are the only new data this sheet reads, and a sheet that
// read them unconditionally would ask every surface that mounts it for facts
// the trades rail has not been turned on for.
// ═══════════════════════════════════════════════════════════════════════════

/** How the studio heard the yes, in the words a designer would use. */
const RESEND_SOURCE_WORDS: ReadonlyArray<readonly [PartyInviteSource, string]> = [
  ['verbal', 'They said yes on the phone'],
  ['form', 'They said yes on a form'],
  ['kickoff', 'They said yes at the kickoff'],
];

/**
 * Six states, six facts. The word comes from the consent record's verdict, the
 * suppression question and the challenge's own clock — never re-derived from a
 * seat column, which 00594 froze.
 */
function FieldLineConsentChip({
  consent,
  phone,
  partyId,
}: {
  consent: string | null | undefined;
  phone: string | null;
  partyId: string | null;
}) {
  const { data: challenge } = usePartyOptinChallenge(partyId);
  const { data: suppressed } = usePartyPhoneSuppressed(phone);
  const state = partySmsChipState({ consent, suppressed, challenge });
  return (
    <span
      data-testid="field-line-consent-chip"
      className="inline-flex items-center gap-1.5 rounded-[4px] border border-[var(--color-pearl)] px-2 py-1 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-mocha)]"
    >
      {PARTY_SMS_CHIP_WORDS[state]}
    </span>
  );
}

/**
 * "Send again" — the room's one door onto `resend_party_invite` (00644). The
 * reason it is held stands beside it in words rather than as a bare disabled
 * control, and the RPC holds the same line whatever this button does: the floor,
 * the single allowance per question, and the record's own refusals are all
 * enforced there, so a double click produces one text and one refusal.
 */
function FieldLineResendBand({
  partyId,
  projectId,
  consent,
  phone,
  displayName,
}: {
  partyId: string | null;
  projectId: string | null;
  consent: string | null | undefined;
  phone: string | null;
  displayName: string | null;
}) {
  const { data: challenge } = usePartyOptinChallenge(partyId);
  const { data: suppressed } = usePartyPhoneSuppressed(phone);
  const resend = useResendPartyInvite();
  const [source, setSource] = useState<PartyInviteSource>('verbal');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sentAgain, setSentAgain] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    setNote('');
    setError(null);
    setSentAgain(false);
    inFlight.current = false;
  }, [partyId]);

  const held = resendUnavailableReason({ consent, phone, suppressed, challenge });
  const askedAt = challenge?.resent_at ?? challenge?.created_at ?? null;

  const doResend = () => {
    setError(null);
    if (!partyId) return;
    if (!note.trim()) {
      setError('Write down how they said yes before asking again.');
      return;
    }
    // Two presses in one tick read the SAME render's `resend.isPending` (still
    // false), so the pending flag cannot be the latch — a ref can, and it holds
    // before React has re-rendered anything. 00644 remains the authority that
    // matters (an advisory lock and a write-once claim per challenge version, so
    // two calls yield one text and one refusal); this only keeps the room from
    // asking twice for one press.
    if (inFlight.current) return;
    inFlight.current = true;
    resend.mutate(
      { partyId, projectId, evidence: { source, note: note.trim() } },
      {
        onSuccess: () => {
          setSentAgain(true);
          setNote('');
        },
        onError: (e) => setError(resendRefusalWords(e)),
        onSettled: () => {
          inFlight.current = false;
        },
      },
    );
  };

  return (
    <div data-testid="field-line-resend-band">
      <p className="text-[0.74rem] leading-relaxed text-[var(--color-aged-oak)]">
        {askedAt
          ? `Asked ${fmtDay(askedAt)}. Waiting on their reply — they reply YES to start.`
          : 'Waiting on their reply — they reply YES to start.'}
      </p>

      {sentAgain ? (
        <p className="mt-2 text-[0.7rem] leading-relaxed text-[var(--color-mocha)]">
          Asked again. {displayName ?? 'They'} will get one more text.
        </p>
      ) : (
        <>
          <div className="mt-3 rounded border border-[var(--color-pearl)] bg-[var(--color-linen)]/45 p-3">
            <label htmlFor="field-resend-source" className={META}>
              How they said yes
            </label>
            <select
              id="field-resend-source"
              value={source}
              onChange={(e) => setSource(e.target.value as PartyInviteSource)}
              className="mb-3 w-full rounded-[7px] border border-[var(--color-pearl)] bg-white px-3.5 py-2.5 text-[0.82rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
            >
              {RESEND_SOURCE_WORDS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <label htmlFor="field-resend-note" className={META}>
              What happened
            </label>
            <textarea
              id="field-resend-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Where and when they agreed, e.g. said yes on the phone this morning"
              rows={2}
              className="w-full resize-none rounded-[7px] border border-[var(--color-pearl)] bg-white px-3.5 py-2.5 text-[0.82rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
            />
            <p className="mt-2 text-[0.62rem] leading-relaxed text-[var(--color-aged-oak)]">
              Kept with the question: this note, the time, {FIELD_SMS_DISCLOSURE_VERSION}, and
              who recorded it.
            </p>
          </div>

          {error && (
            <p role="alert" className="mt-2 text-[0.7rem] text-[var(--color-terracotta-ink)]">
              {error}
            </p>
          )}

          <p
            id="field-resend-reason"
            className="mt-3 text-[0.7rem] leading-relaxed text-[var(--color-aged-oak)]"
          >
            {held ?? 'They get one more text asking them to reply YES.'}
          </p>
          <DocumentActionRow
            surfaceKey="people"
            regionKey="field-resend-invite"
            className="mt-3"
            aria-label="Ask again actions"
          >
            <DocumentAction
              actionKey="resend-party-invite"
              variant="primary"
              onClick={doResend}
              held={!!held}
              disabled={!!held}
              aria-describedby="field-resend-reason"
              loading={resend.isPending}
              loadingLabel="Sending…"
            >
              Send again
            </DocumentAction>
          </DocumentActionRow>
        </>
      )}
    </div>
  );
}

/**
 * "Why didn’t they get it?" (Phase 1, P1-03) — a DIAGNOSTIC, not a second
 * inbox. Every line is a fact `explain_sms_delivery` (00647) read off a row
 * some other owner wrote; asking changes nothing, and there is no act here at
 * all. Mounted only behind `field-line-trades`, for the same reason the chip
 * and the resend band are: its hook is new data this sheet would otherwise ask
 * every surface for.
 *
 * TWO THINGS THE COPY WILL NOT DO. `delivered` is the carrier's receipt that a
 * handset took the text — it is never printed as "read". And "Copy current
 * link" is not here: the renew path this rail has is INBOUND (00645's
 * replyToRenew), so a fresh link is something the crew's own reply mints, which
 * SMS_NEW_LINK_WORDS says in words instead of offering a button that would
 * hand a live credential to whoever is looking at the screen.
 */
function FieldLineDiagnosticCard({ partyId }: { partyId: string | null }) {
  const { data: explanation, isLoading } = useExplainSmsDelivery(partyId);
  // An empty answer is what a caller outside the studio sees too, so it is
  // never printed as a conclusion — but a load in flight is not an answer at
  // all and says nothing.
  if (isLoading) return null;
  const lines = smsDeliveryLines(explanation ?? null);
  return (
    <section
      data-testid="field-line-diagnostic-card"
      className="mt-5 rounded-[8px] border border-[var(--color-pearl)] bg-white/50 px-4 py-3"
    >
      <div className={META}>Why didn’t they get it?</div>
      <ul className="mt-2 flex flex-col gap-1.5">
        {lines.map((line) => (
          <li
            key={line.key}
            data-testid={`field-line-diagnostic-${line.key}`}
            className="text-[0.74rem] leading-relaxed text-[var(--color-aged-oak)]"
          >
            {line.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One inbound MMS thumbnail — resolves the private field-media path to a
 *  short-lived signed URL. */
function MediaThumb({ path }: { path?: string }) {
  const { data: url } = useFieldMediaUrl(path);
  if (!url) {
    return (
      <span className="inline-block h-14 w-14 rounded-[4px] border border-dashed border-[var(--color-pearl)]" />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Field photo"
      className="h-14 w-14 rounded-[4px] border border-[var(--color-pearl)] object-cover"
    />
  );
}

function Bubble({ message }: { message: PartySmsMessage }) {
  const inbound = message.direction === 'inbound';
  return (
    <div className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}>
      <div className="max-w-[80%]">
        <div
          className={`rounded-[10px] px-3 py-2 text-[0.8rem] leading-relaxed ${
            inbound
              ? 'bg-white text-[var(--color-charcoal)]'
              : 'bg-[var(--color-clay)] text-white'
          } ${message.needs_review ? 'outline outline-[1.5px] outline-offset-[-1.5px] outline-[rgba(232,197,71,0.6)]' : ''}`}
          style={{
            border: inbound ? '1px solid var(--color-pearl)' : undefined,
          }}
        >
          {message.body || <span className="opacity-70">(photo)</span>}
          {message.media.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {message.media.map((m, i) => (
                <MediaThumb key={i} path={m.path} />
              ))}
            </div>
          )}
        </div>
        <div
          className={`mt-0.5 flex items-center gap-1.5 ${inbound ? 'justify-start' : 'justify-end'} ${META}`}
        >
          <span>{fmtDay(message.created_at)}</span>
          {/* Template provenance on outbound — which templated message this was. */}
          {!inbound && message.template_key && (
            <span className="opacity-80">
              · {message.template_key.replace(/_/g, ' ')}
            </span>
          )}
          {message.twilio_status === 'dry_run' && (
            <span className="opacity-80">· dry run</span>
          )}
          {message.needs_review && (
            <span className="text-[var(--color-clay-ink)]">· needs review</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function PartyProfileSheet({
  open,
  partyId,
  role,
  onClose,
}: {
  open: boolean;
  partyId: string | null;
  role: PartyRole;
  onClose: () => void;
}) {
  const { data: person, refetch: refetchPerson } = usePerson(partyId, role);
  // R-BE — THE SEAT READER. `partyId` is a `project_parties.id`, and
  // `people_directory` v4 keys a carded human on their ROLODEX CARD, so
  // `usePerson(<seat id>)` finds nothing for a carded seat. `usePersonSeat`
  // resolves the seat through `people_directory_seats` and joins its identity
  // on `person_id`; the consent WORD comes off that identity's own
  // `consent_status` column and off nothing else.
  const { data: seatResolution, refetch: refetchSeat } = usePersonSeat(partyId);
  const seatIdentity = seatResolution?.identity ?? null;
  /**
   * CR3-1 — THE SEAT IS THE SHEET'S RECORD, and `person` is only its fallback.
   *
   * Every door into this sheet passes a `project_parties.id`: the Call Sheet's
   * row chevron (`call-sheet-mount.tsx`) and the person card's seat line
   * (`people-room.tsx`). Under `people_directory` v4 a carded human is keyed on
   * their ROLODEX CARD, so `usePerson(<seat id>)` resolves NOTHING for a carded
   * seat — twelve of twelve Okonkwo seats are carded — and the sheet opened
   * headed "Field party" with no name, no phone, no trade, no company and no
   * project, "Invite to texts" unreachable for somebody whose number is on the
   * seat, and Edit refusing with "This party isn't attached to a project".
   * `people_directory_seats` carries every one of those facts.
   */
  const seat = seatResolution?.seat ?? null;
  const { data: thread } = usePartySmsThread(open ? partyId : null);
  const { data: activeLink } = useActiveFieldLink(open ? partyId : null);
  const createLink = useCreateFieldLink();
  const revokeLink = useRevokeFieldLink();
  const recordConsent = useRecordPartySmsConsent();

  // Call Sheet Wave 2 — the promote band (slide 10). Gated on the flag AND on
  // finding this party's real project_parties row (the mutation needs the
  // full row, not just the people_directory projection `person` is). The
  // `call-sheet` flag that used to gate both queries is retired (rulings §6);
  // the `open` gate below stays, because the sheet is mounted while closed and
  // an ungated query would fire on every mount.
  // CR3-1: the seat names its own job. `person.project_id` is null for every
  // carded seat, so the promote band's row lookup never resolved either.
  const seatProjectId = seat?.project_id ?? person?.project_id ?? null;
  /**
   * CR-1 — THE STUDIO COMES OFF THE JOB, NEVER OFF A MEMBERSHIP GUESS.
   *
   * This was the last `orgs.find(o => o.type === 'design_studio')?.id ??
   * orgs?.[0]?.id` in the room — the QA-R2-1 / QA-R3-1 defect the r3 sweep
   * fixed everywhere else — and the ONE place the guess drove a WRITE:
   * `usePromoteToStudioContact` INSERTs a `studio_contacts` row at this id and
   * then UPDATEs `project_parties.studio_contact_id` to point at it.
   * `useOrganizations` has no ORDER BY, so for a designer who belongs to two
   * design studios (designer@patina.dev belongs to "Leah Hartwell" and "Local
   * Dev Studio") PostgREST's heap order decided which rolodex the card landed
   * in. When it named the studio the job does not record,
   * `assert_project_party_cards` (00624:646-678) raised
   * `party_studio_contact_other_studio` on the link — and because the two
   * PostgREST calls are not one transaction, the card stayed behind. Pressing
   * again minted a second stray.
   *
   * `project_recorded_studio()` is the resolver that guard checks against, so
   * reading it here is what makes the refusal unreachable: the card is only
   * ever inserted into the rolodex the link will accept. A job that records no
   * studio resolves NULL, `showPromoteBand` is false, and the act is not
   * offered at all rather than minting an orphan the guard will refuse.
   */
  const { data: recordedStudioId } = useProjectRecordedStudio(
    open ? seatProjectId : null,
  );
  const organizationId = recordedStudioId ?? null;
  const { data: projectParties } = useProjectParties(
    open ? seatProjectId : null,
  );
  const linkedParty = useMemo(
    () => projectParties?.find((p) => p.id === partyId) ?? null,
    [projectParties, partyId],
  );
  // "Promoted this session" — tracked here, not derived purely from
  // linkedParty.studio_contact_id, so the confirmation survives the refetch
  // the promote mutation itself triggers (see promote-band.tsx's module doc).
  // Self-clears whenever a different party opens.
  const [justPromotedPartyId, setJustPromotedPartyId] = useState<string | null>(null);
  useEffect(() => {
    setJustPromotedPartyId(null);
  }, [partyId]);
  const showPromoteBand =
    !!partyId &&
    !!organizationId &&
    !!linkedParty &&
    (!linkedParty.studio_contact_id || justPromotedPartyId === partyId);
  // Phase 1's trades rail. Fail-closed: until PostHog answers, this sheet is
  // exactly the sheet Phase 0 shipped.
  const { value: tradesOn } = useFeatureFlag('field-line-trades');

  const [mintedUrl, setMintedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Invite-to-texts (existing parties only — AddPersonSheet owns the
  // create-time path). Self-clears whenever a different party opens, same
  // as the promote band's justPromotedPartyId above.
  const [inviteConsent, setInviteConsent] = useState(false);
  const [inviteSource, setInviteSource] = useState<
    '' | 'verbal' | 'written' | 'web_form' | 'other'
  >('');
  const [inviteEvidence, setInviteEvidence] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  useEffect(() => {
    setInviteConsent(false);
    setInviteSource('');
    setInviteEvidence('');
    setInviteError(null);
  }, [partyId]);

  const meta = (person?.meta ?? {}) as Record<string, unknown>;
  // R-BE — NEVER `status_raw`. On a v4 card row that column carries the
  // rolodex ARCHIVE state and reads `active` for someone the studio's record
  // says `opted_out`; the old fallback chain then printed "Not asked" over a
  // dated refusal the same screen's seat line reads correctly. NULL here means
  // the identity could not be resolved, and the chip below renders nothing.
  const consent = seatResolution?.identity?.consent_status ?? null;
  const granted = consent === 'granted';
  // CR3-1: seat first, then the identity, then the directory projection.
  const displayName = seat?.display_name ?? person?.display_name ?? null;
  const rawTradeToken =
    seat?.trade ?? (meta.trade as string | undefined) ?? '';
  const trade = getFieldTradeLabel(rawTradeToken || undefined);
  const company =
    seat?.company_name ?? (meta.company_name as string | undefined) ?? null;
  const projectName =
    seat?.project_name ?? (meta.project_name as string | undefined) ?? null;
  const phone =
    seat?.phone_e164 ??
    person?.phone ??
    (meta.phone_e164 as string | undefined) ??
    null;
  // The seats view carries no email column; the identity behind the seat does.
  const email = seatIdentity?.email ?? person?.email ?? null;

  const contact: Array<[string, string | null]> = useMemo(
    () => [
      ['Kind', getPartyKindLabel(role)],
      ['Trade', trade || null],
      ['Company', company],
      ['Phone', phone],
      ['Email', email],
      ['Project', projectName],
    ],
    [role, trade, company, phone, email, projectName],
  );

  // F3 — the edit form. Kind and Project are never in this state (read-only
  // in edit mode too); raw meta values feed it, not the humanized `trade`
  // label above, so an untouched field round-trips exactly. Self-clears
  // whenever a different party opens, same as the invite-to-texts state.
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    company: '',
    trade: '',
    phone: '',
    email: '',
  });
  // Has the designer typed into this form yet? Until they have, a late-arriving
  // record is allowed to re-hydrate it (below); once they have, nothing may
  // overwrite what they typed.
  const [editTouched, setEditTouched] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const updateParty = useUpdateProjectParty();
  const editField = (patch: Partial<typeof editForm>) => {
    setEditTouched(true);
    setEditForm((f) => ({ ...f, ...patch }));
  };
  const rawTrade = rawTradeToken;
  // CR3-1: the seat is a record. Gating "Edit" on `person` alone hid the act on
  // every carded seat — which is every seat on the Okonkwo job.
  const recordLoaded = !!seat || !!person;
  useEffect(() => {
    setEditing(false);
    setEditTouched(false);
    setEditError(null);
  }, [partyId]);
  // The snapshot. It re-runs while the form is UNTOUCHED, so a record that
  // resolves after the sheet opened still fills the form — the earlier
  // open-once snapshot took an empty record during the initial fetch and Save
  // then cleared company / trade / phone / email off the row. Once the
  // designer types, `editTouched` freezes it and no refetch can clobber the
  // edit in progress. A record that goes AWAY (a query error that drops the
  // cached row) leaves the last good snapshot standing rather than blanking
  // the open form under the designer.
  useEffect(() => {
    if (!editing || editTouched || !recordLoaded) return;
    setEditForm({
      name: displayName ?? '',
      company: company ?? '',
      trade: rawTrade,
      phone: phone ?? '',
      email: email ?? '',
    });
  }, [
    editing,
    editTouched,
    recordLoaded,
    displayName,
    email,
    company,
    rawTrade,
    phone,
  ]);

  // F3-R2-09's shape, for the field trade: a stored trade can sit outside
  // ALL_FIELD_TRADES (a hand-written value, or one retired from the vocab).
  // Shown as its own option so the select renders what the row holds instead
  // of a blank control that discards it on any unrelated save.
  const outOfVocabTrade =
    rawTrade && !(ALL_FIELD_TRADES as readonly string[]).includes(rawTrade)
      ? rawTrade
      : null;

  // F3-R2-03 — warn before a save that will clear a granted/pending consent:
  // normalized so a cosmetic reformat (spacing, parens, a leading +1) never
  // trips the warning for a number that hasn't actually changed.
  const phoneEditWillRevokeConsent =
    editing &&
    (consent === 'granted' || consent === 'pending') &&
    normalizePartyPhoneForCompare(editForm.phone) !== normalizePartyPhoneForCompare(phone);

  const saveParty = async () => {
    if (!partyId) return;
    setEditError(null);
    // CR3-1: the seat names the job. Asking `person.project_id` refused EVERY
    // carded seat, which is the whole shipped population.
    if (!seatProjectId) {
      setEditError(
        "This party isn't attached to a project — reopen it from the roster.",
      );
      return;
    }
    const trimmedName = editForm.name.trim();
    if (!trimmedName) {
      setEditError('This party needs a name.');
      return;
    }
    const originalCompany = company ?? '';
    const originalTrade = rawTrade;
    const trimmedCompany = editForm.company.trim();
    const trimmedTrade = editForm.trade.trim();
    const trimmedPhone = editForm.phone.trim();
    const trimmedEmail = editForm.email.trim();

    const patch: UpdateProjectPartyPatch = {};
    if (trimmedName !== (displayName ?? '')) patch.displayName = trimmedName;
    if (trimmedCompany !== originalCompany) patch.companyName = trimmedCompany || null;
    if (trimmedTrade !== originalTrade) patch.trade = trimmedTrade || null;
    // F3-R2-03 — compare normalized numbers, not raw strings: a cosmetic
    // reformat of the same phone must not read as a change and silently
    // revoke a granted/pending consent (useUpdateProjectParty reverts
    // consent on any `patch.phone`, whatever the actual digits are).
    if (normalizePartyPhoneForCompare(trimmedPhone) !== normalizePartyPhoneForCompare(phone))
      patch.phone = trimmedPhone || null;
    if (trimmedEmail !== (email ?? '')) patch.email = trimmedEmail || null;

    if (Object.keys(patch).length === 0) {
      setEditing(false);
      setEditTouched(false);
      return;
    }
    try {
      await updateParty.mutateAsync({
        id: partyId,
        projectId: seatProjectId,
        patch,
      });
      setEditing(false);
      setEditTouched(false);
    } catch (e) {
      if (isZeroRowWrite(e)) {
        // Zero rows matched: the row is either hidden from the write or gone.
        // The read side is the only thing that can tell them apart — if it
        // still returns the record, the refusal was authority, not a race.
        let stillReadable = true;
        try {
          // CR3-1: ask the SEAT as well. A carded seat has no `person` row at
          // all, so asking the directory alone read every refusal as a race.
          const [{ data: freshSeat }, { data: freshPerson }] = await Promise.all(
            [refetchSeat(), refetchPerson()],
          );
          stillReadable = !!freshSeat?.seat || !!freshPerson;
        } catch {
          // The read failed too. Say the reachable thing rather than guess.
        }
        setEditError(stillReadable ? PARTY_WRITE_DENIED : PARTY_WRITE_RACED);
        return;
      }
      setEditError(friendlyPartyWriteError(e));
    }
  };

  const mint = async () => {
    if (!partyId) return;
    setLinkError(null);
    try {
      // CR11-9: the roster reads by project, so the mint must name it — the
      // revoke below already does. Without it `['project-roster', projectId]`
      // is never invalidated and the Call Sheet keeps reading "On paper".
      const { token } = await createLink.mutateAsync({
        partyId,
        revokePrior: true,
        projectId: seatProjectId ?? undefined,
      });
      const url = fieldLinkUrl(token);
      setMintedUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2500);
      } catch {
        /* clipboard blocked — the URL is shown for manual copy */
      }
    } catch (e) {
      setLinkError(
        e instanceof Error ? e.message : 'Could not mint a link just now.',
      );
    }
  };

  const revoke = async () => {
    if (!partyId || !activeLink) return;
    setLinkError(null);
    try {
      // CR-5: the roster reads by project, so the revoke must name it or the
      // rows behind this sheet keep printing reach `Field link`.
      await revokeLink.mutateAsync({
        tokenId: activeLink.id,
        partyId,
        projectId: seatProjectId,
      });
      setMintedUrl(null);
    } catch (e) {
      setLinkError(
        e instanceof Error ? e.message : 'Could not revoke the link.',
      );
    }
  };

  const doInvite = () => {
    if (!partyId) return;
    setInviteError(null);
    if (!phone?.trim()) {
      setInviteError('Texting updates needs a phone number — add one first.');
      return;
    }
    if (!inviteSource || !inviteEvidence.trim()) {
      setInviteError(
        'Record how and where they gave prior consent before sending a text.',
      );
      return;
    }
    recordConsent.mutate(
      {
        partyId,
        // The record is the studio's, resolved from the project — so the hook
        // needs the job, not just the seat (R-AS). The seat's own project is
        // the one the consent was collected on.
        projectId: linkedParty?.project_id ?? seatProjectId ?? '',
        phone,
        smsConsentSource: inviteSource,
        smsConsentEvidence: inviteEvidence.trim(),
      },
      {
        onSuccess: () => {
          setInviteConsent(false);
          setInviteSource('');
          setInviteEvidence('');
        },
        onError: (e) =>
          setInviteError(
            e instanceof Error ? e.message : 'Could not invite them just now.',
          ),
      },
    );
  };

  return (
    <RoomSheet open={open} onClose={onClose} title="Field party">
      <div className={META}>Field crew · {getPartyKindLabel(role)}</div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-[1.6rem] font-medium text-[var(--color-charcoal)]">
          {displayName ?? 'Field party'}
        </h2>
        {/* No chip when the identity did not resolve. people_directory v4
            keys a carded human on their rolodex card, so usePerson(<seat id>,
            <party_kind>) finds no row for a stamped seat and `consent` falls
            back to 'not_asked' — the sheet printed "Not asked" over a record
            that says opted_out (w1b final review r7 MAJOR-2). R-BE owes W2 the
            repoint: read people_directory_seats for the seat, join the
            identity on person_id, and take the word from consent_status. Until
            then the sheet says nothing rather than the affirmative-adjacent
            word. */}
        {/* No identity, no consent chip (R-BE). An absent record is its own
            fact and must not print as a word. */}
        {seatIdentity ? (
          tradesOn ? (
            <FieldLineConsentChip consent={consent} phone={phone} partyId={partyId} />
          ) : (
            <ConsentChip status={consent} />
          )
        ) : null}
      </div>

      {/* Promote band (Call Sheet Wave 2, slide 10) — only when this party
          isn't (yet) in the studio rolodex and the flag is on. */}
      {showPromoteBand && linkedParty && organizationId && (
        <PromoteBand
          organizationId={organizationId}
          party={linkedParty}
          promoted={justPromotedPartyId === partyId}
          onPromoted={() => setJustPromotedPartyId(partyId)}
        />
      )}

      {/* Contact card — F3 turns into an edit form behind "Edit". Kind and
          Project are read-only in both states. */}
      {editing ? (
        <div className="mt-4 space-y-3 border-y border-[var(--color-pearl)] py-3">
          <p className={META}>
            {getPartyKindLabel(role)}
            {projectName ? ` · ${projectName}` : ''}
          </p>
          <div>
            <label className={EDIT_LABEL} htmlFor="party-edit-name">
              Name
            </label>
            <input
              id="party-edit-name"
              value={editForm.name}
              onChange={(e) => editField({ name: e.target.value })}
              className={EDIT_INPUT}
            />
          </div>
          <div>
            <label className={EDIT_LABEL} htmlFor="party-edit-company">
              Company
            </label>
            <input
              id="party-edit-company"
              value={editForm.company}
              onChange={(e) => editField({ company: e.target.value })}
              className={EDIT_INPUT}
            />
          </div>
          <div>
            <label className={EDIT_LABEL} htmlFor="party-edit-trade">
              Trade
            </label>
            <select
              id="party-edit-trade"
              value={editForm.trade}
              onChange={(e) => editField({ trade: e.target.value })}
              className={EDIT_INPUT}
            >
              <option value="">Which trade…</option>
              {outOfVocabTrade && (
                <option value={outOfVocabTrade}>{outOfVocabTrade}</option>
              )}
              {ALL_FIELD_TRADES.map((t) => (
                <option key={t} value={t}>
                  {FIELD_TRADE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={EDIT_LABEL} htmlFor="party-edit-phone">
              Phone
            </label>
            <input
              id="party-edit-phone"
              type="tel"
              value={editForm.phone}
              onChange={(e) => editField({ phone: e.target.value })}
              className={EDIT_INPUT}
            />
            {phoneEditWillRevokeConsent && (
              <p className="mt-1.5 text-[0.7rem] leading-relaxed text-[var(--color-terracotta-ink)]">
                Changing the number clears their texting opt-in — you&rsquo;ll
                need to record consent again.
              </p>
            )}
          </div>
          <div>
            <label className={EDIT_LABEL} htmlFor="party-edit-email">
              Email
            </label>
            <input
              id="party-edit-email"
              type="email"
              value={editForm.email}
              onChange={(e) => editField({ email: e.target.value })}
              className={EDIT_INPUT}
            />
          </div>
          {editError && (
            <p className="text-[0.7rem] text-[var(--color-terracotta-ink)]">{editError}</p>
          )}
          <DocumentActionRow
            surfaceKey="people"
            regionKey="party-details-editor"
            aria-label="Field party edit actions"
          >
            <DocumentAction
              actionKey="save-party-details"
              variant="primary"
              onClick={() => void saveParty()}
              loading={updateParty.isPending}
              loadingLabel="Saving…"
            >
              Save
            </DocumentAction>
            <DocumentAction
              actionKey="cancel-party-details"
              variant="tertiary"
              onClick={() => {
                setEditing(false);
                setEditTouched(false);
              }}
            >
              Cancel
            </DocumentAction>
          </DocumentActionRow>
        </div>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-y border-[var(--color-pearl)] py-3">
            {contact
              .filter(([, v]) => !!v)
              .map(([label, value]) => (
                <div key={label}>
                  <dt className={META}>{label}</dt>
                  <dd className="text-[0.82rem] text-[var(--color-charcoal)]">
                    {value}
                  </dd>
                </div>
              ))}
          </dl>
          {/* Only once the record has resolved: opening Edit mid-fetch used
              to snapshot an empty form, and Save then cleared company, trade,
              phone and email off the row. */}
          {recordLoaded && (
            <DocumentAction
              actionKey="edit-party-details"
              surfaceKey="people"
              regionKey="party-contact-card"
              variant="secondary"
              onClick={() => setEditing(true)}
              className="mt-2"
            >
              Edit
            </DocumentAction>
          )}
        </>
      )}

      {/* Field link — the no-auth "what's on me" link for the field party. */}
      <section className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className={META}>Field link</span>
          {activeLink && (
            <DocumentAction
              actionKey="revoke-field-link"
              surfaceKey="people"
              regionKey="field-link"
              variant="tertiary"
              onClick={() => void revoke()}
              loading={revokeLink.isPending}
              loadingLabel="Revoking…"
              className="text-[var(--color-terracotta-ink)] decoration-[var(--color-terracotta)]"
            >
              Revoke
            </DocumentAction>
          )}
        </div>
        <p
          id="field-link-consequence"
          className="mb-2 text-[0.72rem] leading-relaxed text-[var(--color-aged-oak)]"
        >
          A no-login link to their tasks and punch list — big-thumb Done /
          Problem, no account needed.{' '}
          {activeLink
            ? `A link is live${activeLink.last_used_at ? ` · last opened ${fmtDay(activeLink.last_used_at)}` : ''}.`
            : 'No link yet.'}
        </p>
        {mintedUrl && (
          <div className="mb-2 rounded-[6px] border border-[var(--color-sage)] bg-[rgba(133,148,124,0.07)] px-3 py-2">
            <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.06em] text-[#6f8268]">
              {copied
                ? 'Copied to clipboard · shown once'
                : 'Copy now — shown once'}
            </p>
            <p className="break-all font-mono text-[0.68rem] text-[var(--color-charcoal)]">
              {mintedUrl}
            </p>
          </div>
        )}
        <DocumentAction
          actionKey="mint-field-link"
          surfaceKey="people"
          regionKey="field-link"
          variant="primary"
          onClick={() => void mint()}
          held={!partyId}
          disabled={!partyId}
          aria-describedby="field-link-consequence"
          loading={createLink.isPending}
          loadingLabel="Minting…"
        >
          {activeLink || mintedUrl
            ? 'Regenerate field link'
            : 'Copy field link'}
        </DocumentAction>
        {linkError && (
          <p className="mt-1.5 text-[0.7rem] text-[var(--color-terracotta-ink)]">
            {linkError}
          </p>
        )}
      </section>

      {/* SMS thread */}
      <section className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <span className={META}>Texts</span>
        </div>
        {(thread ?? []).length === 0 ? (
          <p className="rounded-[8px] border border-dashed border-[var(--color-pearl)] bg-white/40 px-4 py-6 text-center text-[0.74rem] text-[var(--color-aged-oak)]">
            No texts yet.{' '}
            {granted
              ? 'Send the first one below.'
              : 'They’ll appear here once this party opts in.'}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {(thread ?? []).map((m) => (
              <Bubble key={m.id} message={m} />
            ))}
          </div>
        )}
      </section>

      {/* Why didn’t they get it? (P1-03) — behind `field-line-trades`. */}
      {tradesOn && <FieldLineDiagnosticCard key={partyId} partyId={partyId} />}

      {/* Composer */}
      <section className="mt-4 border-t border-[var(--color-pearl)] pt-3">
        {granted ? (
          <PartySmsComposer key={partyId} partyId={partyId} thread={thread} />
        ) : consent === 'pending' ? (
          tradesOn ? (
            <FieldLineResendBand
              key={partyId}
              partyId={partyId}
              projectId={seatProjectId}
              consent={consent}
              phone={phone}
              displayName={displayName}
            />
          ) : (
            <p className="rounded-[7px] border border-[var(--color-pearl)] bg-white/50 px-3 py-2.5 text-[0.74rem] leading-relaxed text-[var(--color-aged-oak)]">
              Invite sent — waiting on their reply. You can text them once they
              reply YES.
            </p>
          )
        ) : consent === 'opted_out' ? (
          <p className="rounded-[7px] border border-[var(--color-pearl)] bg-white/50 px-3 py-2.5 text-[0.74rem] leading-relaxed text-[var(--color-aged-oak)]">
            They opted out by text. Only they can rejoin by replying START.
          </p>
        ) : consent === 'not_asked' && phone ? (
          <div>
            <p className="mb-2.5 text-[0.74rem] leading-relaxed text-[var(--color-aged-oak)]">
              Invite {displayName ?? 'them'} to texts — they get a
              confirmation to reply YES before anything sends.
            </p>
            <label className="flex cursor-pointer items-start gap-2.5 text-[0.74rem] text-[var(--color-mocha)]">
              <input
                type="checkbox"
                checked={inviteConsent}
                onChange={(e) => setInviteConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer rounded border-[var(--color-pearl)] accent-[var(--color-clay)]"
              />
              <span>
                They gave prior express consent for text updates
                <span className="mt-0.5 block text-[0.64rem] text-[var(--color-aged-oak)]">
                  Optional and never preselected. They agreed to Patina
                  project texts (~1/day, rates may apply, reply STOP to quit).
                </span>
              </span>
            </label>

            {inviteConsent && (
              <div className="mt-3 rounded border border-[var(--color-pearl)] bg-[var(--color-linen)]/45 p-3">
                <label htmlFor="invite-consent-source" className={META}>
                  How consent was given
                </label>
                <select
                  id="invite-consent-source"
                  value={inviteSource}
                  onChange={(e) =>
                    setInviteSource(
                      e.target.value as
                        | ''
                        | 'verbal'
                        | 'written'
                        | 'web_form'
                        | 'other',
                    )
                  }
                  className="mb-3 w-full rounded-[7px] border border-[var(--color-pearl)] bg-white px-3.5 py-2.5 text-[0.82rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
                >
                  <option value="">Choose a method…</option>
                  <option value="verbal">Verbal agreement</option>
                  <option value="written">Written agreement</option>
                  <option value="web_form">Website or form</option>
                  <option value="other">Other documented consent</option>
                </select>

                <label htmlFor="invite-consent-evidence" className={META}>
                  Consent record
                </label>
                <textarea
                  id="invite-consent-evidence"
                  value={inviteEvidence}
                  onChange={(e) => setInviteEvidence(e.target.value)}
                  placeholder="Where and when they agreed, e.g. signed site kickoff form on Aug 8"
                  rows={3}
                  className="w-full resize-none rounded-[7px] border border-[var(--color-pearl)] bg-white px-3.5 py-2.5 text-[0.82rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
                />
                <p className="mt-2 text-[0.62rem] leading-relaxed text-[var(--color-aged-oak)]">
                  Keep the underlying form, message, or signed record. Patina
                  stores this note, time, disclosure version, and the person
                  recording it.
                </p>
              </div>
            )}

            {inviteError && (
              <p
                role="alert"
                className="mt-2 text-[0.7rem] text-[var(--color-terracotta-ink)]"
              >
                {inviteError}
              </p>
            )}

            {/* §A5 "held" — the reason stands beside the act and is reachable
                by keyboard, which a native `disabled` would have removed from
                the tab order along with its own explanation. */}
            <p
              id="field-invite-reason"
              className="mt-3 text-[0.7rem] leading-relaxed text-[var(--color-aged-oak)]"
            >
              Tick the consent box above first. Patina never texts somebody the
              studio has not recorded consent for.
            </p>
            <DocumentActionRow
              surfaceKey="people"
              regionKey="field-invite-to-texts"
              className="mt-3"
              aria-label="Invite to texts actions"
            >
              <DocumentAction
                actionKey="invite-party-to-texts"
                variant="primary"
                onClick={doInvite}
                held={!inviteConsent}
                disabled={!inviteConsent}
                aria-describedby="field-invite-reason"
                loading={recordConsent.isPending}
                loadingLabel="Inviting…"
              >
                Invite to texts
              </DocumentAction>
            </DocumentActionRow>
          </div>
        ) : (
          <p className="rounded-[7px] border border-[var(--color-pearl)] bg-white/50 px-3 py-2.5 text-[0.74rem] leading-relaxed text-[var(--color-aged-oak)]">
            Add a phone number to invite this party to texts.
          </p>
        )}
      </section>
    </RoomSheet>
  );
}


/** Keyed by party in the sheet: an in-flight response cannot clear another draft. */
export function PartySmsComposer({ partyId, thread }: { partyId: string | null; thread?: PartySmsMessage[] }) {
  const send = useSendPartySms();
  const [body, setBody] = useState('');
  const [receipt, setReceipt] = useState<PartySmsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const draft = useRef<HTMLTextAreaElement>(null);
  const pending = useRef(false);
  const deferred = receipt?.status === 'deferred';
  const deferredMessage = deferred ? thread?.find((message) => message.id === receipt.id) : null;
  const deferredFailure = deferredMessage && ['failed', 'undelivered', 'suppressed', 'expired'].includes(deferredMessage.twilio_status ?? '')
    ? smsResultWords({ status: 'failed', provider_code: deferredMessage.error_code ?? undefined,
        reason: deferredMessage.twilio_status === 'suppressed' ? 'suppressed' : undefined }) : null;
  useEffect(() => {
    if (!deferred || !receipt?.id) return;
    const status = thread?.find((m) => m.id === receipt.id)?.twilio_status;
    if (status === 'sent' || status === 'queued' || status === 'delivered') {
      setBody('');
      setReceipt({ ...receipt, status: status === 'queued' ? 'queued' : 'sent' });
    }
  }, [thread, deferred, receipt]);
  const doSend = async () => {
    if (!partyId || !body.trim() || pending.current || deferred) return;
    pending.current = true;
    setError(null);
    setReceipt(null);
    try {
      const result = await send.mutateAsync({ partyId, body: body.trim() });
      setReceipt(result);
      if (result.status === 'sent' || result.status === 'queued') setBody('');
      else if (result.status === 'failed') draft.current?.focus();
    } catch {
      setError("Couldn't confirm the send. Your draft is still here.");
      draft.current?.focus();
    } finally { pending.current = false; }
  };
  return (
    <div data-message-id={receipt?.id}>
      <textarea ref={draft} rows={2} value={body} readOnly={deferred || send.isPending}
        onChange={(event) => setBody(event.target.value)} aria-label="Send a text"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void doSend();
          }
        }}
        className="w-full resize-none rounded-[7px] border border-[var(--color-pearl)] bg-white px-3 py-2 text-[0.82rem] text-[var(--color-charcoal)]" />
      <DocumentActionRow surfaceKey="people" regionKey="field-text-composer" aria-label="Field text actions">
        {!deferred && <DocumentAction actionKey="send-field-text" variant="primary" onClick={() => void doSend()}
          disabled={!body.trim() || send.isPending} loading={send.isPending} loadingLabel="Sending…">Send text</DocumentAction>}
        {(receipt || error) && <p role={error || receipt?.status === 'failed' ? 'alert' : 'status'}>
          {error ?? deferredFailure ?? (receipt ? smsResultWords(receipt) : '')}
        </p>}
      </DocumentActionRow>
    </div>
  );
}
