'use client';

/**
 * Correspondence (US-31 B5b): per message kind, whether the studio's messages
 * to clients and trades wait for a designer's Send ("Review before sending",
 * the default) or go out on their schedule. Owners and admins change it; other
 * seats read it. The server refuses a change from anyone else
 * (set_studio_outbound_mode, 00775).
 */

import { useState } from 'react';
import { useSetStudioOutboundMode, useStudioOutboundModes } from '@patina/supabase';
import { Select } from '@/components/ui/controls';
import { OUTBOUND_KIND_GROUPS, OUTBOUND_KIND_LABELS, type OutboundKind } from '@/lib/outbound/kind-labels';

const LABEL =
  'mb-1 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]';
const HELP = 'mt-1 text-[11px] leading-relaxed text-[var(--color-aged-oak)]';
const ROW = 'flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1';
const NAME = 'text-[13px] text-[var(--color-charcoal)]';

type Mode = 'review' | 'scheduled';

const MODE_LABELS: Record<Mode, string> = {
  review: 'Review before sending',
  scheduled: 'Send on schedule',
};

const INTRO =
  'Messages to clients, vendors and trades wait for your Send unless you choose otherwise here.';

export function StudioCorrespondenceCard({
  studioId,
  canManage,
}: {
  studioId: string;
  canManage: boolean;
}) {
  const { data: rows, isLoading } = useStudioOutboundModes(studioId);
  const setMode = useSetStudioOutboundMode();
  // The choice just made; dropped again if the server refuses it.
  const [chosen, setChosen] = useState<Partial<Record<OutboundKind, Mode>>>({});

  const modeOf = (kind: OutboundKind): Mode =>
    chosen[kind] ??
    (rows?.find((row) => row.kind === kind)?.mode === 'scheduled' ? 'scheduled' : 'review');

  const change = (kind: OutboundKind, mode: Mode) => {
    setChosen((prev) => ({ ...prev, [kind]: mode }));
    const forget = () =>
      setChosen((prev) => {
        const next = { ...prev };
        delete next[kind];
        return next;
      });
    setMode.mutate({ studioId, kind, mode }, { onError: forget });
  };

  if (!canManage) {
    return (
      <div className="mb-6 border-t border-[var(--color-pearl)] pt-5" data-correspondence-readonly>
        <h3 className={`${LABEL} mb-3`}>Correspondence</h3>
        <p className={`${HELP} mb-4 mt-0`}>{INTRO}</p>
        {OUTBOUND_KIND_GROUPS.map(({ group, heading, kinds }) => (
          <dl key={group} className="mb-4 max-w-md" aria-label={heading}>
            <p className={LABEL}>{heading}</p>
            {kinds.map((kind) => (
              <div key={kind} className={ROW}>
                <dt className={NAME}>{OUTBOUND_KIND_LABELS[kind]}</dt>
                <dd className="text-[13px] text-[var(--color-aged-oak)]">
                  {isLoading ? '—' : MODE_LABELS[modeOf(kind)]}
                </dd>
              </div>
            ))}
          </dl>
        ))}
        <p className={HELP}>Owners and admins change this.</p>
      </div>
    );
  }

  return (
    <div className="mb-6 border-t border-[var(--color-pearl)] pt-5">
      <fieldset disabled={isLoading} data-correspondence>
        <legend className={`${LABEL} mb-3`}>Correspondence</legend>
        <p className={`${HELP} mb-4 mt-0`}>{INTRO}</p>
        {OUTBOUND_KIND_GROUPS.map(({ group, heading, kinds }) => (
          <div key={group} role="group" aria-label={heading} className="mb-4 max-w-md">
            <p className={LABEL}>{heading}</p>
            {kinds.map((kind) => {
              const id = `correspondence-${kind}`;
              return (
                <div key={kind} className={ROW}>
                  <label htmlFor={id} className={NAME}>
                    {OUTBOUND_KIND_LABELS[kind]}
                  </label>
                  <Select
                    id={id}
                    wrapperClassName="w-auto"
                    className="min-h-11"
                    value={modeOf(kind)}
                    disabled={setMode.isPending && setMode.variables?.kind === kind}
                    onChange={(e) => change(kind, e.target.value as Mode)}
                  >
                    <option value="review">{MODE_LABELS.review}</option>
                    <option value="scheduled">{MODE_LABELS.scheduled}</option>
                  </Select>
                </div>
              );
            })}
          </div>
        ))}
        {setMode.isError && (
          <p role="alert" className="mt-2 text-[12px] text-[var(--color-terracotta-ink)]">
            Could not change how this message is sent. Only an owner or admin can change it.
          </p>
        )}
      </fieldset>
    </div>
  );
}
