import { PATH_METADATA } from '@nestjs/common/constants';
import { SearchController } from './search.controller';

describe('SearchController routes', () => {
  it('does not expose the legacy unsecured background-removal endpoint', () => {
    const prototype = SearchController.prototype as unknown as Record<string, unknown>;
    const paths = Object.getOwnPropertyNames(prototype)
      .map((name) => prototype[name])
      .filter((handler): handler is object | Function =>
        ['object', 'function'].includes(typeof handler),
      )
      .map((handler) => Reflect.getMetadata(PATH_METADATA, handler))
      .filter((path): path is string => typeof path === 'string');

    expect(paths).not.toContain('ai/remove-background/:assetId');
  });
});
