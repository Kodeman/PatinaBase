"use client";

/**
 * VoidAct — the terracotta scored act that retires a furnishings
 * authorization. Typed confirmation ("VOID № N", matching the instrument's
 * own display number) plus a required reason guard the act; on success it
 * offers "Start the superseding release", which does not create anything
 * itself — it emits a `document:start-release` CustomEvent carrying the
 * voided instrument's source FF&E item ids as `preTickIds`; ReleaseCeremonyProvider
 * (schedule/release-ceremony-context.tsx) listens on the window and pre-ticks
 * them into a fresh selection via `begin()`.
 */

import { useState } from "react";
import { Button, Textarea } from "@/components/ui/controls";
import { useVoidAuthorization } from "@/hooks/use-commercial-documents";
import type { ProjectInstrumentView } from "@/lib/document/project-commerce";

export const START_RELEASE_EVENT = "document:start-release";

export interface StartReleaseEventDetail {
  preTickIds: string[];
}

export function VoidAct({
  projectId,
  instrument,
  onVoided,
}: {
  projectId: string;
  instrument: ProjectInstrumentView;
  onVoided?: () => void;
}) {
  const voidAuthorization = useVoidAuthorization(projectId);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [voided, setVoided] = useState(false);

  const expectedConfirm = `VOID № ${instrument.number}`;
  const canVoid =
    reason.trim().length >= 5 && confirmText.trim() === expectedConfirm;

  const submit = async () => {
    if (!canVoid) return;
    setError(null);
    try {
      await voidAuthorization.mutateAsync({
        proposalId: instrument.proposalId,
        reason,
      });
      setVoided(true);
      setOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "This authorization could not be voided.",
      );
    }
  };

  const startSupersedingRelease = () => {
    const preTickIds = instrument.items
      .map((item) => item.sourceFfeItemId)
      .filter((id): id is string => Boolean(id));
    window.dispatchEvent(
      new CustomEvent<StartReleaseEventDetail>(START_RELEASE_EVENT, {
        detail: { preTickIds },
      }),
    );
    onVoided?.();
  };

  if (voided) {
    return (
      <div className="border-l-2 border-[var(--color-terracotta)] pl-3 text-[11px]">
        <p className="text-[var(--color-mocha)]">
          Authorization № {instrument.number} is void and superseded.
        </p>
        <Button size="sm" variant="secondary" className="mt-2" onClick={startSupersedingRelease}>
          Start the superseding release
        </Button>
      </div>
    );
  }

  if (!open) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="text-[var(--color-terracotta-ink)] hover:bg-[rgba(196,124,92,0.08)]"
        onClick={() => setOpen(true)}
      >
        Void this authorization
      </Button>
    );
  }

  return (
    <div className="border-l-2 border-[var(--color-terracotta)] pl-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-terracotta-ink)]">
        Void authorization № {instrument.number}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-mocha)]">
        This retires the authorization and marks it superseded. It cannot be
        undone.
      </p>

      <label className="mt-3 block text-[10px] text-[var(--text-muted)]">
        Reason for the void
        <Textarea
          className="mt-1"
          value={reason}
          invalid={reason.length > 0 && reason.trim().length < 5}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Client requested fewer pieces on the call…"
        />
      </label>

      <label className="mt-3 block text-[10px] text-[var(--text-muted)]">
        Type <strong className="font-mono text-[var(--color-charcoal)]">{expectedConfirm}</strong> to confirm
        <input
          className="mt-1 w-full rounded-[3px] border border-[var(--doc-ink-border)] bg-white px-3 py-2 font-mono text-[12px] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-terracotta)]"
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          aria-label={`Type ${expectedConfirm} to confirm the void`}
          autoComplete="off"
        />
      </label>

      {error && (
        <p role="alert" className="mt-2 text-[11px] text-[var(--color-terracotta-ink)]">
          {error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setOpen(false);
            setReason("");
            setConfirmText("");
            setError(null);
          }}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!canVoid}
          loading={voidAuthorization.isPending}
          onClick={submit}
        >
          Void № {instrument.number}
        </Button>
      </div>
    </div>
  );
}
