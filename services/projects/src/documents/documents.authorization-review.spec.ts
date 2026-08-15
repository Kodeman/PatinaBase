const { DocumentsService } =
  require('./documents.service.ts') as typeof import('./documents.service');
const { DocumentCategory } =
  require('./dto/create-document.dto.ts') as typeof import('./dto/create-document.dto');

describe('DocumentsService delegated Media authorization', () => {
  const document = {
    id: 'document-a',
    projectId: 'service-project-a',
    title: 'specification.pdf',
    category: DocumentCategory.SPEC,
    mimeType: 'application/pdf',
    version: 1,
    key: 'raw/documents/asset-a/specification.pdf',
    metadata: { assetId: 'asset-a', uploadSessionId: 'session-a' },
  };
  const tx = {
    project: { findUnique: jest.fn() },
    document: {
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  };
  const eventEmitter = { emit: jest.fn() };
  const media = {
    validateFile: jest.fn(),
    getUploadUrl: jest.fn(),
    confirmUpload: jest.fn(),
    getDownloadUrl: jest.fn(),
    deleteAsset: jest.fn(),
  };
  const authorization = {
    withProjectAccess: jest.fn(
      async (_subject: string, _projectId: string, _mode: string, operation: Function) =>
        operation(tx),
    ),
  };
  const service = new DocumentsService(
    {} as any,
    eventEmitter as any,
    media as any,
    authorization as any,
  );
  const delegatedAuthorization = 'Bearer verified-user-jwt';

  beforeEach(() => {
    jest.clearAllMocks();
    authorization.withProjectAccess.mockImplementation(
      async (_subject: string, _projectId: string, _mode: string, operation: Function) =>
        operation(tx),
    );
    media.validateFile.mockReturnValue({ valid: true });
    media.getUploadUrl.mockResolvedValue({
      uploadUrl: 'https://upload.invalid',
      key: document.key,
      assetId: 'asset-a',
      uploadSessionId: 'session-a',
      expiresAt: new Date('2026-08-15T13:00:00.000Z'),
    });
    media.deleteAsset.mockResolvedValue(undefined);
    tx.project.findUnique.mockResolvedValue({
      id: 'service-project-a',
      publicProjectId: 'public-project-a',
    });
    tx.document.findFirst.mockResolvedValue(null);
    tx.document.create.mockResolvedValue(document);
    tx.document.deleteMany.mockResolvedValue({ count: 1 });
    tx.auditLog.create.mockResolvedValue({});
  });

  it('delegates the verified bearer and canonical public project without caller identity fields', async () => {
    await service.initializeUpload(
      'service-project-a',
      {
        title: 'specification.pdf',
        category: DocumentCategory.SPEC,
        mimeType: 'application/pdf',
        sizeBytes: 128,
        metadata: { assetId: 'caller-asset', actor: 'caller-actor' },
        key: 'caller/key.pdf',
      } as any,
      'verified-subject',
      delegatedAuthorization,
    );

    expect(media.getUploadUrl).toHaveBeenCalledWith(
      {
        publicProjectId: 'public-project-a',
        category: DocumentCategory.SPEC,
        filename: 'specification.pdf',
        mimeType: 'application/pdf',
        fileSize: 128,
      },
      delegatedAuthorization,
      expect.any(String),
    );
    expect(tx.document.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: 'service-project-a',
        uploadedBy: 'verified-subject',
        key: document.key,
        metadata: expect.objectContaining({ assetId: 'asset-a', uploadSessionId: 'session-a' }),
      }),
    });
    const persisted = tx.document.create.mock.calls[0][0].data;
    expect(persisted.metadata).not.toEqual(expect.objectContaining({ actor: expect.anything() }));
    expect(persisted.key).not.toBe('caller/key.pdf');
  });

  it('does not delete the local document or audit when protected Media deletion fails', async () => {
    const failure = new Error('media deletion failed');
    tx.document.findFirst.mockResolvedValue(document);
    media.deleteAsset.mockRejectedValueOnce(failure);

    await expect(
      service.remove('service-project-a', 'document-a', 'verified-subject', delegatedAuthorization),
    ).rejects.toBe(failure);

    expect(media.deleteAsset).toHaveBeenCalledWith('asset-a', delegatedAuthorization);
    expect(authorization.withProjectAccess).toHaveBeenCalledTimes(1);
    expect(tx.document.deleteMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('re-authorizes and rechecks the asset relationship before deleting locally', async () => {
    tx.document.findFirst.mockResolvedValue(document);

    await expect(
      service.remove('service-project-a', 'document-a', 'verified-subject', delegatedAuthorization),
    ).resolves.toEqual({ message: 'Document deleted successfully' });

    expect(authorization.withProjectAccess).toHaveBeenCalledTimes(2);
    expect(tx.document.deleteMany).toHaveBeenCalledWith({
      where: { id: 'document-a', projectId: 'service-project-a' },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actor: 'verified-subject', entityId: 'document-a' }),
    });
  });
});
