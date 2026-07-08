/**
 * Shared base Jest configuration for workspace packages/services.
 *
 * Individual packages (services/orders, services/media, services/projects,
 * packages/types, packages/utils, ...) `require('../../jest.config.cjs')`
 * and spread this as a base, overriding `rootDir`, `displayName`,
 * `coverageDirectory`, and other fields as needed.
 *
 * NOTE: this file was missing from the repo (unreferenced in git history on
 * any branch), which meant `npx jest` failed immediately for every consumer
 * with `Cannot find module '../../jest.config.cjs'`. Restored with a
 * conventional NestJS/ts-jest baseline so `pnpm --filter <pkg> test` /
 * `npx jest` work again.
 */

module.exports = {
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/test/'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s', '!**/*.spec.ts', '!**/node_modules/**', '!**/dist/**'],
};
