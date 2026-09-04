import { render, screen } from '@testing-library/react';

import { SinceYesterday } from '../since-yesterday';

/** The house as the leaves actually mark themselves up. */
function house() {
  return (
    <>
      {/* a unit that opts in */}
      <section data-testid="mat" data-threshold-unit="mat" data-dimmable />
      {/* a unit that opts in and moved */}
      <section data-testid="key" data-threshold-unit="key" data-dimmable />
      {/* a unit that never opts in — the doorstep keeps its ink */}
      <section data-testid="doorstep" data-threshold-unit="doorstep" />
      {/* the letterbox: a unit, never dimmable, belt-and-braces never-dim,
          with the toll living inside it carrying no attributes at all */}
      <section data-testid="letterbox" data-threshold-unit="letterbox" data-never-dim>
        <div data-testid="toll" />
      </section>
      {/* not a unit at all */}
      <header data-testid="doorplate" />
    </>
  );
}

describe('SinceYesterday — opt-in dimming, and the tick beside what moved', () => {
  it('leaves every unit at full ink while it is not asked', () => {
    render(
      <SinceYesterday active={false} changed={new Set(['key'])}>
        {house()}
      </SinceYesterday>,
    );

    for (const id of ['mat', 'key', 'doorstep', 'letterbox', 'doorplate']) {
      expect(screen.getByTestId(id)).not.toHaveAttribute('data-dimmed');
    }
  });

  it('dims only what asked to be dimmable', () => {
    render(
      <SinceYesterday active changed={new Set()}>
        {house()}
      </SinceYesterday>,
    );

    expect(screen.getByTestId('mat')).toHaveAttribute('data-dimmed', 'true');
    expect(screen.getByTestId('key')).toHaveAttribute('data-dimmed', 'true');
  });

  it('never dims a unit that did not opt in, however still it is', () => {
    render(
      <SinceYesterday active changed={new Set()}>
        {house()}
      </SinceYesterday>,
    );

    expect(screen.getByTestId('doorstep')).not.toHaveAttribute('data-dimmed');
    expect(screen.getByTestId('doorplate')).not.toHaveAttribute('data-dimmed');
  });

  it('never dims the letterbox, so the toll inside it keeps its ink', () => {
    render(
      <SinceYesterday active changed={new Set()}>
        {house()}
      </SinceYesterday>,
    );

    expect(screen.getByTestId('letterbox')).not.toHaveAttribute('data-dimmed');
    expect(screen.getByTestId('toll')).not.toHaveAttribute('data-dimmed');
  });

  it('does not dim a dimmable unit that moved', () => {
    render(
      <SinceYesterday active changed={new Set(['key'])}>
        {house()}
      </SinceYesterday>,
    );

    expect(screen.getByTestId('key')).not.toHaveAttribute('data-dimmed');
    expect(screen.getByTestId('mat')).toHaveAttribute('data-dimmed', 'true');
  });

  it('spares a dimmable that is also marked never-dim', () => {
    render(
      <SinceYesterday active changed={new Set()}>
        <section data-testid="gate" data-threshold-unit="door" data-dimmable data-never-dim />
      </SinceYesterday>,
    );

    expect(screen.getByTestId('gate')).not.toHaveAttribute('data-dimmed');
  });

  it('ticks the units that moved, dimmable or not, and only those', () => {
    render(
      <SinceYesterday active changed={new Set(['key', 'doorstep'])}>
        {house()}
      </SinceYesterday>,
    );

    expect(screen.getByTestId('key')).toHaveAttribute('data-changed', 'true');
    expect(screen.getByTestId('doorstep')).toHaveAttribute('data-changed', 'true');
    expect(screen.getByTestId('mat')).not.toHaveAttribute('data-changed');
    expect(screen.getByTestId('doorplate')).not.toHaveAttribute('data-changed');
  });

  it('answers to the unit it sits in when a dimmable is not one itself', () => {
    const rows = (
      <section data-threshold-unit="ledger">
        <div data-testid="row" data-dimmable />
      </section>
    );

    const { rerender } = render(
      <SinceYesterday active changed={new Set()}>
        {rows}
      </SinceYesterday>,
    );
    expect(screen.getByTestId('row')).toHaveAttribute('data-dimmed', 'true');

    rerender(
      <SinceYesterday active changed={new Set(['ledger'])}>
        {rows}
      </SinceYesterday>,
    );
    expect(screen.getByTestId('row')).not.toHaveAttribute('data-dimmed');
  });

  it('gives the ink back when the reading is dismissed', () => {
    const { rerender } = render(
      <SinceYesterday active changed={new Set(['key'])}>
        {house()}
      </SinceYesterday>,
    );
    expect(screen.getByTestId('mat')).toHaveAttribute('data-dimmed', 'true');

    rerender(
      <SinceYesterday active={false} changed={new Set(['key'])}>
        {house()}
      </SinceYesterday>,
    );
    expect(screen.getByTestId('mat')).not.toHaveAttribute('data-dimmed');
    expect(screen.getByTestId('key')).not.toHaveAttribute('data-changed');
  });
});
