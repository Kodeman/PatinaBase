"use client";

/**
 * The loading register's switch (US-34 N10; US-33 PQ2, PQ5–PQ7, V24), behind
 * the fail-closed `loading-register` flag. Flag off is today's behaviour.
 *
 * - `useLoadingRegister()` reads the flag and mirrors it onto <html> as
 *   `data-loading-register`. Server-rendered fallbacks cannot read a flag, so
 *   globals.css keys on that mark: placeholders breathe (PQ5), loader words
 *   marked `data-register-off` retire and `data-register-on` lines appear
 *   (PQ7), and arrival.css lifts the arr-pre veil (arrival C, PQ3).
 * - Until the flag answers on a fresh mount, the hook keeps the answer the
 *   session already printed on <html>, so a client navigation never flips
 *   from today's loader to the register on its first frame. On a hard load
 *   nothing is printed yet, which matches the server render.
 * - `SlowLine` is the register's only loading words (PQ7): slow at 4 s and
 *   stall at 10 s, from thresholds.ts. CSS times it, so it needs no clock.
 */

import {
  useLayoutEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { LOADING_REGISTER_ATTR } from "@/lib/arrival/register";
import { SLOW_MS, STALL_MS } from "@/lib/loading/thresholds";

export const LOADING_REGISTER_FLAG = "loading-register";

export function useLoadingRegister(): boolean {
  const { value, isLoading } = useFeatureFlag(LOADING_REGISTER_FLAG);
  const [carried] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.hasAttribute(LOADING_REGISTER_ATTR),
  );
  useLayoutEffect(() => {
    if (isLoading) return;
    const html = document.documentElement;
    if (value) html.setAttribute(LOADING_REGISTER_ATTR, "");
    else html.removeAttribute(LOADING_REGISTER_ATTR);
  }, [value, isLoading]);
  return isLoading ? carried : value;
}

/**
 * A route fallback that renders either way and keeps the register's mark on
 * <html> current. A loading boundary swaps the old page out at once, so flag
 * off must still draw the sheet (still, no slow line) rather than nothing.
 */
export function RegisterFallback({ children }: { children: ReactNode }) {
  useLoadingRegister();
  return <>{children}</>;
}

/**
 * "Still reading. The connection is slow." at SLOW_MS; "Reload the page" joins
 * it at STALL_MS (D1 §3). A plain link to this very URL, so it works before
 * hydration (H3). Hidden, not absent, until its time: `visibility` keeps it
 * out of the accessibility tree and out of the tab order until then.
 */
export function SlowLine({ className }: { className?: string }) {
  return (
    <p
      role="status"
      data-slow-line
      data-register-on
      className={className ? `slow-line ${className}` : "slow-line"}
      style={
        {
          "--slow-at": `${SLOW_MS}ms`,
          "--stall-at": `${STALL_MS}ms`,
        } as CSSProperties
      }
    >
      Still reading. The connection is slow.
      <span className="slow-line-stall">
        {" "}
        <a
          href=""
          className="inline-flex min-h-11 items-center underline underline-offset-2"
        >
          Reload the page
        </a>
      </span>
    </p>
  );
}
