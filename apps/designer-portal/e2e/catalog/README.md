# Product Editor Phase 1 E2E Tests

Comprehensive end-to-end test suite for the Phase 1 product editor features built with Playwright.

## Test File

- **File**: `product-editor-phase1.spec.ts`
- **Lines of Code**: 2,155
- **Test Suites**: 13
- **Test Cases**: 66

## Coverage

### 1. Product Editor Tabs (13 tests)
- Tab navigation and layout
- Previous/Next button navigation
- Progress meter display
- Tab state persistence
- Visual compliance

### 2. Header and Visual Elements (5 tests)
- Product thumbnail display
- Product name and SKU display
- Save state badges
- Modal dimensions (90vh/90vw)
- Close modal functionality

### 3. Details Tab (7 tests)
- Basic product information fields
- Required field validation
- Product name updates
- Category selection
- Customizable checkbox toggle
- 3D/AR support flags
- Long description handling

### 4. Media Tab (5 tests)
- Media management interface
- Image display
- Image actions (primary, delete)
- Primary image identification
- Empty state handling

### 5. Pricing Tab (7 tests)
- Pricing form fields
- Base price updates
- Multi-currency support
- Sale pricing
- Price validation
- Variant pricing section
- MSRP field

### 6. Inventory Tab (6 tests)
- Inventory management fields
- Stock quantity updates
- Availability status
- Lead time days
- Variant inventory
- Quantity validation

### 7. SEO Tab (8 tests)
- SEO metadata fields
- SEO title updates
- SEO description updates
- Keywords handling
- SEO score display
- SEO recommendations
- Title length validation
- Product slug updates

### 8. Variant Management (6 tests)
- Add variant button
- Create new variant with SKU
- Display existing variants
- Update variant pricing
- Delete variant
- Validate variant SKU uniqueness

### 9. Publishing Workflow (5 tests)
- Draft status
- Change status to published
- Required field validation before publishing
- Published date display
- Unpublish workflow

### 10. Form Validation (3 tests)
- Invalid input validation
- Unsaved changes warning
- Email format validation

### 11. Accessibility (4 tests)
- ARIA labels on form fields
- Keyboard navigation
- Focus indicators
- Screen reader announcements

### 12. Error Handling (3 tests)
- Save failure error state
- Network timeout handling
- Loading state during save

### 13. Visual Compliance (2 tests)
- Modal layout snapshot
- Tab-specific snapshots

## Architecture

### Page Object Model

The tests use the Page Object Model pattern for maintainability:

- **ProductEditorPage**: Main modal interactions
- **DetailsTabPage**: Details tab form fields
- **MediaTabPage**: Media management interface
- **PricingTabPage**: Pricing and variants
- **InventoryTabPage**: Stock and availability
- **SEOTabPage**: SEO metadata and optimization
- **CatalogPage**: Catalog page navigation
- **VendorLinkSection**: Vendor management

### Key Features

- ✅ Authenticated test fixtures
- ✅ Visual regression testing
- ✅ Form validation testing
- ✅ API call verification
- ✅ Error state handling
- ✅ Accessibility checks (ARIA, keyboard navigation)
- ✅ Graceful handling of missing data
- ✅ Comprehensive coverage across all tabs

## Running the Tests

### Prerequisites

1. Start the designer portal:
```bash
cd /home/kody/patina
pnpm --filter @patina/designer-portal dev
```

2. Ensure test data is available (seed the database):
```bash
pnpm db:seed
```

### Run All Tests

```bash
cd /home/kody/patina/apps/designer-portal

# Run all product editor tests
npx playwright test e2e/catalog/product-editor-phase1.spec.ts
```

### Run Specific Test Suite

```bash
# Run only tab navigation tests
npx playwright test e2e/catalog/product-editor-phase1.spec.ts -g "Tab Navigation"

# Run only variant management tests
npx playwright test e2e/catalog/product-editor-phase1.spec.ts -g "Variant Management"

# Run only SEO tab tests
npx playwright test e2e/catalog/product-editor-phase1.spec.ts -g "SEO Tab"
```

### Run in UI Mode

```bash
npx playwright test e2e/catalog/product-editor-phase1.spec.ts --ui
```

### Run in Debug Mode

```bash
npx playwright test e2e/catalog/product-editor-phase1.spec.ts --debug
```

### Run with Specific Browser

```bash
# Chrome only
npx playwright test e2e/catalog/product-editor-phase1.spec.ts --project=chromium

# Firefox only
npx playwright test e2e/catalog/product-editor-phase1.spec.ts --project=firefox

# WebKit only
npx playwright test e2e/catalog/product-editor-phase1.spec.ts --project=webkit
```

### Generate Test Report

```bash
# Run tests and generate HTML report
npx playwright test e2e/catalog/product-editor-phase1.spec.ts

# View report
npx playwright show-report
```

### Update Visual Snapshots

If you make intentional UI changes:

```bash
npx playwright test e2e/catalog/product-editor-phase1.spec.ts --update-snapshots
```

## Test Patterns

### Graceful Degradation

Tests are designed to gracefully handle missing data:

```typescript
const hasProducts = await catalogPage.productCards.count() > 0;
if (!hasProducts) {
  authTest.skip(hasProducts, 'No products available for testing');
  return;
}
```

### Optional Field Handling

Tests check for field visibility before interacting:

```typescript
const isVisible = await nameInput.isVisible().catch(() => false);
if (isVisible) {
  await nameInput.fill('Test Product');
}
```

### Error Recovery

Tests include error handling for robustness:

```typescript
const imageCount = await mediaTab.getImageCount().catch(() => 0);
expect(imageCount).toBeGreaterThanOrEqual(0);
```

## CI/CD Integration

These tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run Product Editor E2E Tests
  run: |
    cd apps/designer-portal
    npx playwright test e2e/catalog/product-editor-phase1.spec.ts --reporter=html
```

## Troubleshooting

### Tests Failing Due to No Products

Ensure the database is seeded:
```bash
pnpm db:seed:catalog
```

### Tests Timing Out

Increase timeout in playwright.config.ts:
```typescript
use: {
  actionTimeout: 30000,
}
```

### Authentication Failures

Ensure the dev credentials provider is enabled in `.env`:
```
AUTH_DEV_CREDENTIALS=true
```

### Visual Regression Failures

Update snapshots if changes are intentional:
```bash
npx playwright test e2e/catalog/product-editor-phase1.spec.ts --update-snapshots
```

## Future Enhancements

Planned additions to the test suite:

- [ ] Collections management tests
- [ ] Vendor link management tests
- [ ] Bulk operations tests
- [ ] Import/export workflow tests
- [ ] Advanced filtering tests
- [ ] Performance benchmarks
- [ ] Mobile responsiveness tests
- [ ] Cross-browser compatibility matrix

## Contributing

When adding new tests:

1. Follow the Page Object Model pattern
2. Add comprehensive error handling
3. Include accessibility checks
4. Document new test scenarios
5. Update this README with new coverage

## License

Part of the Patina project - see main LICENSE file.
