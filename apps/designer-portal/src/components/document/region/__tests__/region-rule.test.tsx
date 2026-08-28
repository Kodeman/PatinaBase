import { render } from '@testing-library/react';
import { RegionRule } from '../region-rule';

describe('RegionRule', () => {
  it('is presentational and hidden from the accessibility tree', () => {
    const { container } = render(<RegionRule />);
    const rule = container.firstElementChild!;
    expect(rule).toHaveAttribute('aria-hidden', 'true');
    expect(rule).toHaveAttribute('role', 'presentation');
    expect(rule.textContent).toBe('');
  });

  it('ends a region on the 1.5px charcoal rule by default', () => {
    const { container } = render(<RegionRule />);
    const rule = container.firstElementChild!;
    expect(rule).toHaveClass('doc-rule-mid');
    expect(rule).not.toHaveClass('doc-rule-strong');
    expect(rule).toHaveAttribute('data-rule-weight', 'mid');
  });

  it('takes the double rule only where a movement opens', () => {
    const { container } = render(<RegionRule weight="strong" />);
    const rule = container.firstElementChild!;
    expect(rule).toHaveClass('doc-rule-strong');
    expect(rule).not.toHaveClass('doc-rule-mid');
    expect(rule).toHaveAttribute('data-rule-weight', 'strong');
  });

  it('takes a caller class alongside its own', () => {
    const { container } = render(<RegionRule className="mt-6" />);
    expect(container.firstElementChild).toHaveClass('doc-rule-mid', 'mt-6');
  });
});
