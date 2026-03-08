# BLOCKER-002 Resolution Plan: Designer Portal UI Implementation

**Team:** Foxtrot2 - Designer Portal UI Implementation Team
**Timeline:** 6 weeks (Weeks 11-16)
**Generated:** 2025-10-03
**Status:** Ready for Implementation

---

## Executive Summary

The Designer Portal foundation is **complete** with all infrastructure, API clients, React Query hooks, and build configuration in place. This plan outlines the systematic implementation of all UI components and workflows to deliver a fully functional Designer Portal.

### Current State Assessment

✅ **COMPLETED (Foundation - 30%)**
- Next.js 15 + React 19 application structure
- TypeScript strict mode configuration
- API client layer (6 services) with type safety
- React Query hooks (16 hooks) for all backend services
- Environment configuration with validation
- Production build optimization
- Global styles and theming

🚧 **IN PROGRESS (5%)**
- Root layout with providers (basic implementation exists)

📋 **PENDING (65%)**
- Complete UI implementation across all modules
- Authentication flows
- All core workflows and features

---

## Implementation Phases

### **Phase 1: Authentication & Core Layout (Week 11)**
**Priority: CRITICAL** | **Complexity: Medium** | **Estimated Effort: 5-7 days**

#### Tasks:

**1.1 Authentication Setup (Days 1-2)**
```bash
# Install dependencies
cd /home/middle/patina/apps/designer-portal
pnpm add next-auth@beta @auth/core
```

**Files to Create:**
- `/src/lib/auth.ts` - NextAuth configuration with OCI Identity Domains OIDC
- `/src/app/api/auth/[...nextauth]/route.ts` - Auth API route handler
- `/src/middleware.ts` - Protected route middleware
- `/src/app/auth/signin/page.tsx` - Sign-in page
- `/src/app/auth/error/page.tsx` - Auth error page
- `/src/app/auth/signout/page.tsx` - Sign-out confirmation

**1.2 Navigation & Layout (Days 3-4)**

**Files to Create:**
- `/src/components/layout/nav.tsx` - Main navigation component
- `/src/components/layout/header.tsx` - Header with user menu
- `/src/components/layout/sidebar.tsx` - Collapsible sidebar (mobile/desktop)
- `/src/components/layout/user-menu.tsx` - User dropdown menu
- `/src/app/(dashboard)/layout.tsx` - Protected dashboard layout
- `/src/lib/utils.ts` - Utility functions (cn, formatters)

**Navigation Structure:**
```typescript
const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'Clients', href: '/clients', icon: UsersIcon },
  { name: 'Catalog', href: '/catalog', icon: GridIcon },
  { name: 'Proposals', href: '/proposals', icon: DocumentIcon },
  { name: 'Projects', href: '/projects', icon: FolderIcon },
  { name: 'Messages', href: '/messages', icon: MessageIcon },
  { name: 'Teaching', href: '/teaching', icon: AcademicCapIcon },
];
```

**1.3 Essential UI Components from Design System (Days 5-7)**

Leverage existing Button component, create additional:
- Input, Textarea, Select components
- Modal/Dialog component
- Dropdown Menu component
- Table component
- Card component
- Badge/Tag components
- Toast/Notification system
- Loading Spinner/Skeleton

**Success Criteria:**
- ✅ Users can sign in with OCI Identity Domains
- ✅ Protected routes redirect unauthenticated users
- ✅ Navigation works across all sections
- ✅ Responsive layout on mobile, tablet, desktop

---

### **Phase 2: Core Pages & Workflows (Weeks 12-13)**
**Priority: CRITICAL** | **Complexity: High** | **Estimated Effort: 10-12 days**

#### **2.1 Dashboard (Days 1-2)**

**File:** `/src/app/(dashboard)/dashboard/page.tsx`

**Features:**
- Key metrics cards (active clients, proposals, projects, messages)
- Recent activity feed
- Quick actions (new client, new proposal)
- Proposal status overview
- Teaching impact summary
- Notifications/alerts panel

**Components to Create:**
- `/src/components/dashboard/stats-card.tsx`
- `/src/components/dashboard/activity-feed.tsx`
- `/src/components/dashboard/quick-actions.tsx`
- `/src/components/dashboard/proposal-status-overview.tsx`

#### **2.2 Client Management Module (Days 3-5)**

**Files to Create:**
- `/src/app/(dashboard)/clients/page.tsx` - Client list with search/filter
- `/src/app/(dashboard)/clients/[id]/page.tsx` - Client detail view
- `/src/app/(dashboard)/clients/[id]/style-profile/page.tsx` - Style profile view
- `/src/app/(dashboard)/clients/[id]/proposals/page.tsx` - Client proposals
- `/src/app/(dashboard)/clients/new/page.tsx` - Create client form

**Components:**
- `/src/components/clients/client-list.tsx` - Data table with filters
- `/src/components/clients/client-card.tsx` - Client summary card
- `/src/components/clients/client-form.tsx` - Create/edit client form
- `/src/components/clients/style-profile-viewer.tsx` - Profile visualization

**Features:**
- Sortable/filterable data table
- Search by name, email
- View client details with style profile
- Create/edit client profiles
- View client project history

#### **2.3 Catalog Search & Browse (Days 6-8)**

**Files to Create:**
- `/src/app/(dashboard)/catalog/page.tsx` - Main catalog page
- `/src/app/(dashboard)/catalog/[id]/page.tsx` - Product detail modal/page

**Components:**
- `/src/components/catalog/search-bar.tsx` - Search input with autocomplete
- `/src/components/catalog/facet-filters.tsx` - Sidebar filters
- `/src/components/catalog/product-grid.tsx` - Product grid/list view
- `/src/components/catalog/product-card.tsx` - Product card with actions
- `/src/components/catalog/product-detail.tsx` - Product detail drawer
- `/src/components/catalog/similar-products.tsx` - Similar products panel

**Features:**
- Full-text search with autocomplete (useAutocomplete hook)
- Faceted filters (category, brand, price, material, color, tags)
- Product grid/list toggle
- Quick actions: Add to proposal, Like, Find similar
- Product detail modal with variants
- 3D model viewer (if available)
- Sort by relevance, price, newest

**Hooks to Use:**
- `useSearch(params)` - Main search
- `useAutocomplete(query)` - Typeahead
- `useSimilarProducts(productId)` - Similar items

#### **2.4 Proposal Builder (Days 9-12)**

**Files to Create:**
- `/src/app/(dashboard)/proposals/page.tsx` - Proposals list
- `/src/app/(dashboard)/proposals/[id]/page.tsx` - Proposal board view
- `/src/app/(dashboard)/proposals/[id]/edit/page.tsx` - Edit mode
- `/src/app/(dashboard)/proposals/new/page.tsx` - Create proposal

**Components:**
- `/src/components/proposals/proposal-list.tsx` - Proposals data table
- `/src/components/proposals/proposal-board.tsx` - Board with sections
- `/src/components/proposals/board-section.tsx` - Board section component
- `/src/components/proposals/proposal-item.tsx` - Item in board
- `/src/components/proposals/budget-tracker.tsx` - Budget visualization
- `/src/components/proposals/proposal-actions.tsx` - Send, export, version
- `/src/components/proposals/version-diff.tsx` - Version comparison view

**Features:**
- Drag-and-drop board interface (use `@dnd-kit/core`)
- Create proposal with client, budget, due date
- Add products from catalog (drag from search)
- Organize by sections (Sofa, Lighting, etc.)
- Real-time budget tracking
- Notes and annotations
- PDF export
- Send to client for approval
- Proposal versioning with diff view

**Additional Dependencies:**
```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
pnpm add @react-pdf/renderer # For PDF generation
```

**Success Criteria:**
- ✅ Dashboard shows accurate metrics and activity
- ✅ Client CRUD operations work end-to-end
- ✅ Catalog search with facets returns results <300ms (p95)
- ✅ Proposal creation workflow complete
- ✅ Drag-and-drop board functional

---

### **Phase 3: Advanced Features (Weeks 14-15)**
**Priority: HIGH** | **Complexity: High** | **Estimated Effort: 10-12 days**

#### **3.1 Style Profile Visualization (Days 1-2)**

**Components:**
- `/src/components/style-profile/profile-overview.tsx` - Top facets display
- `/src/components/style-profile/facet-chart.tsx` - Visual facet scores
- `/src/components/style-profile/quiz-results.tsx` - Quiz answers view
- `/src/components/style-profile/constraints-display.tsx` - Budget/constraints
- `/src/components/style-profile/rationale-list.tsx` - Explainability

**Features:**
- Display top style facets with confidence scores
- Visual charts (bar, radar) for facet distribution
- Quiz results visualization
- Budget band and constraints display
- Recommendation rationale

**Hooks to Use:**
- `useStyleProfile(profileId)` - Get profile
- `useStyleProfileVersions(profileId)` - Version history

#### **3.2 Teaching Interface Integration (Days 3-5)**

**Files to Create:**
- `/src/app/(dashboard)/teaching/page.tsx` - Teaching dashboard
- `/src/app/(dashboard)/teaching/feedback/page.tsx` - Feedback history
- `/src/app/(dashboard)/teaching/labels/page.tsx` - Label management
- `/src/app/(dashboard)/teaching/rules/page.tsx` - Rules builder

**Components:**
- `/src/components/teaching/quick-actions.tsx` - Approve/Reject/Similar buttons
- `/src/components/teaching/bulk-teaching.tsx` - Bulk label application
- `/src/components/teaching/feedback-history.tsx` - Teaching history
- `/src/components/teaching/rule-builder.tsx` - Visual rule builder

**Features:**
- Inline quick actions on product cards (approve/reject/maybe)
- Bulk teaching mode
- Teaching history view
- Rule creation with predicate builder
- Impact preview

**Teaching Actions:**
- Approve product → boost in recommendations
- Reject product → avoid in recommendations
- Find similar → show alternatives
- Add labels → categorize for rules

#### **3.3 Messaging Interface (Days 6-8)**

**Files to Create:**
- `/src/app/(dashboard)/messages/page.tsx` - Message threads list
- `/src/app/(dashboard)/messages/[threadId]/page.tsx` - Conversation view

**Components:**
- `/src/components/messages/thread-list.tsx` - Threads with unread counts
- `/src/components/messages/message-thread.tsx` - Conversation view
- `/src/components/messages/message-composer.tsx` - Send message form
- `/src/components/messages/message-item.tsx` - Individual message
- `/src/components/messages/attachment-upload.tsx` - File attachments

**Features:**
- Thread list by client/proposal/project
- Conversation view with history
- Send messages with attachments
- Real-time updates (polling or WebSocket)
- Unread counts and notifications
- Message search
- Archive threads

**Hooks to Use:**
- `useThreads({ scope })` - List threads
- `useThread(threadId)` - Thread detail with auto-refresh
- `useSendMessage()` - Send message mutation
- `useMarkRead()` - Mark as read

#### **3.4 Project Tracking Integration (Days 9-10)**

**Files to Create:**
- `/src/app/(dashboard)/projects/page.tsx` - Projects list
- `/src/app/(dashboard)/projects/[id]/page.tsx` - Project detail
- `/src/app/(dashboard)/projects/[id]/tasks/page.tsx` - Tasks kanban
- `/src/app/(dashboard)/projects/[id]/rfis/page.tsx` - RFIs list
- `/src/app/(dashboard)/projects/[id]/change-orders/page.tsx` - Change orders

**Components:**
- `/src/components/projects/project-list.tsx`
- `/src/components/projects/kanban-board.tsx` - Tasks board
- `/src/components/projects/task-card.tsx`
- `/src/components/projects/rfi-form.tsx`
- `/src/components/projects/change-order-form.tsx`

**Features:**
- Project list with status filters
- Kanban board for tasks
- Create/update tasks
- RFI workflow
- Change order requests
- Issue tracking

**Hooks to Use:**
- `useProjects({ designerId })` - List projects
- `useProject(projectId)` - Project detail
- `useCreateTask()` - Add task
- `useUpdateTask()` - Update task
- `useCreateRFI()` - Create RFI
- `useCreateChangeOrder()` - Create change order

**Success Criteria:**
- ✅ Style profile displays with visual charts
- ✅ Teaching actions update recommendations within 60s
- ✅ Real-time messaging functional
- ✅ Project tracking integrated with proposals

---

### **Phase 4: Polish, Testing & Optimization (Week 16)**
**Priority: HIGH** | **Complexity: Medium** | **Estimated Effort: 5-7 days**

#### **4.1 Responsive Design (Days 1-2)**

**Tasks:**
- Mobile-first CSS refinement
- Tablet layout optimization
- Desktop multi-column layouts
- Touch-friendly interactions (minimum 44px touch targets)
- Mobile navigation (drawer/hamburger)
- Responsive tables (horizontal scroll or cards on mobile)

**Breakpoints:**
```typescript
const breakpoints = {
  sm: '640px',   // Mobile landscape
  md: '768px',   // Tablet
  lg: '1024px',  // Desktop
  xl: '1280px',  // Large desktop
  '2xl': '1536px' // Extra large
}
```

#### **4.2 Performance Optimization (Days 3-4)**

**Tasks:**
- Code splitting per route (Next.js automatic)
- Lazy loading for heavy components
- Image optimization (next/image with AVIF/WebP)
- API response caching (React Query)
- Debounced search inputs
- Virtual scrolling for long lists (react-virtual)
- Bundle analysis and reduction

**Performance Targets:**
- LCP ≤ 2.5s (Largest Contentful Paint)
- TTI ≤ 3.5s (Time to Interactive)
- CLS < 0.1 (Cumulative Layout Shift)
- Search API p95 < 300ms
- Proposals read p95 < 200ms
- Proposals write p95 < 400ms

**Optimization Checklist:**
```bash
# Install performance tools
pnpm add @next/bundle-analyzer
pnpm add react-virtual

# Analyze bundle
ANALYZE=true pnpm build
```

#### **4.3 Testing Implementation (Days 5-6)**

**Unit Tests:**
```bash
# Test files to create
/src/hooks/__tests__/use-search.test.ts
/src/hooks/__tests__/use-style-profile.test.ts
/src/hooks/__tests__/use-projects.test.ts
/src/hooks/__tests__/use-comms.test.ts
/src/components/__tests__/catalog/product-card.test.tsx
/src/components/__tests__/proposals/proposal-board.test.tsx
/src/lib/__tests__/utils.test.ts
```

**Integration Tests:**
- Mock API responses with MSW
- Test critical user flows
- Test error handling

**E2E Tests (Playwright):**
```bash
# Test files to create
/e2e/auth.spec.ts              # Login flow
/e2e/catalog-search.spec.ts    # Search → add to proposal
/e2e/proposal-creation.spec.ts # Complete proposal workflow
/e2e/teaching.spec.ts          # Teaching feedback
/e2e/client-management.spec.ts # Client CRUD
```

**Test Coverage Goals:**
- Unit tests: 80%+ coverage
- Integration tests: All API hooks
- E2E tests: All critical workflows
- Accessibility tests: WCAG AA compliance

#### **4.4 Documentation (Day 7)**

**Files to Create/Update:**
- `/apps/designer-portal/README.md` - Updated with complete features
- `/apps/designer-portal/DEPLOYMENT.md` - Deployment guide
- `/apps/designer-portal/TESTING.md` - Testing guide
- `/apps/designer-portal/TROUBLESHOOTING.md` - Common issues
- `/apps/designer-portal/CHANGELOG.md` - Version history
- Storybook stories for all components

**Success Criteria:**
- ✅ Responsive on all device sizes
- ✅ Performance targets met
- ✅ Test coverage >80%
- ✅ Documentation complete

---

## Technical Architecture

### **Frontend Stack**
- **Framework:** Next.js 15 (App Router)
- **React:** 19.x
- **TypeScript:** 5.3.3 (strict mode)
- **Styling:** Tailwind CSS 3.4
- **State Management:**
  - React Query v5 (server state)
  - Zustand (client state)
- **Forms:** React Hook Form + Zod validation
- **Drag & Drop:** @dnd-kit/core
- **Testing:** Jest + React Testing Library + Playwright
- **Design System:** @patina/design-system

### **API Integration**
All API clients are already implemented:

1. **Catalog Service** (Port 3003) - Products, variants, media
2. **Search Service** (Port 3002) - Search, autocomplete, similarity
3. **Style Profile Service** (Port 3001) - Profiles, quiz, signals
4. **Orders Service** (Port 3005) - Cart, checkout
5. **Comms Service** (Port 3006) - Messages, threads
6. **Projects Service** (Port 3007) - Tasks, RFIs, change orders

### **Authentication Flow**
```
User → Sign In Page → OCI Identity Domains (OIDC)
→ Auth Callback → NextAuth Session → Protected Dashboard
```

**Auth Configuration:**
- OIDC provider: OCI Identity Domains
- Session management: NextAuth.js
- Token storage: HTTP-only cookies
- Token refresh: Automatic via NextAuth

---

## Component Library Strategy

### **Use Existing from @patina/design-system:**
- Button (already exists)
- Typography components
- Layout primitives (Box, Stack, Grid)
- Design tokens

### **Build Custom for Designer Portal:**
- Data tables (sortable, filterable)
- Drag-and-drop board
- Product cards
- Proposal board sections
- File upload with preview
- 3D model viewer
- Chart components (facet visualization)

### **Consider shadcn/ui for Rapid Development:**
```bash
# Optional: Use shadcn/ui for common patterns
npx shadcn-ui@latest init
npx shadcn-ui@latest add dialog dropdown-menu table tabs form
```

---

## Dependencies to Add

### **Core UI Libraries:**
```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
pnpm add react-hook-form @hookform/resolvers
pnpm add recharts # For charts
pnpm add react-virtual # For virtual scrolling
pnpm add date-fns # Date utilities
```

### **PDF & Media:**
```bash
pnpm add @react-pdf/renderer
pnpm add @google/model-viewer # For 3D models
```

### **Testing:**
```bash
pnpm add -D msw # Mock Service Worker
pnpm add -D @testing-library/user-event
```

---

## Key Workflows Implementation

### **1. Catalog Search → Add to Proposal**
```typescript
// User flow:
1. Navigate to /catalog
2. Enter search query (useSearch hook)
3. Apply facet filters
4. View product details
5. Click "Add to Proposal"
6. Select proposal or create new
7. Product added to board (useMutation)
```

### **2. Client Onboarding**
```typescript
// User flow:
1. Navigate to /clients/new
2. Fill client form (name, email, phone)
3. Select style quiz (optional)
4. Submit (useCreateClient mutation)
5. Redirect to client detail
6. View style profile when quiz completed
```

### **3. Proposal Creation & Approval**
```typescript
// User flow:
1. Navigate to /proposals/new
2. Select client
3. Set budget and due date
4. Search catalog and drag products to board
5. Organize into sections
6. Add notes and annotations
7. Review totals
8. Send for client approval
9. Track approval status
```

### **4. Teaching Feedback**
```typescript
// User flow:
1. Browse catalog
2. Click "Approve" on product card
3. Feedback sent to Teaching service
4. Recommendations updated within 60s
5. View teaching history in /teaching
```

---

## Risk Mitigation

### **Technical Risks:**

| Risk | Mitigation |
|------|------------|
| Performance degradation with large datasets | Implement virtual scrolling, pagination, lazy loading |
| Real-time messaging latency | Use WebSocket fallback to polling, show optimistic UI |
| Complex drag-and-drop bugs | Thorough testing with @dnd-kit, use established patterns |
| OIDC integration issues | Test with OCI sandbox environment first |
| API timeout errors | Implement retry logic, show user-friendly errors |

### **Schedule Risks:**

| Risk | Mitigation |
|------|------------|
| Underestimated complexity | Prioritize MVP features, defer nice-to-haves |
| Dependency delays | Use mock data to unblock frontend work |
| Testing bottleneck | Write tests alongside implementation |
| Integration issues | Daily integration testing with backend |

---

## Success Metrics

### **Technical Metrics:**
- ✅ All core workflows functional
- ✅ Performance targets met (LCP ≤ 2.5s, TTI ≤ 3.5s)
- ✅ Test coverage >80%
- ✅ Zero critical accessibility issues (WCAG AA)
- ✅ Mobile, tablet, desktop responsive

### **User Metrics (Post-Launch):**
- Time to first proposal ≤ 30 minutes (median)
- Proposal acceptance rate +10% vs baseline
- Teaching override rate -15%
- Designer satisfaction score ≥ 4.5/5

### **Operational Metrics:**
- 99.9% uptime
- p95 API latency < targets
- Error rate < 0.1%
- All privileged actions audited

---

## Acceptance Criteria

### **Must Have (MVP):**
- ✅ OIDC authentication with OCI Identity Domains
- ✅ Protected routes with RBAC
- ✅ Dashboard with key metrics
- ✅ Client management (CRUD)
- ✅ Catalog search with facets
- ✅ Proposal creation and board interface
- ✅ Style profile visualization
- ✅ Teaching interface integration
- ✅ Messaging with clients
- ✅ Responsive design (mobile, tablet, desktop)
- ✅ Performance targets met
- ✅ Accessibility WCAG AA
- ✅ E2E test coverage for critical flows

### **Should Have (Post-MVP):**
- 🔲 Advanced project tracking UI
- 🔲 Real-time multiplayer features
- 🔲 Offline support
- 🔲 Advanced analytics dashboard
- 🔲 Custom report builder

### **Could Have (Future):**
- 🔲 Mobile app (React Native)
- 🔲 Voice interface
- 🔲 AR/VR integration
- 🔲 AI assistant

---

## Rollout Plan

### **Week 11:**
- Deploy authentication to staging
- Internal team testing

### **Week 12-13:**
- Deploy core pages to staging
- Alpha testing with select designers

### **Week 14-15:**
- Deploy advanced features
- Beta testing with 10-20 designers

### **Week 16:**
- Final polish and optimization
- Production deployment (phased rollout)
- 10% → 25% → 50% → 100% over 2 weeks

### **Post-Launch:**
- Monitor performance metrics
- Gather user feedback
- Iterate based on data

---

## Next Immediate Steps

1. **Install NextAuth dependencies** and configure OIDC
2. **Create auth middleware** and protected routes
3. **Build navigation components** and dashboard layout
4. **Implement dashboard page** with metrics
5. **Begin client management module**

**First Command to Run:**
```bash
cd /home/middle/patina/apps/designer-portal
pnpm add next-auth@beta @auth/core
```

---

## Resources

### **Documentation:**
- [Designer Portal PRD](/home/middle/patina/docs/features/08-designer-portal/Patina_Designer_Portal_PRD_OCI.md)
- [API Endpoints](/home/middle/patina/API_ENDPOINTS.md)
- [Next Steps Guide](/home/middle/patina/apps/designer-portal/NEXT_STEPS.md)
- [Implementation Summary](/home/middle/patina/apps/designer-portal/IMPLEMENTATION_SUMMARY.md)

### **Backend Services:**
- Style Profile: http://localhost:3001
- Search: http://localhost:3002
- Catalog: http://localhost:3003
- Orders: http://localhost:3005
- Comms: http://localhost:3006
- Projects: http://localhost:3007

### **Design System:**
- Package: `@patina/design-system`
- Storybook: TBD
- Components: 80+ production-ready

---

**Status:** ✅ Ready for Implementation
**Blocking Issues:** None
**Team Lead:** Team Foxtrot2
**Next Review:** End of Week 11

---

*Last Updated: 2025-10-03*
