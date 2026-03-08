/**
 * CRM Test Fixtures
 *
 * Shared fixtures for CRM E2E tests including authentication and test data
 */

import { test as base, expect, Page } from '@playwright/test';
import { CRMIntakeFormPage } from '../page-objects/crm-intake-form.page';
import { CRMKanbanPage } from '../page-objects/crm-kanban.page';
import { CRMClientDetailPage } from '../page-objects/crm-client-detail.page';

/**
 * Test user credentials
 */
export const testUsers = {
  designer: {
    email: 'designer@patina.test',
    password: 'Test@Designer123!',
    name: 'Test Designer',
  },
  admin: {
    email: 'admin@patina.test',
    password: 'Test@Admin123!',
    name: 'Test Admin',
  },
};

/**
 * Test client data
 */
export const testClients = {
  basic: {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '555-0100',
  },
  withCompany: {
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane.smith@example.com',
    phone: '555-0101',
    company: 'Smith Design Co.',
  },
  complete: {
    firstName: 'Robert',
    lastName: 'Johnson',
    email: 'robert.j@example.com',
    phone: '555-0102',
    company: 'Johnson Interiors',
    address: '123 Main St',
    city: 'New York',
    state: 'NY',
    zipCode: '10001',
    designStyle: 'modern',
    budget: '50000',
    projectScope: 'Full home renovation',
    notes: 'Interested in sustainable materials',
  },
};

/**
 * Extended test context with CRM page objects
 */
export type CRMTestContext = {
  intakeForm: CRMIntakeFormPage;
  kanban: CRMKanbanPage;
  clientDetail: CRMClientDetailPage;
  authenticatedPage: Page;
  user: typeof testUsers.designer;
};

/**
 * Login helper
 */
async function loginAsDesigner(page: Page): Promise<void> {
  await page.goto('/auth/signin');
  await page.fill('input[name="email"]', testUsers.designer.email);
  await page.fill('input[name="password"]', testUsers.designer.password);
  await page.click('button[type="submit"]');

  // Wait for successful login redirect
  await page.waitForURL(/\/dashboard|\/crm/, { timeout: 30000 });
  await page.waitForLoadState('networkidle');
}

/**
 * Login helper for admin
 */
async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/auth/signin');
  await page.fill('input[name="email"]', testUsers.admin.email);
  await page.fill('input[name="password"]', testUsers.admin.password);
  await page.click('button[type="submit"]');

  // Wait for successful login redirect
  await page.waitForURL(/\/admin|\/dashboard/, { timeout: 30000 });
  await page.waitForLoadState('networkidle');
}

/**
 * Logout helper
 */
async function logout(page: Page): Promise<void> {
  // Click user menu
  const userMenu = await page.$('button[data-testid="user-menu"]');
  if (userMenu) {
    await userMenu.click();
    await page.click('button[data-testid="logout"]');
    await page.waitForURL(/\/auth\/signin/, { timeout: 10000 });
  }
}

/**
 * Seed test client in database
 */
async function seedTestClient(
  page: Page,
  clientData: typeof testClients.basic
): Promise<string> {
  // This would use your API to create test data
  // For now, we'll navigate through the UI
  const intakeForm = new CRMIntakeFormPage(page);

  await intakeForm.navigate();
  await intakeForm.fillForm({
    firstName: clientData.firstName,
    lastName: clientData.lastName,
    email: clientData.email,
    phone: clientData.phone,
  });
  await intakeForm.submitForm();

  // Extract client ID from URL or success message
  // This is a simplified example - adjust based on your app
  const url = page.url();
  const match = url.match(/\/crm\/clients\/([^\/]+)/);
  return match ? match[1] : '';
}

/**
 * Clear test data from database
 */
async function clearTestData(page: Page): Promise<void> {
  // Call cleanup API or delete through UI
  // This should be implemented based on your app's architecture
  try {
    await page.goto('/api/test/cleanup', { waitUntil: 'networkidle' });
  } catch {
    // Endpoint might not exist or require authentication
    console.log('Test cleanup endpoint not available');
  }
}

/**
 * Custom test fixture with CRM context
 */
export const test = base.extend<CRMTestContext>({
  intakeForm: async ({ page }, use) => {
    const intakeForm = new CRMIntakeFormPage(page);
    await use(intakeForm);
  },

  kanban: async ({ page }, use) => {
    const kanban = new CRMKanbanPage(page);
    await use(kanban);
  },

  clientDetail: async ({ page }, use) => {
    const clientDetail = new CRMClientDetailPage(page);
    await use(clientDetail);
  },

  authenticatedPage: async ({ page }, use) => {
    // Login before tests
    await loginAsDesigner(page);

    // Use the authenticated page
    await use(page);

    // Logout after tests
    await logout(page);
  },

  user: async ({}, use) => {
    await use(testUsers.designer);
  },
});

/**
 * Test setup and teardown hooks
 */
test.beforeEach(async ({ page }) => {
  // Set viewport for consistent testing
  await page.setViewportSize({ width: 1920, height: 1080 });
});

test.afterEach(async ({ page }) => {
  // Take screenshot on failure
  if (test.info().status !== 'passed') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await page.screenshot({
      path: `test-results/screenshots/failure-${timestamp}.png`,
    });
  }
});

/**
 * Global test setup
 */
export async function globalSetup(): Promise<void> {
  // You can add global setup here if needed
  // For example, seeding test data that persists across tests
  console.log('Running CRM E2E tests...');
}

/**
 * Test data builders
 */
export class TestDataBuilder {
  /**
   * Build a random test client
   */
  static buildRandomClient() {
    const timestamp = Date.now();
    return {
      firstName: `Test${timestamp}`,
      lastName: 'User',
      email: `test+${timestamp}@example.com`,
      phone: '555-0199',
    };
  }

  /**
   * Build a client in a specific stage
   */
  static buildClientInStage(stage: string) {
    return {
      ...this.buildRandomClient(),
      stage,
    };
  }

  /**
   * Build a client with specific health score
   */
  static buildClientWithHealthScore(healthScore: number) {
    return {
      ...this.buildRandomClient(),
      healthScore,
    };
  }

  /**
   * Build multiple clients
   */
  static buildMultipleClients(count: number) {
    return Array.from({ length: count }, () => this.buildRandomClient());
  }
}

/**
 * Assertion helpers
 */
export class CRMAssertions {
  /**
   * Assert client exists in kanban
   */
  static async assertClientInKanban(
    kanban: CRMKanbanPage,
    clientName: string
  ): Promise<void> {
    const columns = await kanban.getColumns();
    const allNames = columns
      .flatMap((c) => c.cardNames)
      .some((name) => name.includes(clientName));

    expect(allNames).toBeTruthy();
  }

  /**
   * Assert client in specific stage
   */
  static async assertClientInStage(
    kanban: CRMKanbanPage,
    clientName: string,
    stageName: string
  ): Promise<void> {
    const stage = await kanban.getColumn(stageName);
    const cards = await stage.locator('div[data-testid="kanban-card"]').all();

    let found = false;
    for (const card of cards) {
      const text = await card.textContent();
      if (text?.includes(clientName)) {
        found = true;
        break;
      }
    }

    expect(found).toBeTruthy();
  }

  /**
   * Assert health score changed
   */
  static async assertHealthScoreChanged(
    initial: number,
    current: number,
    direction: 'increased' | 'decreased'
  ): Promise<void> {
    if (direction === 'increased') {
      expect(current).toBeGreaterThan(initial);
    } else {
      expect(current).toBeLessThan(initial);
    }
  }

  /**
   * Assert touchpoint visible
   */
  static async assertTouchpointVisible(
    clientDetail: CRMClientDetailPage,
    touchpointType: string
  ): Promise<void> {
    const touchpoints = await clientDetail.getTouchpoints();
    const found = touchpoints.some((t) =>
      t.type.toLowerCase().includes(touchpointType.toLowerCase())
    );

    expect(found).toBeTruthy();
  }
}

/**
 * Wait helpers
 */
export class WaitHelpers {
  /**
   * Wait for health score to update
   */
  static async waitForHealthScoreUpdate(
    clientDetail: CRMClientDetailPage,
    initialScore: number,
    timeout = 30000
  ): Promise<number> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const currentScore = await clientDetail.getHealthScore();

      if (currentScore !== initialScore) {
        return currentScore;
      }

      await clientDetail.page.waitForTimeout(500);
    }

    throw new Error('Health score did not update within timeout');
  }

  /**
   * Wait for card to appear in column
   */
  static async waitForCardInColumn(
    kanban: CRMKanbanPage,
    clientName: string,
    columnName: string,
    timeout = 30000
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const cards = await kanban.getCardsInColumn(columnName);

      if (cards.some((card) => card.includes(clientName))) {
        return;
      }

      await kanban.page.waitForTimeout(500);
    }

    throw new Error(`Card ${clientName} did not appear in ${columnName}`);
  }

  /**
   * Wait for touchpoint to appear
   */
  static async waitForTouchpointAppear(
    clientDetail: CRMClientDetailPage,
    touchpointType: string,
    timeout = 30000
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const touchpoints = await clientDetail.getTouchpoints();

      if (
        touchpoints.some((t) =>
          t.type.toLowerCase().includes(touchpointType.toLowerCase())
        )
      ) {
        return;
      }

      await clientDetail.page.waitForTimeout(500);
    }

    throw new Error(`Touchpoint of type ${touchpointType} did not appear`);
  }
}

/**
 * Export all utilities
 */
export { expect };
