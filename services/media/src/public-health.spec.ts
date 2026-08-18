import { INestApplication } from '@nestjs/common';
import { registerPublicHealth } from './public-health';

describe('public health exception', () => {
  it('registers only the independently justified raw health route', () => {
    const get = jest.fn();
    const app = {
      getHttpAdapter: () => ({ get }),
    } as unknown as INestApplication;
    registerPublicHealth(app);

    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toBe('/health');
    const json = jest.fn();
    get.mock.calls[0][1]({}, { json });
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok', service: 'media' }));
  });
});
