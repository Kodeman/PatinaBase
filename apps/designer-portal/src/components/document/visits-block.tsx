'use client';

/**
 * The Visits block (§11.3, FC-R3) — one line per visit on the project spread,
 * beside Room files. Read-only: every row in it is already filed, and this is
 * the record of a visit, not a queue. §16.1 refuses an inbox in the portal and
 * this block is how that refusal stays affordable — the margin carries only the
 * notes she promoted, and everything else lives here.
 *
 * Returns null when the project has no visits. That early return is what makes
 * the wave safe to ship unflagged (FC-R10): a field-less project renders
 * exactly as it did before.
 *
 * ⚠ Ruling 1 (2026-08-24): an in-visit voice note files itself into the margin
 * automatically, so this block and the margin rail carry the same material.
 * This block therefore renders a LEDE and a LINK — the first transcript line,
 * one thumbnail, and an anchor to the margin item — and NEVER the note body.
 * Widening it back to the full transcript is the duplication §11.4 warns about.
 *
 * Typography-first, zero shadows, local primitives — the document surfaces do
 * not reach into @patina/design-system for a heading and a list.
 */
import { useEffect, useState } from 'react';
import {
  useCaptureMediaUrls,
  useProjectVisits,
  type ProjectVisit,
  type ProjectVisitCapture,
} from '@patina/supabase';

function fmtDay(iso: string, timeZone: string | null): string {
  // toLocaleDateString inserts a comma after the weekday ("Tue, Aug 25") in
  // this runtime's ICU data; the copy table wants "Tue Aug 25".
  //
  // W4-C11: without an explicit `timeZone` this reads off the READER's zone,
  // not the VISIT's — a visit ending 19:30 CDT is 00:30Z and prints as
  // tomorrow for anyone east of Chicago. `timeZone` falls back to the
  // reader's own zone only when the capture never recorded one.
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  };
  const day = new Date(iso);
  if (timeZone) {
    try {
      return day.toLocaleDateString('en-US', { ...opts, timeZone }).replace(',', '');
    } catch {
      // captured_timezone is device-supplied and never validated on the way
      // in. An id ICU does not recognise makes toLocaleDateString throw
      // RangeError, and the /doc/[id] route group has no error boundary — an
      // unreadable zone must cost the reader her own zone, not the spread.
    }
  }
  return day.toLocaleDateString('en-US', opts).replace(',', '');
}

function lede(v: ProjectVisit): string {
  const where = v.label ?? (v.rooms.length > 0 ? v.rooms.join(', ') : 'Whole house');
  return `${fmtDay(v.endedAt, v.timezone)} · ${where}`;
}

/** Empty string when both lanes are empty — the caller omits the element
 *  rather than rendering it (F11). */
function tally(v: ProjectVisit): string {
  const parts: string[] = [];
  if (v.photoCount > 0) parts.push(`${v.photoCount} photo${v.photoCount === 1 ? '' : 's'}`);
  if (v.noteCount > 0) parts.push(`${v.noteCount} note${v.noteCount === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

/** The first line of a transcript, clipped so a row stays a row. */
function firstLine(transcript: string | null): string | null {
  const line = (transcript ?? '').split('\n')[0].trim();
  if (line.length === 0) return null;
  return line.length > 96 ? `${line.slice(0, 95).trimEnd()}…` : line;
}

/** What a row prints when it has no transcript line to lead with. "Photo"
 *  is only honest when the capture actually holds one — a voice note whose
 *  transcription failed carries neither a line nor a photo, and printing
 *  "Photo" for it would be a lie (F10). */
function summaryLine(c: ProjectVisitCapture): string {
  return firstLine(c.transcript) ?? (c.photoPaths.length > 0 ? 'Photo' : 'No transcript');
}

/**
 * The lead photo of every capture in the OPEN visit, in one array, so the whole
 * block signs once. One hook inside the row component would give each row its
 * own query key and its own createSignedUrls round-trip.
 */
function leadPhotoPaths(captures: readonly ProjectVisitCapture[]): string[] {
  return captures.map((c) => c.photoPaths[0]).filter((p): p is string => Boolean(p));
}

export function VisitsBlock({ projectId }: { projectId: string }) {
  const { data: visits, isError, error } = useProjectVisits(projectId);
  const [open, setOpen] = useState<string | null>(null);

  // FIX 2: FC-R10's render-nothing posture makes a THROWN query render
  // identically to a genuinely empty one unless the failure is surfaced
  // somewhere. This block still renders null either way (no new
  // user-facing failure copy) — the point is that a QA pass checking the
  // console can now tell the two apart.
  useEffect(() => {
    if (isError) {
      console.error('[VisitsBlock] useProjectVisits failed', projectId, error);
    }
  }, [isError, error, projectId]);

  const openVisit = visits?.find((v) => v.visitId === open) ?? null;
  const { data: signed } = useCaptureMediaUrls(
    openVisit ? leadPhotoPaths(openVisit.captures) : [],
  );

  if (!visits || visits.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h3
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 500,
            fontSize: '1.25rem',
            lineHeight: 1.35,
          }}
        >
          Visits
        </h3>
        <span className="font-mono text-[0.58rem] uppercase tracking-wider text-[var(--text-muted)]">
          {visits.length} {visits.length === 1 ? 'visit' : 'visits'}
        </span>
      </div>

      <ul className="border-t" style={{ borderColor: 'var(--border-default)' }}>
        {visits.map((v) => {
          const tallyText = tally(v);
          const captureListId = `visit-captures-${v.visitId}`;
          return (
            <li key={v.visitId} className="border-b" style={{ borderColor: 'var(--border-default)' }}>
              <button
                type="button"
                onClick={() => setOpen(open === v.visitId ? null : v.visitId)}
                aria-expanded={open === v.visitId}
                aria-controls={captureListId}
                className="flex w-full flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3.5 text-left"
              >
                <span className="text-[15px] text-[var(--text-primary)]">{lede(v)}</span>
                {/* F11: an empty tally is omitted, not rendered as a bare span. */}
                {tallyText ? (
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                    {tallyText}
                  </span>
                ) : null}
              </button>

              {open === v.visitId ? (
                <ul id={captureListId} className="pb-3 pl-3">
                  {v.captures.map((c) => {
                    const lead = c.photoPaths[0];
                    const url = lead ? (signed?.[lead] ?? null) : null;
                    return (
                      <li key={c.id} className="flex items-baseline gap-3 py-1.5">
                        <span className="min-w-[64px] font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                          {c.roomName ?? 'Unplaced'}
                        </span>
                        {url ? (
                          <img
                            src={url}
                            alt=""
                            className="h-7 w-7 flex-shrink-0 self-center rounded-[3px] object-cover"
                          />
                        ) : null}
                        <span className="text-[12px] leading-[1.5] text-[var(--color-charcoal)]">
                          {summaryLine(c)}
                        </span>
                        {c.marginNoteId ? (
                          // The note itself lives in the margin and is rendered
                          // there once. This is a pointer, not a second copy.
                          //
                          // FIX 4 / W4-C9: below 1180px the margin rail is
                          // `hidden`; from 1180–1439px it is a closed `inert`
                          // sheet unless she has already opened it
                          // (margin-rail.tsx's COMPACT_MARGIN_QUERY). Either
                          // way the anchor is unreachable, so the link only
                          // prints at the full-rail breakpoint
                          // (FULL_MARGIN_QUERY, min-[1440px]) where the rail
                          // sits open in the document grid.
                          <a
                            href={`#margin-item-${c.marginNoteId}`}
                            className="ml-auto hidden flex-shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)] hover:text-[var(--color-clay-ink)] min-[1440px]:inline-flex"
                          >
                            Read it in the margin
                          </a>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
