'use client';

import { useId, useState } from 'react';
import {
  useRecordServiceAcceptancePaperIntake,
  useStampServiceAcceptancePaper,
  type ServiceAcceptanceAnswer,
  type ServiceAcceptanceRequest,
} from '@patina/supabase';
import { Input, Textarea } from '@/components/ui/controls';
import { DocumentAction, DocumentActionRow } from '../document-action';
import { answerLabel, refusalCopy } from './copy';

const ANSWERS: ServiceAcceptanceAnswer[] = ['accept', 'accept_with_conditions', 'return'];

/**
 * K5 paper intake: the studio records what the paper says, attributed to the
 * recorder. It is never a client response until a second owner or admin
 * confirms it against the stamped hash of the stored PDF.
 */
export function PaperIntakeForm({ projectId, request, signerId, signerName, onInactive, onDone }: {
  projectId: string;
  request: ServiceAcceptanceRequest;
  signerId: string;
  signerName: string;
  onInactive: () => void;
  onDone: () => void;
}) {
  const id = useId();
  const record = useRecordServiceAcceptancePaperIntake(projectId);
  const stamp = useStampServiceAcceptancePaper(projectId);
  const [file, setFile] = useState<File | null>(null);
  const [paperOn, setPaperOn] = useState('');
  const [writtenName, setWrittenName] = useState('');
  const [answer, setAnswer] = useState<ServiceAcceptanceAnswer>('accept');
  const [conditions, setConditions] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const busy = record.isPending || stamp.isPending;

  const submit = async () => {
    if (busy) return;
    setError(null);
    if (!file) { setError('Choose the PDF of the paper.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paperOn) || !writtenName.trim()) {
      setError('Give the date on the paper and the name written on it.');
      return;
    }
    let receipt;
    try {
      receipt = await record.mutateAsync({
        request, signerId, file, paperSignedOn: paperOn, signedName: writtenName.trim(), disposition: answer,
        conditions: answer === 'accept_with_conditions'
          ? conditions.split('\n').map((line) => line.trim()).filter(Boolean) : [],
        returnReason: answer === 'return' ? returnReason.trim() : null,
      });
    } catch (failure) {
      const copy = refusalCopy(failure);
      if (copy == null) onInactive();
      setError(copy);
      return;
    }
    try {
      await stamp.mutateAsync({ intakeId: receipt.intakeId });
    } catch {
      // The intake stands; its card offers Stamp again.
    }
    onDone();
  };

  return (
    <form noValidate aria-label={`Record paper for ${signerName}`} className="mt-3 space-y-3"
      onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <p className="t-body-sm">
        Record what the paper says for {signerName}. It counts once another owner or admin confirms it.
      </p>
      <label className="block t-body-sm" htmlFor={`${id}-file`}>PDF of the paper (up to 20 MiB)</label>
      <Input id={`${id}-file`} type="file" accept="application/pdf,.pdf" disabled={busy}
        onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      <label className="block t-body-sm" htmlFor={`${id}-date`}>Date on the paper</label>
      <Input id={`${id}-date`} type="date" value={paperOn} disabled={busy}
        onChange={(event) => setPaperOn(event.target.value)} />
      <label className="block t-body-sm" htmlFor={`${id}-name`}>Name written on the paper</label>
      <Input id={`${id}-name`} value={writtenName} disabled={busy} autoComplete="off"
        onChange={(event) => setWrittenName(event.target.value)} />
      <fieldset className="space-y-1">
        <legend className="t-body-sm">What the paper says</legend>
        {ANSWERS.map((value) => (
          <label key={value} className="flex items-center gap-2 t-body-sm">
            <input type="radio" name={`${id}-answer`} value={value} checked={answer === value} disabled={busy}
              className="accent-[var(--color-clay)]" onChange={() => setAnswer(value)} />
            {answerLabel(value)}
          </label>
        ))}
      </fieldset>
      {answer === 'accept_with_conditions' && (
        <>
          <label className="block t-body-sm" htmlFor={`${id}-conditions`}>Conditions, one per line</label>
          <Textarea id={`${id}-conditions`} value={conditions} disabled={busy} rows={3}
            onChange={(event) => setConditions(event.target.value)} />
        </>
      )}
      {answer === 'return' && (
        <>
          <label className="block t-body-sm" htmlFor={`${id}-reason`}>Reason given for the return</label>
          <Textarea id={`${id}-reason`} value={returnReason} disabled={busy} rows={2}
            onChange={(event) => setReturnReason(event.target.value)} />
        </>
      )}
      {error && <p role="alert" className="t-body-sm">{error}</p>}
      {busy && (
        <p role="status" className="t-body-sm">
          {record.isPending ? 'Recording the paper…' : 'Stamping the stored PDF…'}
        </p>
      )}
      <DocumentActionRow surfaceKey="service-acceptance" regionKey="paper-intake">
        <DocumentAction actionKey="record-acceptance-paper" type="submit" disabled={busy} loading={record.isPending}>
          Record paper
        </DocumentAction>
        <DocumentAction actionKey="cancel-acceptance-paper" variant="tertiary" disabled={busy} onClick={onDone}>
          Cancel
        </DocumentAction>
      </DocumentActionRow>
    </form>
  );
}
