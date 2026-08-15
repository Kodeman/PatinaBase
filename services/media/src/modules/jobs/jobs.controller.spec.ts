import { JobsController } from './jobs.controller';

describe('JobsController worker callback', () => {
  const body = {
    jobId: '11111111-1111-4111-8111-111111111111',
    assetId: '22222222-2222-4222-8222-222222222222',
    state: 'SUCCEEDED' as const,
  };

  it('verifies the raw request before completing the job transactionally', async () => {
    const jobQueue = { completeJobCallback: jest.fn().mockResolvedValue({ ok: true }) };
    const callbackAuth = { verify: jest.fn() };
    const controller = new JobsController(jobQueue as any, {} as any, callbackAuth as any);
    const request = { rawBody: Buffer.from(JSON.stringify(body)) } as any;

    await expect(
      controller.completeJob(request, '1700000000', 'v1=signature', body),
    ).resolves.toEqual({ ok: true });
    expect(callbackAuth.verify).toHaveBeenCalledWith(request.rawBody, '1700000000', 'v1=signature');
    expect(jobQueue.completeJobCallback).toHaveBeenCalledWith(body);
  });

  it('does not touch the ledger after callback verification fails', async () => {
    const jobQueue = { completeJobCallback: jest.fn() };
    const callbackAuth = {
      verify: jest.fn(() => {
        throw new Error('denied');
      }),
    };
    const controller = new JobsController(jobQueue as any, {} as any, callbackAuth as any);

    await expect(
      controller.completeJob({ rawBody: Buffer.from('{}') } as any, undefined, undefined, body),
    ).rejects.toThrow('denied');
    expect(jobQueue.completeJobCallback).not.toHaveBeenCalled();
  });
});
