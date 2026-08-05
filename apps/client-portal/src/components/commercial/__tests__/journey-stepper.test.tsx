import { render, screen } from '@testing-library/react';
import type { FFEStageKey } from '@patina/types';
import {
  GOODS_JOURNEY_STAGES,
  JourneyStepper,
  journeyStageIndexForStatus,
} from '../journey-stepper';

describe('journeyStageIndexForStatus', () => {
  it('collapses the three pre-agreement FF&E stages onto the same Agreed stop', () => {
    expect(journeyStageIndexForStatus('specified')).toBe(0);
    expect(journeyStageIndexForStatus('quoted')).toBe(0);
    expect(journeyStageIndexForStatus('approved')).toBe(0);
  });

  it('maps each post-agreement stage to its own stop, in order', () => {
    const expected: Array<[FFEStageKey, number]> = [
      ['ordered', 1],
      ['production', 2],
      ['shipped', 3],
      ['delivered', 4],
      ['installed', 5],
    ];
    for (const [status, index] of expected) {
      expect(journeyStageIndexForStatus(status)).toBe(index);
    }
  });
});

describe('JourneyStepper', () => {
  it('renders every stage label from the canonical goods journey', () => {
    render(<JourneyStepper status="ordered" />);
    for (const stage of GOODS_JOURNEY_STAGES) {
      expect(screen.getByText(stage)).toBeInTheDocument();
    }
  });

  it('marks the stage matching the current status as the current step', () => {
    render(<JourneyStepper status="shipped" />);
    expect(screen.getByText('Shipped')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Agreed')).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Installed')).not.toHaveAttribute('aria-current');
  });

  it('marks specified/quoted/approved all as the Agreed step', () => {
    render(<JourneyStepper status="specified" />);
    expect(screen.getByText('Agreed')).toHaveAttribute('aria-current', 'step');
  });
});
