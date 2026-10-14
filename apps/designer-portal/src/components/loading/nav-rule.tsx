"use client";

/**
 * The navigation rule (US-34 N11; US-33 PQ4, triage R14), behind the
 * fail-closed `loading-register` flag. Flag off renders nothing and listens to
 * nothing.
 *
 * A same-origin anchor click (capture phase) or `router.push` starts it. It
 * draws after NAV_RULE_DELAY_MS, so a warm navigation shows nothing. It ends
 * only when BOTH hold:
 * - the destination has committed: pathname and search equal the target;
 * - that destination's `<main>` holds no `[aria-busy="true"]` for one frame.
 * The old page is usually idle while the next is in flight, so idleness alone
 * would end it early.
 *
 * A newer navigation takes the rule over (the commit of a superseded one does
 * not end it); Back/Forward cancels it; a click on the current address ends it
 * at once. It never fakes completion: 60% while the route is fetched, 90% while
 * the destination is busy, then 100% and a fade. Reduced motion steps.
 */

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NAV_RULE_DELAY_MS } from "@/lib/loading/thresholds";
import { useLoadingRegister } from "./register";

/** The completing stroke (120 ms) and its fade (200 ms), as globals.css draws them. */
export const NAV_RULE_DONE_MS = 320;

const BUSY = 'main[aria-busy="true"], main [aria-busy="true"]';

type Stage = "hidden" | "route" | "data" | "done";

interface Run {
  /** The destination, as `pathname?search`. */
  target: string;
  committed: boolean;
}

function trimSlash(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function decoded(path: string): string {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

/** `pathname?search`, normalised so a hook's reading and a resolved href compare. */
function keyOf(pathname: string, search: string): string {
  return `${trimSlash(decoded(pathname))}?${new URLSearchParams(search).toString()}`;
}

function busy(): boolean {
  return document.querySelector(BUSY) !== null;
}

/** The anchor a plain primary click would have Next navigate in this tab, else null. */
function navigableHref(event: MouseEvent): string | null {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return null;
  const anchor =
    event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!anchor) return null;
  const target = anchor.getAttribute("target");
  if (target && target !== "_self") return null;
  if (anchor.hasAttribute("download")) return null;
  // A refused act (DocumentAction's unavailable link) cancels its own click.
  if (anchor.getAttribute("aria-disabled") === "true") return null;
  return anchor.getAttribute("href");
}

type Router = ReturnType<typeof useRouter>;

/**
 * Wraps `router.push` for as long as the rule is mounted; returns the unwrap.
 * useRouter() is the app router's one shared instance, so every caller in the
 * tree reaches the wrap, and the unwrap restores it.
 */
function wrapPush(router: Router, onPush: (href: string) => void): () => void {
  const original = router.push;
  const wrapped: Router["push"] = (href, options) => {
    onPush(href);
    original(href, options);
  };
  router.push = wrapped;
  return () => {
    if (router.push === wrapped) router.push = original;
  };
}

function NavRuleRun() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const search = useSearchParams()?.toString() ?? "";
  const [stage, setStageState] = useState<Stage>("hidden");

  const here = useRef({ pathname, search });
  const stageRef = useRef<Stage>("hidden");
  const run = useRef<Run | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef<number | null>(null);
  const observer = useRef<MutationObserver | null>(null);

  const setStage = useCallback((next: Stage) => {
    stageRef.current = next;
    setStageState(next);
  }, []);

  /** Drop every pending step of the watch; the run itself is the caller's. */
  const quiet = useCallback(() => {
    observer.current?.disconnect();
    observer.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (doneTimer.current !== null) clearTimeout(doneTimer.current);
    doneTimer.current = null;
  }, []);

  const stop = useCallback(() => {
    quiet();
    if (showTimer.current !== null) clearTimeout(showTimer.current);
    showTimer.current = null;
    run.current = null;
    if (stageRef.current !== "hidden") setStage("hidden");
  }, [quiet, setStage]);

  const finish = useCallback(() => {
    if (stageRef.current === "hidden" || stageRef.current === "done") {
      stop();
      return;
    }
    quiet();
    if (showTimer.current !== null) clearTimeout(showTimer.current);
    showTimer.current = null;
    run.current = null;
    setStage("done");
    doneTimer.current = setTimeout(() => {
      doneTimer.current = null;
      setStage("hidden");
    }, NAV_RULE_DONE_MS);
  }, [quiet, setStage, stop]);

  /** The destination has committed: wait until its paper has no busy region for one frame. */
  const watch = useCallback(() => {
    const settle = () => {
      if (busy()) {
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
        if (stageRef.current === "route") setStage("data");
        return;
      }
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        if (!busy()) finish();
      });
    };
    observer.current = new MutationObserver(settle);
    observer.current.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-busy"],
    });
    settle();
  }, [finish, setStage]);

  const begin = useCallback(
    (href: string) => {
      const { pathname: path, search: query } = here.current;
      let url: URL;
      try {
        url = new URL(href, `${window.location.origin}${path}?${query}`);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      const target = keyOf(url.pathname, url.search);
      if (target === keyOf(path, query)) {
        stop();
        return;
      }
      quiet();
      run.current = { target, committed: false };
      if (stageRef.current === "done") setStage("route");
      // Measured from the first click: a superseding click never resets the wait.
      if (stageRef.current === "hidden" && showTimer.current === null) {
        showTimer.current = setTimeout(() => {
          showTimer.current = null;
          setStage(run.current?.committed ? "data" : "route");
        }, NAV_RULE_DELAY_MS);
      }
    },
    [quiet, setStage, stop],
  );

  // Starts: a capture-phase anchor click and a wrapped router.push. Back/Forward cancels.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const href = navigableHref(event);
      if (href !== null) begin(href);
    };
    document.addEventListener("click", onClick, { capture: true });
    window.addEventListener("popstate", stop);
    const unwrap = wrapPush(router, begin);
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("popstate", stop);
      unwrap();
    };
  }, [begin, router, stop]);

  // The commit: pathname and search now read the target. A superseded
  // navigation's commit is not the target, so it never ends the rule.
  useEffect(() => {
    here.current = { pathname, search };
    const current = run.current;
    if (!current || current.committed) return;
    if (keyOf(pathname, search) !== current.target) return;
    current.committed = true;
    watch();
  }, [pathname, search, watch]);

  useEffect(
    () => () => {
      stop();
    },
    [stop],
  );

  if (stage === "hidden") return null;
  return (
    <div
      className="nav-rule"
      data-stage={stage}
      role="progressbar"
      aria-label="Loading the page"
      // Done is no longer progress: out of the tree for its last 320 ms.
      aria-hidden={stage === "done" ? true : undefined}
    />
  );
}

/** Mounted once in the (document) layout. useSearchParams needs its own Suspense boundary. */
export function NavRule() {
  const on = useLoadingRegister();
  if (!on) return null;
  return (
    <Suspense fallback={null}>
      <NavRuleRun />
    </Suspense>
  );
}
