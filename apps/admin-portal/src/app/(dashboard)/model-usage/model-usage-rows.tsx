'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { TableCell, TableRow } from '@/components/ui/table';
import type {
  ModelUsageAuditRow,
  ModelUsageFeature,
  ModelUsageStudio,
} from '@/app/api/admin/model-usage/route';

const usdFormat = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

export function formatUsd(value: number): string {
  return usdFormat.format(value);
}

export function capToText(value: number | null): string {
  return value === null ? '' : String(value);
}

/** '' → null (no cap); otherwise a finite number >= 0, or undefined when invalid. */
export function parseCapText(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? `Request failed (${res.status})`);
  }
}

const capInputClass = 'h-8 w-28 font-mono text-[0.8rem]';

const FEATURE_LABELS: Record<string, string> = {
  'client-edition-compose': 'Client page editions',
};

function featureLabel(feature: string): string | undefined {
  return FEATURE_LABELS[feature];
}

// ─── Features ───────────────────────────────────────────────────────────────

export interface FeatureSave {
  feature: string;
  enabled: boolean;
  dailyCapUsd: number | null;
  studioMonthlyCapUsd: number | null;
}

export function FeatureRow({
  row,
  saving,
  onSave,
}: {
  row: ModelUsageFeature;
  saving: boolean;
  onSave: (next: FeatureSave) => void;
}) {
  const [enabled, setEnabled] = useState(row.enabled);
  const [daily, setDaily] = useState(capToText(row.dailyCapUsd));
  const [studio, setStudio] = useState(capToText(row.studioMonthlyCapUsd));

  const dailyCap = parseCapText(daily);
  const studioCap = parseCapText(studio);
  const invalid = dailyCap === undefined || studioCap === undefined;
  const dirty =
    enabled !== row.enabled ||
    daily.trim() !== capToText(row.dailyCapUsd) ||
    studio.trim() !== capToText(row.studioMonthlyCapUsd);

  return (
    <TableRow>
      <TableCell className="font-mono text-[0.8rem]">
        {featureLabel(row.feature) ? (
          <>
            <span className="block font-sans text-sm">{featureLabel(row.feature)}</span>
            {row.feature}
          </>
        ) : (
          row.feature
        )}
      </TableCell>
      <TableCell>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          aria-label={`${row.feature} enabled`}
        />
      </TableCell>
      <TableCell>
        <Input
          className={capInputClass}
          inputMode="decimal"
          placeholder="No cap"
          value={daily}
          onChange={(e) => setDaily(e.target.value)}
          aria-label={`${row.feature} daily cap in USD`}
          aria-invalid={dailyCap === undefined}
        />
      </TableCell>
      <TableCell>
        <Input
          className={capInputClass}
          inputMode="decimal"
          placeholder="No cap"
          value={studio}
          onChange={(e) => setStudio(e.target.value)}
          aria-label={`${row.feature} studio monthly cap in USD`}
          aria-invalid={studioCap === undefined}
        />
      </TableCell>
      <TableCell className="font-mono text-[0.8rem]">{formatUsd(row.todayUsd)}</TableCell>
      <TableCell className="font-mono text-[0.8rem]">{formatUsd(row.monthUsd)}</TableCell>
      <TableCell className="text-right">
        <Button
          size="sm"
          variant="outline"
          disabled={!dirty || invalid || saving}
          onClick={() => {
            if (dailyCap === undefined || studioCap === undefined) return;
            onSave({ feature: row.feature, enabled, dailyCapUsd: dailyCap, studioMonthlyCapUsd: studioCap });
          }}
        >
          {saving ? 'Saving…' : invalid ? 'Fix caps' : 'Save'}
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ─── Studios ────────────────────────────────────────────────────────────────

export function StudioRow({
  row,
  saving,
  onSave,
}: {
  row: ModelUsageStudio;
  saving: boolean;
  onSave: (studioId: string, monthlyCapUsd: number) => void;
}) {
  const initial = row.hasOverride ? capToText(row.overrideMonthlyCapUsd) : '';
  const [cap, setCap] = useState(initial);
  const parsed = parseCapText(cap);
  // Blank never saves: an override with no cap would lift the studio's limit
  // entirely, and an override cannot be removed once written.
  const valid = typeof parsed === 'number';
  const dirty = cap.trim() !== initial;

  return (
    <TableRow>
      <TableCell>
        <div className="type-label">{row.name ?? 'Unknown studio'}</div>
        <div className="font-mono text-[0.7rem] text-[var(--text-muted)]">{row.studioId}</div>
      </TableCell>
      <TableCell className="font-mono text-[0.8rem]">{formatUsd(row.monthUsd)}</TableCell>
      <TableCell className="font-mono text-[0.8rem]">{row.monthCalls}</TableCell>
      <TableCell>
        <Input
          className={capInputClass}
          inputMode="decimal"
          placeholder={row.hasOverride ? 'No cap' : 'Feature cap'}
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          aria-label={`${row.name ?? row.studioId} monthly cap override in USD`}
          aria-invalid={cap.trim() !== '' && !valid}
        />
      </TableCell>
      <TableCell className="text-right">
        <Button
          size="sm"
          variant="outline"
          disabled={!dirty || !valid || saving}
          onClick={() => {
            if (typeof parsed === 'number') onSave(row.studioId, parsed);
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ─── Audit ──────────────────────────────────────────────────────────────────

function compactJson(value: unknown): string {
  if (value === null || value === undefined) return '—';
  return JSON.stringify(value);
}

export function AuditRow({ row }: { row: ModelUsageAuditRow }) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap font-mono text-[0.75rem]">
        {new Date(row.at).toLocaleString()}
      </TableCell>
      <TableCell className="text-[0.8rem]">{row.actorEmail ?? row.actor ?? 'system'}</TableCell>
      <TableCell className="font-mono text-[0.75rem]">{row.target}</TableCell>
      <TableCell className="font-mono text-[0.7rem] text-[var(--text-muted)]">
        {compactJson(row.before)}
      </TableCell>
      <TableCell className="font-mono text-[0.7rem]">{compactJson(row.after)}</TableCell>
    </TableRow>
  );
}
