'use client';

/**
 * Outreach · Audiences (Track D) — segments that draw from the directory.
 *
 * The whole point (R53): an audience is a slice of the SAME unified directory
 * the Room is built on — segmented by role, lifecycle status, history (recency),
 * or trust. Saved segments come from `useAudienceSegments`; a new one is built
 * by picking a directory-grounded preset, previewing its LIVE count against the
 * roster (`usePeopleDirectory` + audience-rules), then saving via
 * `useCreateAudienceSegment`. `useEstimateAudienceSize` provides the server-side
 * cross-check on the equivalent SegmentRules. Zero shadows (D4).
 */

import { useMemo, useState } from 'react';
import {
  useAudienceSegments,
  useCreateAudienceSegment,
  useDeleteAudienceSegment,
  useEstimateAudienceSize,
  usePeopleDirectory,
} from '@patina/supabase';
import {
  CampRow,
  OutreachButton,
  ListHeader,
  QuietNote,
} from './outreach-bits';
import {
  AUDIENCE_PRESETS,
  countAudience,
  describeAudience,
  presetToSegmentRules,
} from './audience-rules';

const AXIS_LABEL: Record<string, string> = {
  role: 'ROLE',
  status: 'STATUS',
  history: 'HISTORY',
  trust: 'TRUST',
};

export function AudiencesTab({ notify }: { notify: (m: string) => void }) {
  const { data: segments, isLoading } = useAudienceSegments();
  // studio visibility ≠ shared nurture queues — a relationship-action surface;
  // the widened (00420) STUDIO roster stays explicitly mine here (an outreach
  // segment is built from the designer's own book, never a studio-mate's).
  const { data: people } = usePeopleDirectory({ role: 'all', scope: 'mine' });
  const createSegment = useCreateAudienceSegment();
  const deleteSegment = useDeleteAudienceSegment();

  const now = useMemo(() => new Date(), []);
  const [composing, setComposing] = useState(false);
  const [presetKey, setPresetKey] = useState<string>(AUDIENCE_PRESETS[0]!.key);
  const [name, setName] = useState('');

  const preset =
    AUDIENCE_PRESETS.find((p) => p.key === presetKey) ?? AUDIENCE_PRESETS[0]!;
  const rules = useMemo(() => presetToSegmentRules(preset.rule), [preset]);

  // The LIVE count over the directory — the source of truth for "who is in it".
  const liveCount = useMemo(
    () => (people ? countAudience(preset.rule, people, now) : null),
    [people, preset, now],
  );
  // The server-side cross-check on the mapped SegmentRules (best-effort).
  const { data: serverEstimate } = useEstimateAudienceSize(
    rules.conditions.length > 0 ? rules : null,
  );

  const canSubmit = name.trim() && !createSegment.isPending;

  const submit = () => {
    if (!canSubmit) return;
    createSegment.mutate(
      { name: name.trim(), description: describeAudience(preset.rule), rules },
      {
        onSuccess: () => {
          notify(`Segment “${name.trim()}” saved — drawn from your directory.`);
          setComposing(false);
          setName('');
        },
        onError: (e) =>
          notify(
            e instanceof Error ? e.message : 'Could not save the segment.',
          ),
      },
    );
  };

  return (
    <div>
      <p className="mb-3 text-[0.72rem] leading-relaxed text-[var(--color-aged-oak)]">
        Every audience is a slice of your directory — segment by{' '}
        <span className="font-medium text-[var(--color-charcoal)]">role</span>,{' '}
        <span className="font-medium text-[var(--color-charcoal)]">status</span>
        ,{' '}
        <span className="font-medium text-[var(--color-charcoal)]">
          history
        </span>
        , or{' '}
        <span className="font-medium text-[var(--color-charcoal)]">trust</span>.
      </p>

      <ListHeader
        label="Segments"
        action={
          <OutreachButton
            actionKey="new-audience"
            tone="primary"
            onClick={() => setComposing((v) => !v)}
          >
            {composing ? 'Close' : '+ New segment'}
          </OutreachButton>
        }
      />

      {composing && (
        <div className="mb-4 rounded-[10px] border border-[var(--color-pearl)] bg-white p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block font-mono text-[0.44rem] font-semibold uppercase tracking-[0.07em] text-[var(--color-aged-oak)]">
                Segment name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Past clients to reconnect"
                className="w-full rounded-[6px] border border-[var(--color-pearl)] bg-white px-2.5 py-1.5 text-[0.8rem] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block font-mono text-[0.44rem] font-semibold uppercase tracking-[0.07em] text-[var(--color-aged-oak)]">
                Draw from the directory by
              </span>
              <select
                value={presetKey}
                onChange={(e) => setPresetKey(e.target.value)}
                className="w-full rounded-[6px] border border-[var(--color-pearl)] bg-white px-2.5 py-1.5 text-[0.8rem] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
              >
                {AUDIENCE_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* The live preview — "who is in it and why", straight from the roster. */}
          <div className="mt-3 flex items-center justify-between rounded-[8px] border border-[var(--color-pearl)] bg-[var(--color-off-white)] px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="rounded-[3px] border border-[var(--color-clay)] px-[6px] py-[2px] font-mono text-[0.42rem] font-semibold uppercase tracking-[0.05em] text-[var(--color-clay)]">
                {AXIS_LABEL[preset.rule.axis]}
              </span>
              <span className="text-[0.7rem] text-[var(--color-aged-oak)]">
                {describeAudience(preset.rule)}
              </span>
            </div>
            <div className="text-right">
              <span className="font-mono text-[1.05rem] font-medium text-[var(--color-charcoal)]">
                {liveCount == null ? '—' : liveCount}
              </span>
              <span className="ml-1 font-mono text-[0.44rem] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
                {liveCount === 1 ? 'person' : 'people'} now
              </span>
              {typeof serverEstimate === 'number' &&
                serverEstimate !== liveCount && (
                  <div className="mt-0.5 font-mono text-[0.4rem] uppercase tracking-[0.04em] text-[var(--color-aged-oak)]">
                    est. {serverEstimate} server-side
                  </div>
                )}
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <OutreachButton
              actionKey="save-audience"
              tone="primary"
              onClick={submit}
              disabled={!canSubmit}
            >
              {createSegment.isPending ? 'Saving…' : 'Save segment'}
            </OutreachButton>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="px-1 py-5 text-[0.74rem] text-[var(--color-aged-oak)]">
          Reading your segments…
        </p>
      ) : !segments || segments.length === 0 ? (
        <QuietNote>
          No saved segments yet. Build one above — “Past clients”, “Founding
          Circle makers”, “High-trust referrers” — each a live slice of your
          directory.
        </QuietNote>
      ) : (
        segments.map((s) => (
          <CampRow
            key={s.id}
            name={s.name}
            stat={`${s.estimated_size || 0} people · ${s.description?.trim() || 'from the directory'}`}
            right={
              !s.is_preset ? (
                <OutreachButton
                  actionKey="delete-audience"
                  tone="quiet"
                  onClick={() =>
                    deleteSegment.mutate(s.id, {
                      onSuccess: () => notify(`Segment “${s.name}” removed.`),
                      onError: (e) =>
                        notify(
                          e instanceof Error
                            ? e.message
                            : 'Could not remove the segment.',
                        ),
                    })
                  }
                  disabled={deleteSegment.isPending}
                >
                  Delete
                </OutreachButton>
              ) : (
                <span className="shrink-0 font-mono text-[0.42rem] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
                  preset
                </span>
              )
            }
          />
        ))
      )}
    </div>
  );
}
