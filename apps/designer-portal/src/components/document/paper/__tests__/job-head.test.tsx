import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JobHead } from '../job-head';
import { readPaperOrigin, rememberPaperOrigin } from '@/lib/document/paper/paper-origin';
const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ back: mockBack, push: mockPush }) }));

beforeEach(() => { window.sessionStorage.clear(); jest.clearAllMocks(); });
afterEach(() => { delete (window as unknown as { navigation?: unknown }).navigation; });


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

  it('sticks with the round-8 head height as a minimum, not a fixed height', () => {
    render(
      <JobHead returnTo={{ href: '/desk', label: 'Studio' }} jobName="Lake Mendota House" />,
    );
    const banner = screen.getByRole('banner');
    expect(banner).toHaveClass('sticky', 'top-0', 'min-h-[var(--r8-head)]');
    expect(banner).not.toHaveClass('h-[var(--r8-head)]');
  });

  it('wraps long identity and context text, including unbroken strings', () => {
    const jobName = `Lake Mendota House — ${'LongJobName'.repeat(20)}`;
    const context = `Full service + building team — ${'LongContext'.repeat(20)}`;
    render(
      <JobHead returnTo={{ href: '/desk', label: 'Studio' }} jobName={jobName} context={context} />,
    );
    for (const text of [jobName, context]) {
      const node = screen.getByText(text);
      for (const className of ['truncate', 'whitespace-nowrap', 'text-ellipsis']) {
        expect(node).not.toHaveClass(className);
      }
      expect(node).toHaveClass('min-w-0', '[overflow-wrap:anywhere]');
      expect(node).toHaveTextContent(text);
    }
  });
});

describe('Studio return history', () => {
  function history(previousKey = 'desk-entry', previousUrl = 'http://localhost/desk') {
    Object.defineProperty(window, 'navigation', { configurable: true, value: {
      currentEntry: { key: 'desk-entry', index: 2 },
      entries: () => [{ key: previousKey, index: 2, url: previousUrl }],
    } });
    rememberPaperOrigin('job', { path: '/desk', anchorId: 'held-control' });
    (window as unknown as { navigation: { currentEntry: unknown } }).navigation.currentEntry = { key: 'job-entry', index: 3 };
  }
  it('uses Back only for the exact remembered predecessor desk entry', async () => {
    history();
    render(<JobHead returnTo={{ href: '/desk', label: 'Studio' }} origin={readPaperOrigin('job')} jobName="Job" />);
    await userEvent.click(screen.getByRole('link', { name: 'Studio' }));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });
  it.each(['unrelated-entry', 'unfold-entry'])('pushes Studio when the predecessor is %s', async (key) => {
    history(key);
    render(<JobHead returnTo={{ href: '/desk', label: 'Studio' }} origin={readPaperOrigin('job')} jobName="Job" />);
    await userEvent.click(screen.getByRole('link', { name: 'Studio' }));
    expect(mockPush).toHaveBeenCalledWith('/desk');
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('pushes Studio for a deep link without remembered history', async () => {
    render(<JobHead returnTo={{ href: '/desk', label: 'Studio' }} origin={readPaperOrigin('job')} jobName="Job" />);
    await userEvent.click(screen.getByRole('link', { name: 'Studio' }));
    expect(mockPush).toHaveBeenCalledWith('/desk');
    expect(mockBack).not.toHaveBeenCalled();
  });
});
