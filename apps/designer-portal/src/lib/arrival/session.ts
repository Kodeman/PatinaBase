/**
 * US-14 arrival — the tab's own marks (CONTRACT §3, KEYS). sessionStorage first; where that is
 * refused, one JSON line kept on `window.name` after a marker (it outlives same-tab navigation),
 * exactly as the mockup's store (arrival.js:19-27). Every access is try/catch: a refused store
 * reads as empty and a write that fails is dropped.
 */
import { BUDGET, KEYS } from './types';
import type { ArriveToken, Landing, Via } from './types';

const NAME_MARK = '⁣pl:';
const PROBE = 'pl-probe';
const TOUCH_THROTTLE_MS = 10_000;

function sessionStore(): Storage | null {
  try {
    const ss = window.sessionStorage;
    ss.setItem(PROBE, '1');
    ss.removeItem(PROBE);
    return ss;
  } catch {
    return null;
  }
}

function readNameLine(): Record<string, string> {
  try {
    const name = String(window.name || '');
    const i = name.indexOf(NAME_MARK);
    if (i < 0) return {};
    const parsed: unknown = JSON.parse(name.slice(i + NAME_MARK.length));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeNameLine(line: Record<string, string>): void {
  try {
    const name = String(window.name || '');
    const i = name.indexOf(NAME_MARK);
    window.name = (i < 0 ? name : name.slice(0, i)) + NAME_MARK + JSON.stringify(line);
  } catch {
    /* refused: the mark is simply not kept */
  }
}

function get(key: string): string | null {
  if (typeof window === 'undefined') return null;
  const ss = sessionStore();
  if (ss) {
    try {
      return ss.getItem(key);
    } catch {
      return null;
    }
  }
  const line = readNameLine();
  return Object.prototype.hasOwnProperty.call(line, key) ? String(line[key]) : null;
}

function set(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  const ss = sessionStore();
  if (ss) {
    try {
      ss.setItem(key, value);
    } catch {
      /* quota or refusal: dropped */
    }
    return;
  }
  const line = readNameLine();
  line[key] = value;
  writeNameLine(line);
}

function del(key: string): void {
  if (typeof window === 'undefined') return;
  const ss = sessionStore();
  if (ss) {
    try {
      ss.removeItem(key);
    } catch {
      /* dropped */
    }
    return;
  }
  const line = readNameLine();
  if (!Object.prototype.hasOwnProperty.call(line, key)) return;
  delete line[key];
  writeNameLine(line);
}

function readNumber(key: string): number | null {
  const raw = get(key);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── visit (pl-visit) and the Desk's once-a-visit mark (pl-desk) ──────────────

export function readVisit(): number | null {
  return readNumber(KEYS.VISIT);
}

/** Stamps the visit. A missing or stale visit (30 min without her hand) is a new visit, so the
 *  Desk's once-a-visit mark goes with it — before the stamp, or a returning click would keep it. */
export function markVisit(now: number): void {
  const last = readVisit();
  if (last === null || now - last >= BUDGET.VISIT_MS || now < last) del(KEYS.DESK);
  set(KEYS.VISIT, String(now));
}

let touchedAt = -Infinity;

/** Her hand refreshes the visit, throttled (the mockup's `mark()`, arrival.js:816). */
export function touchVisit(now: number): void {
  if (now - touchedAt <= TOUCH_THROTTLE_MS && now >= touchedAt) return;
  touchedAt = now;
  markVisit(now);
}

export function readDeskShown(): boolean {
  return get(KEYS.DESK) !== null;
}

export function setDeskShown(now: number): void {
  set(KEYS.DESK, String(now));
}

// ── the click token (pl-arrive) ─────────────────────────────────────────────

const VIAS: readonly Via[] = ['ptr', 'kbd', 'act'];

export function parseLanding(raw: unknown): Landing | undefined {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  if (v.kind === 'region' && typeof v.region === 'string' && v.region) {
    return { kind: 'region', region: v.region };
  }
  if (v.kind === 'ffe' && typeof v.ffeItemId === 'string' && v.ffeItemId) {
    return { kind: 'ffe', ffeItemId: v.ffeItemId };
  }
  if (v.kind === 'section' && typeof v.sectionKey === 'string' && v.sectionKey) {
    return { kind: 'section', sectionKey: v.sectionKey };
  }
  return undefined;
}

export function writeArriveToken(token: ArriveToken): void {
  set(KEYS.ARRIVE, JSON.stringify(token));
}

function validToken(raw: string | null, pathname: string, now: number): ArriveToken | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (!VIAS.includes(v.via as Via)) return null;
  if (typeof v.to !== 'string' || v.to !== pathname) return null;
  if (typeof v.at !== 'number' || !Number.isFinite(v.at)) return null;
  const age = now - v.at;
  if (age < 0 || age >= BUDGET.TOKEN_TTL_MS) return null;
  const token: ArriveToken = { via: v.via as Via, to: v.to, at: v.at };
  const landing = parseLanding(v.landing);
  if (landing) token.landing = landing;
  return token;
}

/** Peek: the token honoured for this pathname now (`to === pathname`, younger than the TTL). */
export function readArriveToken(pathname: string, now: number): ArriveToken | null {
  return validToken(get(KEYS.ARRIVE), pathname, now);
}

/** Read once: whatever the stored token was, it is gone after this call. */
export function consumeArriveToken(pathname: string, now: number): ArriveToken | null {
  const token = validToken(get(KEYS.ARRIVE), pathname, now);
  del(KEYS.ARRIVE);
  return token;
}

// ── the put-down's row (pl-from-doc) ────────────────────────────────────────

export function writeFromDoc(engagementId: string): void {
  set(KEYS.FROM_DOC, engagementId);
}

export function readFromDoc(): string | null {
  const id = get(KEYS.FROM_DOC);
  return id ? id : null;
}

export function consumeFromDoc(): string | null {
  const id = readFromDoc();
  del(KEYS.FROM_DOC);
  return id;
}

// ── the e2e opt-in (pl-arrive-e2e) ──────────────────────────────────────────

export function readE2eOptIn(): boolean {
  return get(KEYS.E2E) === '1';
}
