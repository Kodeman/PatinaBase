/**
 * WP-01.5 (SQ-1885 F4) — a region jump keeps following its landed root while
 * bodies above it finish loading, until the reader acts. Controls on the paper
 * consume their own keys (a month grid's arrows, the unfold instrument's
 * Escape) and stop propagation, so the reader's input must be heard in the
 * capture phase or the follower keeps pulling the page back under them.
 */
import { scrollToRegion } from '@/hooks/use-document-running-index';

type Observer = { callback: () => void; connected: boolean; disconnect: jest.Mock };
let observers: Observer[] = [];
let rootTop = 400;

beforeEach(() => {
  observers = [];
  rootTop = 400;
  document.body.innerHTML = `
    <main data-document-paper>
      <section data-index-region="ffe" id="ffe">
        <h2 id="ffe-chapter-heading" tabindex="-1">FF&amp;E</h2>
        <div id="consumer" tabindex="0"></div>
      </section>
    </main>`;
  const root = document.getElementById('ffe')!;
  root.getBoundingClientRect = () => ({ top: rootTop }) as DOMRect;
  HTMLElement.prototype.scrollIntoView = jest.fn();
  window.matchMedia = jest.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  }) as typeof window.requestAnimationFrame;
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    private entry: Observer;
    constructor(callback: () => void) {
      this.entry = { callback, connected: false, disconnect: jest.fn() };
      this.entry.disconnect.mockImplementation(() => {
        this.entry.connected = false;
      });
      observers.push(this.entry);
    }
    observe() {
      this.entry.connected = true;
    }
    disconnect() {
      this.entry.disconnect();
    }
  };
});

/** A body above the target finishes loading: the root moves, the observer fires. */
function bodyAboveGrows() {
  rootTop += 300;
  for (const observer of observers) if (observer.connected) observer.callback();
}

describe('holdLanding', () => {
  it('follows the landed root while bodies above it load', () => {
    scrollToRegion('ffe', 'project-1');
    const scroll = HTMLElement.prototype.scrollIntoView as jest.Mock;
    expect(scroll).toHaveBeenCalledTimes(1);

    bodyAboveGrows();
    expect(scroll).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['an arrow a month grid consumes', 'ArrowDown'],
    ['the Escape an instrument consumes', 'Escape'],
  ])('lets go when the reader presses %s, though the control stops it', (_name, key) => {
    scrollToRegion('ffe', 'project-1');
    const scroll = HTMLElement.prototype.scrollIntoView as jest.Mock;
    expect(scroll).toHaveBeenCalledTimes(1);

    const consumer = document.getElementById('consumer')!;
    consumer.addEventListener('keydown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    consumer.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

    expect(observers[0].disconnect).toHaveBeenCalled();
    bodyAboveGrows();
    expect(scroll).toHaveBeenCalledTimes(1);
  });
});
