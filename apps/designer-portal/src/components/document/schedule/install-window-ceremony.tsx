"use client";

/**
 * The install window's commitment act (R112, I126 · migration 00476).
 *
 * Three faces, one sheet:
 *   HOLD     — a date range is set aside. Nothing on the schedule moves, and
 *              nothing outside the studio can see it.
 *   CONFIRM  — the window's start becomes the install phase's anchor. R110:
 *              the sheet states that effect before the act is confirmed; an
 *              uncomputable effect downgrades the anchor to a proposal.
 *   RELEASE  — I126: releasing a CONFIRMED window unpins the anchor, and the
 *              unpinning states its own impact. Releasing a held window is
 *              bookkeeping.
 *
 * Structure follows R2's six-part vocabulary. The five prose parts use
 * gate-anatomy's blocks — pure typography with no coupling to the approvals
 * system — while IMPACT is Wave 2's ScheduleImpactBlock, the disclosure
 * pattern the ceremony sheets already speak.
 *
 * Copy is actor-neutral throughout (§7 guard, №7 open): the window is held,
 * confirmed, released. No counterparty is ever named.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  mapMilestoneRowToScheduleInput,
  mapPhaseRowToScheduleInput,
  useConfirmInstallWindow,
  useHoldInstallWindow,
  useInstallWindow,
  useReleaseInstallWindow,
  useResolvedSchedule,
  type InstallWindowRow,
} from "@patina/supabase";
import { formatCalendarDate, todayYmd } from "@/lib/document/format";
import {
  deriveScheduleImpact,
  deriveUnpinImpact,
  impactContradicts,
  impactIsSettled,
  IMPACT_READING,
  IMPACT_UNAVAILABLE,
  IMPACT_UNCOMPUTABLE_LINE,
  type ScheduleImpact,
} from "@/lib/document/schedule-impact";
import {
  FolioCalendar,
  FolioPopover,
  folioReadout,
  type FolioSelection,
} from "@/components/document/date";
import { DocSheet } from "../overlays/doc-sheet";
import { DocumentAction, DocumentActionGroup } from "../document-action";
import { ScheduleImpactBlock } from "../commercial/schedule-impact-block";
import {
  ArtifactEdges,
  GateCeremony,
  GateImpact,
  GatePartBlock,
  GatePlain,
  GateQuestion,
} from "../approvals/gate-anatomy";

export type InstallWindowFace = "hold" | "confirm" | "release";

/** The face a window's state asks for. No window at all asks to hold one. */
export function installWindowFace(
  installWindow: InstallWindowRow | null | undefined,
): InstallWindowFace {
  if (!installWindow) return "hold";
  return installWindow.state === "confirmed" ? "release" : "confirm";
}

const HOLD_IMPACT_LINE =
  "Holding moves nothing — the window is set aside, not committed, and the schedule keeps the dates it has.";

const RELEASE_HELD_LINE =
  "Releasing a window that was only held moves nothing — no date was ever pinned.";

const RELEASE_UNANCHORED_LINE =
  "This window never pinned a date, so releasing it moves nothing — the schedule keeps the dates it has.";

const WINDOW_READING_LINE = "Reading the install window…";

const WINDOW_UNAVAILABLE_LINE =
  "The install window could not be read — nothing about it has changed.";

/** A span that commits a year out states its year. */
function windowSpan(installWindow: InstallWindowRow): string {
  return `${formatCalendarDate(installWindow.starts_on)} – ${formatCalendarDate(installWindow.ends_on)}`;
}

/**
 * What a confirmed window actually did. `state` alone collapses three
 * outcomes: 00476 records the door's answer in `anchored`, and the surfaces
 * that say "confirmed" say the rest of it too.
 */
function windowStanding(installWindow: InstallWindowRow): string {
  if (installWindow.state === "confirmed") {
    return installWindow.anchored
      ? "confirmed"
      : "confirmed · date proposed, not pinned";
  }
  return "held, not committed";
}

/**
 * The install phase an install window anchors: the project's main-lane
 * installation phase, or failing that the last main-lane phase, both
 * preferring a phase that is not already completed. Mirrors
 * `_install_window_phase(uuid)` (00476) so the stated impact and the written
 * anchor name the same phase — including for the spine's mount row, which
 * calls this rather than re-deriving from the resolver's lanes.
 */
export function useInstallWindowPhaseId(
  projectId: string | null | undefined,
): string | null {
  const { phases } = useResolvedSchedule(projectId ?? undefined);
  return useMemo(() => {
    // `(status === 'completed')` sorts false first, exactly as the SQL orders.
    const done = (p: { status?: string | null }) => (p.status === "completed" ? 1 : 0);
    const main = phases.filter((p) => p.lane === "main");

    const installation = main
      .filter((p) => p.phase_key === "installation")
      .sort((a, b) => {
        if (done(a) !== done(b)) return done(a) - done(b);
        const aOrder = a.sort_order ?? 0;
        const bOrder = b.sort_order ?? 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return String(a.id).localeCompare(String(b.id));
      });
    if (installation.length > 0) return String(installation[0].id);

    const last = [...main].sort((a, b) => {
      if (done(a) !== done(b)) return done(a) - done(b);
      const aOrder = a.sort_order ?? 0;
      const bOrder = b.sort_order ?? 0;
      if (aOrder !== bOrder) return bOrder - aOrder;
      return String(b.id).localeCompare(String(a.id));
    });
    return last.length > 0 ? String(last[0].id) : null;
  }, [phases]);
}

export function InstallWindowCeremony({ projectId }: { projectId: string }) {
  const windowQuery = useInstallWindow(projectId);
  const [open, setOpen] = useState(false);

  const installWindow = windowQuery.data ?? null;
  const face = installWindowFace(installWindow);

  // Neither a read in flight nor a failed read is the answer "no window is
  // held" — the same doctrine the sheet's IMPACT states apply, applied here.
  // Acting on either would meet hold_install_window's raise.
  const reading = windowQuery.isPending;
  const unavailable = windowQuery.isError;
  const settled = !reading && !unavailable;

  return (
    <section
      className="mt-4"
      data-install-window
      data-install-window-state={
        reading ? "reading" : unavailable ? "unavailable" : "settled"
      }
      aria-label="Install window"
    >
      <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
        Install window
      </p>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <p className="text-[12.5px] leading-relaxed text-[var(--color-charcoal)]">
          {reading
            ? WINDOW_READING_LINE
            : unavailable
              ? WINDOW_UNAVAILABLE_LINE
              : installWindow
                ? `${windowSpan(installWindow)} · ${windowStanding(installWindow)}`
                : "No window is held."}
        </p>
        {settled && (
          <DocumentAction
            actionKey="open-install-window-ceremony"
            surfaceKey="open-document"
            regionKey="install-window"
            variant="secondary"
            onClick={() => setOpen(true)}
          >
            {face === "hold"
              ? "Hold a window"
              : face === "confirm"
                ? "Confirm the window"
                : "Release the window"}
          </DocumentAction>
        )}
      </div>

      {settled && (
        <InstallWindowSheet
          open={open}
          onClose={() => setOpen(false)}
          projectId={projectId}
          installWindow={installWindow}
        />
      )}
    </section>
  );
}

function InstallWindowSheet({
  open,
  onClose,
  projectId,
  installWindow,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  installWindow: InstallWindowRow | null;
}) {
  const face = installWindowFace(installWindow);
  const schedule = useResolvedSchedule(projectId);
  const phaseId = useInstallWindowPhaseId(projectId);

  const hold = useHoldInstallWindow();
  const confirm = useConfirmInstallWindow();
  const release = useReleaseInstallWindow();

  // The window the HOLD face is building. The Folio's span selection makes
  // end>=start structural (FolioSelection {kind:'span'} guarantees it), so
  // there is nothing left for this state to validate — only to hold.
  const [span, setSpan] = useState<{ start: string; end: string } | null>(null);
  const [folioOpen, setFolioOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const folioTriggerRef = useRef<HTMLButtonElement>(null);
  // A caption `<span>`, not a `<label>`: wrapping the trigger in a `<label>`
  // would make the accessible-name algorithm prefer the label's OWN text and
  // discard the button's — the one place the current span actually gets
  // read back. `aria-describedby` adds the caption without that trade.
  const folioCaptionId = useId();

  useEffect(() => {
    if (!open) return;
    setSpan(null);
    setFolioOpen(false);
    setReason("");
    setError(null);
  }, [open]);

  const { phases, milestones } = schedule;
  const inputs = useMemo(
    () => ({
      phases: phases.map(mapPhaseRowToScheduleInput),
      milestones: milestones.map(mapMilestoneRowToScheduleInput),
    }),
    [phases, milestones],
  );

  const today = todayYmd();

  // The window the confirmation would pin, and the phase it lands on — the
  // same pair the server resolves, so the stated impact is the written one.
  const confirmTargetPhaseId = installWindow?.phase_id ?? phaseId;
  // A read in flight is not an uncomputable effect. Until the chain answers,
  // the ceremony says so and refuses consent — otherwise a mistimed click
  // discloses nothing, and the server downgrades to a proposal a hardening
  // that would have succeeded a moment later.
  const scheduleUnsettled = schedule.isError
    ? IMPACT_UNAVAILABLE
    : schedule.isLoading
      ? IMPACT_READING
      : null;

  const confirmImpact: ScheduleImpact = useMemo(() => {
    // Only the face check may precede the read: while the schedule is in
    // flight `phases` is [], so the target resolves to null and a
    // target-shaped early return would swallow the reading state entirely —
    // enabling consent mid-read and printing the HOLD face's disclaimer on a
    // confirmation.
    if (face !== "confirm" || !installWindow) {
      return { status: "uncomputable", computable: false, line: HOLD_IMPACT_LINE };
    }
    if (scheduleUnsettled) return scheduleUnsettled;
    if (!confirmTargetPhaseId) {
      return { status: "uncomputable", computable: false, line: IMPACT_UNCOMPUTABLE_LINE };
    }
    // R109's third class, before consent rather than after: 00475 proposes
    // whenever a ceremony's date differs from an anchor already committed on
    // the target, however well it was disclosed. A ripple sentence here would
    // describe a move the server is going to refuse.
    const committed = inputs.phases.find((p) => p.id === confirmTargetPhaseId)?.anchorDate;
    if (committed && committed !== installWindow.starts_on) {
      return impactContradicts(committed);
    }
    return deriveScheduleImpact(
      inputs.phases,
      inputs.milestones,
      {
        kind: "phase-anchor",
        phaseId: confirmTargetPhaseId,
        anchorDate: installWindow.starts_on,
      },
      today,
    );
  }, [face, installWindow, confirmTargetPhaseId, inputs, today, scheduleUnsettled]);

  const releaseImpact: ScheduleImpact = useMemo(() => {
    if (face !== "release" || !installWindow) {
      return { status: "uncomputable", computable: false, line: RELEASE_HELD_LINE };
    }
    // A window the door downgraded pinned nothing, so its release removes
    // nothing — and it must not describe unpinning a date some other act owns.
    if (!installWindow.anchored || !installWindow.phase_id) {
      return { status: "uncomputable", computable: false, line: RELEASE_UNANCHORED_LINE };
    }
    if (scheduleUnsettled) return scheduleUnsettled;
    // The anchor moved on since this window pinned it: 00476 proposes rather
    // than clearing, so the sheet says that instead of narrating a removal.
    const committed = inputs.phases.find((p) => p.id === installWindow.phase_id)?.anchorDate;
    if (committed && committed !== installWindow.starts_on) {
      return impactContradicts(committed);
    }
    return deriveUnpinImpact(
      inputs.phases,
      inputs.milestones,
      installWindow.phase_id,
      today,
    );
  }, [face, installWindow, inputs, today, scheduleUnsettled]);

  const busy = hold.isPending || confirm.isPending || release.isPending;
  const datesReady = span !== null;

  // The trigger line's set-state reading — the same sentence the Folio's own
  // footer would print, minus the label (this line carries no "THE WINDOW"
  // prefix of its own). No date math lives here: the derivation is the one
  // place that owns it.
  const spanReadout = span
    ? folioReadout(
        { mode: "span", anchor: span.start, end: span.end },
        null,
        { day: "", span: "" },
      ).trim()
    : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (face === "hold") {
        if (!span) {
          setError("Choose the window before holding it.");
          return;
        }
        await hold.mutateAsync({ projectId, startsOn: span.start, endsOn: span.end });
      } else if (face === "confirm" && installWindow) {
        await confirm.mutateAsync({
          windowId: installWindow.id,
          projectId,
          disclosedImpact: confirmImpact.computable
            ? confirmImpact.disclosure
            : null,
        });
      } else if (face === "release" && installWindow) {
        await release.mutateAsync({
          windowId: installWindow.id,
          projectId,
          reason: reason.trim() || "Install window released",
          disclosedImpact: releaseImpact.computable
            ? releaseImpact.disclosure
            : null,
        });
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "That did not save — nothing was changed.",
      );
    }
  };

  const releaseHeld = async () => {
    if (!installWindow) return;
    setError(null);
    try {
      await release.mutateAsync({
        windowId: installWindow.id,
        projectId,
        reason: "Install window released",
        disclosedImpact: null,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "That did not save — nothing was changed.",
      );
    }
  };

  const copy = FACE_COPY[face];

  return (
    <DocSheet open={open} onClose={onClose} title={copy.sheetTitle}>
      <form onSubmit={submit} className="mx-auto w-full max-w-[34rem]">
        <GateCeremony label={copy.sheetTitle}>
          {/* One ARTIFACT group per sheet: the window's edges, and on the hold
              face the fields that give it those edges, are the same part. Two
              groups under one name is two things called "Artifact" to AT. */}
          <GatePartBlock part="artifact">
            <ArtifactEdges
              title="Install window"
              meta={
                installWindow
                  ? `${windowSpan(installWindow)} · ${installWindow.state === "confirmed" ? "Confirmed" : "Held"}`
                  : "Not yet held"
              }
            />
            {face === "hold" && (
              <div className="relative mt-3">
                <span
                  id={folioCaptionId}
                  className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--text-muted)]"
                >
                  The window
                </span>
                <button
                  type="button"
                  ref={folioTriggerRef}
                  onClick={() => setFolioOpen((was) => !was)}
                  aria-haspopup="true"
                  aria-expanded={folioOpen}
                  aria-describedby={folioCaptionId}
                  className="block min-h-11 w-full border-b border-[var(--color-pearl)] bg-transparent pb-1.5 text-left font-mono text-[12px] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
                >
                  {span ? (
                    spanReadout
                  ) : (
                    <span className="italic text-[var(--text-faint)]">
                      Choose the window
                    </span>
                  )}
                </button>
                {folioOpen && (
                  <FolioPopover
                    onClose={() => setFolioOpen(false)}
                    aria-label="Install window"
                    returnFocusRef={folioTriggerRef}
                  >
                    <FolioCalendar
                      value={span ? { kind: "span", start: span.start, end: span.end } : null}
                      today={today}
                      modes={["span"]}
                      readoutLabels={{ day: "DUE", span: "THE WINDOW" }}
                      onCommit={(selection: FolioSelection) => {
                        if (selection.kind === "span") {
                          setSpan({ start: selection.start, end: selection.end });
                        }
                        setFolioOpen(false);
                      }}
                    />
                  </FolioPopover>
                )}
              </div>
            )}
          </GatePartBlock>

          <GatePartBlock part="question">
            <GateQuestion>{copy.question}</GateQuestion>
          </GatePartBlock>

          {/* Likewise one SCOPE group: what the release does, and the line the
              schedule will remember it by. */}
          <GatePartBlock part="scope">
            <GatePlain>{copy.scope}</GatePlain>
            {face === "release" && (
              <div className="mt-3">
                <Field label="Why the window is released">
                  <input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="One line, for the schedule's memory"
                    className="w-full border-b border-[var(--color-pearl)] bg-transparent pb-1.5 text-[13px] text-[var(--color-charcoal)] placeholder:text-[var(--text-faint)] focus:border-[var(--color-clay)] focus:outline-none"
                  />
                </Field>
              </div>
            )}
          </GatePartBlock>

          {/* IMPACT is a marked part on every face, not only the hold's. */}
          <GatePartBlock part="impact">
            {face === "hold" ? (
              <GateImpact>{HOLD_IMPACT_LINE}</GateImpact>
            ) : (
              <ScheduleImpactBlock
                impact={face === "confirm" ? confirmImpact : releaseImpact}
                inGatePart
              />
            )}
          </GatePartBlock>

          <GatePartBlock part="authority">
            <GatePlain>{copy.authority}</GatePlain>
          </GatePartBlock>

          <GatePartBlock part="confirmation">
            {error && (
              <p className="mb-4 text-[12px] text-[var(--color-terracotta-ink)]" role="alert">
                {error}
              </p>
            )}
            <DocumentActionGroup
              surfaceKey="open-document"
              regionKey="install-window-ceremony"
              aria-label="Install window actions"
            >
              <DocumentAction
                actionKey={copy.actionKey}
                variant="primary"
                type="submit"
                disabled={
                  face === "hold"
                    ? !datesReady
                    : // Consent waits for the chain to answer (R110): an act
                      // confirmed mid-read would disclose nothing and propose.
                      !impactIsSettled(face === "confirm" ? confirmImpact : releaseImpact)
                }
                loading={busy}
                loadingLabel={copy.submittingLabel}
                trailing="→"
              >
                {copy.submitLabel}
              </DocumentAction>
              {face === "confirm" && (
                <DocumentAction
                  actionKey="release-held-install-window"
                  variant="secondary"
                  onClick={() => void releaseHeld()}
                  disabled={busy}
                >
                  Release this window instead
                </DocumentAction>
              )}
              <DocumentAction
                actionKey="cancel-install-window-ceremony"
                variant="tertiary"
                onClick={onClose}
              >
                Cancel
              </DocumentAction>
            </DocumentActionGroup>
          </GatePartBlock>
        </GateCeremony>
      </form>
    </DocSheet>
  );
}

const FACE_COPY: Record<
  InstallWindowFace,
  {
    sheetTitle: string;
    question: string;
    scope: string;
    authority: string;
    submitLabel: string;
    submittingLabel: string;
    actionKey: string;
  }
> = {
  hold: {
    sheetTitle: "Hold the install window",
    question: "Which week does the install hold?",
    scope:
      "A hold sets the week aside inside the studio. It writes no date onto the schedule and it is not visible outside the studio until it is confirmed.",
    authority:
      "A hold is reversible: it can be released, or confirmed into the schedule, at any time.",
    submitLabel: "Hold the window",
    submittingLabel: "Holding the window…",
    actionKey: "hold-install-window",
  },
  confirm: {
    sheetTitle: "Confirm the install window",
    question: "Is this window committed?",
    scope:
      "Confirming pins the install phase to the window's first day and cuts a revision, unless the impact above says otherwise. The confirmed window becomes visible outside the studio either way.",
    authority:
      "The effect stated above is what is recorded with the confirmation. When it cannot be computed, or when the date contradicts one already committed, the window still confirms and the date is proposed rather than pinned.",
    submitLabel: "Confirm the window",
    submittingLabel: "Confirming the window…",
    actionKey: "confirm-install-window",
  },
  release: {
    sheetTitle: "Release the install window",
    question: "Is the window released?",
    scope:
      "Releasing removes the anchor this window pinned and returns the install phase to the chain. A revision records the release. A window that pinned nothing simply closes.",
    authority:
      "An anchor never moves silently: the effect stated above is recorded with the release. When it cannot be computed, or when the date has since been moved by another act, the window still releases and the unpinning is proposed rather than applied.",
    submitLabel: "Release the window",
    submittingLabel: "Releasing the window…",
    actionKey: "release-install-window",
  },
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
