/**
 * US-14 arrival — entry classification (CONTRACT §3 "Entry classification"). Module state lives
 * for the tab's JS runtime: the first route commit is the hard load; every later commit is a soft
 * (client) navigation, a Back/Forward when a popstate preceded it, or a replace the page announced
 * with `suppressNextArrival`.
 */
import { BUDGET } from './types';
import type { EntryKind } from './types';
import { writeFromDoc } from './session';

/** A route commit this soon after a popstate is that Back/Forward's commit. */
export const POP_AGO_MS = 1_000;

const DOC_PATH = /^\/doc\/([^/]+)\/?$/;

let firstCommitSeen = false;
let lastPopAt = -Infinity;
let previousPath: string | null = null;
const suppressed = new Map<string, number>();

function toPathname(path: string): string {
  try {
    return new URL(path, 'http://arrival.local').pathname;
  } catch {
    return path.split(/[?#]/)[0] ?? path;
  }
}

/** `/doc/{id}` → the decoded id; any other path → null. */
export function docIdOf(pathname: string): string | null {
  const m = DOC_PATH.exec(pathname);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

/** The page is about to replace the route with `path`: that commit must not perform. */
export function suppressNextArrival(path: string, now: number = Date.now()): void {
  suppressed.set(toPathname(path), now);
}

/** True once for a suppression of `path` made within the token TTL. */
export function consumeSuppressed(path: string, now: number = Date.now()): boolean {
  const key = toPathname(path);
  const at = suppressed.get(key);
  if (at === undefined) return false;
  suppressed.delete(key);
  const age = now - at;
  return age >= 0 && age < BUDGET.TOKEN_TTL_MS;
}

export function notePopState(now: number = Date.now()): void {
  lastPopAt = now;
}

function navigationEntry(): PerformanceNavigationTiming | null {
  try {
    const entry = performance.getEntriesByType('navigation')[0];
    return (entry as PerformanceNavigationTiming | undefined) ?? null;
  } catch {
    return null;
  }
}

function timeOrigin(now: number): number {
  try {
    if (typeof performance.timeOrigin === 'number' && performance.timeOrigin > 0) {
      return performance.timeOrigin;
    }
    return now - performance.now();
  } catch {
    return now;
  }
}

export interface RouteEntry {
  entry: EntryKind;
  /** Epoch ms: `performance.timeOrigin` on the hard load, the commit otherwise. */
  entryAt: number;
  hard: boolean;
  /** Navigation-timing type on the hard load; null on every soft entry. */
  navType: string | null;
  suppressedPath: string | null;
}

/**
 * Classifies the route commit for `pathname`. Call once per commit (the caller caches it for
 * StrictMode): it spends the popstate and suppression marks, tracks the previous pathname, and
 * writes `pl-from-doc` when a Document is put down onto the Desk.
 */
export function enterRoute(pathname: string, now: number = Date.now()): RouteEntry {
  const nav = navigationEntry();
  let hard = false;
  if (!firstCommitSeen) {
    // A first commit inside this layout is the hard load only if the tab loaded this very path;
    // a hard load elsewhere followed by a client navigation here is soft.
    hard = nav === null || toPathname(nav.name) === pathname;
  }
  firstCommitSeen = true;

  const prev = previousPath;
  previousPath = pathname;
  if (prev !== null && prev !== pathname && pathname === '/desk') {
    const id = docIdOf(prev);
    if (id) writeFromDoc(id);
  }

  let entry: EntryKind;
  let navType: string | null = null;
  if (hard) {
    navType = nav?.type ?? null;
    entry = navType === 'reload' ? 'reload' : navType === 'back_forward' ? 'back_forward' : 'hard';
  } else if (now - lastPopAt >= 0 && now - lastPopAt < POP_AGO_MS) {
    entry = 'back_forward';
  } else {
    entry = 'soft';
  }
  lastPopAt = -Infinity;

  let suppressedPath: string | null = null;
  if (consumeSuppressed(pathname, now)) {
    suppressedPath = pathname;
    entry = 'replace';
  }
  // A suppression names the very next commit; any left over is spent.
  suppressed.clear();

  return { entry, entryAt: hard ? timeOrigin(now) : now, hard, navType, suppressedPath };
}
