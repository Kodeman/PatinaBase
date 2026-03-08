# E2E Testing Best Practices

This directory contains end-to-end tests for the Designer Portal application using Playwright.

## 🎯 Core Principles

1. **Deterministic Waits**: Never use arbitrary timeouts. Always wait for specific conditions.
2. **Stable Selectors**: Prefer `data-testid` attributes and semantic queries over CSS classes.
3. **Isolated Tests**: Each test should be independent and not rely on state from other tests.
4. **Realistic Scenarios**: Test user workflows, not implementation details.

## 🚫 What NOT to Do

### ❌ NEVER use `waitForTimeout`

```typescript
// ❌ BAD - Arbitrary timeout (flaky, slow, unpredictable)
await page.waitForTimeout(3000);
```

**Why it's bad:**
- Tests become timing-dependent and flaky
- Wastes time waiting unnecessarily
- Fails unpredictably in CI/CD environments
- Makes tests slower than needed

## ✅ What to DO Instead

Use the `WaitHelpers` utility class for deterministic waits:

```typescript
import { WaitHelpers } from '../utils/wait-helpers';

// ✅ GOOD - Wait for specific element
await WaitHelpers.waitForElement(page, '[data-testid="product-list"]');

// ✅ GOOD - Wait for network activity to complete
await WaitHelpers.waitForNetworkIdle(page);

// ✅ GOOD - Wait for API response
await WaitHelpers.waitForApiResponse(page, '/api/products');
```

## 📚 WaitHelpers API Reference

### Element Waiting

#### `waitForElement(page, selector, options?)`
Wait for an element to be visible on the page.

```typescript
await WaitHelpers.waitForElement(page, '[data-testid="modal"]', { timeout: 10000 });
```

#### `waitForElementToDisappear(page, selector, options?)`
Wait for an element to disappear from the page.

```typescript
await WaitHelpers.waitForElementToDisappear(page, '[data-testid="loading-spinner"]');
```

### Network Waiting

#### `waitForNetworkIdle(page, options?)`
Wait for network activity to settle (no requests for 500ms).

```typescript
await WaitHelpers.waitForNetworkIdle(page);
```

#### `waitForApiResponse(page, urlPattern, options?)`
Wait for a specific API call to complete.

```typescript
// String pattern
await WaitHelpers.waitForApiResponse(page, '/api/products');

// RegExp pattern
await WaitHelpers.waitForApiResponse(page, /\/api\/products\/\d+/);

// With status code
await WaitHelpers.waitForApiResponse(page, '/api/products', { status: 200 });
```

#### `waitForMultipleApiResponses(page, urlPatterns, options?)`
Wait for multiple API calls to complete.

```typescript
await WaitHelpers.waitForMultipleApiResponses(page, [
  '/api/products',
  '/api/collections',
  '/api/categories'
]);
```

### Animation & Transition Waiting

#### `waitForTabTransition(page, targetSelector, options?)`
Wait for a tab/section transition animation to complete.

```typescript
await WaitHelpers.waitForTabTransition(page, '[role="tabpanel"][data-state="active"]');
```

#### `waitForAnimationComplete(page, selector, options?)`
Wait for CSS animations/transitions to finish.

```typescript
await WaitHelpers.waitForAnimationComplete(page, '.modal');
```

### Upload & File Handling

#### `waitForUpload(page, uploadAction, options?)`
Wait for a file upload to complete.

```typescript
await WaitHelpers.waitForUpload(page, async () => {
  await fileInput.setInputFiles('/path/to/file.jpg');
});
```

#### `waitForImagesLoaded(page, containerSelector, options?)`
Wait for all images within a container to load.

```typescript
await WaitHelpers.waitForImagesLoaded(page, '[data-testid="product-grid"]');
```

### Search & Debounce

#### `waitForDebouncedSearch(page, searchApiPattern, options?)`
Wait for debounced search to complete.

```typescript
await searchInput.fill('chair');
await WaitHelpers.waitForDebouncedSearch(page, '/api/search', { debounceDelay: 500 });
```

### Custom Conditions

#### `waitForCondition(page, condition, options?)`
Wait for a custom condition to be true.

```typescript
await WaitHelpers.waitForCondition(
  page,
  async () => {
    const count = await page.locator('.product-card').count();
    return count > 0;
  },
  { timeout: 10000 }
);
```

#### `waitForText(page, selector, text, options?)`
Wait for an element to contain specific text.

```typescript
await WaitHelpers.waitForText(page, '.status', 'Published');
```

## 🎭 Common Patterns

### Form Submission

```typescript
// Fill form
await nameInput.fill('Modern Chair');
await priceInput.fill('299.99');

// Submit and wait for API response
await submitButton.click();
await WaitHelpers.waitForApiResponse(page, '/api/products', { status: 201 });

// Verify success
await WaitHelpers.waitForElement(page, '[data-testid="success-toast"]');
```

### Modal Interactions

```typescript
// Open modal
await openModalButton.click();
await WaitHelpers.waitForElement(page, '[role="dialog"]');

// Interact with modal
await modalInput.fill('value');

// Close modal
await closeButton.click();
await WaitHelpers.waitForElementToDisappear(page, '[role="dialog"]');
```

### Tab Navigation

```typescript
// Click tab
await mediaTab.click();
await WaitHelpers.waitForTabTransition(page, '[role="tabpanel"][data-state="active"]');

// Wait for tab content to load
await WaitHelpers.waitForNetworkIdle(page);
```

### Search Operations

```typescript
// Perform search
await searchInput.fill('modern chair');
await WaitHelpers.waitForDebouncedSearch(page, '/api/search');

// Verify results
await WaitHelpers.waitForElement(page, '[data-testid="search-results"]');
```

### Loading States

```typescript
// Trigger action that shows loading
await refreshButton.click();

// Wait for loading to appear
await WaitHelpers.waitForElement(page, '[data-testid="loading"]');

// Wait for loading to complete
await WaitHelpers.waitForElementToDisappear(page, '[data-testid="loading"]');
```

## 🏗️ Test Structure

### Page Object Model

Use Page Object Model pattern for maintainability:

```typescript
class ProductEditorPage {
  readonly page: Page;
  readonly modal: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.modal = page.locator('[role="dialog"]');
    this.saveButton = this.modal.locator('button[type="submit"]');
  }

  async open() {
    await this.modal.waitFor({ state: 'visible' });
  }

  async save() {
    await this.saveButton.click();
    await WaitHelpers.waitForApiResponse(this.page, '/api/products');
  }
}
```

### Test Organization

```typescript
test.describe('Product Editor', () => {
  let page: Page;
  let editorPage: ProductEditorPage;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
    editorPage = new ProductEditorPage(page);
    await page.goto('/catalog');
  });

  test('should create new product', async () => {
    // Test implementation
  });
});
```

## 🔍 Debugging Tips

### View Test Execution

```bash
# Run with UI mode
pnpm test:e2e --ui

# Run with headed browser
pnpm test:e2e --headed

# Run specific test
pnpm test:e2e catalog-page.spec.ts
```

### Screenshots and Traces

```typescript
// Take screenshot on failure
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await page.screenshot({ path: `test-results/${testInfo.title}.png` });
  }
});
```

### Slow Motion

```typescript
// Run tests in slow motion
test.use({ launchOptions: { slowMo: 500 } });
```

## 📊 Performance Considerations

### Optimize Test Speed

1. **Parallel Execution**: Tests run in parallel by default
2. **Reuse Authentication**: Use fixtures to avoid repeated login
3. **Wait Efficiently**: Use specific waits instead of broad network idle when possible

### Avoid Over-Waiting

```typescript
// ❌ Too broad - waits for ALL network activity
await WaitHelpers.waitForNetworkIdle(page);

// ✅ More specific - only waits for what we need
await WaitHelpers.waitForApiResponse(page, '/api/products');
await WaitHelpers.waitForElement(page, '[data-testid="product-list"]');
```

## 🛡️ ESLint Protection

An ESLint rule is configured to prevent `waitForTimeout` usage:

```json
{
  "rules": {
    "no-restricted-syntax": [
      "error",
      {
        "selector": "MemberExpression[property.name='waitForTimeout']",
        "message": "waitForTimeout is not allowed. Use WaitHelpers instead."
      }
    ]
  }
}
```

This ensures new code cannot introduce arbitrary timeouts.

## 📈 Migration Summary

**Before Refactoring:**
- 39 instances of `waitForTimeout`
- Flaky, timing-dependent tests
- Slow execution times
- Unpredictable CI/CD results

**After Refactoring:**
- 0 instances of `waitForTimeout` ✅
- Deterministic, condition-based waits
- Faster, more reliable tests
- Predictable CI/CD pipeline

## 🔗 Related Documentation

- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [WaitHelpers Source Code](./utils/wait-helpers.ts)
- [Authentication Fixtures](./fixtures/auth.ts)

## 💡 Quick Reference

| Old Pattern | New Pattern |
|-------------|-------------|
| `await page.waitForTimeout(3000)` | `await WaitHelpers.waitForNetworkIdle(page)` |
| `await page.waitForTimeout(1000)` after modal open | `await WaitHelpers.waitForElement(page, '[role="dialog"]')` |
| `await page.waitForTimeout(500)` after tab click | `await WaitHelpers.waitForTabTransition(page, selector)` |
| `await page.waitForTimeout(1500)` for search | `await WaitHelpers.waitForDebouncedSearch(page, apiPattern)` |
| `await page.waitForTimeout(1000)` for upload | `await WaitHelpers.waitForUpload(page, uploadFn)` |

---

**Remember**: Every `waitForTimeout` is a bug waiting to happen. Use deterministic waits! 🎯
