import { render } from '@testing-library/react';
import { RegionRule } from '../region-rule';

describe('RegionRule', () => {
  it('is presentational and hidden from the accessibility tree', () => {
    const { container } = render(<RegionRule />);
    const rule = container.firstElementChild!;
    expect(rule).toHaveAttribute('aria-hidden', 'true');
    expect(rule).toHaveAttribute('role', 'presentation');
    expect(rule).toHaveClass('doc-region-rule');
    expect(rule.textContent).toBe('');
  });

  it('takes a caller class alongside its own', () => {
    const { container } = render(<RegionRule className="mt-6" />);
    expect(container.firstElementChild).toHaveClass('doc-region-rule', 'mt-6');
  });
});
