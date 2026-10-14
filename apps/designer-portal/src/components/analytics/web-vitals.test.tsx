import { act, fireEvent, render } from '@testing-library/react';

let mockPathname = '/desk';
let mockCaptureAnalyticsEvent: jest.Mock;
let WebVitals: React.ComponentType;
let routeTemplate: (path: string) => string;
let webVitalProperties: (metric: { name: string; value: number; rating: string; navigationType: string }, path: string) => Record<string, unknown>;
let frames: FrameRequestCallback[];

jest.mock('next/navigation', () => ({ usePathname: () => mockPathname }));
jest.mock('next/web-vitals', () => ({ useReportWebVitals: jest.fn() }));
jest.mock('@/lib/analytics/posthog', () => ({ captureAnalyticsEvent: (...args: unknown[]) => mockCaptureAnalyticsEvent(...args) }));

beforeAll(() => {
  jest.spyOn(Math, 'random').mockReturnValue(0);
  ({ WebVitals, routeTemplate, webVitalProperties } = require('./web-vitals'));
});

afterAll(() => {
  jest.restoreAllMocks();
});

beforeEach(() => {
  mockPathname = '/desk';
  mockCaptureAnalyticsEvent = jest.fn();
  frames = [];
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  document.documentElement.className = '';
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('web vitals route privacy', () => {
  it.each([
    ['/doc/secret-project', '/doc/[id]'],
    ['/invoices/secret-invoice/print', '/invoices/[invoiceId]/print'],
    ['/board/secret-board', '/board/[boardId]'],
    ['/room/secret-room/file', '/room/[id]/file'],
    ['/drafting/secret-proposal', '/drafting/[proposalId]'],
    ['/help/topic/private-prefix', '/help/topic/[prefix]'],
  ])('maps %s to the route template', (path, expected) => {
    expect(routeTemplate(path)).toBe(expected);
  });

  it('allows only the five approved fields and never includes a URL or identifier', () => {
    const props = webVitalProperties(
      { name: 'LCP', value: 1200, rating: 'good', navigationType: 'navigate' },
      '/doc/secret-project',
    );
    expect(Object.keys(props).sort()).toEqual(['name', 'navigationType', 'rating', 'route', 'value']);
    expect(props.route).toBe('/doc/[id]');
    expect(JSON.stringify(props)).not.toContain('secret-project');
    expect(JSON.stringify(props)).not.toContain('url');
  });
});

describe('portal usable sampling', () => {
  it('fires once per hard or SPA navigation after the destination is usable', () => {
    const anchor = document.createElement('a');
    anchor.href = '/doc/secret-project';
    document.body.append(anchor);
    document.body.insertAdjacentHTML('beforeend', '<main></main>');
    const view = render(<WebVitals />);

    act(() => frames.shift()?.(0));
    expect(mockCaptureAnalyticsEvent.mock.calls.filter(([name]) => name === 'portal_usable')).toEqual([
      ['portal_usable', { route: '/desk', kind: 'hard', ms: expect.any(Number) }],
    ]);

    fireEvent.click(anchor);
    mockPathname = '/doc/secret-project';
    view.rerender(<WebVitals />);
    act(() => frames.shift()?.(16));
    act(() => frames.shift()?.(32));

    expect(mockCaptureAnalyticsEvent.mock.calls.filter(([name]) => name === 'portal_nav_started')).toEqual([
      ['portal_nav_started', { route: '/desk', kind: 'hard' }],
      ['portal_nav_started', { route: '/doc/[id]', kind: 'spa' }],
    ]);
    expect(mockCaptureAnalyticsEvent.mock.calls.filter(([name]) => name === 'portal_usable')).toEqual([
      ['portal_usable', { route: '/desk', kind: 'hard', ms: expect.any(Number) }],
      ['portal_usable', { route: '/doc/[id]', kind: 'spa', ms: expect.any(Number) }],
    ]);
    anchor.remove();
    document.querySelector('main')?.remove();
  });

  it('stops watching a route that never becomes usable after the cap', () => {
    document.body.insertAdjacentHTML('beforeend', '<main aria-busy="true"></main>');
    const now = jest.spyOn(performance, 'now').mockReturnValue(1_000);
    render(<WebVitals />);
    act(() => frames.shift()?.(0));
    expect(frames).toHaveLength(1);
    now.mockReturnValue(31_000);
    act(() => frames.shift()?.(16));
    expect(frames).toHaveLength(0);
    expect(mockCaptureAnalyticsEvent.mock.calls.filter(([name]) => name === 'portal_usable')).toEqual([]);
    document.querySelector('main')?.remove();
  });
});
