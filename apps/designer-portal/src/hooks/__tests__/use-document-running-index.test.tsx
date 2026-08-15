import { act, fireEvent, render, screen } from '@testing-library/react';
import { useDocumentRunningIndex } from '../use-document-running-index';
import {
  DOCUMENT_INDEX_KEYS,
  UNFOLD_REGION_EVENT,
  type DocumentIndexKey,
} from '@/lib/document/document-index';

function Probe() {
  const { activeKey, jump } = useDocumentRunningIndex(
    DOCUMENT_INDEX_KEYS,
    'proj-1',
  );
  return (
    <div>
      <span data-testid="active">{activeKey ?? 'none'}</span>
      <button type="button" onClick={() => jump('money')}>
        jump
      </button>
    </div>
  );
}

describe('useDocumentRunningIndex', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // jsdom has no scroller; the jump's rAF work must still be allowed to run.
    Element.prototype.scrollIntoView = jest.fn();
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  function mountRegions() {
    const host = document.createElement('div');
    for (const key of DOCUMENT_INDEX_KEYS) {
      const section = document.createElement('section');
      section.setAttribute('data-index-region', key);
      host.appendChild(section);
    }
    document.body.appendChild(host);
    return host;
  }

  it('asks a region to unfold before it jumps — the index never lands on a seam', () => {
    mountRegions();
    const seen: DocumentIndexKey[] = [];
    const listener = (e: Event) => {
      const region = (e as CustomEvent<{ region?: DocumentIndexKey }>).detail
        ?.region;
      if (region) seen.push(region);
    };
    window.addEventListener(UNFOLD_REGION_EVENT, listener);

    render(<Probe />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'jump' }));
    });

    expect(seen).toEqual(['money']);
    window.removeEventListener(UNFOLD_REGION_EVENT, listener);
  });

  it('commits the reading line to the jump target rather than walking there', () => {
    mountRegions();
    render(<Probe />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'jump' }));
    });
    expect(screen.getByTestId('active')).toHaveTextContent('money');

    // The lock lapses with the scroll; the last region then owns the foot of
    // the paper, which is where a jump to it leaves the reader.
    act(() => {
      jest.advanceTimersByTime(1000);
      fireEvent.scroll(window);
      jest.advanceTimersByTime(50);
    });
    expect(screen.getByTestId('active')).toHaveTextContent('money');
  });
});
