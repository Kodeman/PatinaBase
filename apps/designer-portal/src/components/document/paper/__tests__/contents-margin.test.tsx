import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContentsMargin, type ContentsEntry } from '../contents-margin';
import { PaperChapter } from '../paper-chapter';
import { useDocumentRunningIndex } from '@/hooks/use-document-running-index';
import type { DocumentIndexKey } from '@/lib/document/document-index';

const ENTRIES: readonly ContentsEntry[] = [
  { key: 'brief', number: '01', label: 'Brief & agreement', subLabel: 'Full service + building team' },
  { key: 'design', number: '02', label: 'Design development' },
  { key: 'ffe', number: '06', label: 'FF&E selections', subLabel: 'Price the console LR-36' },
  { key: 'record', number: '10', label: 'The record' },
];

function renderMargin(
  props: Partial<React.ComponentProps<typeof ContentsMargin>> = {},
) {
  const onSelect = jest.fn();
  const utils = render(
    <ContentsMargin
      entries={ENTRIES}
      mountedKeys={['ffe', 'brief', 'record']}
      activeKey="brief"
      onSelect={onSelect}
      {...props}
    />,
  );
  return { ...utils, onSelect };
}

describe('ContentsMargin', () => {
  it('is a complementary column holding a named contents navigation', () => {
    renderMargin();
    const aside = screen.getByRole('complementary');
    const nav = within(aside).getByRole('navigation', { name: 'Job contents' });
    expect(within(nav).getByRole('list')).toBeInTheDocument();
  });

  it('lists only mounted chapters, in paper order', () => {
    renderMargin();
    const nav = screen.getByRole('navigation', { name: 'Job contents' });
    const rows = within(nav).getAllByRole('button');
    expect(rows.map((row) => row.getAttribute('data-contents-entry'))).toEqual([
      'brief',
      'ffe',
      'record',
    ]);
    expect(screen.queryByText('Design development')).toBeNull();
  });

  it('marks only the active chapter with aria-current and follows it', () => {
    const { rerender, onSelect } = renderMargin();
    const current = () =>
      screen
        .getAllByRole('button')
        .filter((row) => row.hasAttribute('aria-current'));
    expect(current()).toHaveLength(1);
    expect(current()[0]).toHaveAttribute('aria-current', 'location');
    expect(current()[0]).toHaveAccessibleName(
      'Brief & agreement Full service + building team',
    );

    rerender(
      <ContentsMargin
        entries={ENTRIES}
        mountedKeys={['ffe', 'brief', 'record']}
        activeKey="ffe"
        onSelect={onSelect}
      />,
    );
    expect(current()).toHaveLength(1);
    expect(current()[0]).toHaveAttribute('data-contents-entry', 'ffe');

    rerender(
      <ContentsMargin
        entries={ENTRIES}
        mountedKeys={['ffe', 'brief', 'record']}
        activeKey={null}
        onSelect={onSelect}
      />,
    );
    expect(current()).toHaveLength(0);
  });

  it('prints exact next-act sub-labels and keeps folios out of the name', () => {
    renderMargin();
    const ffe = screen.getByRole('button', { name: /FF&E selections/ });
    expect(ffe).toHaveTextContent('Price the console LR-36');
    expect(within(ffe).getByText('06')).toHaveAttribute('aria-hidden', 'true');
    expect(ffe).toHaveAccessibleName('FF&E selections Price the console LR-36');
  });

  it('is reachable and operable from the keyboard', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderMargin();
    await user.tab();
    expect(screen.getByRole('button', { name: /Brief & agreement/ })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /FF&E selections/ })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith('ffe');
    await user.tab();
    expect(screen.getByRole('button', { name: 'The record' })).toHaveFocus();
    await user.keyboard(' ');
    expect(onSelect).toHaveBeenLastCalledWith('record');
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('is laid out only from 1180px and renders nothing with no mounted chapter', () => {
    const { container, rerender, onSelect } = renderMargin();
    expect(screen.getByRole('complementary')).toHaveClass(
      'hidden',
      'min-[1180px]:block',
      'sticky',
    );
    rerender(
      <ContentsMargin
        entries={ENTRIES}
        mountedKeys={[]}
        activeKey={null}
        onSelect={onSelect}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('carries no region roots, so the running index never observes it', () => {
    const { container } = renderMargin();
    expect(container.querySelector('[data-index-region]')).toBeNull();
  });
});

function Paper({ chapters }: { chapters: readonly DocumentIndexKey[] }) {
  const keys: readonly DocumentIndexKey[] = ['approvals', 'schedule', 'ffe'];
  const { activeKey, mountedKeys } = useDocumentRunningIndex(keys, 'project-1');
  return (
    <>
      <div data-document-paper="">
        {chapters.map((key, i) => (
          <PaperChapter key={key} id={key} number={`0${i + 1}`} title={key} />
        ))}
      </div>
      <ContentsMargin
        entries={keys.map((key) => ({ key, label: `Go to ${key}` }))}
        mountedKeys={mountedKeys}
        activeKey={activeKey}
        onSelect={() => {}}
      />
    </>
  );
}

describe('ContentsMargin with useDocumentRunningIndex', () => {
  it('lists the chapters whose roots the running index found on the paper', async () => {
    const entries = () =>
      screen.getAllByRole('button').map((b) => b.getAttribute('data-contents-entry'));
    const { rerender } = render(<Paper chapters={['approvals', 'ffe']} />);
    expect(entries()).toEqual(['approvals', 'ffe']);
    // jsdom lays nothing out, so the page reads as scrolled to its foot and
    // the running index hands the line to the last mounted chapter.
    expect(screen.getByRole('button', { name: 'Go to ffe' })).toHaveAttribute(
      'aria-current',
      'location',
    );

    rerender(<Paper chapters={['approvals', 'schedule', 'ffe']} />);
    await screen.findByRole('button', { name: 'Go to schedule' });
    expect(entries()).toEqual(['approvals', 'schedule', 'ffe']);
  });
});
