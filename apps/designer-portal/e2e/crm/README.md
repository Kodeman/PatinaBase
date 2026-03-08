# CRM E2E Testing Framework

Comprehensive end-to-end testing framework for the Patina CRM system using Playwright and Page Object Model architecture.

## Overview

This testing framework covers all critical user journeys in the CRM module:

- **New Client Onboarding** - Intake form completion and client creation
- **Stage Transitions** - Moving clients through sales pipeline
- **Health Score Updates** - Tracking and impact of touchpoints
- **Touchpoint Logging** - Recording interactions with clients
- **Real-time Updates** - WebSocket and dashboard synchronization

## Architecture

### Page Objects

Page objects model the user interface and provide methods for interaction:

- **BasePage** - Common functionality for all pages
- **CRMIntakeFormPage** - Client intake form
- **CRMKanbanPage** - Kanban board view
- **CRMClientDetailPage** - Client details panel
- **CRMHealthScorePage** - Health score metrics (future)
- **CRMTouchpointPage** - Touchpoint logging (future)

### Test Fixtures

Custom Playwright fixtures provide pre-configured context:

```typescript
test('should create client', async ({ intakeForm, kanban, authenticatedPage }) => {
  // fixtures are automatically injected
  await intakeForm.navigate();
  await intakeForm.fillForm(testData);
});
```

### Test Data Utilities

Flexible data generation for various scenarios:

```typescript
// Random client
generateRandomClient()

// Client in specific stage
generateClientByStage('discovery')

// Client with health score
generateClientWithHealthScore(75)

// Test scenarios
TestScenarioBuilder.buildHappyPathScenario()
TestScenarioBuilder.buildAtRiskScenario()
```

## Getting Started

### Installation

```bash
# Install Playwright browsers
pnpm playwright:install

# Install dependencies
pnpm install
```

### Running Tests

```bash
# Run all CRM E2E tests
cd apps/designer-portal
pnpm test:e2e crm/

# Run specific test file
pnpm test:e2e crm/tests/crm-critical-journeys.spec.ts

# Run tests in debug mode
pnpm test:e2e crm/ --debug

# Run tests in UI mode (interactive)
pnpm test:e2e crm/ --ui

# Run tests with specific browser
pnpm test:e2e crm/ --project=firefox

# Run with trace recording
pnpm test:e2e crm/ --trace=on

# Generate HTML report
pnpm playwright show-report
```

### Configuration

Tests read from `playwright.config.ts` at the project root:

```typescript
export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
});
```

## Test Files Structure

```
apps/designer-portal/e2e/crm/
├── page-objects/                  # POM classes
│   ├── base.page.ts              # Base class with common methods
│   ├── crm-intake-form.page.ts   # Intake form interactions
│   ├── crm-kanban.page.ts        # Kanban board interactions
│   └── crm-client-detail.page.ts # Client detail interactions
├── fixtures/
│   └── crm-fixtures.ts            # Test fixtures and helpers
├── tests/
│   ├── crm-intake-form.spec.ts           # Form tests
│   ├── crm-kanban.spec.ts                # Kanban tests
│   ├── crm-client-detail.spec.ts         # Detail view tests
│   ├── crm-health-score.spec.ts          # Health score tests
│   ├── crm-touchpoint-logging.spec.ts    # Touchpoint tests
│   ├── crm-stage-transitions.spec.ts     # Stage transition tests
│   └── crm-critical-journeys.spec.ts     # Critical user journeys
└── utils/
    ├── test-data.ts              # Data generators
    └── helpers.ts                # Test helpers
```

## Writing Tests

### Basic Test

```typescript
import { test, expect } from '../fixtures/crm-fixtures';

test('should create new client', async ({ intakeForm, kanban }) => {
  // Arrange
  const clientData = generateRandomClient();

  // Act
  await intakeForm.navigate();
  await intakeForm.fillForm(clientData);
  await intakeForm.submitForm();

  // Assert
  expect(await intakeForm.isSuccessMessageDisplayed()).toBeTruthy();

  // Verify in kanban
  await kanban.navigate();
  const leadCards = await kanban.getCardsInColumn('Lead');
  expect(leadCards).toContain(clientData.firstName);
});
```

### Using Page Objects

```typescript
test('should update client health score', async ({
  kanban,
  clientDetail,
}) => {
  // Open kanban and click client
  await kanban.navigate();
  await kanban.clickCard('John Doe');

  // Get initial score
  const initialScore = await clientDetail.getHealthScore();

  // Add touchpoint
  await clientDetail.addTouchpoint('call', 'Positive discussion', 30);

  // Verify score increased
  const newScore = await clientDetail.getHealthScore();
  expect(newScore).toBeGreaterThan(initialScore);
});
```

### Using Test Data Builders

```typescript
test('should handle at-risk scenario', async ({ kanban, clientDetail }) => {
  const scenario = TestScenarioBuilder.buildAtRiskScenario();

  // Create client with specific scenario
  await kanban.navigate();

  // Verify at-risk status
  const healthScore = await clientDetail.getHealthScore();
  expect(healthScore).toBeLessThan(40);

  // Add recovery touchpoint
  await clientDetail.addTouchpoint('call', 'Recovery call', 45);

  // Verify improvement
  const newScore = await clientDetail.getHealthScore();
  expect(newScore).toBeGreaterThan(healthScore);
});
```

### Using Custom Assertions

```typescript
import { CRMAssertions, WaitHelpers } from '../fixtures/crm-fixtures';

test('should verify client in stage', async ({ kanban }) => {
  // Assertion helpers
  await CRMAssertions.assertClientInStage(
    kanban,
    'John Doe',
    'Discovery'
  );

  // Wait helpers
  await WaitHelpers.waitForCardInColumn(
    kanban,
    'John Doe',
    'Discovery'
  );
});
```

## Test Data Management

### Seeding Data

Test data is seeded via fixtures:

```typescript
// In crm-fixtures.ts
test.beforeEach(async ({ page }) => {
  // Login
  await loginAsDesigner(page);

  // Seed test data if needed
  await seedTestClient(page, testClients.basic);
});
```

### Generating Test Data

Use factories from `packages/testing`:

```typescript
import {
  ClientFactory,
  TouchpointFactory,
  TestScenarioFactory,
} from '@patina/testing/crm';

// Single client
const client = ClientFactory.create();

// Multiple clients
const clients = ClientFactory.createMany(10);

// Client with specific stage
const lead = ClientFactory.createWithStage('lead');

// Test scenario
const scenario = TestScenarioFactory.createHappyPathScenario();
```

### Data Builders

Create complex test scenarios:

```typescript
class TestDataBuilder {
  static buildRandomClient() { /* ... */ }
  static buildClientInStage(stage: string) { /* ... */ }
  static buildClientWithHealthScore(score: number) { /* ... */ }
  static buildMultipleClients(count: number) { /* ... */ }
}
```

## Debugging Tests

### Debug Mode

```bash
# Run tests with debugger
pnpm test:e2e crm/ --debug

# This opens Playwright Inspector allowing you to:
# - Step through test execution
# - Inspect elements
# - View network requests
# - See console messages
```

### UI Mode

```bash
# Run tests in interactive UI
pnpm test:e2e crm/ --ui

# Allows you to:
# - Run individual tests
# - See live preview of page
# - Step through actions
# - Inspect elements
```

### Visual Inspection

```bash
# Enable screenshots on failure
# Already enabled in playwright.config.ts

# View screenshots
open playwright-report/index.html
```

### Trace Viewer

```bash
# Traces are recorded on first failure
# View them with:
npx playwright show-trace playwright-report/trace.zip
```

### Logging

```typescript
// Enable detailed logging
test('should handle edge case', async ({ page }) => {
  page.on('console', (msg) => console.log(msg.text()));

  // Your test code
});
```

## Performance Testing

### Performance Annotations

```typescript
test('should load kanban board in <1s @performance', async ({ kanban }) => {
  const start = performance.now();
  await kanban.navigate();
  const duration = performance.now() - start;

  expect(duration).toBeLessThan(1000);
});
```

### Visual Regression Testing

```typescript
test('should maintain visual consistency @visual', async ({ page }) => {
  await page.goto('/crm/kanban');
  await page.waitForLoadState('networkidle');

  // Take screenshot for comparison
  await expect(page).toHaveScreenshot('kanban-desktop.png');
});
```

## CI/CD Integration

Tests run automatically on:

- **Pull Requests** - Full E2E suite across all browsers
- **Main Branch** - Nightly scheduled runs
- **Manual Trigger** - Via workflow_dispatch

See `.github/workflows/test-crm-e2e.yml` for configuration.

## Best Practices

### 1. Use Page Objects

```typescript
// Good
await intakeForm.fillForm(data);
await intakeForm.submitForm();

// Avoid
await page.fill('input[name="firstName"]', data.firstName);
await page.click('button[type="submit"]');
```

### 2. Wait for Actual Conditions

```typescript
// Good
await WaitHelpers.waitForCardInColumn(kanban, clientName, columnName);

// Avoid
await page.waitForTimeout(5000); // Hard-coded wait
```

### 3. Use Meaningful Test Data

```typescript
// Good
const testClient = generateRandomClient();
const scenario = TestScenarioBuilder.buildHappyPathScenario();

// Avoid
const data = { name: 'Test', email: 'test@test.com' };
```

### 4. Test User Behaviors, Not Implementation

```typescript
// Good
await intakeForm.fillForm(clientData);
await intakeForm.submitForm();
expect(await intakeForm.isSuccessMessageDisplayed()).toBeTruthy();

// Avoid
const apiCall = await page.evaluate(() => {
  return fetch('/api/clients', {...}).then(r => r.json());
});
```

### 5. Keep Tests Independent

```typescript
// Good - Each test is standalone
test('should create client in intake form', async ({ intakeForm }) => {
  const client = generateRandomClient();
  await intakeForm.navigate();
  // ...
});

test('should move client between stages', async ({ kanban }) => {
  // Create fresh test data
  // ...
});

// Avoid
test('create and transition client', async ({ intakeForm, kanban }) => {
  // Tests that depend on previous test execution
});
```

### 6. Use Fixtures for Setup

```typescript
// Good - Setup in fixture
test.beforeEach(async ({ page }) => {
  await loginAsDesigner(page);
});

test('should require authentication', async ({ authenticatedPage }) => {
  // Already authenticated
});

// Avoid
test('should require authentication', async ({ page }) => {
  // Manually logging in each test
  await page.goto('/auth/signin');
  // ...
});
```

## Troubleshooting

### Tests Timeout

- Increase timeout: `test.setTimeout(60000)`
- Check if page loaded: `await page.waitForLoadState('networkidle')`
- Verify selectors exist: `test.only()` to run single test

### Flaky Tests

- Use explicit waits instead of `sleep()`
- Wait for actual conditions: `await page.waitForSelector(selector)`
- Use `retries` in config for CI

### Selector Issues

```typescript
// Debug selector
test.only('debug selector', async ({ page }) => {
  await page.goto('/crm/intake');
  const element = await page.$('input[name="firstName"]');
  console.log('Element:', element);
});
```

### Authentication Issues

- Verify auth tokens in fixtures
- Check if login endpoint is accessible
- Ensure test user exists in database

## Maintenance

### Regular Updates

- Review and update selectors when UI changes
- Keep test data generators in sync with API
- Update thresholds based on performance baselines

### Test Review

- Quarterly review of test coverage
- Identify flaky tests and fix them
- Archive old/obsolete tests

### Documentation

- Keep README updated
- Document custom fixtures
- Add inline comments for complex tests

## Contact & Support

For issues or questions:

1. Check existing test examples in `/tests`
2. Review page object methods in `/page-objects`
3. Consult fixture helpers in `/fixtures`
4. Create GitHub issue with details
