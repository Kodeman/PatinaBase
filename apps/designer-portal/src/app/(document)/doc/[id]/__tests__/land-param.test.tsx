import { renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { useLandParam } from '@/lib/document/paper/use-land-param';

const LINE = '0a9b8c7d-aaaa-4bbb-8ccc-ddddeeeeffff';

beforeEach(() => window.history.replaceState({ kept: true }, '', '/doc/job'));
afterEach(() => jest.restoreAllMocks());

describe('one-shot land parameter', () => {
  it('fires once after commit, clears only land and preserves native state and hash', () => {
    window.history.replaceState({ kept: true }, '', `/doc/job?land=line:${LINE}&sheet=call#note`);
    const land = jest.fn();
    const { rerender } = renderHook(({ ready }) => useLandParam(ready, land), {
      initialProps: { ready: false }, wrapper: StrictMode,
    });
    expect(land).not.toHaveBeenCalled();
    expect(window.location.search).toContain('land=');
    rerender({ ready: true });
    expect(land).toHaveBeenCalledTimes(1);
    expect(land).toHaveBeenCalledWith({ kind: 'ffe', ffeItemId: LINE });
    expect(window.location.search).toBe('?sheet=call');
    expect(window.location.hash).toBe('#note');
    expect(window.history.state).toEqual({ kept: true });
    rerender({ ready: false });
    rerender({ ready: true });
    expect(land).toHaveBeenCalledTimes(1);
  });

  it('ignores an absent land parameter, including the legacy alias', () => {
    window.history.replaceState({}, '', `/doc/job?ffeItemId=${LINE}`);
    const replace = jest.spyOn(window.history, 'replaceState');
    const land = jest.fn();
    renderHook(() => useLandParam(true, land));
    expect(land).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    ['region:money', { kind: 'region', region: 'money' }],
    ['section:install', { kind: 'section', sectionKey: 'install' }],
  ])('passes %s through the existing landing vocabulary', (value, expected) => {
    window.history.replaceState({}, '', `/doc/job?land=${value}`);
    const land = jest.fn();
    renderHook(() => useLandParam(true, land));
    expect(land).toHaveBeenCalledWith(expected);
    expect(window.location.search).toBe('');
  });

  it('spends but does not perform an invalid instruction', () => {
    window.history.replaceState({}, '', '/doc/job?land=line:not-a-uuid');
    const land = jest.fn();
    renderHook(() => useLandParam(true, land));
    expect(land).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
  });

  it('leaves an unfolded sheet landing to its reader-intent owner', () => {
    window.history.replaceState({}, '', `/doc/job?land=line:${LINE}&unfold=pieces&lens=spec&line=${LINE}`);
    const land = jest.fn();
    renderHook(() => useLandParam(true, land));
    expect(land).not.toHaveBeenCalled();
    expect(new URLSearchParams(window.location.search).get('line')).toBe(LINE);
    expect(window.location.search).not.toContain('land=');
  });
});
