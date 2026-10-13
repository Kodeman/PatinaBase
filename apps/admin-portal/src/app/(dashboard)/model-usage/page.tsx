'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader, Section, StatusDot, EmptyState } from '@/components/portal';
import { useToast } from '@/components/portal/toast-provider';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ModelUsageOverview } from '@/app/api/admin/model-usage/route';
import {
  AuditRow,
  FeatureRow,
  type FeatureSave,
  StudioRow,
  formatUsd,
  parseCapText,
  postJson,
} from './model-usage-rows';

// Model usage (US-30 A4): spend and limits for every Claude call, backed by
// the 00770 ledger. Reads via GET /api/admin/model-usage; writes go through
// the audited llm_set_* RPCs, so every change lands in "Recent changes".

const QUERY_KEY = ['admin-model-usage'] as const;

async function fetchOverview(): Promise<ModelUsageOverview> {
  const res = await fetch('/api/admin/model-usage', { cache: 'no-store' });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to load model usage (${res.status})`);
  }
  const json = (await res.json()) as { data: ModelUsageOverview };
  return json.data;
}

export default function ModelUsagePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchOverview,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const controls = useMutation({
    mutationFn: (next: { killSwitch?: boolean; globalDailyCapUsd?: number }) =>
      postJson('/api/admin/model-usage/controls', next),
    onSettled: refresh,
  });
  const feature = useMutation({
    mutationFn: ({ feature: name, ...rest }: FeatureSave) =>
      postJson(`/api/admin/model-usage/features/${encodeURIComponent(name)}`, rest),
    onSuccess: (_d, vars) => toast(`${vars.feature} saved.`, 'success'),
    onError: (err, vars) => toast(`Couldn't save ${vars.feature}: ${(err as Error).message}`, 'error'),
    onSettled: refresh,
  });
  const studio = useMutation({
    mutationFn: (vars: { studioId: string; monthlyCapUsd: number }) =>
      postJson(`/api/admin/model-usage/studios/${vars.studioId}`, { monthlyCapUsd: vars.monthlyCapUsd }),
    onSuccess: () => toast('Studio cap saved.', 'success'),
    onError: (err) => toast(`Couldn't save studio cap: ${(err as Error).message}`, 'error'),
    onSettled: refresh,
  });

  return (
    <div>
      <PageHeader
        title="Model"
        accent="Usage"
        description="Spend and limits for every Claude call Patina makes. Spend counts settled calls; days and months are UTC."
      />

      {isLoading && (
        <div className="mt-10 space-y-4" data-testid="model-usage-loading">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded bg-[var(--bg-hover)]" />
          ))}
        </div>
      )}

      {isError && (
        <Section className="mt-10">
          <div className="border border-[var(--color-error)]/40 bg-[var(--color-error)]/5 px-4 py-3 text-[var(--color-error)] type-body-small">
            Failed to load model usage: {(error as Error)?.message ?? 'unknown error'}
          </div>
        </Section>
      )}

      {data && (
        <>
          <ControlsSection
            key={`${data.controls.killSwitch}:${data.controls.globalDailyCapUsd}`}
            overview={data}
            saving={controls.isPending}
            onSave={async (next, successMessage) => {
              try {
                await controls.mutateAsync(next);
                toast(successMessage, 'success');
              } catch (err) {
                toast(`Couldn't update controls: ${(err as Error).message}`, 'error');
              }
            }}
          />

          <Section title="Features" className="mt-12">
            {data.features.length === 0 ? (
              <EmptyState label="Features" message="No feature controls found." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feature</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead>Daily cap (USD)</TableHead>
                    <TableHead>Studio monthly cap (USD)</TableHead>
                    <TableHead>Today</TableHead>
                    <TableHead>This month</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.features.map((row) => (
                    <FeatureRow
                      key={`${row.feature}:${row.enabled}:${row.dailyCapUsd}:${row.studioMonthlyCapUsd}`}
                      row={row}
                      saving={feature.isPending && feature.variables?.feature === row.feature}
                      onSave={(next) => feature.mutate(next)}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
            <p className="type-meta-small mt-4 text-[var(--text-muted)]">
              Blank cap = no cap at that level. The studio monthly cap applies to each studio&apos;s
              spend on that feature unless the studio has an override below.
            </p>
          </Section>

          <Section title="Studios this month" className="mt-12">
            {data.studios.length === 0 ? (
              <EmptyState label="Studios" message="No studio spend this month and no overrides." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Studio</TableHead>
                    <TableHead>Spend</TableHead>
                    <TableHead>Calls</TableHead>
                    <TableHead>Override monthly cap (USD)</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.studios.map((row) => (
                    <StudioRow
                      key={`${row.studioId}:${row.hasOverride}:${row.overrideMonthlyCapUsd}`}
                      row={row}
                      saving={studio.isPending && studio.variables?.studioId === row.studioId}
                      onSave={(studioId, monthlyCapUsd) => studio.mutate({ studioId, monthlyCapUsd })}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
            <p className="type-meta-small mt-4 text-[var(--text-muted)]">
              An override replaces every feature&apos;s studio monthly cap for that studio, per
              feature. Overrides cannot be removed here, only changed.
            </p>
          </Section>

          <Section title="Recent changes" className="mt-12">
            {data.audit.length === 0 ? (
              <EmptyState label="Recent changes" message="No control changes yet." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Who</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Before</TableHead>
                    <TableHead>After</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.audit.map((row) => (
                    <AuditRow key={row.id} row={row} />
                  ))}
                </TableBody>
              </Table>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function ControlsSection({
  overview,
  saving,
  onSave,
}: {
  overview: ModelUsageOverview;
  saving: boolean;
  onSave: (next: { killSwitch?: boolean; globalDailyCapUsd?: number }, successMessage: string) => Promise<void>;
}) {
  const { killSwitch, globalDailyCapUsd } = overview.controls;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [capText, setCapText] = useState(String(globalDailyCapUsd));
  const parsedCap = parseCapText(capText);
  const capValid = typeof parsedCap === 'number';
  const capDirty = capText.trim() !== String(globalDailyCapUsd);

  return (
    <Section title="Controls" className="mt-10">
      <Table>
        <TableBody>
          <TableRow>
            <TableCell className="py-3 pr-4 align-top">
              <div className="type-label">Kill switch</div>
              <div className="type-meta-small text-[var(--text-muted)]">
                On refuses every Claude call immediately, no deploy needed.
              </div>
            </TableCell>
            <TableCell className="py-3 pr-4 align-top">
              <StatusDot
                variant={killSwitch ? 'error' : 'success'}
                label={killSwitch ? 'On — all calls refused' : 'Off — calls allowed'}
              />
            </TableCell>
            <TableCell className="py-3 text-right align-top">
              <Switch
                checked={killSwitch}
                disabled={saving}
                onCheckedChange={() => setConfirmOpen(true)}
                aria-label="Kill switch"
              />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="py-3 pr-4 align-top">
              <div className="type-label">Global daily cap (USD)</div>
              <div className="type-meta-small text-[var(--text-muted)]">
                Today so far {formatUsd(overview.todayUsd)} · this month {formatUsd(overview.monthUsd)}
              </div>
            </TableCell>
            <TableCell className="py-3 pr-4 align-top">
              <Input
                className="h-8 w-28 font-mono text-[0.8rem]"
                inputMode="decimal"
                value={capText}
                onChange={(e) => setCapText(e.target.value)}
                aria-label="Global daily cap in USD"
                aria-invalid={!capValid}
              />
            </TableCell>
            <TableCell className="py-3 text-right align-top">
              <Button
                size="sm"
                variant="outline"
                disabled={!capDirty || !capValid || saving}
                onClick={() => {
                  if (typeof parsedCap === 'number') {
                    void onSave({ globalDailyCapUsd: parsedCap }, 'Global daily cap saved.');
                  }
                }}
              >
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        variant={killSwitch ? 'warning' : 'destructive'}
        title={killSwitch ? 'Turn the kill switch off?' : 'Turn the kill switch on?'}
        description={
          killSwitch
            ? 'Claude calls resume right away, within the feature and spend caps.'
            : 'Every Claude call from Patina is refused right away, for every feature and studio, until it is turned off again.'
        }
        confirmText={killSwitch ? 'Turn off' : 'Turn on'}
        isLoading={saving}
        onConfirm={() =>
          onSave(
            { killSwitch: !killSwitch },
            killSwitch ? 'Kill switch off. Calls allowed.' : 'Kill switch on. All calls refused.',
          )
        }
      />
    </Section>
  );
}
