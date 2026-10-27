import { act, render, screen } from '@testing-library/react';
import { ResponsiveMarginRail, OPEN_MARGIN_EVENT } from '../margin-rail';
import { ContentsMargin } from './contents-margin';
import { Round8MarginContext } from './margin-layout';

jest.mock('@patina/supabase', () => ({}));
jest.mock('@/hooks/use-margin-items', () => ({}));
jest.mock('@/hooks/use-section-work', () => ({}));
jest.mock('@/hooks/use-margin-notes', () => ({}));
jest.mock('@/hooks/use-project-file-change-notifications', () => ({}));
jest.mock('../margin-bodies', () => ({}));
jest.mock('../coordination/item-composer', () => ({}));

beforeEach(() => {
  window.matchMedia = jest.fn().mockImplementation(query => ({
    matches: query === '(min-width: 1180px)', media: query,
    addEventListener: jest.fn(), removeEventListener: jest.fn(),
  }));
  Element.prototype.scrollIntoView = jest.fn();
});

test('stacked margin follows contents and OPEN_MARGIN_EVENT reaches its existing controls without a drawer', () => {
  render(
    <Round8MarginContext.Provider value={true}>
      <ContentsMargin entries={[{ key: 'cover', label: 'Cover' }]} mountedKeys={['cover']} activeKey="cover" onSelect={jest.fn()}>
        <ResponsiveMarginRail><button type="button">+ Note</button><p>A decision, a message, money</p></ResponsiveMarginRail>
      </ContentsMargin>
    </Round8MarginContext.Provider>,
  );
  const panel = screen.getByRole('complementary', { name: 'In the margin' });
  expect(panel).toHaveAttribute('data-margin-mode', 'stacked');
  expect(panel).not.toHaveAttribute('inert');
  expect(screen.queryByRole('button', { name: 'Margin' })).toBeNull();
  expect(screen.getByRole('navigation').compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  act(() => window.dispatchEvent(new CustomEvent(OPEN_MARGIN_EVENT)));
  expect(screen.getByRole('button', { name: '+ Note' })).toHaveFocus();
  expect(panel.scrollIntoView).toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('legacy default retains the compact margin trigger and inert closed sheet', () => {
  render(<ResponsiveMarginRail><button type="button">+ Note</button></ResponsiveMarginRail>);
  expect(screen.getByRole('button', { name: 'Margin' })).toHaveAttribute('aria-expanded', 'false');
  expect(document.querySelector('[data-margin-panel]')).toHaveAttribute('inert');
  expect(document.querySelector('[data-margin-panel]')).toHaveAttribute('data-margin-mode', 'sheet');
});
