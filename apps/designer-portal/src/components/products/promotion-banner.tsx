'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { LayerIcon } from '@patina/catalog-ui';
import { usePromotionCandidates } from '@patina/supabase';

const DISMISS_KEY = 'library_promotion_banner_dismissed';

/**
 * Inline banner at the top of the Personal LayerView surfacing the count
 * of personal items that meet the PRD §6.1 promotion bar. Renders only
 * when count >= 1 and the user hasn't dismissed it this session.
 *
 * v1 keeps the CTA informational — clicking the chevron expands a small
 * preview list rather than navigating elsewhere. Bulk-promote routing
 * lands with the BulkPromoteToStudioModal in Sprint 2 chunk 3.
 */
export function PromotionBanner() {
  const { data } = usePromotionCandidates({ limit: 5 });
  const [sessionDismissed, setSessionDismissed] = useState(true);

  useEffect(() => {
    try {
      setSessionDismissed(window.sessionStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setSessionDismissed(false);
    }
  }, []);

  if (sessionDismissed) return null;
  if (!data || data.count === 0) return null;

  function dismiss() {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* sessionStorage unavailable — silently skip persistence */
    }
    setSessionDismissed(true);
  }

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-md border px-4 py-3"
      style={{
        background: 'rgba(168, 181, 160, 0.08)',
        borderColor: 'rgba(168, 181, 160, 0.35)',
      }}
    >
      <div style={{ paddingTop: 2 }}>
        <LayerIcon layer="studio" size="md" />
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <div className="font-body text-[0.85rem] text-[var(--text-primary)]">
          <span className="font-semibold">
            {data.count} {data.count === 1 ? 'item is' : 'items are'} ready for the Studio Library
          </span>
          <span className="text-[var(--text-muted)]">
            {' '}
            — used in two or more projects with successful order history.
          </span>
        </div>
        {data.items.length > 0 && (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[0.78rem] text-[var(--text-muted)]">
            {data.items.slice(0, 4).map((item) => (
              <li key={item.product_id} className="truncate">
                · {item.name}
              </li>
            ))}
            {data.count > 4 && <li>+ {data.count - 4} more</li>}
          </ul>
        )}
        <p className="text-[0.78rem] text-[var(--text-muted)]">
          Click any item below and choose <em>Promote to Studio</em> to make it studio-wide.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss until next session"
        className="rounded-sm p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
