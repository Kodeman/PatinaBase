import { fireEvent, render, screen } from '@testing-library/react';
import { NeedsSetupChip } from './needs-setup-chip';

describe('NeedsSetupChip', () => {
  it('renders nothing when there is nothing to set up', () => {
    const { container } = render(<NeedsSetupChip count={0} entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('states the count and unfolds the remedy for the one live need', () => {
    const onActivate = jest.fn();
    render(
      <NeedsSetupChip
        count={1}
        entries={[
          { text: 'Name the phases for this project', remedyLabel: 'Open the schedule', onActivate },
        ]}
      />,
    );

    const chip = screen.getByRole('button', { name: 'Needs setup · 1' });
    expect(chip).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('button', { name: 'Open the schedule' }),
    ).not.toBeInTheDocument();

    fireEvent.click(chip);

    expect(chip).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Name the phases for this project')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Open the schedule' }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});
