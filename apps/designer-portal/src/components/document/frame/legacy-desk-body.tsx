'use client';

import { DeskRoster } from '@/components/document/desk-roster';
import { DeskTodaySkeleton } from '@/components/loading';
import { DaySheet } from '@/components/document/day-sheet';
import { EmptyState } from '@/components/document/empty-state';
import {
  DocumentAction,
  DocumentActionGroup,
} from '@/components/document/document-action';
import { RegionRule } from '@/components/document/region/region-rule';
import { DeskContents } from '@/components/document/desk-contents';
import { RecentBoardsStrip } from '@/components/document/recent-boards-strip';
import { DeskBoardsReactionRollup } from '@/components/document/desk-boards-reaction-rollup';
import { CaptureLeadSheet } from '@/components/document/overlays/capture-lead-sheet';
import { OpenProjectSheet } from '@/components/document/overlays/open-project-sheet';
import { openCommandBar } from '@/components/document/command-bar';

import type { DeskFrameSlots } from './frame-slots';

export function LegacyDeskBody({
  sheet,
  cards,
  ledger,
  recorded,
  scope,
  onScope,
  oneVoice,
  now,
  dateLabel,
  teammateActed,
  names,
  holderOf,
  deskLine,
  othersHold,
  loading,
  loadingRegister,
  deskEmpty,
  arrivalHeld,
  arrivalRoot,
  arrivalReady,
  deskRead,
  deskRoot,
  notePress,
  firstName,
  greetingWord,
  isError,
  refetch,
  captureOpen,
  setCaptureOpen,
  openProjectOpen,
  setOpenProjectOpen,
  setRecorded,
}: DeskFrameSlots) {
  const rosterBlock =
    (loading || arrivalHeld) && loadingRegister ? (
      <DeskTodaySkeleton dateLabel={dateLabel} />
    ) : loading || arrivalHeld ? (
      // Loading is not empty: Today's eyebrow and three quiet frames where
      // its cards will stand, no ledger yet.
      <section
        className="section"
        aria-labelledby="desk-loading-head"
        aria-busy="true"
        data-tour-anchor="desk-needs-your-hand"
      >
        <div className="sec-head">
          <p id="desk-loading-head" className="eb">
            <svg
              className="orn"
              viewBox="0 0 34 12"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M0 2h34M0 6h28M0 10h20" />
            </svg>
            <span>{dateLabel ? `${dateLabel} · Today` : 'Today'}</span>
          </p>
        </div>
        <p className="sr-only">Loading today’s lines.</p>
        <div className="cards-wrap" aria-hidden="true">
          <div className="cards">
            {[0, 1, 2].map((i) => (
              <div key={i} className="desk-loading-frame" />
            ))}
          </div>
        </div>
      </section>
    ) : deskEmpty && sheet.unchecked.length === 0 ? (
      <div data-tour-anchor="desk-needs-your-hand">
        <EmptyState eyebrow={dateLabel ? `${dateLabel} · Today` : 'Today'}>
          No project files yet. Record an inquiry or create a project file to
          begin.
        </EmptyState>
      </div>
    ) : (
      <>
        <DaySheet
          sheet={sheet}
          cards={cards}
          scope={scope}
          onScope={onScope}
          oneVoice={oneVoice}
          now={now}
          dateLabel={dateLabel}
          teammateActed={teammateActed}
          names={names}
        />
        <DeskRoster
          ledger={ledger}
          holderOf={holderOf}
          belowHead={
            <>
              {deskLine}
              {/* U-Q7 — the visit line, above Also yours; the inquiry
                  itself is a row of the ledger, read like any other. */}
              {recorded && (
                <p
                  data-desk-visit
                  role="status"
                  className="t-body-sm text-[var(--text-muted)] [overflow-wrap:anywhere]"
                >
                  {`${recorded.name} recorded · just now · `}
                  <DocumentAction
                    actionKey="desk-visit-open-brief"
                    variant="tertiary"
                    href={`/doc/${recorded.id}`}
                    aria-label={`Open the brief — ${recorded.name}`}
                  >
                    Open the brief
                  </DocumentAction>
                </p>
              )}
            </>
          }
          othersHold={othersHold}
        />
      </>
    );

  return (
    <main
      data-arrival={arrivalRoot ? 'desk' : undefined}
      data-arrival-ready={arrivalReady ? '' : undefined}
      className="mx-auto w-full max-w-[1120px] px-[clamp(1.5rem,5vw,4rem)] pb-28 pt-14"
      ref={deskRoot}
      onClickCapture={notePress}
    >
      {/* F1 — one header line: the greeting, then the acts on its baseline.
          The date moved to Today's eyebrow (U-Q3). */}
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 pb-3">
        {/* The signature move: greeting in Playfair, the first name in
            Playfair italic, Aged Oak. Kept modest so the folios lead. */}
        <h1
          data-tour-anchor="desk-greeting"
          className="font-heading text-[1.7rem] font-normal text-[var(--text-primary)]"
        >
          {firstName ? (
            <>
              {greetingWord},{' '}
              <span className="italic text-[var(--text-muted)]">
                {firstName}
              </span>
            </>
          ) : (
            <>{greetingWord}.</>
          )}
        </h1>
        {/* At 390 the header is two rows: Find on the greeting's, then the
            creates. This Find stands only there, so focus follows the eye
            at both widths; the wide one closes the acts' row. */}
        <DocumentActionGroup
          surfaceKey="desk"
          regionKey="desk-find"
          aria-label="Find"
          className="min-[600px]:hidden"
        >
          <DocumentAction
            actionKey="find-anything"
            variant="tertiary"
            leading="⌕"
            aria-label="Find anything"
            onClick={() => openCommandBar()}
          >
            Find
          </DocumentAction>
        </DocumentActionGroup>
        {/* No filled act on the Desk: both creates are secondary (F1). At
            390 each prints its short word; its name stays whole (2.5.3). */}
        <DocumentActionGroup
          surfaceKey="desk"
          regionKey="desk-head"
          aria-label="Desk actions"
          className="max-[599px]:basis-full"
        >
          <DocumentAction
            actionKey="capture-lead"
            variant="secondary"
            leading="＋"
            aria-label="Record an inquiry"
            data-tour-anchor="desk-capture-lead"
            onClick={() => setCaptureOpen(true)}
          >
            <span className="max-[599px]:hidden">Record an inquiry</span>
            <span aria-hidden="true" className="min-[600px]:hidden">
              Inquiry
            </span>
          </DocumentAction>
          {/* R79 — the quiet act beside capture: a project that skips the
              proposal (a repeat client, handshake work). */}
          <DocumentAction
            actionKey="open-project"
            variant="secondary"
            leading="＋"
            aria-label="Create a project file"
            onClick={() => setOpenProjectOpen(true)}
          >
            <span className="max-[599px]:hidden">Create a project file</span>
            <span aria-hidden="true" className="min-[600px]:hidden">
              Project
            </span>
          </DocumentAction>
          <DocumentAction
            actionKey="find-anything"
            variant="tertiary"
            data-tour-anchor="desk-find-anything"
            className="max-[599px]:hidden"
            onClick={() => openCommandBar()}
            trailing={
              // The ⌘K hint is for a fine pointer only.
              <kbd className="hidden rounded-[3px] border border-[var(--border-default)] px-1 py-px font-mono [@media(hover:hover)_and_(pointer:fine)]:inline">
                ⌘K
              </kbd>
            }
          >
            Find anything
          </DocumentAction>
        </DocumentActionGroup>
      </header>
      {/* F2 — the double rule opens the day under the header. */}
      <RegionRule weight="strong" className="mb-12 max-[599px]:mb-6" />

      {isError ? (
        // I64 whole-desk error state: one coherent surface, not a half-desk.
        // A 0-row auth-degraded read now throws (use-desk-engagements.ts), so
        // this branch means a genuine read failure — never mix it with the
        // Needs-your-hand / In-motion / Contents populations below, which
        // would otherwise render past it independently and produce exactly
        // the incoherent half-desk this replaces. Everything past the
        // greeting is replaced, including the first-touch note (it describes
        // desk contents that did not load) and the open-requests/Contents/
        // reconnect/field populations (each fetches its own data and would
        // otherwise float, working, beside a "could not be read" message).
        <div
          role="alert"
          data-testid="desk-error-state"
          className="mt-16 max-w-[440px]"
        >
          <p className="font-heading text-[15px] italic text-[var(--text-muted)]">
            Your studio overview couldn't load.
          </p>
          <p className="doc-type-body mt-2">Try again or reload this page.</p>
          <DocumentActionGroup
            surfaceKey="desk"
            regionKey="desk-error"
            className="mt-4"
            aria-label="Desk recovery"
          >
            <DocumentAction
              actionKey="try-again"
              variant="primary"
              onClick={() => void refetch()}
            >
              Try again
            </DocumentAction>
          </DocumentActionGroup>
        </div>
      ) : (
        // Held with its read in hand, the block the ready Desk replaces is
        // marked: a press on it ends the wait and the roster prints under her
        // finger, so the arrival swallows that press's click. The header above
        // stays live chrome (round 4).
        <div data-arrival-held={deskRead && arrivalHeld ? 'desk' : undefined}>
          {/* The roster takes the full width of the desk at every viewport.
              IA-17's ≥1280px boards rail took a 260px column out of it, which
              left the ledger row narrower than its own fixed tracks — the
              sentence column resolved to 0px and broke one character to a
              line. The boards go back below the roster, where they were. */}
          {rosterBlock}
          {/* D5 — the recents strip returns (B2-L2 deleted it along with
              the folio grid it used to sit beside). It keeps its own
              quiet doorway shape rather than a roster line: a board has
              no stage and no need line, so it never fit the roster's
              one-line-per-job grammar. It renders nothing of its own once
              its query resolves empty, so a boardless studio sees no seam
              here at all. */}
          <RecentBoardsStrip />
          <DeskBoardsReactionRollup />

          {/* R95 — on a quiet Desk the Studio index rises here, at full weight, to
              fill the space the folders would occupy. */}
          {deskEmpty && <DeskContents prominent />}

          {/* R95 — the Studio Contents page: book-style front matter (Rooms /
              Ledgers / Begin), labels + doorways only. On a working Desk it sits
              here as quiet front matter after the roster; on a quiet Desk it
              has already risen above (deskEmpty), so it renders in exactly one place. */}
          {!deskEmpty && <DeskContents />}
        </div>
      )}

      {/* The capture front door (G1 · R62) — an overlay over the Desk, never a
          route; the Desk beneath does not unmount (D1). */}
      <CaptureLeadSheet
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onCreated={setRecorded}
      />

      {/* R79 — the no-proposal front door: same overlay contract as capture. */}
      <OpenProjectSheet
        open={openProjectOpen}
        onClose={() => setOpenProjectOpen(false)}
      />
    </main>
  );
}
