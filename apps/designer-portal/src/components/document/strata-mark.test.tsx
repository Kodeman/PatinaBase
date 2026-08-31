/**
 * The Strata Mark's ghost track, per ground (W7-C14, the design lead's W7
 * sign-off).
 *
 * The W7 correctness review read `build/w7-shots/head-mark.png` and found the
 * third line printing a ~10px stub with NO visible remainder: at 3px on the
 * rail stock `rgba(44,41,38,0.12)` does not print, so the one mark Kody asked
 * for read as the brand device at rest rather than as progress. The ruling
 * (b) is one register up for the rail alone — the fills, the movement hues and
 * every other ground unchanged.
 */
import { render } from '@testing-library/react';
import { StrataMark } from './strata-mark';

const lines = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('.strata-line'));

const fills = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('.strata-fill'));

describe('StrataMark — the ghost track, per ground', () => {
  it('prints the rail’s track one register up from light (W7-C14)', () => {
    const { container } = render(
      <StrataMark fill={[1, 1, 0.2]} size="md" ground="rail" label="Progress" />,
    );
    const row = lines(container);
    expect(row).toHaveLength(3);
    for (const line of row) {
      expect(line.style.background).toBe('rgba(44, 41, 38, 0.22)');
    }
  });

  it('leaves light and dark exactly where they were', () => {
    const light = render(<StrataMark fill={[1, 0, 0]} size="md" ground="light" />);
    for (const line of lines(light.container)) {
      expect(line.style.background).toBe('rgba(44, 41, 38, 0.12)');
    }
    const dark = render(<StrataMark fill={[1, 0, 0]} size="md" ground="dark" />);
    for (const line of lines(dark.container)) {
      expect(line.style.background).toBe('rgba(250, 247, 242, 0.12)');
    }
  });

  it('changes the ghost only — the fills and the movement hues are untouched', () => {
    const rail = render(
      <StrataMark fill={[1, 0.5, 0.2]} size="md" ground="rail" label="a" />,
    );
    const light = render(
      <StrataMark fill={[1, 0.5, 0.2]} size="md" ground="light" label="a" />,
    );
    // The claim is that ONLY the ghost moved: every fill — its transform, its
    // class (which carries the reduce-aware transition) and every style
    // declaration jsdom can see — is byte-identical between the two grounds.
    // The movement hues themselves are `var()` values jsdom drops from the
    // style attribute entirely; they are held by the source contract
    // (`lib/document/__tests__/strata-progress-contract.test.ts`).
    const shape = (c: HTMLElement) =>
      fills(c).map((f) => `${f.className}|${f.getAttribute('style')}`);
    expect(shape(rail.container)).toEqual(shape(light.container));
    expect(fills(rail.container).map((f) => f.style.transform)).toEqual([
      'scaleX(1)',
      'scaleX(0.5)',
      'scaleX(0.2)',
    ]);
    // And the ghost did move, on the same render.
    expect(lines(rail.container)[0].style.background).toBe(
      'rgba(44, 41, 38, 0.22)',
    );
    expect(lines(light.container)[0].style.background).toBe(
      'rgba(44, 41, 38, 0.12)',
    );
  });

  it('the meaning-carrying mark announces; a decorative one stays hidden', () => {
    const named = render(
      <StrataMark fill={[0, 0, 0]} size="md" ground="rail" label="Proposal" />,
    );
    expect(named.container.querySelector('[role="img"]')).toHaveAttribute(
      'aria-label',
      'Proposal',
    );
    const bare = render(<StrataMark fill={[0, 0, 0]} size="md" ground="rail" />);
    expect(bare.container.querySelector('.strata-mark')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });
});
