# Testing Guide - Designer Portal

This document provides information about testing in the Designer Portal application.

## Test Setup

The Designer Portal uses two testing frameworks:

1. **Jest** with React Testing Library for unit and integration tests
2. **Playwright** for end-to-end (e2e) tests

## Configuration Files

### Jest Configuration

- **jest.config.js**: Main Jest configuration using Next.js Jest preset
- **jest.setup.js**: Test environment setup (mocks, polyfills)

### Playwright Configuration

- **playwright.config.ts**: Playwright configuration for e2e tests
- **e2e/**: Directory containing e2e test files

## Running Tests

### Unit/Integration Tests (Jest)

```bash
# Run all Jest tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### E2E Tests (Playwright)

```bash
# Run all e2e tests
npm run test:e2e

# Run e2e tests in UI mode (interactive)
npx playwright test --ui

# Run e2e tests in a specific browser
npx playwright test --project=chromium

# List all e2e tests
npx playwright test --list
```

## Test Structure

### Unit/Integration Tests

Located in `src/**/__tests__/` directories:

```
src/
├── hooks/
│   └── __tests__/
│       └── use-auth.test.tsx
├── lib/
│   └── __tests__/
│       └── rbac.test.ts
└── components/
    └── __tests__/
        └── component.test.tsx
```

### E2E Tests

Located in `e2e/` directory:

```
e2e/
├── auth/
│   └── authentication.spec.ts
└── [other-features]/
    └── feature.spec.ts
```

## Writing Tests

### Jest Unit Tests

Example of a React hook test:

```tsx
import { renderHook } from '@testing-library/react';
import { useAuth } from '../use-auth';

describe('useAuth', () => {
  it('should return authenticated user when session exists', () => {
    // Test implementation
  });
});
```

### Playwright E2E Tests

Example of an e2e test:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('should perform action', async ({ page }) => {
    await page.goto('/some-route');
    await expect(page.getByText('Expected Text')).toBeVisible();
  });
});
```

## Mocking

### Next.js Router

The Next.js router is automatically mocked in `jest.setup.js`. You can customize the mock in individual tests:

```tsx
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    // other router methods
  })),
}));
```

### Next Auth

Mock `next-auth/react` in your tests:

```tsx
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
}));
```

## Path Aliases

Both Jest and Playwright are configured to recognize the following path aliases:

- `@/*`: Maps to `src/*`
- `@patina/design-system`: Design system package
- `@patina/types`: Types package
- `@patina/api-client`: API client package
- `@patina/utils`: Utils package

## Coverage

Coverage reports are generated in the `coverage/` directory when running:

```bash
npm run test:coverage
```

Open `coverage/lcov-report/index.html` in a browser to view detailed coverage reports.

## Test Files Currently Available

### Unit/Integration Tests

1. **src/hooks/__tests__/use-auth.test.tsx**
   - Tests for useAuth hook
   - Tests for usePermissions hook
   - Tests for useRequireAuth hook

2. **src/lib/__tests__/rbac.test.ts**
   - Tests for RBAC utilities
   - Permission checking
   - Role management

### E2E Tests

1. **e2e/auth/authentication.spec.ts**
   - Authentication flow tests
   - Protected routes
   - Session management
   - Error handling
   - Sign out flow
   - RBAC UI tests

## Best Practices

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Cleanup**: Use `beforeEach` and `afterEach` to clean up mocks and state
3. **Descriptive Names**: Use clear, descriptive test names that explain what is being tested
4. **Arrange-Act-Assert**: Follow the AAA pattern in tests
5. **Mock External Dependencies**: Mock API calls, external services, and modules
6. **Test User Behavior**: Focus on testing how users interact with the application

## Troubleshooting

### Common Issues

1. **Module not found errors**
   - Check that path aliases are correctly configured in `jest.config.js`
   - Ensure packages are installed

2. **TypeScript errors in tests**
   - Make sure test files use `.test.ts` or `.test.tsx` extensions
   - Check that `@types/jest` is installed

3. **Transform errors**
   - The configuration uses Next.js Jest preset which handles TypeScript/JSX automatically
   - For ESM packages, they're listed in `transformIgnorePatterns`

4. **E2E test failures**
   - Ensure the dev server is running on http://localhost:3000
   - Check that required test data is seeded
   - Verify environment variables are set

## CI/CD Integration

Tests can be run in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run Unit Tests
  run: npm test

- name: Run E2E Tests
  run: npm run test:e2e
```

## Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Next.js Testing](https://nextjs.org/docs/testing)
