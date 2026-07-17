'use client';

import { useState } from 'react';
import { PageHeader, EmptyState } from '@/components/portal';
import { useToast } from '@/components/portal/toast-provider';
import { useFulfillmentConfig, useUpdateFulfillmentConfig } from '@/hooks/use-fulfillment-config';
import { ConfigKeyEditor } from '@/components/fulfillment/config/config-key-editor';

// Config editor (S4, spec §10) — replaces S1's placeholder. Every
// fulfillment_config key, typed rate/pct/hours fields, business-hours
// week+holidays editable. Writes via fulfillment_update_config (00353),
// which events config.updated — updated_by/updated_at shown per row so the
// audit trail is visible without leaving the page.

export default function FulfillmentConfigPage() {
  const { toast } = useToast();
  const { data: rows, isLoading, error } = useFulfillmentConfig();
  const updateConfig = useUpdateFulfillmentConfig();
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const handleSave = (key: string, value: Record<string, unknown>) => {
    setSavingKey(key);
    updateConfig.mutate(
      { key, value },
      {
        onSuccess: () => toast(`${key.replace(/_/g, ' ')} saved.`, 'success'),
        onError: (err) => toast(`Couldn't save ${key}: ${(err as Error).message}`, 'error'),
        onSettled: () => setSavingKey(null),
      },
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Config"
        description="Commission rate, settlement tolerance, margin floor, SLA hours, business-hours calendar."
      />

      {isLoading && (
        <div className="space-y-4 py-6" data-testid="config-loading">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded bg-[var(--bg-hover)]" />
          ))}
        </div>
      )}

      {error && (
        <div className="py-10 text-center type-body text-[var(--color-error)]">
          Failed to load fulfillment config: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && rows && rows.length === 0 && (
        <EmptyState label="Fulfillment Config" message="No config rows found." />
      )}

      {!isLoading && !error && rows && rows.length > 0 && (
        <div className="mt-4 space-y-8 divide-y divide-[var(--border-subtle)]">
          {rows.map((row) => (
            <div key={row.key} className="pt-8 first:pt-0">
              <ConfigKeyEditor
                row={row}
                onSave={(value) => handleSave(row.key, value)}
                saving={savingKey === row.key && updateConfig.isPending}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
