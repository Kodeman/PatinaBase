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

describe('Doorstep — the since block carries #changed', () => {
  it('names the block the landmark ledger points at', () => {
    render(<Doorstep {...step()} />);

    const block = screen.getByTestId('doorstep-changed-block');
    expect(block).toHaveAttribute('id', 'changed');
    // A new id beside the old ones — the section is still #doorstep.
    expect(screen.getByTestId('doorstep')).toHaveAttribute('id', 'doorstep');
  });

  it('renders no block, and so no #changed, when there is nothing to put in it', () => {
    const { container } = render(
      <Doorstep
        {...step({ showSince: false, changedCount: 0, readingMark: null })}
      />,
    );

    expect(screen.queryByTestId('doorstep-changed-block')).not.toBeInTheDocument();
    expect(container.querySelector('#changed')).toBeNull();
  });

  it('draws the block for a reading mark alone', () => {
    render(
      <Doorstep
        {...step({
          showSince: false,
          changedCount: 0,
          readingMark: 'Read here on the fourth of August.',
        })}
      />,
    );

    expect(screen.getByTestId('doorstep-changed-block')).toHaveAttribute('id', 'changed');
  });
});

describe('Doorstep — a sentence that names a thing links to it', () => {
  it('links finished work to the wall it stands on', () => {
    render(
      <Doorstep
        {...step({ sentence: 'Finished work waits for your acceptance.' })}
      />,
    );

    const object = screen.getByTestId('doorstep-sentence-object');
    expect(object).toHaveAttribute('href', '#wall');
    expect(object).toHaveTextContent('Finished work');
    expect(screen.getByTestId('doorstep-sentence')).toHaveTextContent(
      'Finished work waits for your acceptance.',
    );
  });

  it('links the papers to the door that holds them', () => {
    render(
      <Doorstep
        {...step({ sentence: 'Two papers wait for your name. Installation comes next.' })}
      />,
    );

    const object = screen.getByTestId('doorstep-sentence-object');
    expect(object).toHaveAttribute('href', '#door');
    expect(object).toHaveTextContent('Two papers');
  });

  it('links an open balance to the letterbox', () => {
    render(
      <Doorstep
        {...step({ sentence: 'It is the fifth of August. A balance of $9,125.00 stands open.' })}
      />,
    );

    const object = screen.getByTestId('doorstep-sentence-object');
    expect(object).toHaveAttribute('href', '#letterbox');
    expect(object).toHaveTextContent('A balance of $9,125.00');
  });

  it('takes the object the sentence names first, and only that one', () => {
    render(
      <Doorstep
        {...step({
          sentence:
            'One paper waits for your name, and a balance of $9,125.00 stands open.',
        })}
      />,
    );

    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByTestId('doorstep-sentence-object')).toHaveAttribute('href', '#door');
  });

  it('links nothing when the sentence names nothing on the page', () => {
    render(<Doorstep {...step({ sentence: 'Nothing waits on you today.' })} />);

    expect(screen.queryByTestId('doorstep-sentence-object')).not.toBeInTheDocument();
    expect(screen.getByTestId('doorstep-sentence')).toHaveTextContent(
      'Nothing waits on you today.',
    );
  });
});
