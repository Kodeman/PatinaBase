import { test, expect } from '@playwright/test';

/**
 * E2E Tests for Project Creation Page (/projects/new)
 * Tests page load, UI elements, tab navigation, and form interactions
 */

test.describe('Projects New Page - /projects/new', () => {
  test('should load page without critical errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const networkErrors: { url: string; status: number }[] = [];

    // Capture console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Capture page errors
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    // Capture network errors (500, 404, etc.)
    page.on('response', (response) => {
      if (response.status() >= 400 && response.status() !== 401 && response.status() !== 403) {
        networkErrors.push({
          url: response.url(),
          status: response.status(),
        });
      }
    });

    console.log('\n=== TESTING: /projects/new ===');

    // Navigate to the page
    const response = await page.goto('/projects/new');

    // Wait for initial load
    await page.waitForLoadState('domcontentloaded');

    // Get the final URL (after any redirects)
    const finalUrl = page.url();
    console.log(`Final URL: ${finalUrl}`);

    // Verify page has content
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length || 0).toBeGreaterThan(0);

    // Check for module resolution errors (critical)
    const hasModuleErrors = pageErrors.some(
      (err) => err.includes('Module not found') || err.includes("Can't resolve")
    );

    if (hasModuleErrors) {
      console.error('❌ MODULE RESOLUTION ERRORS:');
      pageErrors.forEach((err) => console.error(`  - ${err}`));
    }

    expect(hasModuleErrors, 'Module resolution errors found on /projects/new').toBe(false);

    // Check response status (500 is critical)
    if (response && response.status() === 500) {
      console.error('❌ Server returned 500 error');
      expect(response.status(), '/projects/new returned 500 error').not.toBe(500);
    }

    // Report all errors found
    if (consoleErrors.length > 0) {
      console.log(`\nConsole Errors (${consoleErrors.length}):`);
      consoleErrors.forEach((err, i) => console.log(`  ${i + 1}. ${err.substring(0, 200)}`));
    }

    if (pageErrors.length > 0) {
      console.log(`\nPage Errors (${pageErrors.length}):`);
      pageErrors.forEach((err, i) => console.log(`  ${i + 1}. ${err.substring(0, 200)}`));
    }

    if (networkErrors.length > 0) {
      console.log(`\nNetwork Errors (${networkErrors.length}):`);
      networkErrors.forEach((err, i) => console.log(`  ${i + 1}. ${err.status} - ${err.url}`));
    }

    console.log('✓ Page loaded successfully without critical errors');
  });

  test('should display page title and description', async ({ page }) => {
    await page.goto('/projects/new');
    await page.waitForLoadState('domcontentloaded');

    // Check for main heading
    const heading = page.locator('h1:has-text("Build a project launch plan")');
    await expect(heading).toBeVisible();

    // Check for description
    const description = page.locator(
      'text=Craft milestones, approvals, and communications before wiring them to live data sources.'
    );
    await expect(description).toBeVisible();

    // Check for sandbox badge
    const sandboxBadge = page.locator('text=Sandbox · no API calls yet');
    await expect(sandboxBadge).toBeVisible();

    console.log('✓ Page title and description are visible');
  });

  test('should display project blueprint card with form fields', async ({ page }) => {
    await page.goto('/projects/new');
    await page.waitForLoadState('domcontentloaded');

    // Check for Project blueprint card
    const blueprintCard = page.locator('text=Project blueprint').first();
    await expect(blueprintCard).toBeVisible();

    // Check for pre-filled project name
    const projectNameInput = page.locator('#project-name');
    await expect(projectNameInput).toBeVisible();
    await expect(projectNameInput).toHaveValue('West Village Penthouse Refresh');

    // Check for project code
    const projectCodeInput = page.locator('#project-code');
    await expect(projectCodeInput).toBeVisible();
    await expect(projectCodeInput).toHaveValue('PRJ-2048');

    // Check for client input
    const clientInput = page.locator('#project-client');
    await expect(clientInput).toBeVisible();
    await expect(clientInput).toHaveValue('Lila Hart');

    // Check for location
    const locationInput = page.locator('#project-location');
    await expect(locationInput).toBeVisible();
    await expect(locationInput).toHaveValue('NYC · 48 West 11th St');

    console.log('✓ Project blueprint form fields are visible and populated');
  });

  test('should display workflow builder with tabs', async ({ page }) => {
    await page.goto('/projects/new');
    await page.waitForLoadState('domcontentloaded');

    // Check for Workflow builder card
    const workflowCard = page.locator('text=Workflow builder').first();
    await expect(workflowCard).toBeVisible();

    // Check for tabs
    const milestonesTab = page.locator('button[role="tab"]:has-text("Milestones")');
    await expect(milestonesTab).toBeVisible();

    const approvalsTab = page.locator('button[role="tab"]:has-text("Approvals")');
    await expect(approvalsTab).toBeVisible();

    const communicationsTab = page.locator('button[role="tab"]:has-text("Communications")');
    await expect(communicationsTab).toBeVisible();

    console.log('✓ Workflow builder tabs are visible');
  });

  test('should switch between tabs successfully', async ({ page }) => {
    await page.goto('/projects/new');
    await page.waitForLoadState('domcontentloaded');

    // Default tab should be Milestones
    const conceptStoryboards = page.locator('text=Concept Storyboards').first();
    await expect(conceptStoryboards).toBeVisible();

    // Click on Approvals tab
    const approvalsTab = page.locator('button[role="tab"]:has-text("Approvals")');
    await approvalsTab.click();
    await page.waitForTimeout(300);

    // Check for approval gate content
    const conceptApproval = page.locator('text=Concept Storyboards').first();
    await expect(conceptApproval).toBeVisible();

    const procurementBudget = page.locator('text=Procurement Budget');
    await expect(procurementBudget).toBeVisible();

    // Click on Communications tab
    const communicationsTab = page.locator('button[role="tab"]:has-text("Communications")');
    await communicationsTab.click();
    await page.waitForTimeout(300);

    // Check for communication tracks
    const weeklyClientSync = page.locator('text=Weekly Client Sync').first();
    await expect(weeklyClientSync).toBeVisible();

    // Switch back to Milestones
    const milestonesTab = page.locator('button[role="tab"]:has-text("Milestones")');
    await milestonesTab.click();
    await page.waitForTimeout(300);

    // Verify we're back on milestones
    await expect(conceptStoryboards).toBeVisible();

    console.log('✓ Tab switching works correctly');
  });

  test('should display initial milestones with correct data', async ({ page }) => {
    await page.goto('/projects/new');
    await page.waitForLoadState('domcontentloaded');

    // Check for milestone titles
    const milestone1 = page.locator('text=Concept Storyboards').first();
    await expect(milestone1).toBeVisible();

    const milestone2 = page.locator('text=Spec & Procurement Package');
    await expect(milestone2).toBeVisible();

    const milestone3 = page.locator('text=Install & Styling Window');
    await expect(milestone3).toBeVisible();

    // Check for status badges
    const inReviewBadge = page.locator('text=In Review').first();
    await expect(inReviewBadge).toBeVisible();

    const draftingBadge = page.locator('text=Drafting');
    await expect(draftingBadge).toBeVisible();

    const upNextBadge = page.locator('text=Up Next');
    await expect(upNextBadge).toBeVisible();

    console.log('✓ Initial milestones are displayed with correct data');
  });

  test('should allow adding a new milestone', async ({ page }) => {
    await page.goto('/projects/new');
    await page.waitForLoadState('domcontentloaded');

    // Count initial milestones
    const initialMilestones = await page.locator('text=Concept Storyboards, text=Spec & Procurement Package, text=Install & Styling Window').count();

    // Click "Add milestone" button
    const addButton = page.locator('button:has-text("Add milestone")');
    await addButton.click();
    await page.waitForTimeout(500);

    // Check for new milestone
    const newMilestone = page.locator('text=New Milestone 4');
    await expect(newMilestone).toBeVisible();

    console.log('✓ New milestone can be added successfully');
  });

  test('should display sidebar cards', async ({ page }) => {
    await page.goto('/projects/new');
    await page.waitForLoadState('domcontentloaded');

    // Timeline snapshot card
    const timelineCard = page.locator('text=Timeline snapshot').first();
    await expect(timelineCard).toBeVisible();

    // Approval health card
    const approvalHealthCard = page.locator('text=Approval health').first();
    await expect(approvalHealthCard).toBeVisible();

    // Communications card
    const communicationsCard = page.locator('text=Communications').nth(1);
    await expect(communicationsCard).toBeVisible();

    // Launch checklist card
    const checklistCard = page.locator('text=Launch checklist').first();
    await expect(checklistCard).toBeVisible();

    console.log('✓ All sidebar cards are visible');
  });

  test('should display timeline window data', async ({ page }) => {
    await page.goto('/projects/new');
    await page.waitForLoadState('domcontentloaded');

    // Check for window label
    const windowLabel = page.locator('text=Window').first();
    await expect(windowLabel).toBeVisible();

    // Check for readiness info
    const readinessLabel = page.locator('text=Readiness').first();
    await expect(readinessLabel).toBeVisible();

    // Check for progress bar
    const progressBar = page.locator('[role="progressbar"]').first();
    await expect(progressBar).toBeVisible();

    console.log('✓ Timeline window data is displayed');
  });

  test('should update form inputs successfully', async ({ page }) => {
    await page.goto('/projects/new');
    await page.waitForLoadState('domcontentloaded');

    // Update project name
    const projectNameInput = page.locator('#project-name');
    await projectNameInput.clear();
    await projectNameInput.fill('Updated Project Name');
    await expect(projectNameInput).toHaveValue('Updated Project Name');

    // Update client name
    const clientInput = page.locator('#project-client');
    await clientInput.clear();
    await clientInput.fill('John Doe');
    await expect(clientInput).toHaveValue('John Doe');

    // Update budget
    const budgetInput = page.locator('#project-budget');
    await budgetInput.clear();
    await budgetInput.fill('1000000');
    await expect(budgetInput).toHaveValue('1000000');

    console.log('✓ Form inputs can be updated successfully');
  });

  test('should display action buttons', async ({ page }) => {
    await page.goto('/projects/new');
    await page.waitForLoadState('domcontentloaded');

    // Check for "Share brief" button
    const shareBriefButton = page.locator('button:has-text("Share brief")');
    await expect(shareBriefButton).toBeVisible();

    // Check for "Mark as ready" button
    const markReadyButton = page.locator('button:has-text("Mark as ready")');
    await expect(markReadyButton).toBeVisible();

    // Check for "Export brief" button
    const exportBriefButton = page.locator('button:has-text("Export brief")');
    await expect(exportBriefButton).toBeVisible();

    // Check for "Route for approvals" button
    const routeApprovalsButton = page.locator('button:has-text("Route for approvals")');
    await expect(routeApprovalsButton).toBeVisible();

    console.log('✓ All action buttons are visible');
  });

  test('should display approval statistics', async ({ page }) => {
    await page.goto('/projects/new');
    await page.waitForLoadState('domcontentloaded');

    // Navigate to approvals tab to verify they exist
    const approvalsTab = page.locator('button[role="tab"]:has-text("Approvals")');
    await approvalsTab.click();
    await page.waitForTimeout(300);

    // Check for approval gate entries
    const conceptApproval = page.locator('text=Concept Storyboards').first();
    await expect(conceptApproval).toBeVisible();

    const siteAccessApproval = page.locator('text=Site Access & Logistics');
    await expect(siteAccessApproval).toBeVisible();

    console.log('✓ Approval statistics are displayed');
  });

  test('should display communication tracks with details', async ({ page }) => {
    await page.goto('/projects/new');
    await page.waitForLoadState('domcontentloaded');

    // Navigate to Communications tab
    const communicationsTab = page.locator('button[role="tab"]:has-text("Communications")');
    await communicationsTab.click();
    await page.waitForTimeout(300);

    // Check for communication track names
    const weeklySync = page.locator('text=Weekly Client Sync').first();
    await expect(weeklySync).toBeVisible();

    const procurementDigest = page.locator('text=Procurement Digest');
    await expect(procurementDigest).toBeVisible();

    const siteBeat = page.locator('text=Site Beat Report');
    await expect(siteBeat).toBeVisible();

    // Check for "Add communication lane" button
    const addButton = page.locator('button:has-text("Add communication lane")');
    await expect(addButton).toBeVisible();

    console.log('✓ Communication tracks are displayed with details');
  });
});
