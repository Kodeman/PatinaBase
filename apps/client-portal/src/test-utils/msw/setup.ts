/**
 * MSW setup for testing and Storybook
 *
 * Usage in tests:
 * ```ts
 * import { server } from '@/test-utils/msw/setup';
 *
 * beforeAll(() => server.listen());
 * afterEach(() => server.resetHandlers());
 * afterAll(() => server.close());
 * ```
 *
 * Usage in Storybook:
 * ```ts
 * // .storybook/preview.ts
 * import { initialize, mswDecorator } from 'msw-storybook-addon';
 * import { handlers } from '@/test-utils/msw/handlers';
 *
 * initialize();
 *
 * export const decorators = [mswDecorator];
 * export const parameters = {
 *   msw: { handlers },
 * };
 * ```
 */

import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// This configures a request mocking server with the given request handlers.
export const server = setupServer(...handlers);

/**
 * Reset all handler state
 * Call this in afterEach or between tests
 */
export const resetAllMocks = () => {
  // Import reset functions dynamically to avoid circular deps
  const { resetTimelineMocks } = require('./handlers/timeline.handlers');
  const { resetNotificationMocks } = require('./handlers/notification.handlers');

  resetTimelineMocks();
  resetNotificationMocks();
};

/**
 * Setup server for test suite
 * Call this in your test setup file
 */
export const setupMswForTests = () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
  afterEach(() => {
    server.resetHandlers();
    resetAllMocks();
  });
  afterAll(() => server.close());
};
