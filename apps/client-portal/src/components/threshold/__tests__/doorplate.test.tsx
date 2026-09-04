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

  it('carries the anchor and the threshold unit', () => {
    render(<Doorplate {...vale()} />);

    const root = screen.getByTestId('doorplate');
    expect(root).toHaveAttribute('id', 'doorplate');
    expect(root).toHaveAttribute('data-threshold-unit', 'doorplate');
  });

  it('goes silent rather than printing half an attribution', () => {
    render(<Doorplate {...vale({ preparedFor: null, studioName: null, location: null })} />);

    expect(screen.queryByTestId('doorplate-line')).not.toBeInTheDocument();
    expect(screen.getByTestId('doorplate-sub')).toHaveTextContent('Procurement · August 2026');
  });
});
