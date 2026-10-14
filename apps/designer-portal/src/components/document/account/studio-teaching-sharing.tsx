'use client';

/**
 * Teaching (R5, V23): a studio setting, on by default. While on, the studio's
 * corrections help Patina read pieces for every studio; off keeps them inside
 * the studio. Other seats read the setting and cannot change it; the server
 * refuses a change from anyone else and logs each one
 * (set_studio_teaching_sharing, 00790).
 */

import { useSetStudioTeachingSharing, useStudioTeachingSharing } from '@patina/supabase';

const LABEL =
  'mb-1 block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]';
const HELP = 'mt-1 text-[11px] leading-relaxed text-[var(--color-aged-oak)]';

const BODY =
  "Your studio's corrections help Patina read pieces better for every studio. Turn this off to keep them to yourselves.";

export function StudioTeachingSharingCard({
  studioId,
  canManage,
}: {
  studioId: string;
  canManage: boolean;
}) {
  const { data, isLoading } = useStudioTeachingSharing(studioId);
  const setSharing = useSetStudioTeachingSharing();
  const sharing = data !== false;

  if (!canManage) {
    return (
      <div className="mb-6 border-t border-[var(--color-pearl)] pt-5">
        <dl className="max-w-md" data-teaching-sharing-readonly>
          <dt className={`${LABEL} mb-3`}>Teaching</dt>
          <dd className="text-[13px] text-[var(--color-charcoal)]">
            {isLoading ? '—' : sharing ? 'Shared with every studio.' : 'Kept to this studio.'}
          </dd>
          <dd className={HELP}>Owners and admins change this.</dd>
        </dl>
      </div>
    );
  }

  return (
    <div className="mb-6 border-t border-[var(--color-pearl)] pt-5">
      <fieldset disabled={isLoading || setSharing.isPending} data-teaching-sharing>
        <legend className={`${LABEL} mb-3`}>Teaching</legend>
        <p className={`${HELP} mb-3 mt-0 max-w-md`}>{BODY}</p>
        <label className="flex min-h-11 items-center gap-2 text-[13px] text-[var(--color-charcoal)]">
          <input
            type="checkbox"
            checked={sharing}
            onChange={(e) =>
              setSharing.mutate({ organizationId: studioId, share: e.target.checked })
            }
          />
          Share our teaching
        </label>
        {setSharing.isError && (
          <p role="alert" className="mt-2 text-[12px] text-[var(--color-terracotta-ink)]">
            Could not change teaching sharing. Only an owner or admin can change it.
          </p>
        )}
      </fieldset>
    </div>
  );
}
