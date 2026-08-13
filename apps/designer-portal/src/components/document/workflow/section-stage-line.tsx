"use client";

/**
 * R1 · M1-after — the stage as a section sub-label.
 *
 * Three equal-width, colour-differentiated bands in the Strata Mark's movement
 * hues. The fill marks WHICH track, never how much of it is done, so the bands
 * are drawn equal and carry no progress semantics. D4: value contrast only, no
 * shadow anywhere.
 */

import { useId, type CSSProperties } from "react";
import type { ResidentialWorkflowTrackKey } from "@patina/types";
import type { Fidelity } from "@patina/utils";

import type { SectionStageLineModel } from "@/lib/document/section-stage-line";

const FIDELITY_LABEL: Record<Fidelity, string> = {
  band: "Band",
  frame: "Frame",
  committed: "Committed",
  record: "Record",
};

const TRACK_HUE: Record<ResidentialWorkflowTrackKey, string> = {
  core: "var(--color-mocha)",
  ffe: "var(--color-clay)",
  construction: "var(--color-dusty-blue)",
};

const META =
  "font-mono text-[12px] uppercase tracking-[0.09em] text-[var(--text-muted)]";

export interface SectionStageLineProps {
  model: SectionStageLineModel | null;
  /**
   * R113 — an unanchored engagement is a legitimate Band, not an error. With no
   * model to name a stage, the line states the register it does know, or stays
   * silent when it knows nothing at all.
   */
  fidelity?: Fidelity | null;
}

export function SectionStageLine({ model, fidelity }: SectionStageLineProps) {
  const headingId = useId();
  const tracksId = useId();

  return (
    <section
      aria-labelledby={headingId}
      data-workflow-document
      data-section-stage-line
      className="mb-1 min-w-0 max-w-full overflow-x-clip"
    >
      <h3 id={headingId} className="sr-only">
        Workflow stage
      </h3>

      {model ? (
        <>
          {model.subLabel && (
            <p className="min-w-0 break-words font-mono text-[12px] font-semibold uppercase tracking-[0.09em] text-[var(--color-aged-oak)]">
              {model.subLabel}
            </p>
          )}

          {model.tracks.length > 0 && (
            <ul
              id={tracksId}
              aria-label="Live workflow tracks"
              className="mt-3 min-w-0 max-w-[21rem] space-y-1.5"
            >
              {model.tracks.map((track) => (
                <li
                  key={track.key}
                  data-workflow-track={track.key}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_6.5rem] items-center gap-x-3"
                >
                  <span
                    aria-hidden="true"
                    className="h-[3px] w-full rounded-full bg-[var(--track-hue)]"
                    style={
                      { "--track-hue": TRACK_HUE[track.key] } as CSSProperties
                    }
                  />
                  <span className={`${META} text-right`}>
                    {track.label} · {track.stageNumber}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {model.provenance && (
            <p className={`mt-3 min-w-0 break-words ${META}`}>
              {model.provenance}
            </p>
          )}
        </>
      ) : fidelity ? (
        <p className={`min-w-0 break-words ${META}`}>{FIDELITY_LABEL[fidelity]}</p>
      ) : null}
    </section>
  );
}
