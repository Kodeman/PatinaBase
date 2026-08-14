'use client';

/**
 * The arrival (Match Ceremony, R106 §2 — "what it presents: meet the client").
 * The request payload honored as an arrival, not a form: the ask verbatim as a
 * pull quote, the scan in a quiet frame (I74a — the scan frame opens the Room
 * View, `/room/[id]`, not an in-page sheet), then the facts as a hairline
 * ledger — room, style tags, budget band, timeline. Renders what exists and
 * stays quiet about what doesn't (a roomless request simply has no frame).
 * D4: zero shadows.
 */

import { useRouter } from 'next/navigation';
import type { Lead, LeadRoomScan } from '@patina/supabase';
import { formatBudgetBand } from '@/lib/document/ceremony-context';

const pretty = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function Fact({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--color-pearl)] px-0.5 py-3">
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
        {k}
      </span>
      <span className="text-right text-[14px] text-[var(--text-primary)]">{children}</span>
    </div>
  );
}

export function CeremonyArrival({
  lead,
  scans,
  tags,
}: {
  lead: Lead;
  scans: LeadRoomScan[];
  tags: string[];
}) {
  const router = useRouter();

  const rows = scans.filter((row) => row.scan);
  const primary = rows[0] ?? null;
  const rest = rows.slice(1);

  const roomLabel = primary?.scan?.room_type
    ? pretty(primary.scan.room_type)
    : lead.project_type
      ? pretty(lead.project_type)
      : null;
  const band = formatBudgetBand(lead.budget_range);

  return (
    <div>
      {/* The ask, verbatim — the pull quote is the arrival's voice. */}
      {lead.project_description && (
        <>
          <blockquote className="border-l-2 border-[var(--color-clay)] pl-5 font-heading text-[19px] italic leading-[1.5] text-[var(--text-primary)]">
            “{lead.project_description}”
          </blockquote>
          <p className="mt-2.5 pl-5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
            The ask, verbatim · from the request
          </p>
        </>
      )}

      {/* The scan, when one travelled with the request. */}
      {primary?.scan && (
        <div className="mt-7">
          <button
            type="button"
            onClick={() => router.push(`/room/${primary.scan_id}?from=document&docId=${lead.id}`)}
            className="block w-full rounded-[2px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] p-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
          >
            {primary.scan.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={primary.scan.thumbnail_url}
                alt={primary.scan.name ?? 'Room scan'}
                className="aspect-[3/2] w-full rounded-[2px] object-cover"
              />
            ) : (
              <div className="flex aspect-[3/2] w-full items-center justify-center rounded-[2px] border border-dashed border-[var(--color-pearl)]">
                <span className="font-heading text-[13px] italic text-[var(--text-muted)]">
                  Scan processing — no preview yet
                </span>
              </div>
            )}
            <span className="mt-2 flex items-baseline justify-between px-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
              <span>{primary.scan.room_type ? pretty(primary.scan.room_type) : 'Room scan'}</span>
              <span>
                {primary.scan.model_url || primary.scan.model_url_gltf
                  ? 'Tap to walk it'
                  : primary.scan.floor_area
                    ? `${Math.round(primary.scan.floor_area)} sq ft`
                    : ''}
              </span>
            </span>
          </button>

          {rest.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {rest.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => router.push(`/room/${row.scan_id}?from=document&docId=${lead.id}`)}
                  title={row.scan?.name ?? 'Room scan'}
                  className="h-16 w-16 shrink-0 overflow-hidden rounded-[4px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
                >
                  {row.scan?.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.scan.thumbnail_url}
                      alt={row.scan.name ?? 'Room scan'}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center px-1 text-center text-[9px] italic text-[var(--text-muted)]">
                      No preview
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* The facts — a hairline ledger of what the payload carried. */}
      <div className="mt-7 border-t border-[var(--color-pearl)]">
        {roomLabel && <Fact k="Room">{roomLabel}</Fact>}
        {tags.length > 0 && (
          <Fact k="Style">
            <span className="flex flex-wrap justify-end gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-[var(--color-clay)] px-2.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--color-mocha)]"
                >
                  {t}
                </span>
              ))}
            </span>
          </Fact>
        )}
        {band && <Fact k="Budget band">{band}</Fact>}
        {lead.timeline && <Fact k="Timeline">{pretty(lead.timeline)}</Fact>}
        {(lead.location_city || lead.location_state) && (
          <Fact k="Where">
            {[lead.location_city, lead.location_state].filter(Boolean).join(', ')}
          </Fact>
        )}
      </div>
    </div>
  );
}
