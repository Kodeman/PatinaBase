import * as React from 'react';
import { render, screen } from '@testing-library/react';

import {
  Button,
  IconButton,
  StatusBadge,
  FilterPill,
  phaseToTone,
  decisionStatusToTone,
} from './index';

describe('control kit', () => {
  describe('Button', () => {
    it('renders a real <button> with text and the clay primary class', () => {
      render(<Button>Save</Button>);
      const btn = screen.getByRole('button', { name: 'Save' });
      expect(btn.tagName).toBe('BUTTON');
      // primary variant (default) uses the clay accent fill
      expect(btn.className).toContain('bg-[var(--accent-primary)]');
    });

    it('passes type through to the native button', () => {
      render(<Button type="submit">Go</Button>);
      expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute(
        'type',
        'submit'
      );
    });

    it('renders an anchor when asChild', () => {
      render(
        <Button asChild>
          <a href="/x">Link</a>
        </Button>
      );
      const link = screen.getByRole('link', { name: 'Link' });
      expect(link.tagName).toBe('A');
      expect(link.className).toContain('bg-[var(--accent-primary)]');
    });

    it('forwards the ref to the child element under asChild', () => {
      // The ref passed to <Button> is forwarded onto the rendered child (the
      // anchor), so callers can reach the underlying element.
      const ref = React.createRef<HTMLAnchorElement>();
      render(
        <Button asChild ref={ref as React.Ref<HTMLButtonElement>}>
          <a href="/x">Link</a>
        </Button>
      );
      expect(ref.current).not.toBeNull();
      expect(ref.current?.tagName).toBe('A');
      expect(ref.current?.getAttribute('href')).toBe('/x');
    });

    it('defaults to type="button" when no type is given', () => {
      render(<Button>Cancel</Button>);
      expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute(
        'type',
        'button'
      );
    });

    it('falls back to a native <button> and warns when asChild has no valid element child', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      render(<Button asChild>plain text</Button>);
      // fell back to a real button containing the text
      expect(screen.getByRole('button', { name: 'plain text' })).toBeInTheDocument();
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('`asChild` requires a single valid React element')
      );
      spy.mockRestore();
    });

    it('disables and marks busy when loading', () => {
      render(<Button loading>Loading</Button>);
      const btn = screen.getByRole('button');
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('aria-busy', 'true');
    });
  });

  describe('IconButton', () => {
    it('applies the label as aria-label', () => {
      render(<IconButton label="Close" />);
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });
  });

  describe('StatusBadge', () => {
    it('renders a tone dot when dot is set', () => {
      const { container } = render(
        <StatusBadge tone="success" dot>
          Decided
        </StatusBadge>
      );
      expect(screen.getByText('Decided')).toBeInTheDocument();
      // leading dot is a 6px span styled with the tone color
      const dot = container.querySelector('span[aria-hidden="true"]');
      expect(dot).not.toBeNull();
      expect((dot as HTMLElement).style.width).toBe('6px');
    });
  });

  describe('FilterPill', () => {
    it('toggles the active class', () => {
      const { rerender } = render(<FilterPill>All</FilterPill>);
      let pill = screen.getByRole('button', { name: 'All' });
      expect(pill).toHaveAttribute('aria-pressed', 'false');
      expect(pill.className).not.toContain('border-[var(--accent-primary)]');

      rerender(<FilterPill active>All</FilterPill>);
      pill = screen.getByRole('button', { name: 'All' });
      expect(pill).toHaveAttribute('aria-pressed', 'true');
      expect(pill.className).toContain('border-[var(--accent-primary)]');
    });

    it('renders the count', () => {
      render(<FilterPill count={7}>Active</FilterPill>);
      expect(screen.getByText('7')).toBeInTheDocument();
    });
  });

  describe('tone helpers', () => {
    it('maps phases to tones', () => {
      expect(phaseToTone('procurement')).toBe('warning');
      expect(phaseToTone('walkthrough')).toBe('success');
      expect(phaseToTone('unknown-phase')).toBe('neutral');
    });

    it('maps decision statuses to tones', () => {
      expect(decisionStatusToTone('decided')).toBe('success');
      expect(decisionStatusToTone('overdue')).toBe('error');
      expect(decisionStatusToTone('pending')).toBe('warning');
    });
  });
});
