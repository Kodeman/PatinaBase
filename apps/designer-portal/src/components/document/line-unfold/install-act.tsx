'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRecordFfeInstalled } from '@patina/supabase';
import { todayYmd } from '@/lib/document/format';
import { DateTextInput } from '../date-text-input';
import { DocumentAction } from '../document-action';
import { LABEL_CLS } from './cell';

/**
 * C-04 (D1-09): a delivered line is marked installed from its unfold. The
 * day defaults to today; the field is there for the install that happened
 * yesterday. Cleared, the server records today. Lifted as the line's next
 * act, it leads (primary).
 */
export function InstallAct({
  itemId,
  projectId,
  lifted = false,
}: {
  itemId: string;
  projectId: string;
  lifted?: boolean;
}) {
  const qc = useQueryClient();
  const record = useRecordFfeInstalled({ errorSurface: 'inline' });
  const [installedOn, setInstalledOn] = useState<string | null>(() =>
    todayYmd(),
  );
  const [failed, setFailed] = useState(false);

  const run = () => {
    if (record.isPending) return;
    setFailed(false);
    record
      .mutateAsync({
        projectId,
        itemIds: [itemId],
        installedOn: installedOn ?? undefined,
      })
      .then(() => {
        void qc.invalidateQueries({ queryKey: ['document-state'] });
      })
      .catch(() => setFailed(true));
  };

  return (
    <div className={lifted ? undefined : 'mb-2.5'}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className={LABEL_CLS}>Installed on</span>
        <DateTextInput
          value={installedOn}
          ariaLabel="Install date"
          disabled={record.isPending}
          onChange={setInstalledOn}
          className="bg-transparent text-[11px] text-[var(--color-charcoal)] outline-none"
        />
        <DocumentAction
          actionKey="mark-ffe-line-installed"
          surfaceKey="project"
          regionKey={lifted ? 'ffe-next-act' : 'ffe-install'}
          variant={lifted ? 'primary' : 'tertiary'}
          loading={record.isPending}
          loadingLabel="Saving…"
          onClick={run}
        >
          Mark installed
        </DocumentAction>
      </div>
      {failed && (
        <p role="alert" className="text-[11px] text-[var(--color-terracotta-ink)]">
          Couldn&rsquo;t save
        </p>
      )}
    </div>
  );
}
