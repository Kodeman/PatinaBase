'use client';

/**
 * Brief section (active for lead-shaped engagements, R1). The lead's stats,
 * ask, and match reasons, plus — Track 6 / R61 / R65 — the captured contact
 * (name · email · phone, 00583), the source, and the inline Accept / Nurture /
 * Pass triage. The triage shows while
 * a lead is actionable: new / viewed AND nurtured ('contacted'), so a
 * reconnect-due lead can convert / re-date / pass instead of dead-ending. Only
 * accepted or declined leads read as a terminal record.
 */

import { useEffect, useRef, useState } from 'react';
import { useLead } from '@patina/supabase';
import { ACT_LANDING_EVENTS } from '@/lib/document/act-names';
import { fmtDay } from '@/lib/document/format';
import { formatBudgetRange, formatTimeline } from '@/lib/document/brief-chips';
import { TriageBar } from './triage-bar';
import { BriefScanStrip } from './brief-scan-strip';
import { SectionLoadingLine } from './section-loading-line';
import { DocumentAction, DocumentActionRow } from './document-action';
import { scrollIntoRevealed } from '@/lib/document/paper-reveal';

/** One fact (US-28 S9): a `dt`/`dd` pair, never a boxed tile. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

const pretty = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function BriefSection({
  leadId,
  onEyebrow,
}: {
  leadId: string;
  /** W5-R2 item 4 — the brief's own inline `<h2>` and its "Respond by …" /
   *  "Reconnect …" sub-label are retired; the region's single head
   *  (`PreworkRegion` → `RegionHead`) is the only head. The sub-label names a
   *  distinct fact (a date), not the region's name, so it moves up into the
   *  head's eyebrow slot via this report-up — the same shape `onDamagedOn`
   *  and its siblings already use on this page. */
  onEyebrow?: (text: string | null) => void;
}) {
  const { data: lead, isLoading, isError, refetch } = useLead(leadId) as {
    data: Record<string, any> | undefined;
    isLoading: boolean;
    isError: boolean;
    refetch: () => unknown;
  };

  const eyebrow =
    lead?.response_deadline
      ? lead.status === 'contacted'
        ? `Reconnect ${fmtDay(lead.response_deadline)}`
        : `Respond by ${fmtDay(lead.response_deadline)}`
      : null;
  useEffect(() => {
    onEyebrow?.(eyebrow);
  }, [eyebrow, onEyebrow]);

  // US-25 fix-now 14 — `Respond to the inquiry` opens a reply draft to the
  // lead's contact, here on the paper. Nothing is sent from Patina: the draft's
  // second named control hands it to her own mail, where she presses send.
  const replyEmail: string | null =
    lead?.homeowner?.email ?? lead?.contact_email ?? null;
  const replyName: string | null =
    lead?.homeowner?.full_name ?? lead?.contact_name ?? null;
  const replyOpenable =
    Boolean(replyEmail) &&
    (lead?.status === 'new' || lead?.status === 'viewed' || lead?.status === 'contacted');
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const replyRef = useRef<HTMLTextAreaElement | null>(null);
  const draftRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!replyOpenable) return;
    const onLand = (event: Event) => {
      event.preventDefault();
      setReplying(true);
      requestAnimationFrame(() => {
        scrollIntoRevealed(draftRef.current, { block: 'center' });
        replyRef.current?.focus({ preventScroll: true });
      });
    };
    window.addEventListener(ACT_LANDING_EVENTS.inquiryReply, onLand);
    return () => window.removeEventListener(ACT_LANDING_EVENTS.inquiryReply, onLand);
  }, [replyOpenable]);

  if (isLoading) {
    return <SectionLoadingLine label="Opening the brief" className="py-3" />;
  }
  if (isError) {
    return (
      <div role="alert" className="t-body-sm py-3">
        <p>The original brief could not be read.</p>
        <DocumentActionRow surfaceKey="brief" regionKey="read-retry">
          <DocumentAction actionKey="retry-original-brief" variant="secondary" onClick={() => void refetch()}>
            Retry original brief
          </DocumentAction>
        </DocumentActionRow>
      </div>
    );
  }
  if (!lead) {
    return <p className="t-body-sm py-3 text-[var(--text-muted)]">Brief unavailable.</p>;
  }

  // The captured contact — a joined Patina homeowner if the prospect has a
  // profile, otherwise the designer-entered contact name/email.
  const contactName: string | null =
    lead.homeowner?.full_name ?? lead.contact_name ?? null;
  const contactEmail: string | null =
    lead.homeowner?.email ?? lead.contact_email ?? null;
  // Phone resolves profile-first, the order the name and email above already
  // use, so one printed line never pairs a profile name with a captured number
  // (00583). `homeowner.phone` is selected by useLead. people_directory's lead
  // branch now reads the PHONE profile-first too (00589), while its name and
  // email stay captured-first — so the directory row can pair a captured name
  // with this same number, and this line is the one both surfaces agree on.
  const contactPhone: string | null =
    lead.homeowner?.phone ?? lead.contact_phone ?? null;

  // The source — the captured "Where from" (R65, `leads.source`) when present;
  // otherwise derived honestly from what the row carries (a joined homeowner
  // means an inbound Patina prospect; else the designer captured it).
  const source =
    lead.source ?? (lead.homeowner_id ? 'Inbound via Patina' : 'Captured by you');

  // R61/R65 — act while the lead is live: new/viewed, and again once nurtured
  // ('contacted') so a reconnect-due lead can convert / re-date / pass rather
  // than dead-end. The header already carries the reconnect date for context.
  // Only accepted/declined are terminal records.
  const triageable =
    lead.status === 'new' || lead.status === 'viewed' || lead.status === 'contacted';

  return (
    <section>
      {/* The captured contact — who reached out, and how they came in. */}
      {(contactName || contactEmail || contactPhone) && (
        <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--color-pearl)] pb-3">
          <p className="text-[13px] text-[var(--color-charcoal)]">
            {contactName && <span className="font-medium">{contactName}</span>}
            {contactName && (contactEmail || contactPhone) && (
              <span className="text-[var(--text-muted)]"> · </span>
            )}
            {contactEmail && <span className="text-[var(--text-muted)]">{contactEmail}</span>}
            {contactEmail && contactPhone && (
              <span className="text-[var(--text-muted)]"> · </span>
            )}
            {contactPhone && <span className="text-[var(--text-muted)]">{contactPhone}</span>}
          </p>
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
            {source}
          </span>
        </div>
      )}

      {replying && replyOpenable && replyEmail && (
        <div
          ref={draftRef}
          role="group"
          aria-label={`Reply to ${replyName ?? replyEmail}`}
          data-inquiry-reply-draft
          className="mb-3.5 rounded-[4px] border border-[var(--color-pearl)] px-3 py-2.5"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              setReplying(false);
            }
          }}
        >
          <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Respond to the inquiry
          </p>
          <p className="mb-1.5 text-[12px] text-[var(--color-charcoal)]">
            {`To ${replyName ? `${replyName} · ` : ''}${replyEmail}`}
          </p>
          <textarea
            ref={replyRef}
            value={replyBody}
            onChange={(event) => setReplyBody(event.target.value)}
            rows={4}
            aria-label={`Your reply to ${replyName ?? replyEmail}`}
            placeholder={`A reply to ${replyName?.split(' ')[0] ?? replyEmail}…`}
            className="w-full resize-y bg-transparent text-[12px] text-[var(--color-charcoal)] outline-none placeholder:italic placeholder:text-[var(--text-muted)]"
          />
          <div className="mt-1 flex flex-wrap items-center gap-4">
            <a
              href={`mailto:${encodeURIComponent(replyEmail)}?subject=${encodeURIComponent(
                'Your inquiry',
              )}&body=${encodeURIComponent(replyBody)}`}
              className="inline-flex min-h-11 items-center text-[12px] font-medium text-[var(--color-charcoal)]"
            >
              <span className="da-score-hover">Open in your mail to send</span>
            </a>
            <button
              type="button"
              onClick={() => setReplying(false)}
              className="inline-flex min-h-11 items-center text-[12px] text-[var(--text-muted)]"
            >
              <span className="da-score-hover">Cancel</span>
            </button>
          </div>
        </div>
      )}

      {/* US-28 S9 — her words on the note edge, then the facts as a `dl`. */}
      {lead.project_description && (
        <blockquote className="papers-note mb-3.5 font-heading text-[16px] italic leading-relaxed text-[var(--text-primary)]">
          “{lead.project_description}”
        </blockquote>
      )}

      {(lead.match_score != null || lead.budget_range || lead.timeline) && (
        <dl className="papers-facts mb-3.5">
          {lead.match_score != null && <Stat label="Match" value={String(lead.match_score)} />}
          {lead.budget_range && <Stat label="Budget" value={formatBudgetRange(lead.budget_range)} />}
          {lead.timeline && <Stat label="Timeline" value={formatTimeline(lead.timeline)} />}
        </dl>
      )}

      {(lead.match_reasons ?? []).length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {(lead.match_reasons as string[]).map((reason) => (
            <li
              key={reason}
              className="rounded-[3px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-2.5 py-1 text-[11px] text-[var(--color-charcoal)]"
            >
              {reason}
            </li>
          ))}
        </ul>
      )}

      {(lead.location_city || lead.location_state || lead.project_type) && (
        <p className="mt-3.5 border-t border-[var(--color-pearl)] pt-3 text-[11px] text-[var(--text-muted)]">
          {[
            lead.project_type ? pretty(lead.project_type) : null,
            [lead.location_city, lead.location_state].filter(Boolean).join(', ') || null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}

      {/* Designer Handoff (Wave 1B) — the request's scan set, between the
          facts and the triage act. Renders nothing for scan-less leads. */}
      <BriefScanStrip leadId={leadId} />

      {/* R61: the triage act, in the document. Accept → Discovery, Nurture →
          People, Pass → declined. Re-derives the Desk in one act (no reload). */}
      {triageable ? (
        <TriageBar
          leadId={leadId}
          variant="brief"
          arrivalEligible={Boolean(lead.homeowner_id)}
        />
      ) : (
        <p className="mt-4 border-t border-[var(--color-pearl)] pt-3.5 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
          {lead.status === 'accepted'
            ? 'Accepted — now in Discovery'
            : lead.status === 'declined'
              ? 'Passed — kept in People'
              : pretty(String(lead.status))}
        </p>
      )}
    </section>
  );
}
