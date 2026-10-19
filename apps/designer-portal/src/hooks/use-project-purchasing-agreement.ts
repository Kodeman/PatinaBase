'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient, type Database } from '@patina/supabase';
import { commercialDocumentKeys } from './use-commercial-documents';

type Evidence = Pick<Database['public']['Tables']['project_external_agreement_evidence']['Row'],
  'id' | 'project_id' | 'storage_key' | 'signed_on' | 'attested_by' | 'attested_at'>;
type PurchasingAgreement = {
  state: 'patina_signed' | 'external_recorded' | 'missing';
  evidence: Evidence | null;
};
const agreementKey = (projectId: string) => ['project-purchasing-agreement', projectId] as const;

function readAgreement(data: unknown, projectId: string): PurchasingAgreement {
  const value = data as PurchasingAgreement | null;
  if (!value || !['patina_signed', 'external_recorded', 'missing'].includes(value.state)) {
    throw new Error('Could not read the project agreement. Try again.');
  }
  if (value.state === 'external_recorded' && (!value.evidence ||
    value.evidence.project_id !== projectId || !value.evidence.storage_key?.startsWith(`${projectId}/`))) {
    throw new Error('Could not read the recorded agreement. Try again.');
  }
  return value;
}

export function useProjectPurchasingAgreement(projectId: string) {
  return useQuery({
    queryKey: agreementKey(projectId),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await createBrowserClient().rpc('get_project_purchasing_agreement', {
        p_project_id: projectId,
      });
      if (error) throw error;
      return readAgreement(data, projectId);
    },
  });
}

export function useRecordProjectSignedAgreement(projectId: string) {
  const qc = useQueryClient();
  const uploaded = useRef<{ projectId: string; file: File; key: string } | null>(null);
  const [stage, setStage] = useState<'uploading' | 'recording' | null>(null);
  const mutation = useMutation({
    mutationFn: async ({ file, signedOn, coversProject }: {
      file: File; signedOn: string; coversProject: boolean;
    }) => {
      if (!projectId || file.type !== 'application/pdf' || file.size < 1 || file.size > 20 * 1024 * 1024) {
        throw new Error('Choose a PDF no larger than 20 MiB.');
      }
      const today = new Date();
      const localDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      if (!coversProject || !/^\d{4}-\d{2}-\d{2}$/.test(signedOn) ||
        !Number.isFinite(Date.parse(signedOn)) ||
        new Date(signedOn).toISOString().slice(0, 10) !== signedOn || signedOn > localDay) {
        throw new Error('Provide a nonfuture signed date and confirm this agreement covers this project.');
      }
      const supabase = createBrowserClient();
      if (uploaded.current?.projectId !== projectId || uploaded.current.file !== file) {
        setStage('uploading');
        const key = `${projectId}/${crypto.randomUUID()}.pdf`;
        const { error } = await supabase.storage.from('project-agreements').upload(key, file, {
          contentType: 'application/pdf', upsert: false,
        });
        if (error) throw error;
        uploaded.current = { projectId, file, key };
      }
      setStage('recording');
      const { data, error } = await supabase.rpc('record_project_external_agreement_evidence', {
        p_project_id: projectId, p_storage_key: uploaded.current.key,
        p_signed_on: signedOn, p_covers_project: coversProject,
      });
      if (error) throw error;
      const evidence = data as Evidence | null;
      if (!evidence?.id || evidence.project_id !== projectId || evidence.storage_key !== uploaded.current.key) {
        throw new Error('The agreement was not confirmed. Try Record again.');
      }
      return evidence;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: agreementKey(projectId) }),
        qc.invalidateQueries({ queryKey: commercialDocumentKeys.authority(projectId) }),
        qc.invalidateQueries({ queryKey: ['project-ffe-items', projectId] }),
      ]);
    },
    onSettled: () => setStage(null),
  });
  return { ...mutation, stage };
}
