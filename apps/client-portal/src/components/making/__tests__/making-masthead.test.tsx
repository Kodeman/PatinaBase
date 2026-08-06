import { render, screen, within } from '@testing-library/react';

import { MakingMasthead, type MakingMastheadProps } from '../making-masthead';
import type { StandingSentenceInput } from '../standing-sentence';

/** The Vale residence in August — the deck's own project, as props. */
function vale(overrides: Partial<MakingMastheadProps> = {}): MakingMastheadProps {
  return {
    projectName: 'The Vale Residence',
    location: 'Des Moines',
    phaseLabel: 'Procurement',
    monthLabel: 'August 2026',
    standing: standing(),
    ...overrides,
  };
}

function standing(overrides: Partial<StandingSentenceInput> = {}): StandingSentenceInput {
  return {
    todayLabel: 'the fifth of August',
    signatureCount: 2,
    acceptanceCount: 0,
    inProduction: ['walnut credenza'],
    shipped: [],
    delivered: [],
    openBalanceCents: 912_500,
    nextMilestone: null,
    ...overrides,
  };
}

describe('MakingMasthead — the letterhead', () => {
  it('names the surface and the project', () => {
    render(<MakingMasthead {...vale()} />);

    expect(screen.getByTestId('making-masthead-eyebrow')).toHaveTextContent('The Making');
    expect(
      screen.getByRole('heading', { level: 1, name: 'The Vale Residence' }),
    ).toBeInTheDocument();
  });

  it('rules one vitals line: where, what phase, what month', () => {
    render(<MakingMasthead {...vale()} />);

    const vitals = screen.getByTestId('making-masthead-vitals');
    expect(vitals).toHaveTextContent('Des Moines · Procurement · August 2026');
  });

  it('gives the phase full ink and leaves the rest quiet', () => {
    render(<MakingMasthead {...vale()} />);

    const vitals = screen.getByTestId('making-masthead-vitals');
    expect(within(vitals).getByText('Procurement')).toHaveClass(
      'text-[var(--text-primary)]',
    );
    expect(within(vitals).getByText('Des Moines')).not.toHaveClass(
      'text-[var(--text-primary)]',
    );
  });

  it('degrades to whatever the project knows about itself', () => {
    render(
      <MakingMasthead
        {...vale({ location: null, phaseLabel: undefined, monthLabel: '   ' })}
      />,
    );

    expect(screen.queryByTestId('making-masthead-vitals')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'The Vale Residence' }),
    ).toBeInTheDocument();
  });

  it('names who the pane was prepared for, and by whom', () => {
    render(
      <MakingMasthead
        {...vale({ preparedFor: 'Harper Vale', studioName: 'Quist Interiors' })}
      />,
    );

    expect(screen.getByTestId('making-masthead-attribution')).toHaveTextContent(
      'Prepared for Harper Vale by Quist Interiors.',
    );
  });

  it('runs the addressee alone when the studio is not known', () => {
    render(<MakingMasthead {...vale({ preparedFor: 'Harper Vale' })} />);

    expect(screen.getByTestId('making-masthead-attribution')).toHaveTextContent(
      'Prepared for Harper Vale.',
    );
  });

  it('omits the attribution entirely rather than half of it', () => {
    render(<MakingMasthead {...vale({ preparedFor: '  ', studioName: 'Quist Interiors' })} />);

    expect(screen.queryByTestId('making-masthead-attribution')).not.toBeInTheDocument();
  });

  it('keeps a vitals line for the one fact it has', () => {
    render(<MakingMasthead {...vale({ location: null, monthLabel: null })} />);

    expect(screen.getByTestId('making-masthead-vitals')).toHaveTextContent('Procurement');
    expect(screen.getByTestId('making-masthead-vitals')).not.toHaveTextContent('·');
  });
});

describe('MakingMasthead — the corner links', () => {
  it('runs the three rooms that keep their own routes', () => {
    render(<MakingMasthead {...vale()} />);

    const nav = screen.getByTestId('making-masthead-links');

    expect(within(nav).getByRole('link', { name: 'The plan' })).toHaveAttribute(
      'href',
      '/budget',
    );
    expect(within(nav).getByRole('link', { name: 'Correspondence' })).toHaveAttribute(
      'href',
      '/messages',
    );
    expect(within(nav).getByRole('link', { name: 'The papers' })).toHaveAttribute(
      'href',
      '/documents',
    );
  });

  it('scores them as tertiary ink — a whisper, never a plate', () => {
    render(<MakingMasthead {...vale()} />);

    const plan = screen.getByRole('link', { name: 'The plan' });

    expect(plan).toHaveClass('da-act', 'da-tertiary');
    expect(plan).toHaveAttribute('data-action-region', 'masthead');
    // A tertiary act never floods: the ink pool is suppressed, the 44px
    // control witness is not.
    expect(plan.querySelector('.da-pool')).toBeNull();
    expect(plan.querySelector('[data-action-hit]')).not.toBeNull();
  });
});

describe('MakingMasthead — the standing sentence', () => {
  it('speaks the state in one sentence and the counts beneath it', () => {
    render(<MakingMasthead {...vale()} />);

    expect(screen.getByTestId('making-standing-sentence')).toHaveTextContent(
      'It is the fifth of August. Your walnut credenza is in production, ' +
        'two papers wait for your name, and a balance of $9,125 stands open.',
    );
    expect(screen.getByTestId('making-standing-subline')).toHaveTextContent(
      '2 unanswered · balance of $9,125 open',
    );
  });

  it('holds the sentence back until the surface can say something true', () => {
    render(<MakingMasthead {...vale({ standing: null })} />);

    expect(screen.queryByTestId('making-standing-sentence')).not.toBeInTheDocument();
    expect(screen.queryByTestId('making-standing-subline')).not.toBeInTheDocument();
    expect(screen.getByTestId('making-standing-pending')).toBeInTheDocument();
    // The live region is mounted the whole time, so the sentence is announced
    // when it lands rather than appearing in silence.
    expect(screen.getByTestId('making-standing')).toHaveAttribute('aria-live', 'polite');
  });

  it('still reads for a project where nothing is moving', () => {
    render(
      <MakingMasthead
        {...vale({
          standing: standing({
            signatureCount: 0,
            inProduction: [],
            openBalanceCents: 0,
          }),
        })}
      />,
    );

    expect(screen.getByTestId('making-standing-sentence')).toHaveTextContent(
      'It is the fifth of August. Nothing waits on you today.',
    );
    // and nothing beneath it: the sentence has already said so, and repeating
    // the negation in mono reads as a stutter
    expect(screen.queryByTestId('making-standing-subline')).not.toBeInTheDocument();
  });

  it('rewrites itself when the house moves', () => {
    const { rerender } = render(<MakingMasthead {...vale({ standing: null })} />);

    expect(screen.queryByTestId('making-standing-sentence')).not.toBeInTheDocument();

    rerender(
      <MakingMasthead
        {...vale({ standing: standing({ signatureCount: 1, inProduction: [] }) })}
      />,
    );

    expect(screen.getByTestId('making-standing-sentence')).toHaveTextContent(
      'One paper waits for your name',
    );
    expect(screen.queryByTestId('making-standing-pending')).not.toBeInTheDocument();
  });
});
