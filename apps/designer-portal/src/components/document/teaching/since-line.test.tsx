import { fireEvent, render, screen } from '@testing-library/react';
import { SinceLine } from './since-line';

const items = [
  { id: 'r4', headline: 'Accounts exports for your bookkeeper' },
  { id: 'r3', headline: 'Everyone on the job, in one room' },
  { id: 'r2', headline: 'Hours, logged where the work happens' },
  { id: 'r1', headline: 'Invoices say what became of the email' },
];

describe('SinceLine', () => {
  it('starts collapsed: one disclosure button wired to a hidden region', () => {
    render(<SinceLine items={items} changesHref="/help/changes" />);
    const toggle = screen.getByRole('button', { name: 'Since you were last here' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const regionId = toggle.getAttribute('aria-controls');
    expect(regionId).toBeTruthy();
    const region = document.getElementById(regionId!);
    expect(region).not.toBeNull();
    expect(region).not.toBeVisible();
    expect(screen.queryByRole('link', { name: 'What changed' })).toBeNull();
  });

  it('expands to at most three headlines and one link to the changes page, then collapses', () => {
    render(<SinceLine items={items} changesHref="/help/changes" />);
    const toggle = screen.getByRole('button', { name: 'Since you were last here' });

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const region = document.getElementById(toggle.getAttribute('aria-controls')!);
    expect(region).toBeVisible();
    const headlines = screen.getAllByRole('listitem').map((li) => li.textContent?.replace('–', '').trim());
    expect(headlines).toEqual(items.slice(0, 3).map((i) => i.headline));
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent('What changed');
    expect(links[0]).toHaveAttribute('href', '/help/changes');
    // No count and no dates.
    expect(region?.textContent).not.toMatch(/\d/);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(region).not.toBeVisible();
  });

  it('is set type, not a widget: a note, never a dialog', () => {
    render(<SinceLine items={items.slice(0, 1)} changesHref="/help/changes" />);
    expect(screen.getByRole('note')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });
});
