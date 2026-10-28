/**
 * The control the user most recently pressed (SQ-2325).
 *
 * WebKit does not focus a button on a mouse click, so a sheet opened by a click
 * sees BODY as `document.activeElement` and has no invoker to give focus back
 * to. One capture-phase `pointerdown` listener per document remembers the
 * nearest control under the press; a key press clears it, so a keyboard-opened
 * sheet keeps reading `activeElement` exactly as before.
 */

const CONTROL_SELECTOR = 'button, a[href], [role=button], [tabindex]';

const pressedByDocument = new WeakMap<Document, HTMLElement | null>();

function trackPressedControl(doc: Document) {
  if (pressedByDocument.has(doc)) return;
  pressedByDocument.set(doc, null);
  doc.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target;
      pressedByDocument.set(
        doc,
        target instanceof Element
          ? target.closest<HTMLElement>(CONTROL_SELECTOR)
          : null,
      );
    },
    true,
  );
  doc.addEventListener('keydown', () => pressedByDocument.set(doc, null), true);
}

export function lastPressedControl(doc: Document) {
  return pressedByDocument.get(doc) ?? null;
}

if (typeof document !== 'undefined') trackPressedControl(document);
