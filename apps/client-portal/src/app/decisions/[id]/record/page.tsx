'use client';

import { use } from 'react';
import { Loader2 } from 'lucide-react';
import { useMyProjectApprovalReviews, useStudioIdentity } from '@patina/supabase';

import { RecordSheet } from '@/components/record/record-sheet';
import {
  checksumMark,
  recordStampStateForApproval,
  signatureBlock,
  supersededNoteSentence,
} from '@/lib/record-of-decision';
import { isPermissionRefusal } from '@/lib/threshold/refusal';
import { parseSourceDate } from '@/lib/threshold/derive';

/* ── /decisions/[id]/record ──────────────────────────────────────────────────
   P-26. The keepsake for a Stage-2 approval.

   AUTH AND RLS FOLLOW EVERY OTHER NON-PUBLIC PATH'S. Sign-in and the
   portal-role gate are the middleware's, and the row itself comes from
   `list_my_project_decision_reviews` — the caller-global sanitized read the
   Threshold already uses, which returns the frozen lead's own approvals and
   the studio's, and nothing else. A stranger's read comes back without this
   id and the page says the record could not be found, and never reveals
   whether the id exists at all.

   THE ROUTE IS NOT FOLDED. `retired-routes.ts` maps `/decisions/<id>` onto
   `#approval-<id>` and deliberately leaves this one alone: a printable sheet
   has no in-page equivalent it could fold onto, and folding it would send
   "Keep a copy" back to the ask it was pressed on. ─────────────────────────── */

const LONG_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });

export default function DecisionRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const reviews = useMyProjectApprovalReviews();
  const approval = (reviews.data ?? []).find((row) => row.decisionId === id) ?? null;
  const identity = useStudioIdentity({ projectId: approval?.projectId });

  if (reviews.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (reviews.isError) {
    // `W3W-R1-04`, on this rail too: a refusal is not a bad moment. Offering
    // "Refresh to try again" to a reader the row is not addressed to is an
    // invitation to press a button that will never work, and it also tells
    // her the id exists. Same sentence as a record that is not there.
    return isPermissionRefusal(reviews.error) ? (
      <Nothing line="This record could not be found." backHref="/" />
    ) : (
      <Nothing
        line="This record could not be read just now. Refresh to try again."
        backHref="/"
      />
    );
  }

  if (!approval) {
    return <Nothing line="This record could not be found." backHref="/" />;
  }

  const back = `/?decision=${encodeURIComponent(id)}#approval-${id}`;
  const answered = approval.outcome !== null || approval.disposition !== 'active';

  // A record is of a thing that happened. An approval still standing open has
  // no answer to print, so the sheet says so and sends her back to the ask
  // rather than printing a blank line where her name will go.
  if (!answered) {
    return (
      <Nothing
        line="This approval has not been answered yet, so there is nothing to keep."
        backHref={back}
      />
    );
  }

  const issued = parseSourceDate(approval.sentAt) ?? parseSourceDate(approval.createdAt);
  const answeredAt = parseSourceDate(approval.respondedAt);
  const answeredOn = answeredAt ? LONG_DATE.format(answeredAt) : null;

  /* `W3W-R2-01` / `W3W-R1-05`. The signature block follows the ROW — the
     consent method 00573 projects and the name it carries — and never the
     outcome. Derived from the outcome, this sheet printed "Signed
     electronically by typed name." over an empty name line on every approval
     answered before 00569, and headed a RETURNED record "Signed". */
  const signature = signatureBlock({
    method: approval.clientConsentMethod,
    name: approval.clientSignature,
    day: answeredOn,
    dateLine: answeredOn ? `Answered ${answeredOn}` : null,
  });

  /* A superseded edition she ALREADY ANSWERED keeps her own outcome as the
     mark — the doorstep's precedence, which puts SUPERSEDED first so the dead
     edition never reads plainly RETURNED beside the live one, is the wrong
     rule for a sheet that records her act. The supersession is said instead,
     in prose, under the mark. The day is the successor's issued date, read off
     the successor's own row; the projection carries no `supersededAt`, and the
     sheet does not invent one. */
  const successor = approval.successorDecisionId
    ? ((reviews.data ?? []).find(
        (row) => row.decisionId === approval.successorDecisionId,
      ) ?? null)
    : null;
  const successorIssued = successor
    ? (parseSourceDate(successor.sentAt) ?? parseSourceDate(successor.createdAt))
    : null;
  const stampNote =
    approval.disposition === 'superseded' && approval.outcome !== null
      ? supersededNoteSentence(
          successorIssued ? LONG_DATE.format(successorIssued) : null,
        )
      : null;

  return (
    <RecordSheet
      studioName={identity.data?.name?.trim() || 'Your studio'}
      studioLogoUrl={identity.data?.logoUrl ?? null}
      kindLine="Record of decision"
      artifactTitle={approval.artifactTitle}
      editionLine={`Edition ${approval.artifactVersion}${
        issued ? ` · Issued ${LONG_DATE.format(issued)}` : ''
      }`}
      question={approval.question}
      stampState={recordStampStateForApproval(approval)}
      stampDateLabel={answeredAt ? DAY_MONTH.format(answeredAt) : null}
      stampSubject={`${approval.artifactTitle} · Edition ${approval.artifactVersion}`}
      stampNote={stampNote}
      signatureHeading={signature.heading}
      signedName={signature.name}
      signedOn={signature.dateLine}
      consentSentence={signature.sentence}
      checksum={checksumMark(approval.artifactChecksum)}
      backHref={back}
      backLabel="Back to the approval"
    />
  );
}

function Nothing({ line, backHref }: { line: string; backHref: string }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <p className="text-[15px] leading-[1.62] text-[var(--text-body)]">{line}</p>
      <p className="mt-4">
        <a className="text-[15px] underline" href={backHref}>
          Back to your page
        </a>
      </p>
    </div>
  );
}
