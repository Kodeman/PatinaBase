import { IdempotencyMiddleware } from './idempotency.middleware';

describe('IdempotencyMiddleware authorization isolation', () => {
  let prisma: any;
  let middleware: IdempotencyMiddleware;

  beforeEach(() => {
    prisma = {
      idempotencyKey: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    middleware = new IdempotencyMiddleware(prisma);
  });

  it('does not read or write idempotency state before verified identity exists', async () => {
    const next = jest.fn();
    await middleware.use(request(undefined), response(), next);

    expect(next).toHaveBeenCalled();
    expect(prisma.idempotencyKey.findUnique).not.toHaveBeenCalled();
    expect(prisma.idempotencyKey.create).not.toHaveBeenCalled();
  });

  it('derives distinct opaque keys for successive pooled requests from different subjects', async () => {
    await middleware.use(request('subject-a'), response(), jest.fn());
    await middleware.use(request('subject-b'), response(), jest.fn());

    const firstKey = prisma.idempotencyKey.create.mock.calls[0][0].data.key;
    const secondKey = prisma.idempotencyKey.create.mock.calls[1][0].data.key;
    expect(firstKey).toMatch(/^[a-f0-9]{64}$/);
    expect(secondKey).toMatch(/^[a-f0-9]{64}$/);
    expect(firstKey).not.toBe(secondKey);
    expect(firstKey).not.toContain('subject-a');
  });

  function request(subject?: string): any {
    return {
      method: 'POST',
      path: '/v1/orders',
      headers: { 'idempotency-key': 'caller-key' },
      user: subject ? { sub: subject } : undefined,
    };
  }

  function response(): any {
    const res: any = {
      statusCode: 201,
      send: jest.fn(),
      status: jest.fn(),
      json: jest.fn(),
    };
    res.status.mockReturnValue(res);
    return res;
  }
});
