import { prepareProjectReviewMedia } from '../project-review-media';

const invoke = jest.fn();
jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({ functions: { invoke } }),
}));

const envelope = {
  assetId: 'asset-1',
  path: 'project-1/prepared/display/hash.webp',
  checksumSha256: 'a'.repeat(64),
  derivativeKind: 'display',
  reused: false,
};

beforeEach(() => invoke.mockReset());

it('uses the exact authenticated prepare action and returns its asset identity', async () => {
  invoke.mockResolvedValue({ data: envelope, error: null });
  await expect(prepareProjectReviewMedia({
    projectId: 'project-1',
    sourcePath: 'project-1/boards/board-1/cover.png',
  })).resolves.toEqual(envelope);
  expect(invoke).toHaveBeenCalledWith('project-review-media', {
    body: {
      action: 'prepare',
      projectId: 'project-1',
      sourceBucket: 'project-ffe-working',
      sourcePath: 'project-1/boards/board-1/cover.png',
      derivativeKind: 'display',
    },
  });
});

it('fails closed when the service does not return the prepared derivative envelope', async () => {
  invoke.mockResolvedValue({ data: { projectId: 'project-1' }, error: null });
  await expect(prepareProjectReviewMedia({
    projectId: 'project-1',
    sourcePath: 'project-1/boards/board-1/image.webp',
  })).rejects.toThrow(/invalid asset envelope/);
});
