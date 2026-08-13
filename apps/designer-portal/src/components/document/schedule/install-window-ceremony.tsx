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

import { useEffect, useMemo, useState } from "react";
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
import { fmtDay, todayYmd } from "@/lib/document/format";
import {
  deriveScheduleImpact,
  deriveUnpinImpact,
  impactIsSettled,
  IMPACT_READING,
  IMPACT_UNAVAILABLE,
  type ScheduleImpact,
} from "@/lib/document/schedule-impact";
import { DateTextInput } from "../date-text-input";
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
  window: InstallWindowRow | null | undefined,
): InstallWindowFace {
  if (!window) return "hold";
  return window.state === "confirmed" ? "release" : "confirm";
}

const HOLD_IMPACT_LINE =
  "Holding moves nothing — the window is set aside, not committed, and the schedule keeps the dates it has.";

const RELEASE_HELD_LINE =
  "Releasing a window that was only held moves nothing — no date was ever pinned.";

function windowSpan(window: InstallWindowRow): string {
  return `${fmtDay(window.starts_on)} – ${fmtDay(window.ends_on)}`;
}

/**
 * The install phase an install window anchors: the project's installation
 * phase, or failing that the last main-lane phase. Mirrors
 * `_install_window_phase(uuid)` (00476) so the stated impact and the written
 * anchor name the same phase.
 */
export function useInstallWindowPhaseId(
  projectId: string | null | undefined,
): string | null {
  const { phases } = useResolvedSchedule(projectId ?? undefined);
  return useMemo(() => {
    const installation = phases
      .filter((p) => p.phase_key === "installation")
      .sort((a, b) => {
        const aOrder = a.sort_order ?? 0;
        const bOrder = b.sort_order ?? 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return String(a.id).localeCompare(String(b.id));
      });
    if (installation.length > 0) return String(installation[0].id);

    const main = phases
      .filter((p) => p.lane !== "thread")
      .sort((a, b) => {
        const aOrder = a.sort_order ?? 0;
        const bOrder = b.sort_order ?? 0;
        if (aOrder !== bOrder) return bOrder - aOrder;
        return String(b.id).localeCompare(String(a.id));
      });
    return main.length > 0 ? String(main[0].id) : null;
  }, [phases]);
}

export function InstallWindowCeremony({ projectId }: { projectId: string }) {
  const windowQuery = useInstallWindow(projectId);
  const [open, setOpen] = useState(false);

  const window = windowQuery.data ?? null;
  const face = installWindowFace(window);

  if (windowQuery.isError) return null;

  return (
    <div className="mt-4" data-install-window aria-label="Install window">
      <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
        Install window
      </p>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <p className="text-[12.5px] leading-relaxed text-[var(--color-charcoal)]">
          {window
            ? `${windowSpan(window)} · ${window.state === "confirmed" ? "confirmed" : "held, not committed"}`
            : "No window is held."}
        </p>
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
      </div>

      <InstallWindowSheet
        open={open}
        onClose={() => setOpen(false)}
        projectId={projectId}
        window={window}
      />
    </div>
  );
}

function InstallWindowSheet({
  open,
  onClose,
  projectId,
  window,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  window: InstallWindowRow | null;
}) {
  const face = installWindowFace(window);
  const schedule = useResolvedSchedule(projectId);
  const phaseId = useInstallWindowPhaseId(projectId);

  const hold = useHoldInstallWindow();
  const confirm = useConfirmInstallWindow();
  const release = useReleaseInstallWindow();

  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [startValid, setStartValid] = useState(false);
  const [endValid, setEndValid] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStartsOn("");
    setEndsOn("");
    setStartValid(false);
    setEndValid(false);
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
  const confirmTargetPhaseId = window?.phase_id ?? phaseId;
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
    if (face !== "confirm" || !window || !confirmTargetPhaseId) {
      return { status: "uncomputable", computable: false, line: HOLD_IMPACT_LINE };
    }
    if (scheduleUnsettled) return scheduleUnsettled;
    return deriveScheduleImpact(
      inputs.phases,
      inputs.milestones,
      {
        kind: "phase-anchor",
        phaseId: confirmTargetPhaseId,
        anchorDate: window.starts_on,
      },
      today,
    );
  }, [face, window, confirmTargetPhaseId, inputs, today, scheduleUnsettled]);

  const releaseImpact: ScheduleImpact = useMemo(() => {
    if (face !== "release" || !window) {
      return { status: "uncomputable", computable: false, line: RELEASE_HELD_LINE };
    }
    if (scheduleUnsettled) return scheduleUnsettled;
    return deriveUnpinImpact(
      inputs.phases,
      inputs.milestones,
      window.phase_id ?? confirmTargetPhaseId,
      today,
    );
  }, [face, window, confirmTargetPhaseId, inputs, today, scheduleUnsettled]);

  const busy = hold.isPending || confirm.isPending || release.isPending;
  const datesReady =
    startValid && endValid && startsOn !== "" && endsOn !== "" && endsOn >= startsOn;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (face === "hold") {
        if (!datesReady) {
          setError("Enter a start and an end, with the end on or after the start.");
          return;
        }
        await hold.mutateAsync({ projectId, startsOn, endsOn });
      } else if (face === "confirm" && window) {
        await confirm.mutateAsync({
          windowId: window.id,
          projectId,
          disclosedImpact: confirmImpact.computable
            ? confirmImpact.disclosure
            : null,
        });
      } else if (face === "release" && window) {
        await release.mutateAsync({
          windowId: window.id,
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
    if (!window) return;
    setError(null);
    try {
      await release.mutateAsync({
        windowId: window.id,
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
          <GatePartBlock part="artifact">
            <ArtifactEdges
              title="Install window"
              meta={
                window
                  ? `${windowSpan(window)} · ${window.state === "confirmed" ? "Confirmed" : "Held"}`
                  : "Not yet held"
              }
            />
          </GatePartBlock>

          <GatePartBlock part="question">
            <GateQuestion>{copy.question}</GateQuestion>
          </GatePartBlock>

          <GatePartBlock part="scope">
            <GatePlain>{copy.scope}</GatePlain>
          </GatePartBlock>

          {face === "hold" && (
            <GatePartBlock part="artifact">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="The window opens">
                  <DateTextInput
                    value={startsOn}
                    onChange={(value) => setStartsOn(value ?? "")}
                    ariaLabel="The window opens"
                    onValidityChange={setStartValid}
                    className="w-full border-b border-[var(--color-pearl)] bg-transparent pb-1.5 font-mono text-[12px] text-[var(--color-charcoal)] placeholder:text-[var(--text-faint)] focus:border-[var(--color-clay)] focus:outline-none"
                  />
                </Field>
                <Field label="The window closes">
                  <DateTextInput
                    value={endsOn}
                    onChange={(value) => setEndsOn(value ?? "")}
                    ariaLabel="The window closes"
                    onValidityChange={setEndValid}
                    className="w-full border-b border-[var(--color-pearl)] bg-transparent pb-1.5 font-mono text-[12px] text-[var(--color-charcoal)] placeholder:text-[var(--text-faint)] focus:border-[var(--color-clay)] focus:outline-none"
                  />
                </Field>
              </div>
            </GatePartBlock>
          )}

          {face === "release" && (
            <GatePartBlock part="scope">
              <Field label="Why the window is released">
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="One line, for the schedule's memory"
                  className="w-full border-b border-[var(--color-pearl)] bg-transparent pb-1.5 text-[13px] text-[var(--color-charcoal)] placeholder:text-[var(--text-faint)] focus:border-[var(--color-clay)] focus:outline-none"
                />
              </Field>
            </GatePartBlock>
          )}

          {face === "hold" ? (
            <GatePartBlock part="impact">
              <GateImpact>{HOLD_IMPACT_LINE}</GateImpact>
            </GatePartBlock>
          ) : face === "confirm" ? (
            <ScheduleImpactBlock impact={confirmImpact} />
          ) : (
            <ScheduleImpactBlock impact={releaseImpact} />
          )}

          <GatePartBlock part="authority">
            <GatePlain>{copy.authority}</GatePlain>
          </GatePartBlock>

          <GatePartBlock part="confirmation">
            {error && (
              <p className="mb-4 text-[12px] text-[var(--color-terracotta)]" role="alert">
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
      "Confirming pins the install phase to the window's first day and cuts a revision. The confirmed window becomes visible outside the studio.",
    authority:
      "The effect stated above is what is recorded with the confirmation. When it cannot be computed, the window still confirms and the date is proposed rather than pinned.",
    submitLabel: "Confirm the window",
    submittingLabel: "Confirming the window…",
    actionKey: "confirm-install-window",
  },
  release: {
    sheetTitle: "Release the install window",
    question: "Is the window released?",
    scope:
      "Releasing removes the anchor the confirmation pinned and returns the install phase to the chain. A revision records the release.",
    authority:
      "An anchor never moves silently: the effect stated above is recorded with the release. When it cannot be computed, the window still releases and the unpinning is proposed rather than applied.",
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
