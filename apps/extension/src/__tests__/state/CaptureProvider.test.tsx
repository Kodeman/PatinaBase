import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import {
  CaptureProvider,
  useCapture,
  useCaptureDispatch,
} from '../../state/CaptureProvider';

function Probe() {
  const state = useCapture();
  const dispatch = useCaptureDispatch();
  return (
    <div>
      <span data-testid="screen">{state.nav.screen}</span>
      <button onClick={() => dispatch({ type: 'SESSION_RESOLVED', user: null })}>
        signout
      </button>
    </div>
  );
}

afterEach(cleanup);

describe('CaptureProvider', () => {
  it('provides the initial boot state to consumers', () => {
    render(
      <CaptureProvider>
        <Probe />
      </CaptureProvider>
    );
    expect(screen.getByTestId('screen').textContent).toBe('boot');
  });

  it('shares dispatched state across consumers', () => {
    render(
      <CaptureProvider>
        <Probe />
      </CaptureProvider>
    );
    act(() => {
      fireEvent.click(screen.getByText('signout'));
    });
    expect(screen.getByTestId('screen').textContent).toBe('signedOut');
  });
});
