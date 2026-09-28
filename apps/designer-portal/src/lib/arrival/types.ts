export type Surface = 'desk' | 'document'
export type Part =
  | 'headline' | 'act' | 'act2' | 'f1' | 'f2' | 'f3'
  | 'name' | 'stage' | 'crown' | 'job' | 'warn' | 'head' | 'settle'
export type Carrier = 'node' | 'clone'
export type Via = 'ptr' | 'kbd' | 'act'
export type EntryKind = 'hard' | 'soft' | 'replace' | 'back_forward' | 'reload'
export type Landing =
  | { kind: 'region'; region: string }
  | { kind: 'ffe'; ffeItemId: string }
  | { kind: 'section'; sectionKey: string }

export interface ArriveToken { via: Via; to: string; at: number; landing?: Landing }

export type DeclineCause =
  | 'query' | 'token' | 'visit' | 'desk-shown' | 'busy' | 'late' | 'hidden'
  | 'fonts' | 'sentinel' | 'drift' | 'no-root' | 'no-headline' | 'webdriver'
  | 'replace' | 'back_forward' | 'reload' | 'unsupported' | 'error'
export type EndHow =
  | 'settled' | 'input' | 'escape' | 'skip' | 'mutation' | 'watchdog' | 'error'
  | 'hidden-tab' | 'declined'

export interface GateInput {
  surface: Surface; pathname: string; search: string; hash: string
  entry: EntryKind; entryAt: number; now: number
  webdriver: boolean; e2eOptIn: boolean
  visitAt: number | null; deskShown: boolean; token: ArriveToken | null
  suppressedPath: string | null; reducedMotion: boolean
}
export type GateResult =
  | { play: true; via: Via | null; reduced: boolean }
  | { play: false; cause: DeclineCause }
// gate() is PURE: no storage reads or writes. start() performs every write
// (pl-visit, pl-desk, token consumption) so a StrictMode double effect re-gates identically.

export interface CardPart { part: Part; text: string; node: HTMLElement; carrier: Carrier }
export interface Brief {
  surface: Surface; parts: CardPart[]; headline: CardPart; act: CardPart | null
  today: string /* browser-local YYYY-MM-DD */
}
// brief(root) lifts ONLY from [data-part] nodes inside the route root; returns null →
// decline 'no-headline'. Frame-0 re-read must equal each part.text or decline 'drift'.

export interface Host {
  root(): HTMLElement | null            // [data-arrival] route root
  ready(): boolean                      // [data-arrival-ready] present
  busy(): boolean                       // §3 list
  faces(): string[]                     // CSS-var families
  view(): { top: number; height: number; width: number; bottom: number } // minus MobileBar
  telemetry(e: ArrivalEnded): void
  markArrival(surface: Surface, engagementId: string | null): void  // fire-and-forget
}

export interface ArrivalEnded { surface: Surface; how: EndHow; cause?: DeclineCause }

export const BUDGET = {
  HOLD_MS: 10_000, HIDDEN_CAP_MS: 1_200, HARD_ENTRY_READY_MS: 8_000, SOFT_ENTRY_READY_MS: 4_000,
  QUIET_MS: 200, FONTS_MS: 600, TOKEN_TTL_MS: 5_000, VISIT_MS: 30 * 60_000,
  WATCHDOG_MARGIN_MS: 5_000, INPUT_SCROLL_WINDOW_MS: 800, LANDING_FADE_MS: 120,
} as const
export const KEYS = {
  ARRIVE: 'pl-arrive', VISIT: 'pl-visit', DESK: 'pl-desk', FROM_DOC: 'pl-from-doc', E2E: 'pl-arrive-e2e',
} as const  // sessionStorage, window.name fallback
export const SENTINEL = '--arr-ok'   // :root{--arr-ok:1} — CSS missing → decline 'sentinel'
export const EVENT_ENDED = 'patina:arrival-ended'
