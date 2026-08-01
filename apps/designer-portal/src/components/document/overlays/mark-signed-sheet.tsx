'use client';

/**
 * MarkSignedSheet (R92) — the designer records that a client signed the proposal
 * offline (on paper). The offline sibling of the client's e-sign: sign_proposal
 * is client-authorized and can't be called here, so this drives the designer-
 * authorized record_offline_signature RPC (00254). In one transaction it settles
 * the approval decision (consent method 'paper'), flips the proposal to accepted,
 * and activates the project — returning its id so we walk straight in.
 *
 * Two fields only: who signed (their printed name) and when (the date on the
 * paper, which anchors the activated project's phase/milestone dates). Built on
 * the DocSheet frame — charcoal D8 overlay, ZERO shadows (D4), the document
 * beneath stays mounted (D1), failures render inline at the act (R83 — no toasts).
 */

import { useEffect, useState } from 'react';
import { useRecordOfflineSignature } from '@/hooks/use-proposals';
import { todayYmd } from '@/lib/document/format';
import { DateTextInput } from '../date-text-input';
import { DocSheet } from './doc-sheet';
import { DocumentAction, DocumentActionGroup } from '../document-action';

export function MarkSignedSheet({
  proposalId,
  clientName,
  open,
  onClose,
  onSigned,
}: {
  proposalId: string;
  clientName: string;
  open: boolean;
  onClose: () => void;
  onSigned: (projectId: string) => void;
}) {
  const record = useRecordOfflineSignature();

  const [signedName, setSignedName] = useState('');
  const [signedDate, setSignedDate] = useState(todayYmd());
  const [dateValid, setDateValid] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fresh form every open, pre-filled with the client's name; clear prior error.
  useEffect(() => {
    if (open) {
      setSignedName(clientName ?? '');
      setSignedDate(todayYmd());
      setDateValid(true);
      setError(null);
    }
  }, [open, clientName]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!dateValid) {
      setError('Enter a valid signature date in MM/DD/YYYY format.');
      return;
    }

    record.mutate(
      {
        proposalId,
        signedByName: signedName.trim(),
        signedDate: signedDate || undefined,
      },
      {
        onSuccess: (projectId) => {
          onClose();
          if (projectId) onSigned(projectId);
        },
        onError: (err: Error) => {
          setError(err.message ?? 'Could not record the signature. Try again.');
        },
      },
    );
  };

  return (
    <DocSheet open={open} onClose={onClose} title="Record the signature">
      <form onSubmit={submit} className="mx-auto w-full max-w-[34rem]">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--color-clay)]">
          Signed offline · on paper
        </span>
        <h2 className="mt-2 font-heading text-[1.5rem] italic text-[var(--color-charcoal)]">
          Who signed, and when?
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-mocha)]">
          Records the paper signature against this proposal and opens the
          project — the same as if they had signed here.
        </p>

        <div className="mt-7 space-y-5">
          <Field label="Signed by">
            <Input
              autoFocus
              value={signedName}
              onChange={setSignedName}
              placeholder="The name on the signature line"
            />
          </Field>
          <Field label="Date signed">
            <DateTextInput
              value={signedDate}
              onChange={(value) => setSignedDate(value ?? '')}
              ariaLabel="Date signed"
              onValidityChange={setDateValid}
              className="w-full border-b border-[var(--color-pearl)] bg-transparent pb-1.5 font-mono text-[12px] text-[var(--color-charcoal)] placeholder:text-[var(--text-faint)] focus:border-[var(--color-clay)] focus:outline-none"
            />
          </Field>
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
          regionKey="mark-signed-sheet"
          className="mt-8"
          aria-label="Record signature actions"
        >
          <DocumentAction
            actionKey="record-offline-signature"
            variant="primary"
            type="submit"
            disabled={signedName.trim().length < 2 || !dateValid}
            loading={record.isPending}
            loadingLabel="Recording…"
            trailing="→"
          >
            Record signed
          </DocumentAction>
          <DocumentAction
            actionKey="cancel-record-signature"
            variant="tertiary"
            onClick={onClose}
          >
            Cancel
          </DocumentAction>
          <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
            opens the project
          </span>
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
