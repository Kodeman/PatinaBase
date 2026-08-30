'use client';

/**
 * The document's own state, published once on `[data-document-shell]`.
 *
 * D-B19 — this hook is the SOLE writer of `data-lens-state`. Three inputs, one
 * priority, one attribute:
 *
 *   · `editing` — a focus is inside an editable on the paper. It outranks
 *     everything, because a field being typed into is the one situation where
 *     the paper must not move under the hand; it also freezes the density
 *     commit (`lens.freeze(true)`), so a region opening ahead cannot reflow the
 *     line she is editing.
 *   · `mobile` — below 1180 the document has no rail, so the states the rail
 *     expresses have nothing to express them.
 *   · `reading` / `rest` — the band's pin. `rest` while `#doc-ticket-sentinel`
 *     is still in frame (the band sits in flow at s0), `reading` once it has
 *     left.
 *
 * Every write is imperative, for the same reason the density hook's are: the
 * pin turns on every crossing of the letterhead and a focus lands on every
 * field on the paper, and neither may re-render a document this size. The band
 * keeps `data-lens-open` — its own attribute about itself — and hands the pin
 * up through `onPinChange`; nothing else in the tree reads `pinned` as state.
 *
 * The shell is reached by a callback ref rather than a selector: the page calls
 * this hook above its early returns, so the shell does not exist yet on the
 * first pass, and a ref callback is the one thing that fires exactly when it
 * arrives.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';

/** The state machine's document-level values (technical-design §2). `condensed`
 *  is a REGION state (`data-density`), never one of these. */
export type LensState = 'rest' | 'reading' | 'editing' | 'mobile';

const PAPER_SELECTOR = '[data-document-paper]';
/** D-B19's `editing` is about a field being TYPED INTO — the one situation
 *  where the paper must not move under the hand. W4-C5: the literal wording's
 *  bare `input, … select` matched every checkbox, radio and `<select>` on the
 *  paper (the approvals checklist, the care band's closure ticks, the FF&E line
 *  controls). Focus PERSISTS on a checkbox after a click, so ticking one box
 *  and then reading froze the lens for the rest of the session. Text entry
 *  only: everything an `input` can be except the controls that are a choice or
 *  a press, plus `textarea` and the three `contenteditable` spellings. Written
 *  as exclusions so an `input` with a novel or invalid `type` — which every
 *  engine treats as `text` — is still caught. */
const EDITABLE_SELECTOR = [
  'input:not([type=checkbox]):not([type=radio]):not([type=button])' +
    ':not([type=submit]):not([type=reset]):not([type=image])' +
    ':not([type=file]):not([type=color]):not([type=range])',
  'textarea',
  "[contenteditable='']",
  "[contenteditable='true']",
  "[contenteditable='plaintext-only']",
].join(', ');
const MOBILE_QUERY = '(max-width: 1179px)';

export interface UseLensStateOptions {
  /** D-B19 — the density hook's freeze. Called on every editing transition. */
  freeze?: (frozen: boolean) => void;
}

export interface LensStateApi {
  /** Attach to the `[data-document-shell]` root. */
  shellRef: (node: HTMLElement | null) => void;
  /** Hand to `LensBand`'s `onPinChange` (C-5). */
  onPinChange: (pinned: boolean) => void;
}

function isEditable(node: EventTarget | null): node is HTMLElement {
  if (!node || !(node instanceof Element)) return false;
  return node.matches(EDITABLE_SELECTOR) && Boolean(node.closest(PAPER_SELECTOR));
}

export function useLensState({ freeze }: UseLensStateOptions = {}): LensStateApi {
  const shell = useRef<HTMLElement | null>(null);
  const pinned = useRef(false);
  const editing = useRef(false);
  const mobile = useRef(false);
  const freezeRef = useRef(freeze);
  freezeRef.current = freeze;

  const write = useCallback(() => {
    const next: LensState = editing.current
      ? 'editing'
      : mobile.current
        ? 'mobile'
        : pinned.current
          ? 'reading'
          : 'rest';
    shell.current?.setAttribute('data-lens-state', next);
  }, []);

  const shellRef = useCallback(
    (node: HTMLElement | null) => {
      shell.current = node;
      if (node) write();
    },
    [write],
  );

  const onPinChange = useCallback(
    (next: boolean) => {
      if (pinned.current === next) return;
      pinned.current = next;
      write();
    },
    [write],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const setEditing = (next: boolean) => {
      if (editing.current === next) return;
      editing.current = next;
      freezeRef.current?.(next);
      write();
    };

    // Delegated on `document`: `focusin`/`focusout` bubble, and the paper is
    // remounted whenever the spread changes, so a listener bound to the paper
    // itself would have to be re-bound. Containment is tested per event.
    const onFocusIn = (event: FocusEvent) => setEditing(isEditable(event.target));
    const onFocusOut = (event: FocusEvent) => {
      if (!editing.current) return;
      setEditing(isEditable(event.relatedTarget));
    };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);

    const media = window.matchMedia?.(MOBILE_QUERY) ?? null;
    const onMedia = () => {
      const next = Boolean(media?.matches);
      if (mobile.current === next) return;
      mobile.current = next;
      write();
    };
    mobile.current = Boolean(media?.matches);
    media?.addEventListener?.('change', onMedia);

    write();

    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      media?.removeEventListener?.('change', onMedia);
      if (editing.current) {
        editing.current = false;
        freezeRef.current?.(false);
      }
    };
  }, [write]);

  return useMemo(() => ({ shellRef, onPinChange }), [shellRef, onPinChange]);
}
