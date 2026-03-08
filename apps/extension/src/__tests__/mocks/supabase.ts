/**
 * Chainable mock factory for the Supabase client.
 *
 * Usage:
 *   const { supabase, lastInsert } = createMockSupabase();
 *   vi.mock('~/src/lib/supabase', () => ({ supabase }));
 */
import { vi } from 'vitest';

export function createMockSupabase() {
  /** Stores the last payload passed to .insert() */
  const lastInsert: { table: string; payload: unknown }[] = [];

  function chainable(table: string) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};

    chain.insert = vi.fn((payload: unknown) => {
      lastInsert.push({ table, payload });
      return chain;
    });
    chain.update = vi.fn(() => chain);
    chain.delete = vi.fn(() => chain);
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.ilike = vi.fn(() => chain);
    chain.or = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.single = vi.fn(() =>
      Promise.resolve({ data: { id: 'mock-uuid' }, error: null })
    );

    return chain;
  }

  const supabase = {
    from: vi.fn((table: string) => chainable(table)),
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({ data: { session: null }, error: null })
      ),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signOut: vi.fn(),
    },
  };

  return { supabase, lastInsert };
}
