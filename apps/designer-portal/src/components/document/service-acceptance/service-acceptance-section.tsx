'use client';

/**
 * C4 service acceptance in the round-8 Closeout chapter (WP-10C, A20). The
 * studio prepares a request against the active scope edition, hands its draft
 * to the existing V22 ready-to-send sheet (it never sends from here), reads
 * signers and responses, withdraws, replaces a signer, and records paper that
 * a second owner or admin confirms. While acceptance is not switched on every
 * act is denied; that reads as one calm note and the record stays readable.
 */

import { useId, useState } from 'react';
import { Send } from 'lucide-react';
import {
  useCreateServiceAcceptanceRequest,
  useProjectHousehold,
  useReplaceServiceAcceptanceSigner,
  useReviewServiceAcceptancePaperIntake,
  useScopeEditions,
  useServiceAcceptance,
  useServiceAcceptanceManifests,
  useStampServiceAcceptancePaper,
  useStudioContact,
  useWithdrawServiceAcceptanceRequest,
  type ServiceAcceptancePaperIntake,
  type ServiceAcceptanceRequest,
  type ServiceAcceptanceSigner,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { Select, Textarea } from '@/components/ui/controls';
import { DocumentAction, DocumentActionRow } from '../document-action';
import { DocSheet } from '../overlays/doc-sheet';
import { ReadyToSendSheet } from '../outbound/ready-to-send-sheet';
import {
  INACTIVE_NOTE, LIFECYCLE, OUTCOME, SUPERSEDED, answerLabel, refusalCopy, responseLabel, shortDate, slotLabel,
} from './copy';
import { PaperIntakeForm } from './paper-intake-form';

type Report = (error: unknown) => string | null;

export function ServiceAcceptanceSection({ projectId }: { projectId: string }) {
  const read = useServiceAcceptance(projectId);
  const [inactive, setInactive] = useState(false);
  // A denied act while switched off is a state, not an error message.
  const report: Report = (error) => {
    const copy = refusalCopy(error);
    if (copy == null) setInactive(true);
    return copy;
  };
  const requests = [...(read.data?.requests ?? [])].sort((a, b) => b.requestNumber - a.requestNumber);
  const byId = new Map(requests.map((request) => [request.requestId, request]));

  return (
    <section aria-labelledby={`service-acceptance-${projectId}`} data-service-acceptance className="mt-6">
      <h3 id={`service-acceptance-${projectId}`} className="t-body font-semibold">Service acceptance</h3>
      <p className="t-meta mt-1">The client accepts the agreed services. Nothing reaches them until you send it.</p>
      {inactive && (
        <p role="status" data-service-acceptance-inactive className="t-body-sm mt-3">{INACTIVE_NOTE}</p>
      )}
      {read.isError ? (
        <div role="alert" className="t-body-sm mt-3">
          <p>Service acceptance could not be read. Your place is kept.</p>
          <DocumentActionRow surfaceKey="service-acceptance" regionKey="read-retry">
            <DocumentAction actionKey="retry-service-acceptance" variant="secondary" onClick={() => void read.refetch()}>
              Retry service acceptance
            </DocumentAction>
          </DocumentActionRow>
        </div>
      ) : read.isPending ? (
        <p role="status" className="t-body-sm mt-3">Reading service acceptance…</p>
      ) : (
        <>
          <CreateRequest projectId={projectId} hasOpen={requests.some(isOpen)} report={report} />
          {requests.length > 0 && (
            <ol className="mt-4 space-y-4" aria-label="Service acceptance requests">
              {requests.map((request) => (
                <RequestCard key={request.requestId} projectId={projectId} request={request}
                  predecessor={request.predecessorRequestId ? byId.get(request.predecessorRequestId) : undefined}
                  report={report} onInactive={() => setInactive(true)} />
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

function isOpen(request: ServiceAcceptanceRequest) {
  return request.lifecycle === 'draft' || request.lifecycle === 'sent';
}

function CreateRequest({ projectId, hasOpen, report }: { projectId: string; hasOpen: boolean; report: Report }) {
  const id = useId();
  const editions = useScopeEditions(projectId);
  const manifests = useServiceAcceptanceManifests(projectId);
  const create = useCreateServiceAcceptanceRequest(projectId);
  const [manifestId, setManifestId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [drafted, setDrafted] = useState(false);
  const edition = editions.data?.find((row) => row.status === 'active') ?? null;
  const options = manifests.data ?? [];
  const chosen = manifestId || options[0]?.id || '';

  if (!edition) {
    return <p className="t-body-sm mt-3">{editions.isPending ? 'Reading the agreed scope…'
      : 'No agreed scope edition is active for this job, so there is nothing to ask the client to accept yet.'}</p>;
  }
  if (options.length === 0) {
    return <p className="t-body-sm mt-3">{manifests.isPending ? 'Reading the evidence sets…'
      : 'No service acceptance evidence set is recorded for this job yet.'}</p>;
  }
  return (
    <form noValidate className="mt-3 space-y-2" aria-label="Prepare a service acceptance request"
      onSubmit={async (event) => {
        event.preventDefault();
        if (create.isPending || !chosen) return;
        setError(null);
        setDrafted(false);
        try {
          await create.mutateAsync({ scopeEditionId: edition.id, evidenceManifestId: chosen });
          setDrafted(true);
        } catch (failure) {
          setError(report(failure));
        }
      }}>
      <label className="block t-body-sm" htmlFor={`${id}-manifest`}>Evidence the client reviews</label>
      <Select id={`${id}-manifest`} value={chosen} disabled={create.isPending}
        onChange={(event) => setManifestId(event.target.value)}>
        {options.map((manifest) => (
          <option key={manifest.id} value={manifest.id}>
            Evidence set of {shortDate(manifest.createdAt)} ({manifest.manifestHash.slice(0, 8)})
          </option>
        ))}
      </Select>
      <p className="t-meta">
        Against scope edition {edition.editionNumber}.{hasOpen ? ' A new request replaces the open one.' : ''}
      </p>
      {error && <p role="alert" className="t-body-sm">{error}</p>}
      {drafted && <p role="status" className="t-body-sm">Request drafted. Review and send it when it reads right.</p>}
      <DocumentActionRow surfaceKey="service-acceptance" regionKey="create-request">
        <DocumentAction actionKey="draft-service-acceptance-request" type="submit" variant="secondary"
          disabled={create.isPending} loading={create.isPending}>
          {hasOpen ? 'Draft a new request' : 'Draft the request'}
        </DocumentAction>
      </DocumentActionRow>
    </form>
  );
}

function RequestCard({ projectId, request, predecessor, report, onInactive }: {
  projectId: string;
  request: ServiceAcceptanceRequest;
  predecessor?: ServiceAcceptanceRequest;
  report: Report;
  onInactive: () => void;
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const open = isOpen(request);
  const active = request.signers.filter((signer) => signer.status === 'active');
  const replaced = request.signers.filter((signer) => signer.status === 'replaced');

  return (
    <li data-service-acceptance-request={request.requestId} data-lifecycle={request.lifecycle}
      className="border-t border-[var(--color-pearl)] pt-3">
      <p className="t-body-sm font-semibold">
        Request {request.requestNumber} · {LIFECYCLE[request.lifecycle]} · {OUTCOME[request.aggregateOutcome]}
      </p>
      {predecessor && <p className="t-meta">Follows request {predecessor.requestNumber}.</p>}
      {request.lifecycle === 'superseded' && (
        <p className="t-meta">Replaced because {SUPERSEDED[request.supersededReason ?? ''] ?? 'a newer request took its place'}.</p>
      )}
      {request.lifecycle === 'withdrawn' && (
        <p className="t-meta">
          Withdrawn{request.withdrawnAt ? ` ${shortDate(request.withdrawnAt)}` : ''}
          {request.withdrawReason ? `: ${request.withdrawReason}` : ''}.
        </p>
      )}
      {request.sentAt && <p className="t-meta">Sent {shortDate(request.sentAt)}.</p>}
      {request.lifecycle === 'draft' && request.outboundDraftId && (
        <div className="mt-2">
          <p className="t-body-sm">Drafted for your review. Nothing has been sent.</p>
          <DocumentActionRow surfaceKey="service-acceptance" regionKey="hand-off">
            <DocumentAction actionKey="open-acceptance-draft" data-outbound-draft-id={request.outboundDraftId}
              onClick={() => setReviewOpen(true)}>
              Review and send
            </DocumentAction>
          </DocumentActionRow>
          <DocSheet open={reviewOpen} onClose={() => setReviewOpen(false)} title="Ready to send" icon={Send}
            kind="service-acceptance-review">
            <ReadyToSendSheet projectId={projectId} />
          </DocSheet>
        </div>
      )}

      <ul className="mt-3 space-y-2" aria-label={`Signers on request ${request.requestNumber}`}>
        {active.map((signer) => (
          <SignerRow key={signer.signerId} projectId={projectId} request={request} signer={signer}
            open={open} report={report} onInactive={onInactive} />
        ))}
        {replaced.map((signer) => (
          <li key={signer.signerId} className="t-meta" data-signer-status="replaced">
            <SignerName signer={signer} /> was replaced{signer.replacedAt ? ` ${shortDate(signer.replacedAt)}` : ''}
            {signer.replacementReason ? `: ${signer.replacementReason}` : ''}.
          </li>
        ))}
      </ul>

      {request.paperIntakes.length > 0 && (
        <ul className="mt-3 space-y-2" aria-label={`Paper recorded on request ${request.requestNumber}`}>
          {request.paperIntakes.map((intake) => (
            <PaperIntakeRow key={intake.intakeId} projectId={projectId} intake={intake}
              signer={request.signers.find((signer) => signer.signerId === intake.signerId)} report={report} />
          ))}
        </ul>
      )}

      {open && <WithdrawRequest projectId={projectId} request={request} report={report} />}
    </li>
  );
}

function SignerName({ signer }: { signer: ServiceAcceptanceSigner }) {
  const card = useStudioContact(signer.householdPersonId);
  const name = signer.householdPersonId ? card.data?.full_name ?? 'Household member' : 'The client account';
  return <>{name} ({slotLabel(signer.slot)})</>;
}

function SignerRow({ projectId, request, signer, open, report, onInactive }: {
  projectId: string;
  request: ServiceAcceptanceRequest;
  signer: ServiceAcceptanceSigner;
  open: boolean;
  report: Report;
  onInactive: () => void;
}) {
  const [act, setAct] = useState<'replace' | 'paper' | null>(null);
  const response = signer.response;
  const pendingPaper = request.paperIntakes.some(
    (intake) => intake.signerId === signer.signerId && intake.reviewState === 'pending_review');
  return (
    <li data-signer-status="active" className="t-body-sm">
      <SignerName signer={signer} /> · {signer.required ? 'Required' : 'Optional'} ·{' '}
      {response ? (
        <span data-response-method={response.method}>{responseLabel(response.response, response.method)}</span>
      ) : 'Waiting'}
      {response && response.conditions.length > 0 && (
        <ul className="t-meta ml-4 list-disc">
          {response.conditions.map((condition) => <li key={condition.conditionId}>{condition.text}</li>)}
        </ul>
      )}
      {response?.returnReason && <p className="t-meta">Reason given: {response.returnReason}</p>}
      {open && !response && act == null && (
        <DocumentActionRow surfaceKey="service-acceptance" regionKey="signer">
          {!pendingPaper && (
            <DocumentAction actionKey="record-signer-paper" variant="tertiary" onClick={() => setAct('paper')}>
              Record paper
            </DocumentAction>
          )}
          <DocumentAction actionKey="replace-acceptance-signer" variant="tertiary" onClick={() => setAct('replace')}>
            Replace this person
          </DocumentAction>
        </DocumentActionRow>
      )}
      {act === 'paper' && (
        <PaperIntakeForm projectId={projectId} request={request} signerId={signer.signerId}
          signerName={slotLabel(signer.slot)} onInactive={onInactive} onDone={() => setAct(null)} />
      )}
      {act === 'replace' && (
        <ReplaceSigner projectId={projectId} request={request} signer={signer} report={report}
          onDone={() => setAct(null)} />
      )}
    </li>
  );
}

function ContactOption({ id }: { id: string }) {
  const card = useStudioContact(id);
  return <option value={id}>{card.data?.full_name ?? 'Household member'}</option>;
}

function ReplaceSigner({ projectId, request, signer, report, onDone }: {
  projectId: string;
  request: ServiceAcceptanceRequest;
  signer: ServiceAcceptanceSigner;
  report: Report;
  onDone: () => void;
}) {
  const id = useId();
  const household = useProjectHousehold(projectId);
  const replace = useReplaceServiceAcceptanceSigner(projectId);
  const taken = new Set(request.signers.filter((s) => s.status === 'active').map((s) => s.householdPersonId));
  const cards = (household.data?.household?.member_person_ids ?? []).filter((card) => !taken.has(card));
  const [cardId, setCardId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const chosen = cardId || cards[0] || '';
  return (
    <form noValidate className="mt-2 space-y-2" aria-label={`Replace ${slotLabel(signer.slot)}`}
      onSubmit={async (event) => {
        event.preventDefault();
        if (replace.isPending) return;
        if (!chosen || !reason.trim()) { setError('Choose the new person and give a reason for the change.'); return; }
        setError(null);
        try {
          await replace.mutateAsync({
            requestId: request.requestId, signerId: signer.signerId,
            expectedSignerPolicyRevision: request.signerPolicyRevision, reason: reason.trim(),
            newProfileId: null, newHouseholdPersonId: chosen,
          });
          onDone();
        } catch (failure) {
          setError(report(failure));
        }
      }}>
      {cards.length === 0 ? (
        <p className="t-body-sm">No other household member is on file for this job.</p>
      ) : (
        <>
          <label className="block t-body-sm" htmlFor={`${id}-card`}>New person</label>
          <Select id={`${id}-card`} value={chosen} disabled={replace.isPending}
            onChange={(event) => setCardId(event.target.value)}>
            {cards.map((card) => <ContactOption key={card} id={card} />)}
          </Select>
        </>
      )}
      <label className="block t-body-sm" htmlFor={`${id}-reason`}>Reason for the change</label>
      <Textarea id={`${id}-reason`} rows={2} value={reason} disabled={replace.isPending}
        onChange={(event) => setReason(event.target.value)} />
      {error && <p role="alert" className="t-body-sm">{error}</p>}
      <DocumentActionRow surfaceKey="service-acceptance" regionKey="replace-signer">
        <DocumentAction actionKey="confirm-replace-acceptance-signer" type="submit" variant="secondary"
          disabled={replace.isPending || cards.length === 0} loading={replace.isPending}>
          Replace
        </DocumentAction>
        <DocumentAction actionKey="cancel-replace-acceptance-signer" variant="tertiary" onClick={onDone}>
          Cancel
        </DocumentAction>
      </DocumentActionRow>
    </form>
  );
}

function WithdrawRequest({ projectId, request, report }: {
  projectId: string; request: ServiceAcceptanceRequest; report: Report;
}) {
  const id = useId();
  const withdraw = useWithdrawServiceAcceptanceRequest(projectId);
  const [opened, setOpened] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!opened) {
    return (
      <DocumentActionRow surfaceKey="service-acceptance" regionKey="withdraw">
        <DocumentAction actionKey="withdraw-acceptance-request" variant="tertiary" onClick={() => setOpened(true)}>
          Withdraw request {request.requestNumber}
        </DocumentAction>
      </DocumentActionRow>
    );
  }
  return (
    <form noValidate className="mt-2 space-y-2" aria-label={`Withdraw request ${request.requestNumber}`}
      onSubmit={async (event) => {
        event.preventDefault();
        if (withdraw.isPending) return;
        if (!reason.trim()) { setError('Give a reason for withdrawing.'); return; }
        setError(null);
        try {
          await withdraw.mutateAsync({ requestId: request.requestId, reason: reason.trim() });
          setOpened(false);
        } catch (failure) {
          setError(report(failure));
        }
      }}>
      <label className="block t-body-sm" htmlFor={`${id}-reason`}>Why it is withdrawn</label>
      <Textarea id={`${id}-reason`} rows={2} value={reason} disabled={withdraw.isPending}
        onChange={(event) => setReason(event.target.value)} />
      <p className="t-meta">The request and any answers stay on the record.</p>
      {error && <p role="alert" className="t-body-sm">{error}</p>}
      <DocumentActionRow surfaceKey="service-acceptance" regionKey="withdraw">
        <DocumentAction actionKey="confirm-withdraw-acceptance-request" type="submit" variant="secondary"
          disabled={withdraw.isPending} loading={withdraw.isPending}>
          Withdraw
        </DocumentAction>
        <DocumentAction actionKey="cancel-withdraw-acceptance-request" variant="tertiary"
          onClick={() => setOpened(false)}>
          Keep it
        </DocumentAction>
      </DocumentActionRow>
    </form>
  );
}

const REVIEW_STATE: Record<ServiceAcceptancePaperIntake['reviewState'], string> = {
  pending_review: 'Waiting for review',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  lapsed: 'Lapsed',
};

function PaperIntakeRow({ projectId, intake, signer, report }: {
  projectId: string;
  intake: ServiceAcceptancePaperIntake;
  signer?: ServiceAcceptanceSigner;
  report: Report;
}) {
  const id = useId();
  const { user } = useAuth();
  const review = useReviewServiceAcceptancePaperIntake(projectId);
  const stamp = useStampServiceAcceptancePaper(projectId);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pending = intake.reviewState === 'pending_review';
  const recorder = !!user?.id && user.id === intake.recordedBy;
  const stamped = intake.documentSha256;

  const decide = async (decision: 'confirmed' | 'rejected') => {
    if (review.isPending) return;
    setError(null);
    try {
      await review.mutateAsync({
        intakeId: intake.intakeId, decision, expectedDocumentSha256: stamped, note: note.trim() || null,
      });
    } catch (failure) {
      setError(report(failure));
    }
  };

  return (
    <li data-paper-intake={intake.intakeId} data-review-state={intake.reviewState} className="t-body-sm">
      <p>
        Paper for {signer ? slotLabel(signer.slot) : 'a signer'}: “{intake.signedName}”, dated{' '}
        {shortDate(intake.paperSignedOn)} · {answerLabel(intake.disposition)} · {REVIEW_STATE[intake.reviewState]}
      </p>
      {intake.conditions.length > 0 && (
        <ul className="t-meta ml-4 list-disc">
          {intake.conditions.map((condition) => <li key={condition.conditionId}>{condition.text}</li>)}
        </ul>
      )}
      {intake.returnReason && <p className="t-meta">Reason given: {intake.returnReason}</p>}
      <p className="t-meta" data-paper-stamp={stamped ? 'stamped' : 'unstamped'}>
        {stamped ? `Stored PDF stamped sha256 ${stamped.slice(0, 12)}…` : 'The stored PDF is not stamped yet.'}
      </p>
      {intake.reviewNote && <p className="t-meta">Review note: {intake.reviewNote}</p>}
      {pending && !stamped && (
        <DocumentActionRow surfaceKey="service-acceptance" regionKey="paper-stamp">
          <DocumentAction actionKey="stamp-acceptance-paper" variant="tertiary" disabled={stamp.isPending}
            loading={stamp.isPending}
            onClick={async () => {
              setError(null);
              try { await stamp.mutateAsync({ intakeId: intake.intakeId }); } catch { setError('The stamp did not finish. Try Stamp again.'); }
            }}>
            Stamp the stored PDF
          </DocumentAction>
        </DocumentActionRow>
      )}
      {pending && recorder && <p role="status" className="t-meta">Waiting for a second reviewer.</p>}
      {pending && !recorder && (
        <div className="mt-2 space-y-2">
          <label className="block t-body-sm" htmlFor={`${id}-note`}>Review note (optional)</label>
          <Textarea id={`${id}-note`} rows={2} value={note} disabled={review.isPending}
            onChange={(event) => setNote(event.target.value)} />
          {!stamped && <p className="t-meta" id={`${id}-unstamped`}>Confirm opens once the stored PDF is stamped.</p>}
          <DocumentActionRow surfaceKey="service-acceptance" regionKey="paper-review">
            <DocumentAction actionKey="confirm-acceptance-paper" variant="secondary"
              disabled={!stamped || review.isPending} aria-describedby={stamped ? undefined : `${id}-unstamped`}
              onClick={() => void decide('confirmed')}>
              Confirm paper
            </DocumentAction>
            <DocumentAction actionKey="reject-acceptance-paper" variant="tertiary" disabled={review.isPending}
              onClick={() => void decide('rejected')}>
              Reject paper
            </DocumentAction>
          </DocumentActionRow>
        </div>
      )}
      {error && <p role="alert" className="t-body-sm">{error}</p>}
    </li>
  );
}
