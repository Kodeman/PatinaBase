import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JobHead } from '../job-head';

describe('JobHead', () => {
  it('is the banner, with a return link named by its origin', () => {
    render(
      <JobHead
        returnTo={{ href: '/desk', label: 'Studio' }}
        jobName="Lake Mendota House"
        context="Project file"
      />,
    );
    const banner = screen.getByRole('banner');
    const link = within(banner).getByRole('link', { name: 'Studio' });
    expect(link).toHaveAttribute('href', '/desk');
    expect(link).toHaveTextContent('←Studio');
    expect(within(link).getByText('←')).toHaveAttribute('aria-hidden', 'true');
  });

  it('prints the job name and context without taking a heading level', () => {
    render(
      <JobHead
        returnTo={{ href: '/projects', label: 'Projects' }}
        jobName="Lake Mendota House"
        context="Project file"
      />,
    );
    const banner = screen.getByRole('banner');
    expect(within(banner).queryAllByRole('heading')).toHaveLength(0);
    expect(within(banner).getByText('Lake Mendota House')).toBeInTheDocument();
    const context = within(banner).getByText('Project file');
    expect(context).toHaveClass('hidden', 'min-[1180px]:block');
  });

  it('omits the context line when there is none', () => {
    render(
      <JobHead returnTo={{ href: '/desk', label: 'Studio' }} jobName="Lake Mendota House" />,
    );
    expect(screen.getByRole('banner').querySelectorAll('p')).toHaveLength(1);
  });

  it('puts the return link first in the tab order', async () => {
    const user = userEvent.setup();
    render(
      <JobHead returnTo={{ href: '/desk', label: 'Studio' }} jobName="Lake Mendota House" />,
    );
    await user.tab();
    expect(screen.getByRole('link', { name: 'Studio' })).toHaveFocus();
  });

  it('sticks at the round-8 head height', () => {
    render(
      <JobHead returnTo={{ href: '/desk', label: 'Studio' }} jobName="Lake Mendota House" />,
    );
    expect(screen.getByRole('banner')).toHaveClass('sticky', 'top-0', 'h-[var(--r8-head)]');
  });
});
