'use client';

/**
 * US-36 K1–K3 — the hold spotlight. Pressing a held act lays a scrim INSIDE
 * the act's own frame (K2: never a second page veil, so no L5) with a window
 * cut around each thing that holds the act, and a bar that says the active
 * reason and carries its fix. Inside the frame, everything outside the windows
 * and the bar is `inert`. Nothing outside the frame is touched, so the
 * body-portalled popovers above it (ClientPicker z-70, aboveFolio sheets z-65)
 * stay usable.
 *
 * D4: depth is the --veil fill alone. No shadow, no blur, no opacity fade
 * (house sheet SPEC.md:370). Windows are --terracotta-ink hairlines.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { focusableWithin, trapTabWithin } from '@/lib/full-screen-boundary';
import type { SpotlightHold } from '@/lib/document/spotlight/use-hold-spotlight';
import { DocumentAction } from '../document-action';
import { topActiveModalDialog, topDismissiblePopover } from './active-dialog';

export type { SpotlightHold };

const PAD = 6;
const NARROW_QUERY = '(max-width: 640px)';
const LABEL_ROOM = 22;
const GEOMETRY_MOTION: CSSProperties = {
  transition: ['x', 'y', 'width', 'height']
    .map((property) => `${property} 160ms var(--ease-editorial)`)
    .join(', '),
};

type SpotWindow = { id: string; x: number; y: number; w: number; h: number };
type Geometry = { ids: string[]; windows: SpotWindow[]; width: number; height: number; inset: number };

export interface HoldSpotlightProps {
  frame: RefObject<HTMLElement | null>;
  holds: SpotlightHold[];
  open: boolean;
  onClose: () => void;
  onNext?: (hold: SpotlightHold) => void;
}

const things = (n: number) => (n === 1 ? '1 thing' : `${n} things`);

export function HoldSpotlight({ frame, holds, open, onClose, onNext }: HoldSpotlightProps) {
  const [frameEl, setFrameEl] = useState<HTMLElement | null>(null);
  const [geo, setGeo] = useState<Geometry | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const reduced = useReducedMotion();
  const maskId = `hold-spotlight-${useId().replace(/[^\w-]/g, '')}`;

  const rootRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const holdsRef = useRef(holds);
  const onCloseRef = useRef(onClose);
  const onNextRef = useRef(onNext);
  const reducedRef = useRef(reduced);
  const activeRef = useRef<string | null>(null);
  const advanceRef = useRef<(() => void) | null>(null);
  const dismissRef = useRef<(() => void) | null>(null);
  const scheduleRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    holdsRef.current = holds;
    onCloseRef.current = onClose;
    onNextRef.current = onNext;
    reducedRef.current = reduced;
  });

  // Re-read on open too, for a spotlight rendered inside its own frame.
  useLayoutEffect(() => {
    setFrameEl(frame.current);
  }, [frame, open]);

  useEffect(() => {
    scheduleRef.current?.();
  }, [holds]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const layer = layerRef.current;
    if (!open || !frameEl || !root || !layer) return;
    const host = frameEl;
    const marked = new Set<Element>();
    const observed = new Set<Element>();
    let request = 0;
    let count = -1;
    let done = false;
    let geoKey = '';
    const staticHost = window.getComputedStyle(host).position === 'static';
    const priorPosition = host.style.position;
    if (staticHost) host.style.position = 'relative';
    activeRef.current = null;

    const resolve = () =>
      holdsRef.current.flatMap((hold) => {
        const el = hold.target();
        return el && el !== host && host.contains(el) ? [{ hold, el }] : [];
      });

    // Mark only what this spotlight inerts; a node already inert is left as
    // it was, before and after.
    const settleInert = (keep: Element[]) => {
      const desired = new Set<Element>();
      const walk = (node: Element) => {
        for (const child of Array.from(node.children)) {
          if (keep.includes(child)) continue;
          if (keep.some((kept) => child.contains(kept))) walk(child);
          else if (marked.has(child) || !child.hasAttribute('inert')) desired.add(child);
        }
      };
      walk(host);
      marked.forEach((el) => {
        if (desired.has(el)) return;
        el.removeAttribute('inert');
        marked.delete(el);
      });
      desired.forEach((el) => {
        if (marked.has(el)) return;
        el.setAttribute('inert', '');
        marked.add(el);
      });
    };

    const focusInto = (el: HTMLElement) => {
      const into =
        focusableWithin(el)[0] ?? (barRef.current ? focusableWithin(barRef.current)[0] : undefined);
      into?.focus({ preventScroll: true });
    };

    const reveal = (el: HTMLElement) =>
      el.scrollIntoView?.({ block: 'center', behavior: reducedRef.current ? 'auto' : 'smooth' });

    const focusLost = () => {
      const active = document.activeElement;
      return (
        !active ||
        active === document.body ||
        (host.contains(active) && active.closest('[inert]') !== null)
      );
    };

    const schedule = () => {
      if (!request && !done) request = window.requestAnimationFrame(sync);
    };
    const resizer = new ResizeObserver(schedule);

    const sync = (): void => {
      if (request) window.cancelAnimationFrame(request);
      request = 0;
      if (done) return;
      const found = resolve();
      if (found.length === 0) {
        done = true;
        setMessage('All set.');
        onCloseRef.current();
        return;
      }
      const activeIndex = Math.max(
        0,
        found.findIndex((entry) => entry.hold.id === activeRef.current),
      );
      const active = found[activeIndex]!;
      activeRef.current = active.hold.id;
      setActiveId(active.hold.id);

      // On a phone only the active window is cut, so only it stays live.
      const narrow = window.matchMedia(NARROW_QUERY).matches;
      const shown = narrow ? [active] : found;
      settleInert([...shown.map((entry) => entry.el), root]);

      const watch = new Set<Element>([host, ...found.map((entry) => entry.el)]);
      observed.forEach((el) => {
        if (watch.has(el)) return;
        resizer.unobserve(el);
        observed.delete(el);
      });
      watch.forEach((el) => {
        if (observed.has(el)) return;
        resizer.observe(el);
        observed.add(el);
      });

      // The layer sits at the frame's scroll origin, so geometry is in the
      // frame's content coordinates and scrolls with it natively.
      const box = host.getBoundingClientRect();
      const ox = box.left + host.clientLeft - host.scrollLeft;
      const oy = box.top + host.clientTop - host.scrollTop;
      const width = host.clientWidth;
      const windows = shown.map(({ hold, el }) => {
        const r = el.getBoundingClientRect();
        const x = Math.max(0, r.left - ox - PAD);
        const y = Math.max(0, r.top - oy - PAD);
        const right = Math.min(width, r.right - ox + PAD);
        return {
          id: hold.id,
          x,
          y,
          w: Math.max(0, right - x),
          h: Math.max(0, r.bottom - oy + PAD - y),
        };
      });
      let bottom = 0;
      for (const child of Array.from(host.children)) {
        if (child === root) continue;
        const r = child.getBoundingClientRect();
        const margin = Number.parseFloat(window.getComputedStyle(child).marginBottom) || 0;
        bottom = Math.max(bottom, r.bottom - oy + margin);
      }
      const hostStyle = window.getComputedStyle(host);
      // A sticky bar stops at the frame's padding edge; the inset lets it dock
      // to the frame's own foot instead.
      const inset = Number.parseFloat(hostStyle.paddingBottom) || 0;
      bottom += inset;
      // A scrolling frame gets room past its content for the docked bar, so
      // the last window can scroll clear of it.
      const reserve = /auto|scroll/.test(hostStyle.overflowY)
        ? (barRef.current?.offsetHeight ?? 0) + (narrow ? 0 : 32)
        : 0;
      const height = Math.max(host.clientHeight, bottom + reserve);
      const ids = found.map((entry) => entry.hold.id);
      const key = JSON.stringify([ids, windows, width, height, inset]);
      if (key !== geoKey) {
        geoKey = key;
        setGeo({ ids, windows, width, height, inset });
      }

      const n = found.length;
      const reason = active.hold.reason;
      const first = count === -1;
      if (first) {
        setMessage(
          n === 1
            ? `1 thing needs attention: ${reason}`
            : `${n} things need attention. First: ${reason}`,
        );
      } else if (n < count) {
        setMessage(`${things(n)} left. ${activeIndex + 1} of ${n}: ${reason}`);
      }
      count = n;
      if (first || focusLost()) {
        reveal(active.el);
        focusInto(active.el);
      }
    };

    advanceRef.current = () => {
      const found = resolve();
      if (found.length < 2) return;
      const index = (found.findIndex((entry) => entry.hold.id === activeRef.current) + 1) % found.length;
      const next = found[index]!;
      activeRef.current = next.hold.id;
      sync();
      if (done) return;
      reveal(next.el);
      setMessage(`${index + 1} of ${found.length}: ${next.hold.reason}`);
      focusableWithin(next.el)[0]?.focus({ preventScroll: true });
      onNextRef.current?.(next.hold);
    };

    dismissRef.current = () => {
      done = true;
      setMessage('');
      onCloseRef.current();
    };
    scheduleRef.current = schedule;

    const onFocusIn = (event: FocusEvent) => {
      if (done || !(event.target instanceof Node)) return;
      const target = event.target;
      const found = resolve();
      const index = found.findIndex((entry) => entry.el.contains(target));
      if (index < 0 || found[index]!.hold.id === activeRef.current) return;
      activeRef.current = found[index]!.hold.id;
      sync();
      setMessage(`${index + 1} of ${found.length}: ${found[index]!.hold.reason}`);
    };

    // Capture phase, so the host sheet's own Esc never sees the key.
    const onKey = (event: KeyboardEvent) => {
      if (done || topActiveModalDialog() !== layer) return;
      // Focus in a body-level popover (ClientPicker) belongs to that popover.
      const focused = document.activeElement;
      if (focused && focused !== document.body && !host.contains(focused)) return;
      if (event.key === 'Escape') {
        if (event.defaultPrevented || topDismissiblePopover()) return;
        event.preventDefault();
        event.stopPropagation();
        dismissRef.current?.();
        return;
      }
      trapTabWithin(event, host);
    };

    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocusIn);
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    const mutations = new MutationObserver((records) => {
      if (records.some((record) => !root.contains(record.target))) schedule();
    });
    mutations.observe(host, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
    });
    sync();

    return () => {
      done = true;
      window.cancelAnimationFrame(request);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      mutations.disconnect();
      resizer.disconnect();
      marked.forEach((el) => el.removeAttribute('inert'));
      if (staticHost) host.style.position = priorPosition;
      advanceRef.current = null;
      dismissRef.current = null;
      scheduleRef.current = null;
      setGeo(null);
    };
  }, [open, frameEl]);

  if (!frameEl) return null;

  const activeHold = open ? (holds.find((hold) => hold.id === activeId) ?? holds[0]) : undefined;
  const total = geo?.ids.length ?? holds.length;
  const activeIndex = geo && activeId ? Math.max(0, geo.ids.indexOf(activeId)) : 0;
  const activeWindow = geo?.windows.find((win) => win.id === activeId);
  const motion = reduced ? undefined : GEOMETRY_MOTION;

  return createPortal(
    <div ref={rootRef} data-hold-spotlight-root="" className="hold-spotlight-root">
      <p role="status" aria-live="polite" className="sr-only">
        {message}
      </p>
      {open && (
        <div
          ref={layerRef}
          data-modal-layer=""
          data-hold-spotlight=""
          className="hold-spotlight"
          style={
            geo
              ? ({
                  width: geo.width,
                  height: geo.height,
                  '--hold-spotlight-inset': `${geo.inset}px`,
                } as CSSProperties)
              : undefined
          }
        >
          <svg className="hold-spotlight__scrim" aria-hidden="true" focusable="false">
            <defs>
              <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                {geo?.windows.map((win) => (
                  <rect
                    key={win.id}
                    x={win.x}
                    y={win.y}
                    width={win.w}
                    height={win.h}
                    rx={2}
                    fill="black"
                    style={motion}
                  />
                ))}
              </mask>
            </defs>
            <rect
              className="hold-spotlight__fill"
              x="0"
              y="0"
              width="100%"
              height="100%"
              mask={`url(#${maskId})`}
            />
            {geo?.windows.map((win) => (
              <rect
                key={win.id}
                data-hold-spotlight-window={win.id}
                data-active={win.id === activeId ? '' : undefined}
                className="hold-spotlight__ring"
                x={win.x}
                y={win.y}
                width={win.w}
                height={win.h}
                rx={2}
                style={motion}
              />
            ))}
          </svg>
          {activeWindow && activeHold && (
            <span
              aria-hidden="true"
              className="hold-spotlight__label"
              style={{
                left: activeWindow.x,
                top:
                  activeWindow.y >= LABEL_ROOM
                    ? activeWindow.y - LABEL_ROOM
                    : activeWindow.y + activeWindow.h + 4,
              }}
            >
              {activeIndex + 1} of {total} · {activeHold.label}
            </span>
          )}
          <div
            ref={barRef}
            role="group"
            aria-label="What needs attention"
            data-hold-spotlight-bar=""
            className="hold-spotlight__bar"
          >
            {activeHold && <p className="hold-spotlight__reason">{activeHold.reason}</p>}
            {activeHold?.fix}
            <div className="hold-spotlight__acts">
              {total > 1 && (
                <DocumentAction
                  actionKey="spotlight-next"
                  surfaceKey="spotlight"
                  regionKey="hold-spotlight"
                  variant="secondary"
                  onClick={() => advanceRef.current?.()}
                >
                  Next
                </DocumentAction>
              )}
              <DocumentAction
                actionKey="spotlight-close"
                surfaceKey="spotlight"
                regionKey="hold-spotlight"
                variant="tertiary"
                onClick={() => dismissRef.current?.()}
              >
                Close
              </DocumentAction>
            </div>
          </div>
        </div>
      )}
    </div>,
    frameEl,
  );
}
