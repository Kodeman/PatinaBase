import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  ReleaseCeremonyProvider,
  useReleaseCeremony,
} from '../release-ceremony-context';
import type { InstrumentLike } from '@/lib/document/authorization-derivation';

jest.mock('@/hooks/use-commercial-documents', () => ({
  useVoidAuthorization: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

// VoidAct's own contract — imported (not restated) so this test breaks if
// the event name ever drifts between the two files.
import { START_RELEASE_EVENT } from '../../commercial/void-supersede-act';

function Harness() {
  const ceremony = useReleaseCeremony();
  if (!ceremony) return <p>no ceremony</p>;
  return (
    <div>
      <p data-testid="phase">{ceremony.phase}</p>
      <p data-testid="number">{ceremony.provisionalNumber}</p>
      <p data-testid="selected">
        {ceremony.selectedIds.slice().sort().join(',') || 'none'}
      </p>
      <p data-testid="room-state">{ceremony.roomState(['a', 'b'])}</p>
      <button onClick={() => ceremony.begin()}>begin</button>
      <button onClick={() => ceremony.begin(['a'])}>begin with a</button>
      <button onClick={() => ceremony.toggleLine('a')}>toggle a</button>
      <button onClick={() => ceremony.toggleLine('b')}>toggle b</button>
      <button onClick={() => ceremony.setRoom(['a', 'b'], true)}>room on</button>
      <button onClick={() => ceremony.setRoom(['a', 'b'], false)}>
        room off
      </button>
      <button onClick={ceremony.review}>review</button>
      <button onClick={ceremony.backToSelecting}>back</button>
      <button onClick={ceremony.putBack}>put back</button>
    </div>
  );
}

const renderCeremony = (instruments: InstrumentLike[] = []) =>
  render(
    <ReleaseCeremonyProvider instruments={instruments}>
      <Harness />
    </ReleaseCeremonyProvider>,
  );

const phase = () => screen.getByTestId('phase').textContent;
const selected = () => screen.getByTestId('selected').textContent;
const click = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }));

describe('release ceremony machine', () => {
  it('starts idle with nothing held', () => {
    renderCeremony();
    expect(phase()).toBe('idle');
    expect(selected()).toBe('none');
  });

  it('walks idle → selecting → reviewing → idle', () => {
    renderCeremony();
    click('begin');
    expect(phase()).toBe('selecting');
    click('toggle a');
    click('review');
    expect(phase()).toBe('reviewing');
    click('put back');
    expect(phase()).toBe('idle');
    expect(selected()).toBe('none');
  });

  it('mints the number once, at the start of the ceremony', () => {
    renderCeremony([
      { number: 1, state: 'superseded' },
      { number: 2, state: 'executed' },
    ]);
    expect(screen.getByTestId('number').textContent).toBe('3');
    click('begin');
    expect(screen.getByTestId('number').textContent).toBe('3');
  });

  it('refuses to review an empty release', () => {
    renderCeremony();
    click('begin');
    click('review');
    expect(phase()).toBe('selecting');
  });

  it('ticks and unticks a line', () => {
    renderCeremony();
    click('begin');
    click('toggle a');
    expect(selected()).toBe('a');
    click('toggle a');
    expect(selected()).toBe('none');
  });

  it('takes a whole room at once, and gives it back', () => {
    renderCeremony();
    click('begin');
    click('room on');
    expect(selected()).toBe('a,b');
    expect(screen.getByTestId('room-state').textContent).toBe('all');
    click('toggle a');
    expect(screen.getByTestId('room-state').textContent).toBe('some');
    click('room off');
    expect(selected()).toBe('none');
    expect(screen.getByTestId('room-state').textContent).toBe('none');
  });

  it('can begin with a line already ticked', () => {
    renderCeremony();
    click('begin with a');
    expect(phase()).toBe('selecting');
    expect(selected()).toBe('a');
  });

  it('leaves the sheet with the ticks intact', () => {
    renderCeremony();
    click('begin');
    click('toggle a');
    click('review');
    click('back');
    expect(phase()).toBe('selecting');
    expect(selected()).toBe('a');
  });

  it('Esc puts the ceremony back and forgets the ticks', () => {
    renderCeremony();
    click('begin');
    click('toggle a');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(phase()).toBe('idle');
    expect(selected()).toBe('none');
  });

  it('leaves Escape alone once the review sheet owns it', () => {
    renderCeremony();
    click('begin');
    click('toggle a');
    click('review');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(phase()).toBe('reviewing');
  });

  it('hands the number back for the next attempt', () => {
    renderCeremony([{ number: 4, state: 'executed' }]);
    click('begin');
    expect(screen.getByTestId('number').textContent).toBe('5');
    click('put back');
    click('begin');
    expect(screen.getByTestId('number').textContent).toBe('5');
  });

  it("listens for VoidAct's document:start-release and pre-ticks the freed lines", () => {
    renderCeremony();
    expect(phase()).toBe('idle');

    act(() => {
      window.dispatchEvent(
        new CustomEvent(START_RELEASE_EVENT, {
          detail: { preTickIds: ['a', 'b'] },
        }),
      );
    });

    expect(phase()).toBe('selecting');
    expect(selected()).toBe('a,b');
  });

  it('treats a start-release event with no ids as an empty seed, not a crash', () => {
    renderCeremony();
    act(() => {
      window.dispatchEvent(
        new CustomEvent(START_RELEASE_EVENT, { detail: { preTickIds: [] } }),
      );
    });
    expect(phase()).toBe('selecting');
    expect(selected()).toBe('none');
  });
});
