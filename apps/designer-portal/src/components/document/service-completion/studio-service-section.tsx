'use client';

/**
 * C6 studio service completion in the round-8 Closeout chapter (WP-10B,
 * A21–A23), beside the C4 acceptance card. It is its own reading: what holds
 * the studio's service, what does not, and the balance that holds project
 * closure instead. It never relabels the closure checklist or touches
 * close_project, and a later care question never reopens it. While completion
 * is not switched on every act is denied; that reads as one calm note.
 */

import { useId, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import type { ScopeEdition } from '@patina/types';
import {
  citedReferences,
  serviceCompletionRefusal,
  STALE_SERVICE_COMPLETION_REFUSALS,
  useCompleteStudioService,
  useOrganizations,
  useProjectV2,
  useResolveServiceAcceptanceCondition,
  useRevokeStudioServiceCompletion,
  useScopeEditions,
  useServiceAcceptance,
  useServiceConditionCitation,
  useServiceConditionEvidenceOptions,
  useStudioServiceCompletion,
  useStudioServiceObligations,
  type ServiceConditionEvidence,
  type ServiceConditionEvidenceKind,
  type ServiceConditionResolution,
  type StudioServiceCompletion,
  type StudioServiceObligationItem,
  type StudioServiceObligations,
} from '@patina/supabase';
import { formatMoney } from '@/lib/currency-totals';
import { Select, Textarea } from '@/components/ui/controls';
import { DocumentAction, DocumentActionRow } from '../document-action';
import { unfoldOpenerFor } from '../paper/unfold-bridge';
import {
  CITATION_UNCHECKED, HOLD_NOTE, INACTIVE_BLOCKER, INACTIVE_NOTE, PARTY, obligationLabel, refusalCopy, shortDate,
} from './copy';

type Report = (error: unknown) => string | null;

/** The chapter whose heading a care reference folds back to. */
export const STUDIO_SERVICE_CHAPTER = 'closeout';

export function studioServiceAnchorId(projectId: string): string {
  return `studio-service-${projectId}`;
}

export function StudioServiceSection({ projectId }: { projectId: string }) {
  const obligations = useStudioServiceObligations(projectId);
  const record = useStudioServiceCompletion(projectId);
  const [denied, setDenied] = useState(false);
  // A denied act while switched off is a state, not an error message.
  const report: Report = (error) => {
    const copy = refusalCopy(error);
    if (copy == null) setDenied(true);
    return copy;
  };
  const reading = obligations.data;
  const completions = record.data?.completions ?? [];
  // One live completion per edition (00888): the current edition's is this reading's.
  const current = completions.find((row) => row.revokedAt == null && row.scopeEditionId === reading?.scopeEditionId) ?? null;
  const earlier = completions.filter((row) => row !== current);
  const inactive = denied || reading?.capability === 'inactive' || record.data?.capability === 'inactive';
  const failed = obligations.isError || record.isError;
  const retry = () => { void obligations.refetch(); void record.refetch(); };

  return (
    <section aria-labelledby={`${studioServiceAnchorId(projectId)}-heading`} id={studioServiceAnchorId(projectId)}
      data-studio-service className="mt-8">
      <h3 id={`${studioServiceAnchorId(projectId)}-heading`} className="t-body font-semibold">Studio service</h3>
      <p className="t-meta mt-1">Whether the studio has delivered the services it agreed. Project closure is separate.</p>
      {inactive && <p role="status" data-studio-service-inactive className="t-body-sm mt-3">{INACTIVE_NOTE}</p>}
      {failed && (
        <div role="alert" className="t-body-sm mt-3">
          <p>{reading && record.data ? 'The studio service could not be refreshed. What you have entered is kept.'
            : 'The studio service could not be read.'}</p>
          <DocumentActionRow surfaceKey="studio-service" regionKey="read-retry">
            <DocumentAction actionKey="retry-studio-service" variant="secondary" onClick={retry}>
              Retry the studio service
            </DocumentAction>
          </DocumentActionRow>
        </div>
      )}
      {!reading || !record.data ? (
        !failed && <p role="status" className="t-body-sm mt-3">Reading the studio service…</p>
      ) : (
        <StudioServiceBody projectId={projectId} reading={reading} current={current} earlier={earlier}
          resolutions={record.data.resolutions} report={report}
          readAt={obligations.dataUpdatedAt} readFailed={obligations.isError} />
      )}
    </section>
  );
}

/** When the reading on screen was read, and whether its last refresh failed. */
interface ReadState {
  readAt: number;
  readFailed: boolean;
}

function StudioServiceBody({ projectId, reading, current, earlier, resolutions, report, readAt, readFailed }: {
  projectId: string;
  reading: StudioServiceObligations;
  current: StudioServiceCompletion | null;
  earlier: StudioServiceCompletion[];
  resolutions: ServiceConditionResolution[];
  report: Report;
} & ReadState) {
  const editions = useScopeEditions(projectId);
  const edition = editions.data?.find((row) => row.id === (current?.scopeEditionId ?? reading.scopeEditionId)) ?? null;
  const requestId = current?.acceptanceRequestId ?? reading.acceptance.requestId;
  return (
    <>
      {current ? (
        <CompletionRecord projectId={projectId} completion={current} edition={edition} report={report} />
      ) : (
        <Obligations projectId={projectId} reading={reading} edition={edition} report={report}
          readAt={readAt} readFailed={readFailed} />
      )}
      <FinancialHold reading={reading} />
      {requestId && (
        <Conditions projectId={projectId} requestId={requestId} open={reading.conditions}
          resolutions={resolutions.filter((row) => row.requestId === requestId)} report={report} />
      )}
      {current && <CareReferences projectId={projectId} completion={current} edition={edition} />}
      {earlier.length > 0 && <History projectId={projectId} completions={earlier} report={report} />}
    </>
  );
}

function packageLabel(edition: ScopeEdition | null, key: string | null): string {
  if (key == null) return 'Across the job';
  return edition?.packages.find((entry) => entry.packageKey === key)?.label ?? key;
}

function byPackage(items: StudioServiceObligationItem[]): [string | null, StudioServiceObligationItem[]][] {
  const groups = new Map<string | null, StudioServiceObligationItem[]>();
  for (const item of items) groups.set(item.packageKey, [...(groups.get(item.packageKey) ?? []), item]);
  return [...groups.entries()];
}

function Obligations({ projectId, reading, edition, report, readAt, readFailed }: {
  projectId: string; reading: StudioServiceObligations; edition: ScopeEdition | null; report: Report;
} & ReadState) {
  // While switched off the server holds the service with one inactive blocker;
  // the section's note says that, so it is not listed as studio work.
  const blockers = reading.blockers.filter((item) => item.code !== INACTIVE_BLOCKER);
  return (
    <div data-studio-service-obligations className="mt-4">
      <h4 className="t-body-sm font-semibold">Holds the studio&apos;s service</h4>
      {blockers.length === 0 ? (
        <p className="t-body-sm mt-1">Nothing holds the studio&apos;s service.</p>
      ) : (
        <ul className="mt-1 space-y-2" aria-label="Holds the studio's service">
          {byPackage(blockers).map(([key, items]) => (
            <li key={key ?? 'job'} data-obligation-package={key ?? 'job'}>
              <p className="t-body-sm">{packageLabel(edition, key)}</p>
              <ul className="t-meta ml-4 list-disc">
                {items.map((item) => <li key={item.code} data-blocker={item.code}>{obligationLabel(item)}</li>)}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {reading.informational.length > 0 && (
        <>
          <h4 className="t-body-sm font-semibold mt-4">Doesn&apos;t hold the studio&apos;s service</h4>
          <ul className="t-meta mt-1 ml-4 list-disc" aria-label="Doesn't hold the studio's service">
            {reading.informational.map((item) => (
              <li key={`${item.code}:${item.packageKey ?? ''}`} data-informational={item.code}>
                {item.packageKey ? `${packageLabel(edition, item.packageKey)}: ` : ''}{obligationLabel(item)}
              </li>
            ))}
          </ul>
        </>
      )}
      <CompleteService projectId={projectId} reading={reading} edition={edition} report={report}
        readAt={readAt} readFailed={readFailed} />
    </div>
  );
}

function CompleteService({ projectId, reading, edition, report, readAt, readFailed }: {
  projectId: string; reading: StudioServiceObligations; edition: ScopeEdition | null; report: Report;
} & ReadState) {
  const id = useId();
  const complete = useCompleteStudioService(projectId);
  const [error, setError] = useState<string | null>(null);
  // A stale refusal retires the reading it was read at: Complete waits until a
  // refetch succeeds and the updated list is on screen, and a failed read
  // (the section's calm error with Retry) keeps it held.
  const [retiredAt, setRetiredAt] = useState<number | null>(null);
  const requestId = reading.acceptance.requestId;
  // Zero blockers, the inactive one included: the server refuses any.
  const ready = reading.blockers.length === 0 && requestId != null;
  const held = !ready || complete.isPending || readFailed || (retiredAt != null && readAt <= retiredAt);
  const onComplete = async () => {
    if (held) return;
    const shownAt = readAt;
    setError(null);
    try {
      // The hash of the list on screen: a changed list refuses as stale.
      await complete.mutateAsync({ acceptanceRequestId: requestId, obligationHash: reading.obligationHash });
    } catch (failure) {
      const token = serviceCompletionRefusal(failure);
      if (token && STALE_SERVICE_COMPLETION_REFUSALS.has(token)) setRetiredAt(shownAt);
      setError(report(failure));
    }
  };
  return (
    <div className="mt-4 space-y-2">
      {reading.conditions.length > 0 && (
        <p className="t-body-sm">
          The client accepted with conditions. Completing now records the service as completed with conditions
          until each one below is resolved.
        </p>
      )}
      <p id={`${id}-consequence`} className="t-meta">
        {ready
          ? `Completing records the studio's service against scope edition ${edition?.editionNumber ?? ''}. It does not close the project.`.replace(' .', '.')
          : 'You can complete the studio service once nothing above holds it.'}
      </p>
      {error && <p role="alert" className="t-body-sm">{error}</p>}
      <DocumentActionRow surfaceKey="studio-service" regionKey="complete">
        <DocumentAction actionKey="complete-studio-service" variant="primary" onClick={onComplete}
          disabled={held} loading={complete.isPending}
          aria-describedby={`${id}-consequence`}>
          Complete studio service
        </DocumentAction>
      </DocumentActionRow>
    </div>
  );
}

function FinancialHold({ reading }: { reading: StudioServiceObligations }) {
  const { balanceCents, openInvoiceCount, uncollectedContractCents } = reading.financialHold;
  if (balanceCents <= 0 && uncollectedContractCents <= 0) return null;
  const detail = balanceCents > 0
    ? `${formatMoney(balanceCents)} open on ${openInvoiceCount} ${openInvoiceCount === 1 ? 'invoice' : 'invoices'}.`
    : `${formatMoney(uncollectedContractCents)} of the agreed fee not yet collected.`;
  return (
    <p data-financial-hold className="t-body-sm mt-4">
      {HOLD_NOTE} <span className="t-meta">{detail}</span>
    </p>
  );
}

function CompletionRecord({ projectId, completion, edition, report }: {
  projectId: string; completion: StudioServiceCompletion; edition: ScopeEdition | null; report: Report;
}) {
  const conditional = completion.state === 'completed_with_conditions';
  return (
    <div data-studio-service-state={completion.state} className="mt-4">
      <p className="t-body-sm font-semibold">
        {conditional ? 'Completed with conditions' : 'Studio service complete'} · {shortDate(completion.completedAt)}
      </p>
      {conditional && <p className="t-meta">It reads complete once each condition below is resolved.</p>}
      {completion.conditionsClosedAt && (
        <p className="t-meta">Every condition was resolved {shortDate(completion.conditionsClosedAt)}.</p>
      )}
      {edition && <p className="t-meta">Recorded against scope edition {edition.editionNumber}.</p>}
      <RevokeCompletion projectId={projectId} completion={completion} report={report} />
    </div>
  );
}

/** Owner or admin of the job's recorded studio (00888 revoke rule). */
function useStudioPrincipal(projectId: string): boolean {
  const project = useProjectV2(projectId);
  const organizations = useOrganizations();
  const studioId = (project.data as { studio_id?: string | null } | undefined)?.studio_id;
  const role = studioId ? organizations.data?.find((org) => org.id === studioId)?.membership?.role : null;
  return role === 'owner' || role === 'admin';
}

/** Offered on every live completion, current or earlier: 00888 lets an owner
 *  or admin revoke any of them, and stays the authority. */
function RevokeCompletion({ projectId, completion, report, label = 'Revoke this completion' }: {
  projectId: string; completion: StudioServiceCompletion; report: Report; label?: string;
}) {
  const id = useId();
  const principal = useStudioPrincipal(projectId);
  const revoke = useRevokeStudioServiceCompletion(projectId);
  const [opened, setOpened] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!principal) return null;
  if (!opened) {
    return (
      <DocumentActionRow surfaceKey="studio-service" regionKey="revoke">
        <DocumentAction actionKey="revoke-studio-service" variant="tertiary" onClick={() => setOpened(true)}>
          {label}
        </DocumentAction>
      </DocumentActionRow>
    );
  }
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (revoke.isPending) return;
    if (!reason.trim()) { setError('Give a reason for revoking.'); return; }
    setError(null);
    try {
      await revoke.mutateAsync({ completionId: completion.completionId, reason: reason.trim() });
      setOpened(false);
    } catch (failure) {
      setError(report(failure));
    }
  };
  return (
    <form noValidate className="mt-2 space-y-2" aria-label={label} onSubmit={onSubmit}>
      <label className="block t-body-sm" htmlFor={`${id}-reason`}>Why it is revoked</label>
      <Textarea id={`${id}-reason`} rows={2} value={reason} disabled={revoke.isPending}
        onChange={(event) => setReason(event.target.value)} />
      <p id={`${id}-consequence`} className="t-meta">
        The completion and its resolved conditions stay on the record with your reason.
      </p>
      {error && <p role="alert" className="t-body-sm">{error}</p>}
      <DocumentActionRow surfaceKey="studio-service" regionKey="revoke">
        <DocumentAction actionKey="confirm-revoke-studio-service" type="submit" variant="danger"
          disabled={revoke.isPending} loading={revoke.isPending} aria-describedby={`${id}-consequence`}>
          Revoke
        </DocumentAction>
        <DocumentAction actionKey="cancel-revoke-studio-service" variant="tertiary" onClick={() => setOpened(false)}>
          Cancel
        </DocumentAction>
      </DocumentActionRow>
    </form>
  );
}

const EVIDENCE_KEY: Record<ServiceConditionEvidenceKind, keyof ServiceConditionEvidence> = {
  issue: 'issueId', siteRequest: 'siteRequestId', storageObject: 'storageObjectId',
};
const EVIDENCE_GROUP: Record<ServiceConditionEvidenceKind, string> = {
  issue: 'Drawing issues', siteRequest: 'Site requests', storageObject: 'Stored documents',
};

/** The condition texts the client wrote, by conditionId, from the C4 read. */
function useConditionTexts(projectId: string, open: StudioServiceObligations['conditions']): Map<string, string> {
  const acceptance = useServiceAcceptance(projectId);
  const texts = new Map(open.map((condition) => [condition.conditionId, condition.text]));
  for (const request of acceptance.data?.requests ?? []) {
    for (const signer of request.signers) {
      for (const condition of signer.response?.conditions ?? []) texts.set(condition.conditionId, condition.text);
    }
  }
  return texts;
}

function Conditions({ projectId, requestId, open, resolutions, report }: {
  projectId: string;
  requestId: string;
  open: StudioServiceObligations['conditions'];
  resolutions: ServiceConditionResolution[];
  report: Report;
}) {
  const texts = useConditionTexts(projectId, open);
  if (open.length === 0 && resolutions.length === 0) return null;
  return (
    <div data-studio-service-conditions className="mt-4">
      <h4 className="t-body-sm font-semibold">The client&apos;s conditions</h4>
      <ul className="mt-1 space-y-2" aria-label="The client's conditions">
        {open.map((condition) => (
          <OpenCondition key={condition.conditionId} projectId={projectId} requestId={requestId}
            conditionId={condition.conditionId} text={condition.text} report={report} />
        ))}
        {resolutions.map((row) => (
          <li key={row.resolutionId} data-resolved-condition={row.conditionId} className="t-body-sm">
            <p>{texts.get(row.conditionId) ?? 'A condition'} · Resolved {shortDate(row.resolvedAt)}</p>
            <p className="t-meta">{row.resolution}</p>
            <Citations projectId={projectId} evidence={row.evidence} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Citations({ projectId, evidence }: { projectId: string; evidence: ServiceConditionEvidence }) {
  const cited = citedReferences(evidence);
  if (cited.length === 0) return <p className="t-meta">Cited: no longer available</p>;
  return (
    <>
      {cited.map(({ kind, id }) => <Citation key={`${kind}:${id}`} projectId={projectId} kind={kind} id={id} />)}
    </>
  );
}

/** A citation is point-in-time (C6 §2.2), checked on its own: one that is
 *  positively gone reads "no longer available"; one that could not be checked
 *  says so with Retry. Neither is an error, and neither reopens the condition. */
function Citation({ projectId, kind, id }: { projectId: string; kind: ServiceConditionEvidenceKind; id: string }) {
  const citation = useServiceConditionCitation(projectId, kind, id);
  const reference = `${kind}:${id}`;
  if (citation.data) {
    return (
      <p className="t-meta" data-citation={reference} data-citation-state={citation.data.available ? 'available' : 'gone'}>
        Cited: {citation.data.available ? citation.data.label : 'no longer available'}
      </p>
    );
  }
  if (citation.isError) {
    return (
      <div data-citation={reference} data-citation-state="unchecked">
        <p className="t-meta">Cited: {CITATION_UNCHECKED}</p>
        <DocumentActionRow surfaceKey="studio-service" regionKey="citation-retry">
          <DocumentAction actionKey="retry-condition-citation" variant="tertiary" onClick={() => void citation.refetch()}>
            Check the reference again
          </DocumentAction>
        </DocumentActionRow>
      </div>
    );
  }
  return <p className="t-meta" data-citation={reference} data-citation-state="reading">Cited: reading…</p>;
}

function OpenCondition({ projectId, requestId, conditionId, text, report }: {
  projectId: string; requestId: string; conditionId: string; text: string; report: Report;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <li data-open-condition={conditionId} className="t-body-sm">
      <p>{text} · Open</p>
      {opened ? (
        <ResolveCondition projectId={projectId} requestId={requestId} conditionId={conditionId} text={text}
          report={report} onDone={() => setOpened(false)} />
      ) : (
        <DocumentActionRow surfaceKey="studio-service" regionKey="condition">
          <DocumentAction actionKey="resolve-service-condition" variant="tertiary" onClick={() => setOpened(true)}>
            Resolve this condition
          </DocumentAction>
        </DocumentActionRow>
      )}
    </li>
  );
}

function ResolveCondition({ projectId, requestId, conditionId, text, report, onDone }: {
  projectId: string; requestId: string; conditionId: string; text: string; report: Report; onDone: () => void;
}) {
  const id = useId();
  const resolve = useResolveServiceAcceptanceCondition(projectId);
  const options = useServiceConditionEvidenceOptions(projectId);
  const [resolution, setResolution] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (resolve.isPending) return;
    const chosen = options.data?.find((option) => `${option.kind}:${option.id}` === reference);
    // 00888 requires one reference: an empty evidence object refuses.
    if (!resolution.trim() || !chosen) {
      setError('Say how the condition was resolved and choose one reference.');
      return;
    }
    setError(null);
    try {
      await resolve.mutateAsync({
        requestId, conditionId, resolution: resolution.trim(), evidence: { [EVIDENCE_KEY[chosen.kind]]: chosen.id },
      });
      onDone();
    } catch (failure) {
      setError(report(failure));
    }
  };
  return (
    <form noValidate className="mt-2 space-y-2" aria-label={`Resolve: ${text}`} onSubmit={onSubmit}>
      <label className="block t-body-sm" htmlFor={`${id}-resolution`}>How it was resolved</label>
      <Textarea id={`${id}-resolution`} rows={2} value={resolution} disabled={resolve.isPending}
        onChange={(event) => setResolution(event.target.value)} />
      <EvidencePicker id={`${id}-reference`} options={options} value={reference} disabled={resolve.isPending}
        onChange={setReference} />
      {error && <p role="alert" className="t-body-sm">{error}</p>}
      <DocumentActionRow surfaceKey="studio-service" regionKey="resolve-condition">
        <DocumentAction actionKey="record-condition-resolution" type="submit" variant="secondary"
          disabled={resolve.isPending} loading={resolve.isPending}>
          Record the resolution
        </DocumentAction>
        <DocumentAction actionKey="cancel-condition-resolution" variant="tertiary" onClick={onDone}>
          Cancel
        </DocumentAction>
      </DocumentActionRow>
    </form>
  );
}

function EvidencePicker({ id, options, value, disabled, onChange }: {
  id: string;
  options: ReturnType<typeof useServiceConditionEvidenceOptions>;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}): ReactNode {
  if (options.isError) {
    return (
      <div role="alert" className="t-body-sm">
        <p>The references could not be read.</p>
        <DocumentActionRow surfaceKey="studio-service" regionKey="evidence-retry">
          <DocumentAction actionKey="retry-condition-references" variant="secondary" onClick={() => void options.refetch()}>
            Retry the references
          </DocumentAction>
        </DocumentActionRow>
      </div>
    );
  }
  if (!options.data) return <p role="status" className="t-body-sm">Reading what you can cite…</p>;
  if (options.data.length === 0) {
    return <p className="t-body-sm">This job has no drawing issue, site request or stored document to cite yet.</p>;
  }
  const kinds = Object.keys(EVIDENCE_GROUP) as ServiceConditionEvidenceKind[];
  return (
    <>
      <label className="block t-body-sm" htmlFor={id}>What shows it</label>
      <Select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose one reference</option>
        {kinds.map((kind) => {
          const group = options.data.filter((option) => option.kind === kind);
          return group.length === 0 ? null : (
            <optgroup key={kind} label={EVIDENCE_GROUP[kind]}>
              {group.map((option) => (
                <option key={option.id} value={`${option.kind}:${option.id}`}>{option.label}</option>
              ))}
            </optgroup>
          );
        })}
      </Select>
    </>
  );
}

/**
 * A23: care, specification and warranty refer to the edition the service was
 * delivered against and who bought and installed each package. The
 * specification unfolds over the paper and folds back to this reading
 * through the existing unfold return (opening control, then the Closeout
 * chapter's heading).
 */
function CareReferences({ projectId, completion, edition }: {
  projectId: string; completion: StudioServiceCompletion; edition: ScopeEdition | null;
}) {
  const acceptance = useServiceAcceptance(projectId);
  const request = acceptance.data?.requests.find((row) => row.requestId === completion.acceptanceRequestId);
  const included = edition?.packages.filter((entry) => entry.inclusion === 'included') ?? [];
  const openSpecification = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    // Only over this job's mounted round-8 paper; otherwise the link loads.
    const open = unfoldOpenerFor(projectId);
    if (!open) return;
    event.preventDefault();
    open({ kind: 'pieces', lens: 'spec', room: null, line: null },
      { documentId: projectId, chapter: STUDIO_SERVICE_CHAPTER, lens: 'spec' }, event.currentTarget);
  };
  return (
    <div data-care-references className="mt-4">
      <h4 className="t-body-sm font-semibold">Care references</h4>
      <p className="t-meta mt-1">
        Care, specification and warranty refer to
        {edition ? ` scope edition ${edition.editionNumber}, in force from ${shortDate(edition.effectiveAt)}` : ' the agreed scope'}
        {request ? `, accepted on request ${request.requestNumber}` : ''}.
        A later care question is answered against this record. It doesn&apos;t reopen the studio service.
      </p>
      {included.length > 0 && (
        <ul className="t-meta mt-1 ml-4 list-disc" aria-label="Who is responsible">
          {included.map((entry) => (
            <li key={entry.packageKey} data-care-package={entry.packageKey}>
              {entry.label}: bought by {PARTY[entry.responsibilities.purchasing]}, installed by{' '}
              {PARTY[entry.responsibilities.installation]}
            </li>
          ))}
        </ul>
      )}
      <DocumentActionRow surfaceKey="studio-service" regionKey="care-references">
        <DocumentAction actionKey="open-care-specification" variant="tertiary"
          href={`/doc/${projectId}?unfold=pieces&lens=spec`} onClick={openSpecification}>
          Open the specification
        </DocumentAction>
      </DocumentActionRow>
    </div>
  );
}

function History({ projectId, completions, report }: {
  projectId: string; completions: StudioServiceCompletion[]; report: Report;
}) {
  return (
    <div data-studio-service-history className="mt-4">
      <h4 className="t-body-sm font-semibold">Earlier completions</h4>
      <ul className="t-meta mt-1 space-y-1">
        {completions.map((row) => (
          <li key={row.completionId} data-earlier-completion={row.completionId}>
            Completed {shortDate(row.completedAt)}
            {row.revokedAt
              ? ` · Revoked ${shortDate(row.revokedAt)}${row.revokeReason ? `: ${row.revokeReason}` : ''}`
              : ' · Against an earlier scope edition'}
            {row.revokedAt == null && (
              <RevokeCompletion projectId={projectId} completion={row} report={report}
                label={`Revoke the completion of ${shortDate(row.completedAt)}`} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
