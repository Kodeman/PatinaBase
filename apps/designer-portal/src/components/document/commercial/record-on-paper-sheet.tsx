'use client';

/**
 * RecordOnPaperSheet — the designer records that a paper original carries
 * the signature or acceptance a commercial document was waiting on: the
 * printed-and-signed sibling of the client's own on-screen act, for the four
 * points a commercial document asks one of the client honestly offline.
 *
 * Modeled on overlays/mark-signed-sheet.tsx (R92 — same ceremony: prefilled
 * name, a date field, inline errors, no double-confirm). What's new here is
 * `kind`, which selects which paper RPC actually runs, and an optional scan
 * upload for the three kinds whose RPC accepts one. The provenance recorded
 * is always the same shape (00412 shared contract): the client's own name on
 * the signature line, `signed_ip` NULL (the paper tell — no browser touched
 * this), and — when a scan is attached — the Folio file it points at.
 *
 * Upload-then-record, always in that order: `record_paper_client_signature`
 * / `execute_*_on_paper` validate that a passed scan document actually
 * belongs to this proposal, so the scan has to exist before the RPC call
 * that references it.
 */

import { useEffect, useRef, useState } from 'react';
import { todayYmd } from '@/lib/document/format';
import {
  uploadPaperScanDocument,
  useExecuteFurnishingsAuthorizationOnPaper,
  useExecuteTradeScopeOnPaper,
  useRecordPaperClientSignature,
  useRecordPaperTradeAcceptance,
} from '@/hooks/use-commercial-documents';
import { DateTextInput } from '../date-text-input';
import { DocSheet } from '../overlays/doc-sheet';
import { DocumentAction, DocumentActionGroup } from '../document-action';

export type RecordOnPaperKind =
  | 'design-services'
  | 'furnishings'
  | 'trade-execution'
  | 'trade-acceptance';

const KIND_COPY: Record<
  RecordOnPaperKind,
  {
    /** The DocSheet chrome title — kind-aware so an acceptance sheet never
     *  reads as though a signature is being recorded. */
    sheetTitle: string;
    /** The scored eyebrow line above the heading. */
    eyebrow: string;
    nameLabel: string;
    dateLabel: string;
    heading: string;
    body: string;
    submitLabel: string;
    submittingLabel: string;
  }
> = {
  'design-services': {
    sheetTitle: 'Record signed on paper',
    eyebrow: 'Signed offline · on paper',
    nameLabel: 'Signed by',
    dateLabel: 'Date signed',
    heading: 'Who signed the paper original, and when?',
    body: "Records the client's printed signature against this agreement. Countersign it below once it's recorded, the same as any other signature.",
    submitLabel: 'Record signed',
    submittingLabel: 'Recording…',
  },
  furnishings: {
    sheetTitle: 'Record signed on paper',
    eyebrow: 'Signed offline · on paper',
    nameLabel: 'Signed by',
    dateLabel: 'Date signed',
    heading: 'Who signed the paper original, and when?',
    body: 'Executes this authorization exactly as if it were signed here — the named lines move to the schedule and the deposit invoice follows.',
    submitLabel: 'Record & execute',
    submittingLabel: 'Executing…',
  },
  'trade-execution': {
    sheetTitle: 'Record signed on paper',
    eyebrow: 'Signed offline · on paper',
    nameLabel: 'Signed by',
    dateLabel: 'Date signed',
    heading: 'Who signed the paper original, and when?',
    body: 'Executes this scope exactly as if it were signed here — the deposit draw is issued and the trade can be engaged.',
    submitLabel: 'Record & execute',
    submittingLabel: 'Executing…',
  },
  'trade-acceptance': {
    sheetTitle: 'Record the acceptance',
    eyebrow: 'Record the acceptance · signed offline',
    nameLabel: 'Accepted by',
    dateLabel: 'Date accepted',
    heading: 'Who accepted the finished work on paper, and when?',
    body: "Records the client's printed acceptance. The final draw unlocks — it isn't issued automatically.",
    submitLabel: 'Record accepted',
    submittingLabel: 'Recording…',
  },
};

/** All four paper acts can now carry a scan (00425 added trade-acceptance's
 *  own acceptance_scan_document_id alongside the three execution/signature
 *  RPCs' existing scan pointer) — kept as a lookup rather than folded away
 *  so a future kind can still opt out explicitly. */
const ALLOWS_SCAN: Record<RecordOnPaperKind, boolean> = {
  'design-services': true,
  furnishings: true,
  'trade-execution': true,
  'trade-acceptance': true,
};

export function RecordOnPaperSheet({
  kind,
  proposalId,
  projectId = null,
  clientName = '',
  open,
  onClose,
  onRecorded,
}: {
  kind: RecordOnPaperKind;
  proposalId: string;
  /** Required for furnishings / trade-execution / trade-acceptance — their
   *  invalidation is project-scoped. Unused (and unneeded) for design-services. */
  projectId?: string | null;
  clientName?: string;
  open: boolean;
  onClose: () => void;
  onRecorded?: () => void;
}) {
  // All four are set up unconditionally (cheap — a useMutation call does
  // nothing until .mutate/.mutateAsync fires) so `kind` can freely pick which
  // one actually runs without changing this component's hook order.
  const recordClientSignature = useRecordPaperClientSignature(proposalId);
  const executeFurnishings = useExecuteFurnishingsAuthorizationOnPaper(
    projectId ?? '',
  );
  const executeTradeScope = useExecuteTradeScopeOnPaper(projectId ?? '');
  const recordTradeAcceptance = useRecordPaperTradeAcceptance(
    projectId ?? '',
  );

  const [signedName, setSignedName] = useState('');
  const [paperSignedOn, setPaperSignedOn] = useState(todayYmd());
  const [dateValid, setDateValid] = useState(true);
  const [scanFile, setScanFile] = useState<File | null>(null);
  // Set once uploadPaperScanDocument resolves, and reused verbatim on a
  // retry after a failed record — a retry re-runs submit() without the user
  // touching the file picker again, and re-uploading would leave an orphan
  // scan document sitting in the Folio for every failed attempt. Cleared
  // whenever the picked file itself changes, so a genuinely new file is
  // never recorded under a stale id.
  const [uploadedScanId, setUploadedScanId] = useState<string | null>(null);
  const [stage, setStage] = useState<'idle' | 'uploading' | 'recording'>(
    'idle',
  );
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSignedName(clientName ?? '');
      setPaperSignedOn(todayYmd());
      setDateValid(true);
      setScanFile(null);
      setUploadedScanId(null);
      setStage('idle');
      setError(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [open, clientName]);

  const copy = KIND_COPY[kind];
  const allowsScan = ALLOWS_SCAN[kind];
  const isPending =
    recordClientSignature.isPending ||
    executeFurnishings.isPending ||
    executeTradeScope.isPending ||
    recordTradeAcceptance.isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!dateValid) {
      setError('Enter a valid date in MM/DD/YYYY format.');
      return;
    }
    const trimmedName = signedName.trim();
    if (trimmedName.length < 2) return;

    try {
      // Reuse a scan already uploaded on a prior, failed attempt at this
      // same open sheet rather than uploading a second copy — see
      // uploadedScanId's declaration above.
      let scanDocumentId: string | null = uploadedScanId;
      if (allowsScan && scanFile && !scanDocumentId) {
        setStage('uploading');
        scanDocumentId = await uploadPaperScanDocument(proposalId, scanFile);
        setUploadedScanId(scanDocumentId);
      }

      setStage('recording');
      switch (kind) {
        case 'design-services':
          await recordClientSignature.mutateAsync({
            signedName: trimmedName,
            paperSignedOn,
            scanDocumentId,
          });
          break;
        case 'furnishings':
          await executeFurnishings.mutateAsync({
            proposalId,
            signedName: trimmedName,
            paperSignedOn,
            scanDocumentId,
          });
          break;
        case 'trade-execution':
          await executeTradeScope.mutateAsync({
            proposalId,
            signedName: trimmedName,
            paperSignedOn,
            scanDocumentId,
          });
          break;
        case 'trade-acceptance':
          await recordTradeAcceptance.mutateAsync({
            proposalId,
            signedName: trimmedName,
            paperSignedOn,
            scanDocumentId,
          });
          break;
      }
      setStage('idle');
      onRecorded?.();
    } catch (err) {
      setStage('idle');
      setError(
        err instanceof Error
          ? err.message
          : 'Could not record this. Try again.',
      );
    }
  };

  const loadingLabel =
    stage === 'uploading' ? 'Uploading the scan…' : copy.submittingLabel;

  return (
    <DocSheet open={open} onClose={onClose} title={copy.sheetTitle}>
      <form onSubmit={submit} className="mx-auto w-full max-w-[34rem]">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-clay)]">
          {copy.eyebrow}
        </span>
        <h2 className="mt-2 font-heading text-[1.5rem] italic text-[var(--color-charcoal)]">
          {copy.heading}
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-mocha)]">
          {copy.body}
        </p>

        <div className="mt-7 space-y-5">
          <Field label={copy.nameLabel}>
            <Input
              autoFocus
              value={signedName}
              onChange={setSignedName}
              placeholder="The name on the signature line"
            />
          </Field>
          <Field label={copy.dateLabel}>
            <DateTextInput
              value={paperSignedOn}
              onChange={(value) => setPaperSignedOn(value ?? '')}
              ariaLabel={copy.dateLabel}
              onValidityChange={setDateValid}
              className="w-full border-b border-[var(--color-pearl)] bg-transparent pb-1.5 font-mono text-[12px] text-[var(--color-charcoal)] placeholder:text-[var(--text-faint)] focus:border-[var(--color-clay)] focus:outline-none"
            />
          </Field>
          {allowsScan && (
            <Field label="Scan of the signed original (optional)">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => {
                  setScanFile(e.target.files?.[0] ?? null);
                  // A newly picked file is not the one (if any) already
                  // uploaded under uploadedScanId — never record a
                  // different file under a stale scan id.
                  setUploadedScanId(null);
                }}
                className="block w-full text-[12px] text-[var(--color-mocha)] file:mr-3 file:rounded-[3px] file:border file:border-[var(--color-pearl)] file:bg-transparent file:px-3 file:py-1.5 file:font-mono file:text-[10px] file:uppercase file:tracking-[0.08em] file:text-[var(--color-charcoal)]"
              />
              {scanFile && (
                <span className="mt-1 block text-[10.5px] text-[var(--text-muted)]">
                  {scanFile.name}
                </span>
              )}
              <span className="mt-1 block text-[10.5px] text-[var(--text-muted)]">
                The signed copy files to the client&rsquo;s folio — they can see it.
              </span>
            </Field>
          )}
        </div>

        {error && (
          <p
            className="mt-5 text-[12px] text-[var(--color-terracotta)]"
            role="alert"
          >
            {error}
          </p>
        )}

        <DocumentActionGroup
          surfaceKey="open-document"
          regionKey="record-on-paper-sheet"
          className="mt-8"
          aria-label="Record on paper actions"
        >
          <DocumentAction
            actionKey="record-on-paper"
            variant="primary"
            type="submit"
            disabled={signedName.trim().length < 2 || !dateValid}
            loading={isPending}
            loadingLabel={loadingLabel}
            trailing="→"
          >
            {copy.submitLabel}
          </DocumentAction>
          <DocumentAction
            actionKey="cancel-record-on-paper"
            variant="tertiary"
            onClick={onClose}
          >
            Cancel
          </DocumentAction>
        </DocumentActionGroup>
      </form>
    </DocSheet>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="text"
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border-b border-[var(--color-pearl)] bg-transparent pb-1.5 text-[14px] text-[var(--color-charcoal)] placeholder:text-[var(--text-faint)] focus:border-[var(--color-clay)] focus:outline-none"
    />
  );
}
