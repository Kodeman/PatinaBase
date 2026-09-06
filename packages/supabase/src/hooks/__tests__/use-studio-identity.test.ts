import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

const supabaseClient = { rpc };

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
}));

// Import AFTER mocks.
import { useStudioIdentity } from '../use-studio-identity';

type QueryConfig = {
  queryKey: unknown[];
  enabled: boolean;
  queryFn: () => Promise<unknown>;
};

function config(params: Parameters<typeof useStudioIdentity>[0]): QueryConfig {
  return useStudioIdentity(params) as unknown as QueryConfig;
}

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({
    data: [
      {
        studio_id: 'studio-b',
        name: 'Middle West Studio',
        logo_url: null,
        website: null,
        source: 'studio',
      },
    ],
    error: null,
  });
});

/* A studio invoice carries its own studio_id and has no project to resolve
   through. 00571 gave the resolver p_studio_id precedence for exactly that
   case: without it a designer who belongs to two studios brands the letter
   with _primary_studio_for's guess. */
describe('useStudioIdentity — the studio the row names itself', () => {
  it('asks the resolver by studio, alongside the designer fallback leg', async () => {
    await config({ studioId: 'studio-b', designerId: 'designer-nora' }).queryFn();

    expect(rpc).toHaveBeenCalledWith('resolve_studio_identity', {
      p_studio_id: 'studio-b',
      p_designer_id: 'designer-nora',
    });
  });

  it('names no studio when the caller has none to name', async () => {
    await config({ projectId: 'proj-vale' }).queryFn();

    expect(rpc).toHaveBeenCalledWith('resolve_studio_identity', {
      p_project_id: 'proj-vale',
    });
  });

  it('runs on a studio id alone and keys on every id the answer depends on', () => {
    const only = config({ studioId: 'studio-b' });
    expect(only.enabled).toBe(true);
    expect(only.queryKey).toEqual([
      'studio-identity',
      { studioId: 'studio-b', projectId: null, designerId: null },
    ]);

    const withFallback = config({ studioId: 'studio-b', designerId: 'designer-nora' });
    expect(withFallback.queryKey).not.toEqual(only.queryKey);
  });

  it('stays idle when no id is named at all', () => {
    expect(config({}).enabled).toBe(false);
  });
});
