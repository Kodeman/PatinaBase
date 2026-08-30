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
import { FIDELITY_WORD, type Fidelity } from "@patina/utils";

import type { SectionStageLineModel } from "@/lib/document/section-stage-line";

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
  /**
   * W5 follow-up — the strip is HOSTED by a stop that already names it.
   *
   * Inside `scope` the region head prints the stop's name and status, and the
   * strip printed its own label under it: `Core · stage 03` three times down
   * one column. A hosted strip drops the label line and the `Workflow stage`
   * eyebrow — the head is the name — and the bars with `CORE · 03` become the
   * whole body.
   */
  hosted?: boolean;
}

export function SectionStageLine({
  model,
  fidelity,
  hosted = false,
}: SectionStageLineProps) {
  const headingId = useId();
  const tracksId = useId();
  // Hosted, it is not its own region: a second landmark named "Workflow stage"
  // sitting inside the stop that already carries that name is one more thing
  // to walk past.
  const Frame = hosted ? 'div' : 'section';

  return (
    <Frame
      {...(hosted ? {} : { 'aria-labelledby': headingId })}
      data-workflow-document
      data-section-stage-line
      className="mb-1 min-w-0 max-w-full overflow-x-clip"
    >
      {!hosted && (
        <h3 id={headingId} className="sr-only">
          Workflow stage
        </h3>
      )}

      {model ? (
        <>
          {!hosted && model.subLabel && (
            <p className="min-w-0 break-words font-mono text-[12px] font-semibold uppercase tracking-[0.09em] text-[var(--color-aged-oak)]">
              {model.subLabel}
            </p>
          )}

          {model.tracks.length > 0 && (
            // A1 e2e follow-up: at 320px the bare `max-w-[21rem]` (336px) was
            // wider than the viewport and the label column was a fixed
            // `6.5rem` with nowhere to shrink to. `w-full` + `max-w` resolves
            // to `min(100%, 21rem)`, so the 336px cap still holds on the wide
            // paper, and `min-w-0 break-words` lets a long `label ·
            // stageNumber` pairing wrap instead of forcing the row past the
            // section's own edge.
            <ul
              id={tracksId}
              aria-label="Live workflow tracks"
              className="mt-3 w-full min-w-0 max-w-[21rem] space-y-1.5"
            >
              {model.tracks.map((track) => (
                <li
                  key={track.key}
                  data-workflow-track={track.key}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,6.5rem)] items-center gap-x-3"
                >
                  <span
                    aria-hidden="true"
                    className="h-[3px] w-full rounded-full bg-[var(--track-hue)]"
                    style={
                      { "--track-hue": TRACK_HUE[track.key] } as CSSProperties
                    }
                  />
                  <span className={`${META} min-w-0 break-words text-right`}>
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
        <p role="status" className={`min-w-0 break-words ${META}`}>
          {FIDELITY_WORD[fidelity]}
        </p>
      ) : null}
    </Frame>
  );
}
