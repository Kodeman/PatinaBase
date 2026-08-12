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
 *
 * Zero shadows (D4); typography-first; the Room beneath never unmounts (D1).
 */

import { useEffect, useMemo, useState } from 'react';
import {
  usePerson,
  usePartySmsThread,
  useSendPartySms,
  useActiveFieldLink,
  useCreateFieldLink,
  useRevokeFieldLink,
  useFieldMediaUrl,
  useOrganizations,
  useProjectParties,
  useRecordPartySmsConsent,
  fieldLinkUrl,
  type PartyRole,
  type PartySmsMessage,
} from '@patina/supabase';
import {
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
  'font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';

function ConsentChip({ status }: { status: string | null | undefined }) {
  const cfg =
    SMS_CONSENT_DISPLAY[(status ?? 'not_asked') as SmsConsentStatus] ??
    SMS_CONSENT_DISPLAY.not_asked;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-[var(--color-pearl)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--color-mocha)]">
      <span
        aria-hidden
        className={`inline-block h-2 w-2 rounded-full ${cfg.dotClass}`}
      />
      {cfg.label}
    </span>
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
            <span className="text-[var(--color-clay)]">· needs review</span>
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
  const { data: person } = usePerson(partyId, role);
  const { data: thread } = usePartySmsThread(open ? partyId : null);
  const { data: activeLink } = useActiveFieldLink(open ? partyId : null);
  const createLink = useCreateFieldLink();
  const revokeLink = useRevokeFieldLink();
  const send = useSendPartySms();
  const recordConsent = useRecordPartySmsConsent();

  // Call Sheet Wave 2 — the promote band (slide 10). Gated on the flag AND on
  // finding this party's real project_parties row (the mutation needs the
  // full row, not just the people_directory projection `person` is). Both
  // queries below are flag-disabled rather than merely flag-unused — the
  // sheet stays mounted while closed (see the `open` gate on
  // useProjectParties), so an ungated query would fire on every mount
  // regardless of whether the promote band can ever render, flag on or not.
  const { value: callSheetOn } = useFeatureFlag('call-sheet');
  const { data: orgs } = useOrganizations({ enabled: callSheetOn });
  const organizationId = useMemo(
    () => orgs?.find((o) => o.type === 'design_studio')?.id ?? orgs?.[0]?.id ?? null,
    [orgs],
  );
  const { data: projectParties } = useProjectParties(
    callSheetOn && open ? person?.project_id : null,
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
    callSheetOn &&
    !!partyId &&
    !!organizationId &&
    !!linkedParty &&
    (!linkedParty.studio_contact_id || justPromotedPartyId === partyId);

  const [mintedUrl, setMintedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [body, setBody] = useState('');
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
  const consent = (person?.status_raw ??
    (meta.sms_consent_status as string) ??
    'not_asked') as string;
  const granted = consent === 'granted';
  const trade = getFieldTradeLabel(meta.trade as string | undefined);
  const company = (meta.company_name as string | undefined) ?? null;
  const projectName = (meta.project_name as string | undefined) ?? null;
  const phone =
    person?.phone ?? (meta.phone_e164 as string | undefined) ?? null;

  const contact: Array<[string, string | null]> = useMemo(
    () => [
      ['Kind', getPartyKindLabel(role)],
      ['Trade', trade || null],
      ['Company', company],
      ['Phone', phone],
      ['Email', person?.email ?? null],
      ['Project', projectName],
    ],
    [role, trade, company, phone, person?.email, projectName],
  );

  const mint = async () => {
    if (!partyId) return;
    setLinkError(null);
    try {
      const { token } = await createLink.mutateAsync({ partyId });
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
      await revokeLink.mutateAsync({ tokenId: activeLink.id, partyId });
      setMintedUrl(null);
    } catch (e) {
      setLinkError(
        e instanceof Error ? e.message : 'Could not revoke the link.',
      );
    }
  };

  const doSend = () => {
    if (!partyId || !body.trim()) return;
    send.mutate(
      { partyId, body: body.trim() },
      { onSuccess: () => setBody('') },
    );
  };

  const doInvite = () => {
    if (!partyId || !person?.project_id) return;
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
        projectId: person.project_id,
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
          {person?.display_name ?? 'Field party'}
        </h2>
        <ConsentChip status={consent} />
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

      {/* Contact card */}
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
              className="text-[var(--color-terracotta)] decoration-[var(--color-terracotta)]"
            >
              Revoke
            </DocumentAction>
          )}
        </div>
        <p className="mb-2 text-[0.72rem] leading-relaxed text-[var(--color-aged-oak)]">
          A no-login link to their tasks and punch list — big-thumb Done /
          Problem, no account needed.{' '}
          {activeLink
            ? `A link is live${activeLink.last_used_at ? ` · last opened ${fmtDay(activeLink.last_used_at)}` : ''}.`
            : 'No link yet.'}
        </p>
        {mintedUrl && (
          <div className="mb-2 rounded-[6px] border border-[var(--color-sage)] bg-[rgba(133,148,124,0.07)] px-3 py-2">
            <p className="mb-1 font-mono text-[8px] uppercase tracking-[0.06em] text-[#6f8268]">
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
          disabled={createLink.isPending || !partyId}
          loading={createLink.isPending}
          loadingLabel="Minting…"
        >
          {activeLink || mintedUrl
            ? 'Regenerate field link'
            : 'Copy field link'}
        </DocumentAction>
        {linkError && (
          <p className="mt-1.5 text-[0.7rem] text-[var(--color-terracotta)]">
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

      {/* Composer */}
      <section className="mt-4 border-t border-[var(--color-pearl)] pt-3">
        {granted ? (
          <>
            <textarea
              rows={2}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Send a text…"
              aria-label="Send a text"
              className="w-full resize-none rounded-[7px] border border-[var(--color-pearl)] bg-white px-3 py-2 text-[0.82rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
            />
            <DocumentActionRow
              surfaceKey="people"
              regionKey="field-text-composer"
              className="mt-1.5"
              aria-label="Field text actions"
            >
              <DocumentAction
                actionKey="send-field-text"
                variant="primary"
                onClick={doSend}
                disabled={!body.trim() || send.isPending}
                loading={send.isPending}
                loadingLabel="Sending…"
              >
                Send text
              </DocumentAction>
              {send.isError && (
                <span className="text-[0.7rem] text-[var(--color-terracotta)]">
                  {send.error instanceof Error
                    ? send.error.message
                    : 'Send failed'}
                </span>
              )}
            </DocumentActionRow>
          </>
        ) : consent === 'pending' ? (
          <p className="rounded-[7px] border border-[var(--color-pearl)] bg-white/50 px-3 py-2.5 text-[0.74rem] leading-relaxed text-[var(--color-aged-oak)]">
            Invite sent — waiting on their reply. You can text them once they
            reply YES.
          </p>
        ) : consent === 'opted_out' ? (
          <p className="rounded-[7px] border border-[var(--color-pearl)] bg-white/50 px-3 py-2.5 text-[0.74rem] leading-relaxed text-[var(--color-aged-oak)]">
            They opted out by text. Only they can rejoin by replying START.
          </p>
        ) : phone ? (
          <div>
            <p className="mb-2.5 text-[0.74rem] leading-relaxed text-[var(--color-aged-oak)]">
              Invite {person?.display_name ?? 'them'} to texts — they get a
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
                <label className={META}>How consent was given</label>
                <select
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
                  aria-label="SMS consent method"
                >
                  <option value="">Choose a method…</option>
                  <option value="verbal">Verbal agreement</option>
                  <option value="written">Written agreement</option>
                  <option value="web_form">Website or form</option>
                  <option value="other">Other documented consent</option>
                </select>

                <label className={META}>Consent record</label>
                <textarea
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
              <p className="mt-2 text-[0.7rem] text-[var(--color-terracotta)]">
                {inviteError}
              </p>
            )}

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
                disabled={!inviteConsent || recordConsent.isPending}
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
