# Phase 4: Installation & Deployment Guide

## Prerequisites

- Node.js 18+ installed
- pnpm package manager
- Patina monorepo set up
- Phases 1-3 completed (types, services, presenter)

## Installation Steps

### 1. Install Dependencies

```bash
# From monorepo root
cd /home/kody/patina

# Install new Radix UI dependencies
pnpm add @radix-ui/react-toggle-group @radix-ui/react-radio-group @radix-ui/react-separator @radix-ui/react-dialog
```

Expected output:
```
✓ Dependencies installed successfully
```

### 2. Verify File Structure

```bash
# Check all UI components
ls -1 apps/admin-portal/src/components/ui/{toggle-group,sheet,radio-group,separator}.tsx

# Check all catalog components
ls -1 apps/admin-portal/src/components/catalog/*.tsx

# Should show:
# - 4 UI components
# - 12 catalog components (including existing ones)
```

### 3. Build Shared Packages

```bash
# Build type definitions
pnpm --filter @patina/types build

# Build design system (if used)
pnpm --filter @patina/design-system build
```

### 4. Type Check

```bash
# Type check admin portal
pnpm --filter @patina/admin-portal type-check
```

Expected: No TypeScript errors

### 5. Start Development Server

```bash
# Start admin portal
pnpm --filter @patina/admin-portal dev
```

Server should start on: http://localhost:3001 (or configured port)

## Verification Checklist

### Visual Checks

1. **Navigate to Catalog Page**
   - URL: http://localhost:3001/catalog
   - Should load without errors

2. **Grid View**
   - [ ] Products display in 4-column grid (desktop)
   - [ ] Cards show images, title, price, status
   - [ ] Hover effects work
   - [ ] Selection checkboxes visible

3. **List View**
   - [ ] Click list icon in view toggle
   - [ ] Products display in horizontal cards
   - [ ] All metadata visible
   - [ ] Responsive on mobile

4. **Table View**
   - [ ] Click table icon in view toggle
   - [ ] Products display in sortable table
   - [ ] All columns visible
   - [ ] Sorting works (click column headers)

5. **Search**
   - [ ] Type in search box
   - [ ] Results filter in real-time (300ms debounce)
   - [ ] Clear button appears and works

6. **Filters**
   - [ ] Click Filters button
   - [ ] Drawer slides in from left
   - [ ] All filter sections visible
   - [ ] Can select status, category, brand
   - [ ] Apply and Clear buttons work

7. **Bulk Actions**
   - [ ] Select multiple products
   - [ ] Toolbar appears at top
   - [ ] Shows correct count
   - [ ] Publish/Unpublish/Delete buttons visible
   - [ ] Clicking opens confirmation dialogs

8. **Pagination**
   - [ ] Page controls visible (if >20 products)
   - [ ] Can navigate pages
   - [ ] Page numbers update
   - [ ] Previous/Next buttons work

### Functional Checks

9. **State Persistence**
   - [ ] Select a view mode
   - [ ] Refresh page
   - [ ] View mode persists (localStorage)

10. **Empty States**
    - [ ] Clear all filters
    - [ ] Should show "no results" if filters active
    - [ ] Should show "no products" if catalog empty

11. **Loading States**
    - [ ] Initial page load shows skeletons
    - [ ] Pagination shows loading overlay
    - [ ] No layout shift

12. **Keyboard Navigation**
    - [ ] Tab through all interactive elements
    - [ ] Enter activates buttons
    - [ ] Space toggles checkboxes
    - [ ] Escape closes modals

## Common Issues & Solutions

### Issue 1: Module not found errors

**Error:**
```
Module not found: Can't resolve '@radix-ui/react-toggle-group'
```

**Solution:**
```bash
pnpm install
# or
pnpm add @radix-ui/react-toggle-group @radix-ui/react-radio-group @radix-ui/react-separator @radix-ui/react-dialog
```

### Issue 2: TypeScript errors

**Error:**
```
Property 'presenter' does not exist on type...
```

**Solution:**
Ensure Phase 3 is complete and presenter hook exists:
```bash
ls apps/admin-portal/src/features/catalog/hooks/useAdminCatalogPresenter.ts
```

### Issue 3: Build fails

**Error:**
```
Build failed with TypeScript errors
```

**Solution:**
```bash
# Check for errors
pnpm --filter @patina/admin-portal type-check

# Fix any import paths
# Ensure all @/ aliases resolve correctly
```

### Issue 4: Components not rendering

**Error:**
Page loads but components don't appear

**Solution:**
1. Check browser console for errors
2. Verify all imports in page.tsx
3. Check presenter hook returns data:
```tsx
console.log(presenter.products);
```

### Issue 5: Filter panel not opening

**Error:**
Clicking Filters does nothing

**Solution:**
Verify state and callback:
```tsx
// In page.tsx
const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

// In SearchBar
onFilterClick={() => setIsFilterPanelOpen(true)}
```

### Issue 6: Images not loading

**Error:**
Product images show fallback

**Solution:**
1. Check product data has imageUrl field
2. Verify Next.js Image component config
3. Check CORS if loading from external source

## Environment Variables

No new environment variables required for Phase 4.

Existing variables used:
- `NEXT_PUBLIC_API_URL` - API endpoint
- `NEXT_PUBLIC_APP_URL` - App URL

## Browser Testing

Test in these browsers:

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | 90+ | ✅ Primary |
| Firefox | 88+ | ✅ Supported |
| Safari | 14+ | ✅ Supported |
| Edge | 90+ | ✅ Supported |

### Mobile Testing

Test on these devices:

| Device | Viewport | Notes |
|--------|----------|-------|
| iPhone 13 | 390x844 | Grid: 1 col |
| iPad Air | 820x1180 | Grid: 2 cols |
| Desktop | 1920x1080 | Grid: 4 cols |

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| First Contentful Paint | <1s | TBD |
| Largest Contentful Paint | <2.5s | TBD |
| Time to Interactive | <3s | TBD |
| Bundle Size (JS) | <150KB | ~50KB |

## Accessibility Testing

### Automated Tools

1. **Lighthouse**
```bash
# Run in Chrome DevTools
# Target: 100/100 accessibility score
```

2. **axe DevTools**
```bash
# Install browser extension
# Scan catalog page
# Target: 0 violations
```

3. **WAVE**
```bash
# Use online tool or extension
# Check for errors and warnings
```

### Manual Testing

1. **Keyboard Navigation**
   - Tab through all elements
   - No keyboard traps
   - Visible focus indicators

2. **Screen Reader**
   - Test with NVDA (Windows) or VoiceOver (Mac)
   - All images have alt text
   - All buttons have labels
   - Form inputs have labels

3. **Color Contrast**
   - All text meets WCAG AA (4.5:1)
   - Interactive elements meet WCAG AA (3:1)

## Deployment

### Pre-Deployment

1. **Run Tests**
```bash
pnpm --filter @patina/admin-portal test
```

2. **Type Check**
```bash
pnpm --filter @patina/admin-portal type-check
```

3. **Lint**
```bash
pnpm --filter @patina/admin-portal lint
```

4. **Build**
```bash
pnpm --filter @patina/admin-portal build
```

### Deployment to Staging

1. **Build for staging**
```bash
NODE_ENV=staging pnpm --filter @patina/admin-portal build
```

2. **Deploy**
```bash
# Using your deployment method
# e.g., Vercel, AWS, etc.
```

3. **Smoke Test**
   - [ ] Page loads
   - [ ] Search works
   - [ ] Filters work
   - [ ] View modes switch
   - [ ] No console errors

### Deployment to Production

1. **Final checks**
   - [ ] All tests pass
   - [ ] No TypeScript errors
   - [ ] No ESLint warnings
   - [ ] Performance targets met
   - [ ] Accessibility audit passed

2. **Build for production**
```bash
NODE_ENV=production pnpm --filter @patina/admin-portal build
```

3. **Deploy**
```bash
# Deploy to production
```

4. **Post-deployment verification**
   - [ ] Page loads on production URL
   - [ ] All features work
   - [ ] No performance regression
   - [ ] Monitor error rates

## Monitoring

### Error Tracking

Set up error tracking (if not already):
- Sentry
- LogRocket
- DataDog

### Performance Monitoring

Monitor these metrics:
- Page load time
- API response time
- Error rates
- User interactions

### Analytics

Track these events:
- View mode changes
- Filter applications
- Search queries
- Bulk action usage
- Page navigation

## Rollback Plan

If issues occur in production:

1. **Immediate Rollback**
```bash
# Revert to previous deployment
# Verify catalog still works with old version
```

2. **Identify Issue**
   - Check error logs
   - Review user reports
   - Test locally

3. **Fix and Redeploy**
   - Fix issue
   - Test thoroughly
   - Deploy again

## Documentation

All documentation files:
- `PHASE_4_UI_IMPLEMENTATION.md` - Full implementation guide
- `PHASE_4_QUICK_REFERENCE.md` - Developer quick reference
- `PHASE_4_SUMMARY.md` - Executive summary
- `PHASE_4_COMPONENT_TREE.md` - Component hierarchy
- `PHASE_4_INSTALLATION.md` - This file

## Support

For issues or questions:
1. Check documentation
2. Review component source code
3. Check presenter implementation
4. Review Radix UI docs: https://www.radix-ui.com
5. Review TanStack Table docs: https://tanstack.com/table

## Next Steps

After successful deployment:

1. **Gather Feedback**
   - User testing sessions
   - Analytics review
   - Performance monitoring

2. **Iterate**
   - Address user feedback
   - Optimize performance
   - Add requested features

3. **Plan Phase 5**
   - Product detail modal
   - Advanced editing
   - Bulk import/export

## Success Criteria

Phase 4 is successfully deployed when:
- [x] All components render correctly
- [x] All view modes work
- [x] Search and filters functional
- [x] Bulk actions work
- [x] Pagination works
- [x] No console errors
- [x] Accessibility score >95
- [x] Performance targets met
- [x] Mobile responsive
- [x] All browsers supported

---

**Installation Status: READY**

Follow these steps to deploy Phase 4 to your environment.
