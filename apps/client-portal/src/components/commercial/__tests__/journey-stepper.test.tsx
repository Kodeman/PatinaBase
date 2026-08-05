import { render, screen } from '@testing-library/react';
import type { FFEStageKey, TradeScopeProgressState } from '@patina/types';
import {
  GOODS_JOURNEY_STAGES,
  JourneyStepper,
  journeyStageIndexForStatus,
  TRADE_JOURNEY_STAGES,
  TradeJourneyStepper,
  tradeJourneyStageIndexForState,
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

describe('tradeJourneyStageIndexForState', () => {
  // Four stops (Agreed / Engaged / In progress / Complete), matching the
  // deck's slide-19 vocabulary — 'accepted' is the client's own act at the
  // Complete endpoint, not a fifth stop of its own.
  it('maps every progress_state to its own stop, with accepted landing on Complete', () => {
    const expected: Array<[TradeScopeProgressState, number]> = [
      ['none', 0],
      ['engaged', 1],
      ['in_progress', 2],
      ['substantially_complete', 3],
      ['accepted', 3],
    ];
    for (const [state, index] of expected) {
      expect(tradeJourneyStageIndexForState(state)).toBe(index);
    }
  });
});

describe('TradeJourneyStepper', () => {
  it('renders every stage label from the canonical four-stop trade journey', () => {
    render(<TradeJourneyStepper state="in_progress" />);
    expect(TRADE_JOURNEY_STAGES).toEqual(['Agreed', 'Engaged', 'In progress', 'Complete']);
    for (const stage of TRADE_JOURNEY_STAGES) {
      expect(screen.getByText(stage)).toBeInTheDocument();
    }
  });

  it('marks substantially_complete as the Complete step', () => {
    render(<TradeJourneyStepper state="substantially_complete" />);
    expect(screen.getByText('Complete')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Agreed')).not.toHaveAttribute('aria-current');
  });

  // accepted is the endpoint OF Complete, not a fifth stop — the stepper
  // still reads "Complete" as current, never an "Accepted" label of its own.
  it('also marks accepted as the Complete step, not a separate final stop', () => {
    render(<TradeJourneyStepper state="accepted" />);
    expect(screen.getByText('Complete')).toHaveAttribute('aria-current', 'step');
    expect(screen.queryByText('Accepted')).not.toBeInTheDocument();
  });
});
