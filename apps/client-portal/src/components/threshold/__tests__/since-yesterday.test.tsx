import { render, screen } from '@testing-library/react';

import { SinceYesterday } from '../since-yesterday';

function house() {
  return (
    <>
      <section data-testid="ledger" data-threshold-unit="ledger" />
      <section data-testid="letterbox" data-threshold-unit="letterbox" />
      <section data-testid="door" data-threshold-unit="door" data-never-dim />
    </>
  );
}

describe('SinceYesterday — the whole house, quieted but the part that moved', () => {
  it('leaves every unit at full ink while it is not asked', () => {
    render(
      <SinceYesterday active={false} changed={new Set(['letterbox'])}>
        {house()}
      </SinceYesterday>,
    );

    expect(screen.getByTestId('ledger')).not.toHaveAttribute('data-dimmed');
    expect(screen.getByTestId('letterbox')).not.toHaveAttribute('data-dimmed');
  });

  it('dims only the units that did not move', () => {
    render(
      <SinceYesterday active changed={new Set(['letterbox'])}>
        {house()}
      </SinceYesterday>,
    );

    expect(screen.getByTestId('ledger')).toHaveAttribute('data-dimmed', 'true');
    expect(screen.getByTestId('letterbox')).not.toHaveAttribute('data-dimmed');
  });

  it('never dims a unit that has asked not to be', () => {
    render(
      <SinceYesterday active changed={new Set()}>
        {house()}
      </SinceYesterday>,
    );

    expect(screen.getByTestId('door')).not.toHaveAttribute('data-dimmed');
    expect(screen.getByTestId('ledger')).toHaveAttribute('data-dimmed', 'true');
  });

  it('ticks the units that moved, and only those', () => {
    render(
      <SinceYesterday active changed={new Set(['letterbox'])}>
        {house()}
      </SinceYesterday>,
    );

    expect(screen.getByTestId('letterbox')).toHaveAttribute('data-changed', 'true');
    expect(screen.getByTestId('ledger')).not.toHaveAttribute('data-changed');
  });

  it('gives the ink back when the reading is dismissed', () => {
    const { rerender } = render(
      <SinceYesterday active changed={new Set(['letterbox'])}>
        {house()}
      </SinceYesterday>,
    );
    expect(screen.getByTestId('ledger')).toHaveAttribute('data-dimmed', 'true');

    rerender(
      <SinceYesterday active={false} changed={new Set(['letterbox'])}>
        {house()}
      </SinceYesterday>,
    );
    expect(screen.getByTestId('ledger')).not.toHaveAttribute('data-dimmed');
    expect(screen.getByTestId('letterbox')).not.toHaveAttribute('data-changed');
  });
});
