import { render, screen, within } from '@testing-library/react';
import { PaperChapter } from '../paper-chapter';
import { scrollToRegion } from '@/hooks/use-document-running-index';
import {
  regionAnchorSelector,
  regionHeadingId,
} from '@/lib/document/document-index';

describe('PaperChapter', () => {
  it('is a region named by its real h2 heading', () => {
    render(
      <PaperChapter id="brief" number="01" title="Brief & agreement">
        <p>Body</p>
      </PaperChapter>,
    );
    const region = screen.getByRole('region', { name: 'Brief & agreement' });
    const heading = within(region).getByRole('heading', {
      level: 2,
      name: 'Brief & agreement',
    });
    expect(region).toHaveAttribute('id', 'brief');
    expect(region).toHaveAttribute('aria-labelledby', heading.id);
    expect(heading.id).toBe('brief-chapter-heading');
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(within(region).getByText('Body')).toBeInTheDocument();
  });

  it('prints the folio for the eye only and the kicker as its reading line', () => {
    const { rerender } = render(
      <PaperChapter
        id="design"
        number="02"
        title="Design development"
        kicker="Scans, renderings & drawings"
      />,
    );
    const folio = screen.getByText('02');
    expect(folio).toHaveAttribute('aria-hidden', 'true');
    expect(
      screen.getByRole('region', { name: 'Design development' }),
    ).toHaveTextContent('Scans, renderings & drawings');

    rerender(<PaperChapter id="design" number="02" title="Design development" />);
    expect(screen.queryByText('Scans, renderings & drawings')).toBeNull();
  });

  it('clears the sticky job head when scrolled to', () => {
    render(<PaperChapter id="schedule" number="05" title="Project schedule" />);
    expect(screen.getByRole('region')).toHaveClass(
      'scroll-mt-[calc(var(--r8-head)+24px)]',
    );
  });

  describe('running-index compatibility', () => {
    const originalRaf = window.requestAnimationFrame;
    const originalMatchMedia = window.matchMedia;
    const originalScrollIntoView = Element.prototype.scrollIntoView;

    beforeEach(() => {
      window.requestAnimationFrame = (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      };
      window.matchMedia = jest.fn().mockReturnValue({ matches: false });
      Element.prototype.scrollIntoView = jest.fn();
    });

    afterEach(() => {
      window.requestAnimationFrame = originalRaf;
      window.matchMedia = originalMatchMedia;
      Element.prototype.scrollIntoView = originalScrollIntoView;
    });

    it('is the region root scrollToRegion scrolls to and lands focus on', () => {
      const projectId = 'project-1';
      const { container } = render(
        <div data-document-paper="">
          <PaperChapter
            id="ffe"
            number="06"
            title="FF&E selections"
            headingId={regionHeadingId('ffe', projectId)}
          />
        </div>,
      );
      const root = container.querySelector(regionAnchorSelector('ffe'));
      expect(root).toBe(screen.getByRole('region', { name: 'FF&E selections' }));

      scrollToRegion('ffe', projectId);

      expect(root!.scrollIntoView).toHaveBeenCalledWith({
        block: 'start',
        behavior: 'smooth',
      });
      expect(
        screen.getByRole('heading', { level: 2, name: 'FF&E selections' }),
      ).toHaveFocus();
    });
  });
});
