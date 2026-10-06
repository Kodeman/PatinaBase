'use client';

/**
 * Who sees margin (R1, C-36): a studio setting. Everyone in the studio by
 * default; an owner or admin can restrict margin, markup and trade cost to
 * owners and admins. Other seats read the setting and cannot change it. The
 * server refuses a change from anyone else (set_studio_margin_visibility,
 * 00713), and decides who sees margin (can_see_studio_margin).
 */

import {
  useSetStudioMarginVisibility,
  useStudioMarginVisibility,
  type StudioMarginVisibility,
} from '@patina/supabase';

const LABEL =
  'mb-1 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]';
const HELP = 'mt-1 text-[11px] leading-relaxed text-[var(--color-aged-oak)]';

const OPTIONS: { value: StudioMarginVisibility; label: string }[] = [
  { value: 'everyone', label: 'Everyone in the studio' },
  { value: 'owners_admins', label: 'Owners and admins only' },
];

export function StudioMarginVisibilityCard({
  studioId,
  canManage,
}: {
  studioId: string;
  canManage: boolean;
}) {
  const { data: visibility, isLoading } = useStudioMarginVisibility(studioId);
  const setVisibility = useSetStudioMarginVisibility();
  const current = visibility ?? 'everyone';

  return (
    <div className="mb-6 border-t border-[var(--color-pearl)] pt-5">
      {canManage ? (
        <fieldset disabled={isLoading || setVisibility.isPending}>
          <legend className={`${LABEL} mb-3`}>Who sees margin</legend>
          <p className={`${HELP} mb-3 mt-0`}>
            Margin, markup and trade cost on the schedule and in the accounts.
          </p>
          <div className="space-y-2">
            {OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 text-[13px] text-[var(--color-charcoal)]"
              >
                <input
                  type="radio"
                  name="studio-margin-visibility"
                  value={option.value}
                  checked={current === option.value}
                  onChange={() =>
                    setVisibility.mutate({ organizationId: studioId, visibility: option.value })
                  }
                />
                {option.label}
              </label>
            ))}
          </div>
          {setVisibility.isError && (
            <p role="alert" className="mt-2 text-[12px] text-[var(--color-terracotta-ink)]">
              Could not change who sees margin. Only an owner or admin can change it.
            </p>
          )}
        </fieldset>
      ) : (
        <dl className="max-w-md">
          <dt className={`${LABEL} mb-3`}>Who sees margin</dt>
          <dd className="text-[13px] text-[var(--color-charcoal)]">
            {isLoading ? '—' : OPTIONS.find((option) => option.value === current)?.label}
          </dd>
          <dd className={HELP}>Owners and admins change this.</dd>
        </dl>
      )}
    </div>
  );
}
