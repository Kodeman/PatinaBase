/**
 * The loading register's two primitives (US-33 D1 §2, Q "Quiet paper").
 *
 * - `LoadingRegion` is the busy region. It carries `aria-busy="true"` and an
 *   `sr-only` sentence naming what is loading (H4), and it sets the delay the
 *   bars inside it wait before they appear (PQ8: 150 ms, so a fast load never
 *   flashes). The delay is CSS, not a timer: nothing runs before hydration.
 * - `Bar` is one placeholder: a filled pearl bar standing for a line of text,
 *   never a hollow frame (H2). Give it the line box of the type it stands for
 *   so the swap to text moves nothing (D1.19).
 *
 * Still pearl bars, no breath: the breath is N10's (`loading-register`).
 * The `.ph` rules live in globals.css (US-34 F13).
 */

import type { CSSProperties, ReactNode } from "react";
import { PLACEHOLDER_DELAY_MS } from "@/lib/loading/thresholds";

export function Bar({
  width,
  height = 8,
  className,
  style,
}: {
  /** A CSS length: `'40%'`, `120`. */
  width: number | string;
  /** About 0.6 of the type the bar stands for. */
  height?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      data-placeholder
      className={className ? `ph ${className}` : "ph"}
      style={{ width, height, ...style }}
    />
  );
}

export function LoadingRegion({
  label,
  className,
  children,
}: {
  /** The sentence a screen reader hears: "Loading the directory." */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      aria-busy="true"
      data-loading-region
      className={className}
      style={{ "--ph-delay": `${PLACEHOLDER_DELAY_MS}ms` } as CSSProperties}
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
