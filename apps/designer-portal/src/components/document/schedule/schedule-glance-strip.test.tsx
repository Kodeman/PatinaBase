import { render, screen } from '@testing-library/react';
import { ScheduleGlanceStrip } from './schedule-glance-strip';

it('renders the glance month tick in text-grade quiet ink', () => {
  render(
    <ScheduleGlanceStrip
      segments={[]}
      todayXPct={null}
      today="2026-10-29"
      months={[{ key: '2026-10', label: 'OCT', xPct: 25 }]}
    />,
  );
  expect(screen.getByText('OCT')).toHaveClass('text-[var(--color-quiet-ink)]');
});
