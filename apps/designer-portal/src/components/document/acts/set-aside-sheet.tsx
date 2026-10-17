"use client";

/**
 * US-28 S4 (U-Q5) — Set aside, the door beside "Not today": a line put down
 * until a day she names, for a reason she names. Both are required, as the
 * writer requires them (set_need_state 'set_aside', 00765). The sheet keeps
 * no state writer of its own: the line hands it `onSave`, the same
 * useSetNeedState path its "Not today" takes, so the line settles in place
 * with Undo and returns under Coming back on that day.
 */

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import {
  dayMonth,
  parseSourceDate,
  WEEKDAY_FORMAT,
} from "@/lib/document/dates";
import { tomorrowYmd } from "@/lib/document/format";
import { DateTextInput } from "../date-text-input";
import { DocumentAction, DocumentActionGroup } from "../document-action";
import { DocSheet } from "../overlays/doc-sheet";

export interface SetAsideInput {
  /** The local day it comes back, `YYYY-MM-DD`. */
  until: string;
  /** Who or what the studio waits on, in her words. */
  reason: string;
}

export function SetAsideSheet({
  open,
  onClose,
  jobName,
  line,
  onSave,
  now = new Date(),
}: {
  open: boolean;
  onClose: () => void;
  /** The job the line belongs to, as its card names it. */
  jobName: string;
  /** The line's sentence, so she sees what she is putting down. */
  line: string;
  /** Writes the set-aside; rejects when it did not save. */
  onSave: (input: SetAsideInput) => Promise<unknown>;
  now?: Date;
}) {
  const earliest = tomorrowYmd(now);
  const [until, setUntil] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  // A fresh sheet every open.
  useEffect(() => {
    if (!open) return;
    setUntil(null);
    setReason("");
    setTried(false);
    setPending(false);
    setFailed(null);
  }, [open]);

  const dayMissing = !until || until < earliest;
  const reasonMissing = reason.trim() === "";
  const complete = !dayMissing && !reasonMissing;
  const date = !dayMissing ? parseSourceDate(until) : null;
  // "Friday 16 October", as the settled line will print it.
  const back = date ? `${WEEKDAY_FORMAT.format(date)} ${dayMonth(date)}` : null;

  const save = async () => {
    setTried(true);
    if (!complete || pending) return;
    setPending(true);
    setFailed(null);
    try {
      await onSave({ until: until!, reason: reason.trim() });
      onClose();
    } catch {
      setFailed("Set aside did not save. Try again.");
      setPending(false);
    }
  };

  return (
    <DocSheet
      open={open}
      onClose={onClose}
      title="Set aside until a day"
      icon={CalendarClock}
      kind="act-set-aside"
    >
      <form
        data-act-set-aside
        noValidate
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <p className="t-body [overflow-wrap:anywhere]">
          <span className="font-medium">{jobName}</span>
          {` · ${line}`}
        </p>
        <div id="set-aside-fields">
          <div id="set-aside-day-field" className="field">
            <span className="label">Back on</span>
            <DateTextInput
              value={until}
              ariaLabel="Back on"
              minDate={earliest}
              onChange={setUntil}
              className="field-control"
            />
            {tried && dayMissing && (
              <span role="alert" className="reason t-body-sm">
                Choose a day after today.
              </span>
            )}
          </div>
          <div id="set-aside-reason-field" className="field">
            <label className="label" htmlFor="set-aside-reason">
              Waiting on
            </label>
            <input
              id="set-aside-reason"
              className="field-control"
              value={reason}
              aria-invalid={(tried && reasonMissing) || undefined}
              aria-describedby={
                tried && reasonMissing ? "set-aside-reason-reason" : undefined
              }
              onChange={(event) => setReason(event.target.value)}
            />
            {tried && reasonMissing && (
              <span
                id="set-aside-reason-reason"
                role="alert"
                className="reason t-body-sm"
              >
                Say what the line waits on.
              </span>
            )}
          </div>
        </div>
        <p className="t-body-sm text-[var(--text-muted)]">
          {back
            ? `The line comes back under Coming back on ${back}. It sends nothing to anyone.`
            : "The line comes back under Coming back on the day you choose. It sends nothing to anyone."}
        </p>
        {failed && (
          <p role="alert" data-act-set-aside-failed className="t-body-sm">
            {failed}
          </p>
        )}
        <DocumentActionGroup
          surfaceKey="desk"
          regionKey="act-set-aside"
          aria-label="Set the line aside"
        >
          <DocumentAction
            actionKey="act-set-aside-save"
            variant="primary"
            disabled={!complete}
            held={!complete}
            holds={[
              ...(dayMissing
                ? [
                    {
                      id: "set-aside-day",
                      target: () =>
                        document.getElementById("set-aside-day-field"),
                      label: "Back on",
                      reason: "Choose a day after today.",
                    },
                  ]
                : []),
              ...(reasonMissing
                ? [
                    {
                      id: "set-aside-reason",
                      target: () =>
                        document.getElementById("set-aside-reason-field"),
                      label: "Waiting on",
                      reason: "Say what the line waits on.",
                    },
                  ]
                : []),
            ]}
            onHeldActivate={() => setTried(true)}
            onClick={() => void save()}
            loading={pending}
            loadingLabel="Setting aside…"
          >
            {back ? `Set aside until ${back}` : "Set aside"}
          </DocumentAction>
        </DocumentActionGroup>
      </form>
    </DocSheet>
  );
}
