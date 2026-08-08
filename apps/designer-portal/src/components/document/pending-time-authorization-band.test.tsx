import { fireEvent, render, screen } from '@testing-library/react';
import { PendingTimeAuthorizationBand } from './pending-time-authorization-band';

describe('PendingTimeAuthorizationBand', () => {
  it('keeps Winky Loft hours visible and routes the designer to billing setup', () => {
    const onSelectProject = jest.fn();

    render(
      <PendingTimeAuthorizationBand
        rows={[
          { project_id: 'winky', duration_minutes: 360 },
          { project_id: 'winky', duration_minutes: 30 },
        ]}
        projects={[{ id: 'winky', name: "Winky's Loft" }]}
        onSelectProject={onSelectProject}
      />,
    );

    expect(screen.getByText(/6h 30m pending billing authority/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot be billed until/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /review Winky's Loft billing setup/i }));
    expect(onSelectProject).toHaveBeenCalledWith('winky');
  });
});
