'use client';

import { use } from 'react';
import { Loader2 } from 'lucide-react';
import { useStudioIdentity } from '@patina/supabase';

import { RecordSheet } from '@/components/record/record-sheet';
import { KIND_LABEL, summaryLineFor } from '@/components/threshold/consent-copy';
import { useClientCommercialDocument } from '@/hooks/use-commercial-client';
import {
  checksumMark,
  releasedWorkSentence,
  signatureBlock,
} from '@/lib/record-of-decision';
import { isPermissionRefusal } from '@/lib/threshold/refusal';
import { parseSourceDate } from '@/lib/threshold/derive';

/* ── /proposals/[id]/record ──────────────────────────────────────────────────
   P-26. The keepsake for a signed paper — the other half of the Record of
   Decision, and the half that carries her typed name, because
   `get_client_commercial_document_bundle` projects the signature receipt
   (name, day, consent version, fingerprint) where the Stage-2 projection does
   not.

   AUTH AND RLS follow every other non-public path's. The middleware signs her
   in and gates the portal role; the bundle RPC is the client-scoped read the
   door itself uses, so a stranger's call comes back with nothing and the
   sheet says the record could not be found — never whether the id exists.

   `retired-routes.ts` folds `/proposals/<id>` and `/proposals/<id>/sign` onto
   `#door` and leaves this one standing: a printable sheet has no in-page
   equivalent it could fold onto, and folding it would send "Keep a copy"
   back to the ask it was pressed on.
   ────────────────────────────────────────────────────────────────────────── */

const LONG_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });

export default function ProposalRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const bundle = useClientCommercialDocument(id);
  const identity = useStudioIdentity({
    projectId: bundle.data?.document.projectId ?? undefined,
  });

  if (bundle.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (bundle.isError) {
    // `W3W-R1-04`. A 403 is a refusal, not a bad moment: `get_client_
    // commercial_document_bundle` says no to a reader the paper is not
    // addressed to, and it will say no again however many times she presses
    // Refresh. The query no longer retries one (`clientCommercialDocument
    // QueryOptions`), and the sentence is the sibling rail's — which is also
    // the sentence the owner gets for an id that does not exist, so the page
    // still never says whether it does.
    return isPermissionRefusal(bundle.error) ? (
      <Nothing line="This record could not be found." backHref="/" />
    ) : (
      <Nothing
        line="This record could not be read just now. Refresh to try again."
        backHref="/"
      />
    );
  }

  const paper = bundle.data;
  if (!paper) {
    return <Nothing line="This record could not be found." backHref="/" />;
  }

  const back = `/?proposal=${encodeURIComponent(id)}#door`;
  // Hers, not the studio's. A design-services agreement carries both; the
  // sheet she keeps is the record of HER act.
  const signature = paper.signatures.find((row) => row.party === 'client') ?? null;

  if (!signature) {
    return (
      <Nothing
        line="This paper has not been signed yet, so there is nothing to keep."
        backHref={back}
      />
    );
  }

  // The day written on the paper is the day it happened; `signedAt` on the
  // paper rail is only when the studio wrote it down, which is a later one.
  const signedOn =
    parseSourceDate(signature.paperSignedOn) ?? parseSourceDate(signature.signedAt);
  const sent = parseSourceDate(paper.document.sentAt);
  const kindLabel = KIND_LABEL[paper.document.kind] ?? 'Paper';

  // What the signature let go, when the paper names it. A furnishings
  // authorization lists the lines it releases; a trade scope releases work,
  // not pieces, and says nothing here rather than counting the wrong noun.
  const release = releasedWorkSentence(
    (paper.furnishings?.items ?? []).map((item) => item.description),
  );

  /* `W3W-R2-01`'s rule, on the rail that has always been able to keep it: the
     block says what the receipt recorded — a wet signature the studio filed,
     or the typed legal name `sign_proposal` takes — and names her only where
     the row carries a name. */
  const block = signatureBlock({
    method: signature.signedOnPaper ? 'paper' : 'electronic_signature',
    name: signature.signerName,
    day: signedOn ? LONG_DATE.format(signedOn) : null,
    dateLine: signedOn ? `Signed ${LONG_DATE.format(signedOn)}` : null,
  });

  return (
    <RecordSheet
      studioName={identity.data?.name?.trim() || 'Your studio'}
      studioLogoUrl={identity.data?.logoUrl ?? null}
      kindLine="Record of signature"
      artifactTitle={paper.document.title}
      editionLine={`${kindLabel} · Edition ${paper.document.version}${
        sent ? ` · Issued ${LONG_DATE.format(sent)}` : ''
      }`}
      question={summaryLineFor(paper.document.kind, paper.document.title)}
      stampState={signature.signedOnPaper ? 'signed_on_paper' : 'signed'}
      stampDateLabel={signedOn ? DAY_MONTH.format(signedOn) : null}
      stampSubject={`${paper.document.title} · Edition ${paper.document.version}`}
      signatureHeading={block.heading}
      signedName={block.name}
      signedOn={block.dateLine}
      consentSentence={block.sentence}
      releaseSentence={release}
      checksum={checksumMark(signature.documentFingerprint)}
      backHref={back}
      backLabel="Back to the door"
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
