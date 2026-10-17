import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const supabaseClient = {
  auth: { getUser: vi.fn(), getSession: vi.fn() },
  rpc,
};

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

const invalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

// Import AFTER mocks.
import { itemLabelRefusal, useSetFfeItemLabel } from '../use-item-labels';

interface MutationConfig<V> {
  mutationFn: (vars: V) => Promise<unknown>;
  onSuccess?: (result: unknown, vars: V) => void;
}

async function runMutation<V>(config: unknown, vars: V) {
  const { mutationFn, onSuccess } = config as MutationConfig<V>;
  const result = await mutationFn(vars);
  onSuccess?.(result, vars);
  return result;
}

beforeEach(() => {
  rpc.mockReset();
  invalidateQueries.mockReset();
});

describe('itemLabelRefusal', () => {
  it('passes the server sentence through, naming the label the other item holds', () => {
    expect(itemLabelRefusal('Another item in this job already uses LR-02.')).toBe(
      'Another item in this job already uses LR-02.',
    );
    expect(itemLabelRefusal('Another item in this job already uses Sofa A.', 'sofa a')).toBe(
      'Another item in this job already uses Sofa A.',
    );
  });

  it('names the typed label for a raw unique-index violation', () => {
    const raw = 'duplicate key value violates unique constraint "project_ffe_items_label_unique"';
    expect(itemLabelRefusal(raw, ' LR-03 ')).toBe('Another item in this job already uses LR-03.');
    expect(itemLabelRefusal(raw)).toBe('Another item in this job already uses that label.');
  });

  it('returns null for any other error', () => {
    expect(itemLabelRefusal('project not found or access denied', 'LR-01')).toBeNull();
    expect(
      itemLabelRefusal('duplicate key value violates unique constraint "project_ffe_items_pkey"', 'LR-01'),
    ).toBeNull();
    expect(itemLabelRefusal(null)).toBeNull();
    expect(itemLabelRefusal(undefined, 'LR-01')).toBeNull();
  });
});

describe('useSetFfeItemLabel', () => {
  it('writes through set_project_ffe_item_label and refreshes the job', async () => {
    rpc.mockResolvedValue({ data: { id: 'i1', doc_code: 'LR-04' }, error: null });
    const row = await runMutation(useSetFfeItemLabel(), { projectId: 'p1', itemId: 'i1', label: 'LR-04' });

    expect(rpc).toHaveBeenCalledWith('set_project_ffe_item_label', { p_item_id: 'i1', p_label: 'LR-04' });
    expect(row).toEqual({ id: 'i1', doc_code: 'LR-04' });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['project-ffe-items', 'p1'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['project-ffe-readiness'] });
  });

  it('sends a null label as blank, which asks for the next automatic label', async () => {
    rpc.mockResolvedValue({ data: { id: 'i1', doc_code: 'LR-05' }, error: null });
    await runMutation(useSetFfeItemLabel(), { projectId: 'p1', itemId: 'i1', label: null });
    expect(rpc).toHaveBeenCalledWith('set_project_ffe_item_label', { p_item_id: 'i1', p_label: '' });
  });

  it('throws the server error untouched and refreshes nothing', async () => {
    const error = { code: '23505', message: 'Another item in this job already uses LR-02.', hint: 'item_label_taken' };
    rpc.mockResolvedValue({ data: null, error });
    await expect(
      runMutation(useSetFfeItemLabel(), { projectId: 'p1', itemId: 'i1', label: 'lr-02' }),
    ).rejects.toBe(error);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});
