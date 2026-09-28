// US-14 arrival — the gate. PURE: it reads only its input, so a StrictMode double effect re-gates
// identically; start() and the host perform every storage write.
import { BUDGET } from './types'
import type { ArriveToken, GateInput, GateResult } from './types'

const filled = (part: string, mark: string) => part !== '' && part !== mark

/** A token is honoured once, for its own path, while fresh; a refresh never inherits one. */
function honoured(input: GateInput): ArriveToken | null {
  const t = input.token
  if (!t || t.to !== input.pathname || input.entry === 'reload') return null
  const age = input.now - t.at
  return age >= 0 && age < BUDGET.TOKEN_TTL_MS ? t : null
}

/** Structurally ArrivalEngine['gate'] (run-contract.ts); engine.ts binds it to that type. */
export function gate(input: GateInput): GateResult {
  if (filled(input.search, '?') || filled(input.hash, '#')) return { play: false, cause: 'query' }
  const token = honoured(input)
  if (token?.landing) return { play: false, cause: 'token' }
  if (input.webdriver && !input.e2eOptIn) return { play: false, cause: 'webdriver' }
  if (input.entry === 'replace' || input.suppressedPath === input.pathname) {
    return { play: false, cause: 'replace' }
  }
  if (input.entry === 'back_forward') return { play: false, cause: 'back_forward' }
  // arrival.js:36-38, 47 — the Desk briefs once a visit; a visit lapses after VISIT_MS without her
  // hand, and a lapsed visit forgets the Desk was shown. A Document arrives on every open.
  const visitLive = input.visitAt !== null && input.now - input.visitAt < BUDGET.VISIT_MS
  if (input.surface === 'desk' && input.deskShown && visitLive) {
    return { play: false, cause: 'desk-shown' }
  }
  return { play: true, via: token ? token.via : null, reduced: input.reducedMotion }
}
