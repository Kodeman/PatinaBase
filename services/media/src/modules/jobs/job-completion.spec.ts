import { JobQueueService } from './job-queue.service';

describe('JobQueueService completion boundary', () => {
  const payload = {
    jobId: '11111111-1111-4111-8111-111111111111',
    assetId: '22222222-2222-4222-8222-222222222222',
    state: 'SUCCEEDED' as const,
    result: { success: true },
  };

  function harness() {
    const transaction = {
      processJob: {
        findUnique: jest.fn().mockResolvedValue({
          id: payload.jobId,
          assetId: payload.assetId,
          state: 'QUEUED',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      mediaAsset: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn((operation) => operation(transaction)),
    };
    return {
      service: new JobQueueService({} as any, prisma as any),
      prisma,
      transaction,
    };
  }

  it('uses one transaction and marks the asset ready without optional metadata', async () => {
    const { service, prisma, transaction } = harness();

    await expect(service.completeJobCallback(payload)).resolves.toEqual({ ok: true });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.processJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: payload.jobId },
        data: expect.objectContaining({ state: 'SUCCEEDED' }),
      }),
    );
    expect(transaction.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: payload.assetId },
      data: { processed: true, status: 'READY' },
    });
  });

  it('treats a signed retry of the same terminal state as idempotent', async () => {
    const { service, transaction } = harness();
    transaction.processJob.findUnique.mockResolvedValue({
      id: payload.jobId,
      assetId: payload.assetId,
      state: 'SUCCEEDED',
    });

    await expect(service.completeJob(payload, transaction as any)).resolves.toEqual({ ok: true });
    expect(transaction.processJob.update).not.toHaveBeenCalled();
    expect(transaction.mediaAsset.update).not.toHaveBeenCalled();
  });
});
