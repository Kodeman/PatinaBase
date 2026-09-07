import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — the use-agreement-parts rig. useQuery/useMutation are identity
// functions, so a hook call returns its own config object and the test reads
// the key, runs the queryFn, and invokes the mutationFn and onSuccess directly.
//
// The PostgREST builder is a chain, and the Library reads take two different
// shapes of it: `.select().or().order().order()` for the Templates and
// `.select().eq().order().order()` for the Parts. Both terminate on the second
// `.order()`, which is where the mock resolves.
// ─────────────────────────────────────────────────────────────────────────────

const orderTwo = vi.fn();
const orderOne = vi.fn(() => ({ order: orderTwo }));
const or = vi.fn(() => ({ order: orderOne }));
const single = vi.fn();
const selectAfterUpdate = vi.fn(() => ({ single }));
const eqAfterUpdate = vi.fn(() => ({ select: selectAfterUpdate }));
const update = vi.fn(() => ({ eq: eqAfterUpdate }));
const eqAfterDelete = vi.fn();
const del = vi.fn(() => ({ eq: eqAfterDelete }));
const eqSelect = vi.fn(() => ({ order: orderOne }));
const select = vi.fn(() => ({ or, eq: eqSelect }));
const from = vi.fn(() => ({ select, update, delete: del }));
const rpc = vi.fn();

const supabaseClient = {
  auth: { getUser: vi.fn(), getSession: vi.fn() },
  functions: { invoke: vi.fn() },
  from,
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
import {
  agreementLibraryKeys,
  mapAgreementTemplate,
  mapStudioAgreementPart,
  useAgreementTemplates,
  useAgreementStudioContext,
  useStudioAgreementParts,
  useSaveAgreementPart,
  useSaveAgreementAsTemplate,
  useMaterializeAgreementTemplate,
  useRenameAgreementTemplate,
  useDeleteAgreementTemplate,
  useDeleteStudioAgreementPart,
  useCopyAgreementPartsFromAuthority,
  type AgreementTemplateRow,
  type StudioAgreementPartRow,
} from '../use-agreement-library';

beforeEach(() => {
  vi.clearAllMocks();
  orderOne.mockReturnValue({ order: orderTwo });
  or.mockReturnValue({ order: orderOne });
  eqSelect.mockReturnValue({ order: orderOne });
  select.mockReturnValue({ or, eq: eqSelect });
  selectAfterUpdate.mockReturnValue({ single });
  eqAfterUpdate.mockReturnValue({ select: selectAfterUpdate });
  update.mockReturnValue({ eq: eqAfterUpdate });
  del.mockReturnValue({ eq: eqAfterDelete });
  from.mockReturnValue({ select, update, delete: del });
});

const invalidatedKeys = () => invalidateQueries.mock.calls.map((c) => c[0].queryKey);

const STUDIO = '3f2b1c9e-0000-4000-8000-000000000001';

const templateRow = (over: Partial<AgreementTemplateRow> = {}): AgreementTemplateRow => ({
  id: 'tpl-1',
  template_key: 'studio.aaa',
  kind: 'studio',
  studio_id: STUDIO,
  class: 'design_services',
  title: 'Full-service residential',
  parts: [{ kind: 'clause', title: 'Services', payload: {} }],
  consent_key: null,
  created_by: 'user-1',
  created_at: '2026-09-06T00:00:00Z',
  updated_at: '2026-09-06T00:00:00Z',
  ...over,
});

const partRow = (over: Partial<StudioAgreementPartRow> = {}): StudioAgreementPartRow => ({
  id: 'lib-1',
  studio_id: STUDIO,
  kind: 'clause',
  variant: null,
  part_key: 'studio.bbb',
  title: 'House terms',
  payload: { body: 'Ownership and cancellation.' },
  required_default: false,
  client_visible_default: true,
  created_by: 'user-1',
  created_at: '2026-09-06T00:00:00Z',
  updated_at: '2026-09-06T00:00:00Z',
  ...over,
});

describe('agreementLibraryKeys', () => {
  it('keys each Library read by the thing it is about', () => {
    expect(agreementLibraryKeys.templates(STUDIO)).toEqual(['agreement-templates', STUDIO]);
    expect(agreementLibraryKeys.parts(STUDIO)).toEqual(['studio-agreement-parts', STUDIO]);
    expect(agreementLibraryKeys.studioContext('prop-1')).toEqual([
      'agreement-studio-context',
      'prop-1',
    ]);
  });
});

describe('the row mappers', () => {
  it('carries a Template across, camelCased, with an empty part list for a null', () => {
    expect(mapAgreementTemplate(templateRow())).toEqual({
      id: 'tpl-1',
      templateKey: 'studio.aaa',
      kind: 'studio',
      studioId: STUDIO,
      class: 'design_services',
      title: 'Full-service residential',
      parts: [{ kind: 'clause', title: 'Services', payload: {} }],
      consentKey: null,
      createdBy: 'user-1',
      createdAt: '2026-09-06T00:00:00Z',
      updatedAt: '2026-09-06T00:00:00Z',
    });
    expect(mapAgreementTemplate(templateRow({ parts: null })).parts).toEqual([]);
  });

  it('reads a seeded Template, which belongs to no studio and nobody', () => {
    const mapped = mapAgreementTemplate(
      templateRow({
        kind: 'seeded',
        template_key: 'patina.design_services',
        studio_id: null,
        created_by: null,
      }),
    );
    expect(mapped.kind).toBe('seeded');
    expect(mapped.studioId).toBeNull();
    expect(mapped.createdBy).toBeNull();
  });

  it('carries a Library Part across, with an empty payload for a null', () => {
    expect(mapStudioAgreementPart(partRow())).toEqual({
      id: 'lib-1',
      studioId: STUDIO,
      kind: 'clause',
      variant: null,
      partKey: 'studio.bbb',
      title: 'House terms',
      payload: { body: 'Ownership and cancellation.' },
      requiredDefault: false,
      clientVisibleDefault: true,
      createdBy: 'user-1',
      createdAt: '2026-09-06T00:00:00Z',
      updatedAt: '2026-09-06T00:00:00Z',
    });
    expect(mapStudioAgreementPart(partRow({ payload: null })).payload).toEqual({});
  });
});

describe('useAgreementTemplates', () => {
  it('asks for this studio’s Templates and every seeded one, in one query', async () => {
    orderTwo.mockResolvedValue({
      data: [templateRow(), templateRow({ id: 'tpl-2', kind: 'seeded', studio_id: null })],
      error: null,
    });

    const query = useAgreementTemplates(STUDIO) as any;
    expect(query.queryKey).toEqual(agreementLibraryKeys.templates(STUDIO));

    const result = await query.queryFn();
    expect(from).toHaveBeenCalledWith('agreement_templates');
    expect(or).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);
  });

  /* R37 — `or` is a filter GRAMMAR parsed as text: a comma ends a condition, a
     parenthesis ends the group. The value is quoted so it can never be read as
     any of that. */
  it('quotes the studio id inside the or-filter', async () => {
    orderTwo.mockResolvedValue({ data: [], error: null });
    await (useAgreementTemplates(STUDIO) as any).queryFn();
    expect(or).toHaveBeenCalledWith(`studio_id.is.null,studio_id.eq."${STUDIO}"`);
  });

  it('escapes a quote or a backslash rather than letting it close the value', async () => {
    orderTwo.mockResolvedValue({ data: [], error: null });
    await (useAgreementTemplates('a"b\\c') as any).queryFn();
    expect(or).toHaveBeenCalledWith('studio_id.is.null,studio_id.eq."a\\"b\\\\c"');
  });

  it('asks nothing until it knows which studio', () => {
    expect((useAgreementTemplates(null) as any).enabled).toBe(false);
  });

  it('raises the database’s refusal', async () => {
    orderTwo.mockResolvedValue({ data: null, error: new Error('permission denied') });
    await expect((useAgreementTemplates(STUDIO) as any).queryFn()).rejects.toThrow(
      'permission denied',
    );
  });
});

describe('useAgreementStudioContext', () => {
  /* R32 — the studio the AGREEMENT sits in, answered by the database, never
     read off the actor's own organizations. */
  it('asks the RPC about this agreement and carries both halves of the answer', async () => {
    rpc.mockResolvedValue({ data: { studioId: STUDIO, canManage: true }, error: null });

    const query = useAgreementStudioContext('prop-1') as any;
    expect(query.queryKey).toEqual(agreementLibraryKeys.studioContext('prop-1'));

    await expect(query.queryFn()).resolves.toEqual({ studioId: STUDIO, canManage: true });
    expect(rpc).toHaveBeenCalledWith('agreement_studio_context', { p_proposal_id: 'prop-1' });
  });

  it('reads "no studio you compose in" as no studio, and no permission', async () => {
    rpc.mockResolvedValue({ data: { studioId: null, canManage: false }, error: null });
    await expect((useAgreementStudioContext('prop-1') as any).queryFn()).resolves.toEqual({
      studioId: null,
      canManage: false,
    });
  });

  it('fails closed on an answer that says nothing', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect((useAgreementStudioContext('prop-1') as any).queryFn()).resolves.toEqual({
      studioId: null,
      canManage: false,
    });
  });

  it('never reads a truthy non-boolean as permission', async () => {
    rpc.mockResolvedValue({ data: { studioId: STUDIO, canManage: 'yes' }, error: null });
    await expect(
      (useAgreementStudioContext('prop-1') as any).queryFn(),
    ).resolves.toMatchObject({ canManage: false });
  });

  it('asks nothing until it has an agreement', () => {
    expect((useAgreementStudioContext(null) as any).enabled).toBe(false);
  });
});

describe('useStudioAgreementParts', () => {
  it('reads only this studio’s Parts, kind then title', async () => {
    orderTwo.mockResolvedValue({ data: [partRow()], error: null });

    const query = useStudioAgreementParts(STUDIO) as any;
    expect(query.queryKey).toEqual(agreementLibraryKeys.parts(STUDIO));

    const result = await query.queryFn();
    expect(from).toHaveBeenCalledWith('studio_agreement_parts');
    expect(eqSelect).toHaveBeenCalledWith('studio_id', STUDIO);
    expect(orderOne).toHaveBeenCalledWith('kind', { ascending: true });
    expect(orderTwo).toHaveBeenCalledWith('title', { ascending: true });
    expect(result[0].partKey).toBe('studio.bbb');
  });
});

describe('useSaveAgreementPart', () => {
  it('sends the whole part shape, trimmed, and defaults what the caller left out', async () => {
    rpc.mockResolvedValue({ data: partRow(), error: null });

    const mutation = useSaveAgreementPart() as any;
    await mutation.mutationFn({
      studioId: STUDIO,
      kind: 'clause',
      title: '  House terms  ',
      payload: { body: 'Ownership.' },
    });

    expect(rpc).toHaveBeenCalledWith('save_agreement_part', {
      p_studio_id: STUDIO,
      p_part: {
        partKey: undefined,
        kind: 'clause',
        variant: null,
        title: 'House terms',
        payload: { body: 'Ownership.' },
        requiredDefault: false,
        clientVisibleDefault: true,
      },
    });
  });

  it('invalidates the studio’s Parts after a save', () => {
    const mutation = useSaveAgreementPart() as any;
    mutation.onSuccess(mapStudioAgreementPart(partRow()), { studioId: STUDIO });
    expect(invalidatedKeys()).toEqual([agreementLibraryKeys.parts(STUDIO)]);
  });
});

describe('useSaveAgreementAsTemplate', () => {
  it('trims the name it files the composition under', async () => {
    rpc.mockResolvedValue({ data: templateRow(), error: null });
    const mutation = useSaveAgreementAsTemplate(STUDIO) as any;
    await mutation.mutationFn({ proposalId: 'prop-1', title: '  Full-service residential ' });
    expect(rpc).toHaveBeenCalledWith('save_agreement_as_template', {
      p_proposal_id: 'prop-1',
      p_title: 'Full-service residential',
    });
  });

  /* The room calls this with no studio of its own: R32 says the database
     resolves which studio the agreement sits in, so the ANSWER names the shelf
     to refresh. */
  it('falls back to the studio the database filed it in', () => {
    const mutation = useSaveAgreementAsTemplate() as any;
    mutation.onSuccess(mapAgreementTemplate(templateRow()));
    expect(invalidatedKeys()).toEqual([agreementLibraryKeys.templates(STUDIO)]);
  });
});

describe('useMaterializeAgreementTemplate', () => {
  it('answers with the number of parts that landed, and 0 for a null', async () => {
    rpc.mockResolvedValue({ data: 9, error: null });
    const mutation = useMaterializeAgreementTemplate('prop-1') as any;
    await expect(mutation.mutationFn('patina.design_services')).resolves.toBe(9);
    expect(rpc).toHaveBeenCalledWith('materialize_agreement_template', {
      p_proposal_id: 'prop-1',
      p_template_key: 'patina.design_services',
    });

    rpc.mockResolvedValue({ data: null, error: null });
    await expect(mutation.mutationFn('patina.design_services')).resolves.toBe(0);
  });

  /* One call moves the composition, the money row and the fingerprint
     together, so all four families are refreshed. */
  it('refreshes the parts, the history, the document family and the proposal', () => {
    (useMaterializeAgreementTemplate('prop-1') as any).onSuccess();
    expect(invalidatedKeys()).toEqual([
      ['agreement-parts', 'prop-1'],
      ['agreement-part-events', 'prop-1'],
      ['commercial-documents'],
      ['proposal', 'prop-1'],
    ]);
  });
});

describe('useRenameAgreementTemplate', () => {
  it('writes only the title, trimmed, and refreshes the shelf', async () => {
    single.mockResolvedValue({ data: templateRow({ title: 'Renamed' }), error: null });
    const mutation = useRenameAgreementTemplate(STUDIO) as any;
    const result = await mutation.mutationFn({ id: 'tpl-1', title: '  Renamed ' });

    expect(from).toHaveBeenCalledWith('agreement_templates');
    expect(update).toHaveBeenCalledWith({ title: 'Renamed' });
    expect(eqAfterUpdate).toHaveBeenCalledWith('id', 'tpl-1');
    expect(result.title).toBe('Renamed');

    mutation.onSuccess();
    expect(invalidatedKeys()).toEqual([agreementLibraryKeys.templates(STUDIO)]);
  });

  it('raises an RLS refusal rather than reporting a rename that never happened', async () => {
    single.mockResolvedValue({ data: null, error: new Error('PGRST116') });
    const mutation = useRenameAgreementTemplate(STUDIO) as any;
    await expect(mutation.mutationFn({ id: 'tpl-1', title: 'Renamed' })).rejects.toThrow(
      'PGRST116',
    );
  });
});

describe('useDeleteAgreementTemplate', () => {
  it('removes one Template and refreshes the shelf', async () => {
    eqAfterDelete.mockResolvedValue({ error: null });
    const mutation = useDeleteAgreementTemplate(STUDIO) as any;
    await mutation.mutationFn('tpl-1');
    expect(from).toHaveBeenCalledWith('agreement_templates');
    expect(eqAfterDelete).toHaveBeenCalledWith('id', 'tpl-1');
    mutation.onSuccess();
    expect(invalidatedKeys()).toEqual([agreementLibraryKeys.templates(STUDIO)]);
  });

  it('raises the seeded-row refusal', async () => {
    eqAfterDelete.mockResolvedValue({ error: new Error('Patina agreement templates are immutable') });
    await expect((useDeleteAgreementTemplate(STUDIO) as any).mutationFn('tpl-1')).rejects.toThrow(
      'immutable',
    );
  });
});

describe('useDeleteStudioAgreementPart', () => {
  it('removes one Library Part and refreshes the Parts strip', async () => {
    eqAfterDelete.mockResolvedValue({ error: null });
    const mutation = useDeleteStudioAgreementPart(STUDIO) as any;
    await mutation.mutationFn('lib-1');
    expect(from).toHaveBeenCalledWith('studio_agreement_parts');
    expect(eqAfterDelete).toHaveBeenCalledWith('id', 'lib-1');
    mutation.onSuccess();
    expect(invalidatedKeys()).toEqual([agreementLibraryKeys.parts(STUDIO)]);
  });
});

describe('useCopyAgreementPartsFromAuthority', () => {
  it('sends the designer’s why, trimmed, and reads back what landed', async () => {
    rpc.mockResolvedValue({ data: 4, error: null });
    const mutation = useCopyAgreementPartsFromAuthority('prop-2') as any;
    await expect(mutation.mutationFn('  Added the study to the scope ')).resolves.toBe(4);
    expect(rpc).toHaveBeenCalledWith('copy_agreement_parts_from_authority', {
      p_proposal_id: 'prop-2',
      p_why: 'Added the study to the scope',
    });
  });

  it('sends no why at all when the designer wrote nothing', async () => {
    rpc.mockResolvedValue({ data: 0, error: null });
    const mutation = useCopyAgreementPartsFromAuthority('prop-2') as any;
    await mutation.mutationFn('   ');
    expect(rpc).toHaveBeenCalledWith('copy_agreement_parts_from_authority', {
      p_proposal_id: 'prop-2',
      p_why: null,
    });

    await mutation.mutationFn(undefined);
    expect(rpc).toHaveBeenLastCalledWith('copy_agreement_parts_from_authority', {
      p_proposal_id: 'prop-2',
      p_why: null,
    });
  });

  it('refreshes the parts, the history, the document family and the proposal', () => {
    (useCopyAgreementPartsFromAuthority('prop-2') as any).onSuccess();
    expect(invalidatedKeys()).toEqual([
      ['agreement-parts', 'prop-2'],
      ['agreement-part-events', 'prop-2'],
      ['commercial-documents'],
      ['proposal', 'prop-2'],
    ]);
  });
});
