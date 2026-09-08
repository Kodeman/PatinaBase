import { render, screen } from '@testing-library/react';

import { Doorplate, type DoorplateProps } from '../doorplate';

function vale(overrides: Partial<DoorplateProps> = {}): DoorplateProps {
  return {
    studioName: 'Quist Interiors',
    location: 'Des Moines',
    projectName: 'The Vale Residence',
    phaseLabel: 'Procurement',
    monthLabel: 'August 2026',
    preparedFor: 'Harper Vale',
    ...overrides,
  };
}

describe('Doorplate — the letterhead, minus the corner links', () => {
  it('names the studio, the place, and who the page is for', () => {
    render(<Doorplate {...vale()} />);

    expect(screen.getByTestId('doorplate-line')).toHaveTextContent(
      'Quist Interiors · Des Moines',
    );
    expect(screen.getByTestId('doorplate-line')).toHaveTextContent('prepared for Harper Vale');
  });

  it('sets the project as the page heading', () => {
    render(<Doorplate {...vale()} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'The Vale Residence' }),
    ).toBeInTheDocument();
  });

  it('rules one vitals line: where, what phase, what month', () => {
    render(<Doorplate {...vale()} />);

    expect(screen.getByTestId('doorplate-sub')).toHaveTextContent(
      'Des Moines · Procurement · August 2026',
    );
  });

  it('renders zero links — the doorplate is a plate, not a nav', () => {
    const { container } = render(<Doorplate {...vale()} />);

    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('carries the anchor, and is deliberately not a threshold unit', () => {
    render(<Doorplate {...vale()} />);

    const root = screen.getByTestId('doorplate');
    expect(root).toHaveAttribute('id', 'doorplate');
    expect(root).not.toHaveAttribute('data-threshold-unit');
    expect(root).not.toHaveAttribute('data-dimmable');
  });

  it('reads whitespace as absence', () => {
    render(<Doorplate {...vale({ studioName: '   ', preparedFor: '  ' })} />);

    expect(screen.getByTestId('doorplate-line')).toHaveTextContent('Des Moines');
    expect(screen.getByTestId('doorplate-line')).not.toHaveTextContent('prepared for');
  });

  it('goes silent rather than printing half an attribution', () => {
    render(<Doorplate {...vale({ preparedFor: null, studioName: null, location: null })} />);

    expect(screen.queryByTestId('doorplate-line')).not.toBeInTheDocument();
    expect(screen.getByTestId('doorplate-sub')).toHaveTextContent('Procurement · August 2026');
  });

  // BE-23 / PP-1: with the client's display name unset, the addressee slot
  // must print nothing — never a fallback like "PREPARED FOR CLIENT USER".
  it('never invents an addressee — the right slot is silent with no display name', () => {
    render(<Doorplate {...vale({ preparedFor: undefined })} />);

    expect(screen.getByTestId('doorplate-line')).not.toHaveTextContent('prepared for');
    expect(screen.getByTestId('doorplate-line')).not.toHaveTextContent('CLIENT USER');
    expect(screen.queryByText(/prepared for client user/i)).not.toBeInTheDocument();
  });

  // PP-1: no PATINA wordmark on the Threshold. The doorplate's mark is a
  // decorative StrataMark (three drawn lines), never the word "Patina" —
  // this pins that absence so it can never quietly return.
  it('carries no PATINA wordmark', () => {
    render(<Doorplate {...vale()} />);

    expect(screen.queryByText(/patina/i)).not.toBeInTheDocument();
  });
});
