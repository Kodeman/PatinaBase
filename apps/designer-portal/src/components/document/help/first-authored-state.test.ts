import {
  hasBeenAuthored,
  markFirstAuthored,
  setFirstAuthoredStateBackend,
} from './first-authored-state';

const STORAGE_KEY = 'patina:first-authored';

beforeEach(() => {
  window.localStorage.clear();
  setFirstAuthoredStateBackend(null);
});

afterEach(() => {
  window.localStorage.clear();
  setFirstAuthoredStateBackend(null);
});

describe('first-authored-state — localStorage fallback', () => {
  it('is unauthored with no backend and empty localStorage', () => {
    expect(hasBeenAuthored()).toBe(false);
  });

  it('markFirstAuthored writes the once-only marker and hasBeenAuthored flips true', () => {
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    markFirstAuthored();
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(hasBeenAuthored()).toBe(true);
  });
});

describe('first-authored-state — cross-device Supabase backend', () => {
  it('reads and writes through the installed backend once hydrated, never touching localStorage', () => {
    let authored = false;
    const backend = {
      hasAuthored: () => authored,
      markAuthored: jest.fn(() => {
        authored = true;
      }),
    };
    setFirstAuthoredStateBackend(backend, true);

    expect(hasBeenAuthored()).toBe(false);
    markFirstAuthored();
    expect(backend.markAuthored).toHaveBeenCalledTimes(1);
    expect(hasBeenAuthored()).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('falls back to localStorage before the installed backend has hydrated', () => {
    const backend = {
      hasAuthored: jest.fn(() => true),
      markAuthored: jest.fn(),
    };
    // Installed but NOT hydrated — hasBeenAuthored must not consult it.
    setFirstAuthoredStateBackend(backend, false);

    expect(hasBeenAuthored()).toBe(false);
    expect(backend.hasAuthored).not.toHaveBeenCalled();
  });

  it('falls back to localStorage once the backend is cleared (sign-out)', () => {
    const backend = { hasAuthored: () => true, markAuthored: jest.fn() };
    setFirstAuthoredStateBackend(backend, true);
    setFirstAuthoredStateBackend(null);

    // No backend installed and localStorage is empty → unauthored.
    expect(hasBeenAuthored()).toBe(false);
  });
});
