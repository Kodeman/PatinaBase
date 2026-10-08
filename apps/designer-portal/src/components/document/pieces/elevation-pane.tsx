"use client";

/**
 * US-21 T-27 — the room's elevation beside the Rough in table (SPEC §2.6, a2;
 * R2 §5). She types from the drawing she is walking. No room carries an
 * elevation on file yet, so the pane says so and offers `+ FILE`, the door to
 * the Plan Room where the job's drawings are filed.
 */
import { useId } from "react";

const ACT =
  "inline-flex min-h-11 min-w-11 items-center justify-center font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-[var(--sheet-ink-muted)] underline decoration-[var(--sheet-ink)] decoration-1 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clay-ink)]";

export interface ElevationPaneProps {
  roomName: string;
  /** Where `+ FILE` goes: the job's Plan Room. */
  fileHref: string;
}

export function ElevationPane({ roomName, fileHref }: ElevationPaneProps) {
  const uid = useId();
  const headId = `${uid}-head`;
  const fileHintId = `${uid}-file`;
  return (
    <aside
      aria-labelledby={headId}
      data-elevation-pane=""
      className="w-[360px] shrink-0 rounded-[2px] border border-[var(--sheet-rule)] px-[19px] py-3"
    >
      <h3
        id={headId}
        className="flex min-h-6 items-center font-mono text-[11px] font-medium uppercase leading-none tracking-[0.06em] text-[var(--sheet-ink-faint)]"
      >
        {roomName} · Elevation
      </h3>
      <svg
        width="320"
        height="200"
        viewBox="0 0 320 200"
        role="img"
        aria-label="Elevation not on file"
        className="mt-3 block"
      >
        <rect
          x="0.5"
          y="0.5"
          width="319"
          height="199"
          fill="none"
          stroke="var(--sheet-ink-faint)"
          strokeWidth="1"
        />
        <path
          d="M24 168h272M60 168V96h80v72M150 168V96h80v72M60 120h170M260 168V64"
          fill="none"
          stroke="var(--sheet-ink-faint)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
        <text
          x="160"
          y="44"
          textAnchor="middle"
          fill="var(--sheet-ink-faint)"
          fontSize="11"
          letterSpacing=".06em"
          className="font-mono"
        >
          ELEVATION NOT ON FILE
        </text>
      </svg>
      <div className="flex justify-center">
        <a href={fileHref} aria-describedby={fileHintId} className={ACT}>
          + File
        </a>
        <span id={fileHintId} className="sr-only">
          Opens the Plan Room, where the job&apos;s drawings are filed.
        </span>
      </div>
    </aside>
  );
}
