import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Doorstep, type DoorstepProps } from '../doorstep';

function step(overrides: Partial<DoorstepProps> = {}): DoorstepProps {
  return {
    sentence: 'One door in this house is closed until you sign it.',
    previously: 'Previously — fourteen selections agreed, 19 June.',
    changedCount: 2,
    showSince: true,
    sinceActive: false,
    onToggleSince: jest.fn(),
    ...overrides,
  };
}

describe('Doorstep — where she stands', () => {
  it('speaks the standing sentence and the line of history behind it', () => {
    render(<Doorstep {...step()} />);

    expect(screen.getByTestId('doorstep-sentence')).toHaveTextContent(
      'One door in this house is closed until you sign it.',
    );
    expect(screen.getByTestId('doorstep-previously')).toHaveTextContent(
      'Previously — fourteen selections agreed, 19 June.',
    );
  });

  it('carries the anchor and the threshold unit, and never opts into dimming', () => {
    render(<Doorstep {...step()} />);

    const root = screen.getByTestId('doorstep');
    expect(root).toHaveAttribute('id', 'doorstep');
    expect(root).toHaveAttribute('data-threshold-unit', 'doorstep');
    expect(root).not.toHaveAttribute('data-dimmable');
  });

  it('leaves the key sentence to the key', () => {
    render(<Doorstep {...step()} />);

    expect(screen.queryByText(/stands? open on this drawing/i)).not.toBeInTheDocument();
  });

  it('holds an empty measure of the same height when it cannot yet speak', () => {
    render(<Doorstep {...step({ sentence: null })} />);

    expect(screen.queryByTestId('doorstep-sentence')).not.toBeInTheDocument();
    expect(screen.getByTestId('doorstep-sentence-pending')).toBeInTheDocument();
  });

  it('holds no history line when there is none', () => {
    render(<Doorstep {...step({ previously: null })} />);

    expect(screen.queryByTestId('doorstep-previously')).not.toBeInTheDocument();
  });

  it('offers the since toggle only when there was a previous read', () => {
    const { unmount } = render(<Doorstep {...step({ showSince: false })} />);
    expect(
      screen.queryByRole('button', { name: /what changed since yesterday/i }),
    ).not.toBeInTheDocument();
    unmount();

    render(<Doorstep {...step()} />);
    expect(
      screen.getByRole('button', { name: /what changed since yesterday/i }),
    ).toBeInTheDocument();
  });

  it('says what the toggle will do, and reports the reading she is in', () => {
    const { unmount } = render(<Doorstep {...step({ sinceActive: false })} />);
    expect(
      screen.getByRole('button', { name: /what changed since yesterday/i }),
    ).toHaveAttribute('aria-pressed', 'false');
    unmount();

    render(<Doorstep {...step({ sinceActive: true })} />);
    const back = screen.getByRole('button', { name: /show the whole house/i });
    expect(back).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.queryByRole('button', { name: /what changed since yesterday/i }),
    ).not.toBeInTheDocument();
  });

  it('hands the toggle back to the caller', async () => {
    const onToggleSince = jest.fn();
    render(<Doorstep {...step({ onToggleSince })} />);

    await userEvent.click(screen.getByRole('button', { name: /what changed since yesterday/i }));

    expect(onToggleSince).toHaveBeenCalledTimes(1);
  });

  it('says how much moved in words, singular and plural', () => {
    const { unmount } = render(<Doorstep {...step({ changedCount: 2 })} />);
    expect(screen.getByTestId('doorstep-changed')).toHaveTextContent('Two things moved since.');
    unmount();

    render(<Doorstep {...step({ changedCount: 1 })} />);
    expect(screen.getByTestId('doorstep-changed')).toHaveTextContent('One thing moved since.');
  });

  it('says nothing when nothing moved, and never reports a negative', () => {
    const { unmount } = render(<Doorstep {...step({ changedCount: 0 })} />);
    expect(screen.queryByTestId('doorstep-changed')).not.toBeInTheDocument();
    unmount();

    render(<Doorstep {...step({ changedCount: Number.NaN })} />);
    expect(screen.queryByTestId('doorstep-changed')).not.toBeInTheDocument();
  });

  it('gives the ledger and the letterbox their place', () => {
    render(
      <Doorstep {...step()}>
        <div data-testid="ledger-slot" />
      </Doorstep>,
    );

    expect(screen.getByTestId('ledger-slot')).toBeInTheDocument();
  });
});
