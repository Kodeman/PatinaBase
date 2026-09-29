// apps/designer-portal/src/lib/arrival/run-contract.ts — FROZEN (W1.5). Types only: the seam between
// the engine (src/lib/arrival/*) and the host (src/components/document/arrival/*). The host receives an
// ArrivalEngine by injection so the two pieces build and test independently; W3 wires the real one.
import type {
  ArrivalEnded, Brief, DeclineCause, EndHow, GateInput, GateResult, Host, Surface, Via,
} from './types'

export type RunPhase = 'compose' | 'hold' | 'assemble' | 'done'

export interface RunOptions {
  via: Via | null
  reduced: boolean
  entryAt: number
  now: () => number
}

export interface Run {
  readonly phase: RunPhase
  /** Resolves exactly once, with the same payload the host reports as telemetry. */
  readonly ended: Promise<ArrivalEnded>
  /** Swaps arr-pre → arr-on, sets data-arr-played, measures, composes, holds. Never throws. */
  start(): void
  /** Idempotent. Always restores every page node, class, attribute and aria-live it touched. */
  finish(how: EndHow, cause?: DeclineCause): void
  /** The host forwards raw window-capture events; the run decides swallow/advance per CONTRACT §3. */
  onKeyDown(e: KeyboardEvent): void
  onPointerDown(e: PointerEvent): void
  onPointerUp(e: PointerEvent): void
  onWheel(e: WheelEvent): void
  onTouchMove(e: TouchEvent): void
  onScroll(): void
  onVisibilityChange(): void
  onFocusIn(e: FocusEvent): void
}

export type CreateRun = (brief: Brief, host: Host, opts: RunOptions) => Run

export interface ArrivalEngine {
  /** PURE: no storage reads or writes. */
  gate: (input: GateInput) => GateResult
  /** Lifts ONLY from [data-part] nodes inside root (data-part-long overrides textContent when present). null → decline 'no-headline'. */
  brief: (root: HTMLElement, surface: Surface) => Brief | null
  /** Frame-0 re-read: every part.text still equals its node's current text (same data-part-long rule). */
  verifyFrame0: (brief: Brief) => boolean
  createRun: CreateRun
}
