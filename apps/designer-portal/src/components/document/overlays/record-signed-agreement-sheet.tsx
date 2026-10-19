'use client';

import { useRef, useState } from 'react';
import { FileCheck } from 'lucide-react';
import { Input } from '@/components/ui/controls';
import { useRecordProjectSignedAgreement } from '@/hooks/use-project-purchasing-agreement';
import { DocSheet } from './doc-sheet';
import { DocumentAction, DocumentActionGroup } from '../document-action';

export function RecordSignedAgreementSheet({ projectId, projectName, onClose }: {
  projectId: string; projectName: string; onClose: () => void;
}) {
  const record = useRecordProjectSignedAgreement(projectId);
  const [file, setFile] = useState<File | null>(null);
  const [signedOn, setSignedOn] = useState('');
  const [coversProject, setCoversProject] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const close = () => { if (!record.isPending) onClose(); };

  return (
    <DocSheet open onClose={close} title="Record signed agreement" icon={FileCheck}
      pageLabel={projectName} initialFocusRef={firstField} kind="record-signed-agreement">
      <p className="mb-4 text-sm text-[var(--text-muted)]">
        Record the agreement signed outside Patina for {projectName}. The PDF stays private to the studio.
        This does not approve purchases or grant billing authority. It cannot be replaced once recorded.
      </p>
      <form noValidate className="space-y-4" onSubmit={async (event) => {
        event.preventDefault();
        if (record.isPending) return;
        setError(null);
        if (!file) { setError('Choose the signed PDF.'); return; }
        try {
          await record.mutateAsync({ file, signedOn, coversProject });
          onClose();
        } catch (failure) {
          setError(failure && typeof failure === 'object' && 'message' in failure
            ? String(failure.message) : 'The agreement could not be recorded. Try again.');
        }
      }}>
        <label className="block text-sm">Signed PDF (up to 20 MiB)
          <Input ref={firstField} type="file" accept="application/pdf,.pdf" required
            disabled={record.isPending} onChange={(event) => {
              setFile(event.target.files?.[0] ?? null); setError(null);
            }} />
        </label>
        <label className="block text-sm">Signed date
          <Input type="date" required value={signedOn} disabled={record.isPending}
            onChange={(event) => { setSignedOn(event.target.value); setError(null); }} />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" required checked={coversProject} disabled={record.isPending}
            className="mt-1 accent-[var(--color-clay)]"
            onChange={(event) => { setCoversProject(event.target.checked); setError(null); }} />
          I confirm this signed agreement covers {projectName}.
        </label>
        {error && <p role="alert" className="text-sm text-[var(--color-clay)]">{error}</p>}
        {record.isPending && <p role="status" className="text-sm">
          {record.stage === 'uploading' ? 'Uploading private PDF…' : 'Recording signed agreement…'}
        </p>}
        <DocumentActionGroup surfaceKey="project" regionKey="record-signed-agreement">
          <DocumentAction actionKey="record-project-signed-agreement" type="submit"
            disabled={record.isPending} loading={record.isPending}>Record</DocumentAction>
          <DocumentAction actionKey="cancel-record-signed-agreement" variant="secondary"
            disabled={record.isPending} onClick={close}>Cancel</DocumentAction>
        </DocumentActionGroup>
      </form>
    </DocSheet>
  );
}
