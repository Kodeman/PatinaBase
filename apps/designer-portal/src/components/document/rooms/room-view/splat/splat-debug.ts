'use client';

/**
 * `?splatDebug=1` — the Splat stage's error, said out loud (Rendered Room v2, W2).
 *
 * The canvas's failure states are deliberately quiet: every one of them lands on the
 * same italic line, and the `catch` blocks that route them there are bare. That is the
 * right behaviour for a designer — Mesh and Plan carry the room — and it is exactly
 * wrong for debugging a failure that only reproduces in a deployed build, where there
 * is no dev server, no unminified frame, and no second chance to add a breakpoint.
 *
 * So this is an explicit, user-opted escape hatch, and unlike `dev-splat-url.ts` it is
 * NOT folded away in production. That is safe on a different footing than "dev only":
 *
 *   · It is INERT until someone types the flag. Nothing about the page changes, and
 *     nothing is logged, without it.
 *   · It reveals an error STRING and a stack — the shape of the failure, not data.
 *     No room, no scan, no project, no session ever passes through here.
 *   · The one genuinely sensitive thing an error can carry is the capability URL,
 *     whose query string is a SigV4 signature. `scrubSecrets` strips the query and
 *     fragment off every URL in the text, on both the rendered and the logged path,
 *     so a screenshot of a debug run cannot hand anyone a working read grant.
 *
 * The stack is capped at 300 characters: the throwing frame and its callers are the
 * whole diagnostic value, and an uncapped Spark stack is thousands of characters of
 * minified single-letter frames that would push the message itself off the stage.
 */

import { useEffect, useState } from 'react';

const STACK_LIMIT = 300;

/**
 * Every `http(s)`/`blob:`/`data:`-ish absolute URL, up to the first character that
 * cannot appear unescaped in one. Deliberately greedy about what it *matches* and
 * strict about what it *keeps*.
 */
const ABSOLUTE_URL = /\bhttps?:\/\/[^\s'"`)<>\]]+/gi;

/**
 * Anything that still looks like a signed-URL query, even detached from its URL —
 * an error message may quote only the tail. Matched case-insensitively because
 * different SDKs cased these differently over the years.
 */
const SIGNED_QUERY = /[?&](x-amz-|amz-|sig=|signature=|token=|key=)[^\s'"`)<>\]]*/gi;

/**
 * The text with every URL truncated at its `?` or `#`.
 *
 * Origin and path SURVIVE on purpose: which host answered, and whether the object was
 * a `.spz` or a `.ply`, is most of the diagnosis. The signature is what must not.
 * Pure and total — safe on any string, including one with no URL in it.
 */
export function scrubSecrets(text: string): string {
  return text
    .replace(ABSOLUTE_URL, (url) => url.split(/[?#]/, 1)[0])
    .replace(SIGNED_QUERY, '');
}

/**
 * Whether the debug flag is set on a query string. Pure and total — safe to call with
 * anything, including the empty string. Only the literal `1` opts in, so a stray
 * `?splatDebug` or `?splatDebug=0` stays off.
 */
export function splatDebugEnabled(search: string): boolean {
  try {
    return new URLSearchParams(search).get('splatDebug') === '1';
  } catch {
    return false;
  }
}

/**
 * The flag for the live location, resolved after mount.
 *
 * Same shape and same reason as `useDevSplatUrl`: the state starts `false` on both the
 * server render and the first client render, so reading it can never cause a hydration
 * mismatch — where a render-time `window.location` read would.
 */
export function useSplatDebug(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(splatDebugEnabled(window.location.search));
  }, []);

  return enabled;
}

/** Where in the canvas's lifecycle a failure came from — the first thing worth knowing. */
export type SplatFailureStage =
  /** `new THREE.WebGLRenderer` refused, or handed back no context. */
  | 'webgl'
  /** `new SparkRenderer` threw — before the splat URL is ever touched. */
  | 'spark-renderer'
  /** `new SplatMesh({ url })` threw synchronously. */
  | 'splat-mesh'
  /** `splatMesh.initialized` rejected — the fetch/decode path. */
  | 'initialize'
  /** A sort or draw failed while mounted. */
  | 'frame';

export interface SplatFailure {
  stage: SplatFailureStage;
  message: string;
  stack: string | null;
}

/**
 * An unknown thrown value, reduced to the two scrubbed strings worth showing.
 *
 * `String(err)` rather than a bare cast because Spark throws WASM-originated values
 * that are not always `Error`s, and a thrown string is precisely the case where a
 * naive `err.message` would render the empty stage that sent us here.
 */
export function describeSplatFailure(
  stage: SplatFailureStage,
  err: unknown,
): SplatFailure {
  const raw =
    err instanceof Error
      ? err.message || String(err)
      : typeof err === 'string'
        ? err
        : String(err);
  const stack = err instanceof Error && err.stack ? err.stack : null;

  return {
    stage,
    message: scrubSecrets(raw),
    stack: stack ? scrubSecrets(stack).slice(0, STACK_LIMIT) : null,
  };
}
