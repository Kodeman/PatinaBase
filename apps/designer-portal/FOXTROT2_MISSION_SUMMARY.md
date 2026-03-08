# Team Foxtrot2 - Mission Summary: Designer Portal UI Implementation

**Mission:** Resolve BLOCKER-002 by implementing complete Designer Portal UI
**Timeline:** 6 weeks (Weeks 11-16)
**Status:** ✅ Planning Complete, Ready for Implementation
**Date:** 2025-10-03

---

## Mission Briefing

You are **Team Foxtrot2**, tasked with implementing the complete user interface for the Patina Designer Portal. All backend services are operational (200+ API endpoints across 6 services), authentication infrastructure is ready, and API clients with React Query hooks are in place. Your mission is to build the UI that brings it all together.

### What's Already Done ✅

1. **Infrastructure (30% Complete)**
   - Next.js 15 + React 19 application structure
   - TypeScript strict mode configuration
   - API client layer (6 services) with full type safety
   - React Query hooks (16 hooks) for all backend services
   - Environment configuration with validation
   - Production-ready build configuration
   - Global styles and Tailwind CSS setup
   - Design system foundation at `/packages/patina-design-system`

2. **Backend Services (100% Complete)**
   - Style Profile Service (Port 3001) - Profiles, quiz, signals, rules
   - Search Service (Port 3002) - Search, autocomplete, similarity
   - Catalog Service (Port 3003) - Products, variants, media
   - Orders Service (Port 3005) - Cart, checkout, orders
   - Comms Service (Port 3006) - Messages, threads, attachments
   - Projects Service (Port 3007) - Tasks, RFIs, change orders

3. **Documentation (100% Complete)**
   - [BLOCKER_002_RESOLUTION_PLAN.md](./BLOCKER_002_RESOLUTION_PLAN.md) - Complete implementation roadmap
   - [TECHNICAL_SPECIFICATION.md](./TECHNICAL_SPECIFICATION.md) - Detailed technical architecture
   - [IMPLEMENTATION_QUICKSTART.md](./IMPLEMENTATION_QUICKSTART.md) - Day-by-day implementation guide
   - [API_ENDPOINTS.md](../../API_ENDPOINTS.md) - All backend API documentation
   - [Designer Portal PRD](../../docs/features/08-designer-portal/Patina_Designer_Portal_PRD_OCI.md)

### What You Need to Build 📋

**Week 11: Authentication & Core Layout**
- OIDC authentication with NextAuth + OCI Identity Domains
- Protected route middleware
- Auth pages (signin/signout/error)
- Dashboard layout with navigation
- User menu and session management
- Base UI components (Button, Input, Modal, etc.)

**Week 12-13: Core Features**
- Dashboard with metrics and activity feed
- Client Management (CRUD operations)
- Catalog Search & Browse (faceted filters, autocomplete)
- Proposal Builder (drag-and-drop board interface)
- Budget tracking and totals
- PDF export functionality

**Week 14-15: Advanced Features**
- Style Profile Visualization (charts, explainability)
- Teaching Interface (approve/reject/similar actions)
- Messaging System (real-time threads)
- Project Tracking Integration (tasks, RFIs, change orders)
- 3D model viewer for room scans

**Week 16: Polish & Deployment**
- Responsive design (mobile, tablet, desktop)
- Performance optimization (LCP ≤ 2.5s, TTI ≤ 3.5s)
- Testing (unit, integration, E2E)
- Accessibility audit (WCAG AA compliance)
- Production deployment

---

## Success Criteria

### Technical Metrics ✅
- [ ] All core workflows functional end-to-end
- [ ] Performance targets met (LCP ≤ 2.5s, TTI ≤ 3.5s, CLS < 0.1)
- [ ] Test coverage >80%
- [ ] Zero critical accessibility issues (WCAG AA)
- [ ] Responsive on mobile, tablet, desktop

### User Metrics 📊
- Time to first proposal ≤ 30 minutes (median)
- Proposal acceptance rate +10% vs baseline
- Teaching override rate -15%
- Designer satisfaction score ≥ 4.5/5

### Operational Metrics ⚙️
- 99.9% uptime
- p95 API latency < targets (search <300ms, proposals read <200ms, write <400ms)
- Error rate < 0.1%
- All privileged actions audited

---

## Implementation Resources

### 📚 Documentation (Already Created)

1. **[BLOCKER_002_RESOLUTION_PLAN.md](./BLOCKER_002_RESOLUTION_PLAN.md)**
   - Complete 6-week implementation roadmap
   - Phase breakdowns with tasks and timelines
   - Risk mitigation strategies
   - Acceptance criteria and rollout plan

2. **[TECHNICAL_SPECIFICATION.md](./TECHNICAL_SPECIFICATION.md)**
   - Detailed architecture diagrams
   - Authentication implementation (NextAuth + OIDC)
   - State management strategy (React Query + Zustand)
   - Component patterns and best practices
   - API integration patterns
   - Security implementation
   - Testing strategy

3. **[IMPLEMENTATION_QUICKSTART.md](./IMPLEMENTATION_QUICKSTART.md)**
   - Day 1: Environment setup and authentication
   - Day 2: Layout and navigation
   - Day 3-5: Core pages implementation
   - Step-by-step code examples
   - Troubleshooting guide

### 🛠 Technical Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Next.js 15 | App Router, SSR |
| React | React 19 | UI library |
| Language | TypeScript 5.3.3 | Type safety |
| Styling | Tailwind CSS 3.4 | Utility-first CSS |
| State (Server) | React Query 5 | API data, caching |
| State (Client) | Zustand 4.5 | UI state |
| Forms | React Hook Form + Zod | Form management |
| Auth | NextAuth.js 5 beta | OIDC with OCI |
| Drag & Drop | @dnd-kit | Proposal boards |
| Testing | Jest + Playwright | Unit + E2E |

### 🎨 Design System

**Package:** `@patina/design-system`
**Location:** `/home/middle/patina/packages/patina-design-system`

**Available Components:**
- Button (already implemented)
- Typography primitives
- Layout components (Box, Stack, Grid)
- Design tokens (colors, spacing, typography)

**To Build:**
- Data tables
- Form components
- Modals/Drawers
- Product cards
- File upload
- Chart components

### 🔌 API Integration

**All hooks already implemented in `/src/hooks/`:**

**Search Hooks** (`use-search.ts`):
```typescript
useSearch({ q, filters, limit, sort })
useAutocomplete(query)
useSimilarProducts(productId)
```

**Style Profile Hooks** (`use-style-profile.ts`):
```typescript
useStyleProfile(profileId)
useStyleProfileVersions(profileId)
useUpdateStyleProfile()
useCompleteQuiz()
useAddSignals()
useRestoreVersion()
```

**Project Hooks** (`use-projects.ts`):
```typescript
useProjects({ designerId })
useProject(projectId)
useCreateTask()
useUpdateTask()
useCreateRFI()
useCreateChangeOrder()
```

**Communication Hooks** (`use-comms.ts`):
```typescript
useThreads({ scope })
useThread(threadId)
useSendMessage()
useMarkRead()
```

---

## Quick Start Commands

### 1. Initial Setup (15 minutes)

```bash
# Navigate to designer portal
cd /home/middle/patina/apps/designer-portal

# Install authentication dependencies
pnpm add next-auth@beta @auth/core

# Create environment file
cp .env.example .env.local

# Generate NextAuth secret
openssl rand -base64 32

# Edit .env.local with OIDC credentials and services URLs
nano .env.local

# Start development server
pnpm dev
```

### 2. Verify Backend Services

```bash
# Check all services are running
curl http://localhost:3001/health  # Style Profile
curl http://localhost:3002/health  # Search
curl http://localhost:3003/health  # Catalog
curl http://localhost:3005/health  # Orders
curl http://localhost:3006/health  # Comms
curl http://localhost:3007/health  # Projects

# If not running, start them
cd /home/middle/patina/services
docker-compose up -d
```

### 3. First Implementation Task (Day 1)

Follow [IMPLEMENTATION_QUICKSTART.md](./IMPLEMENTATION_QUICKSTART.md) to:
1. Create `/src/lib/auth.ts` - NextAuth config
2. Create `/src/app/api/auth/[...nextauth]/route.ts` - Auth API route
3. Create `/src/middleware.ts` - Protected route middleware
4. Create `/src/app/auth/signin/page.tsx` - Sign-in page
5. Test authentication flow

---

## File Structure

```
apps/designer-portal/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/                   # Auth routes (TO BUILD)
│   │   ├── (dashboard)/              # Protected routes (TO BUILD)
│   │   │   ├── dashboard/            # Home dashboard
│   │   │   ├── clients/              # Client management
│   │   │   ├── catalog/              # Product catalog
│   │   │   ├── proposals/            # Proposals
│   │   │   ├── projects/             # Projects
│   │   │   ├── messages/             # Communications
│   │   │   └── teaching/             # Teaching interface
│   │   ├── api/auth/[...nextauth]/   # Auth API (TO BUILD)
│   │   ├── layout.tsx               # Root layout ✅
│   │   └── page.tsx                 # Landing page ✅
│   ├── components/                   # React components (TO BUILD)
│   │   ├── ui/                      # Base UI
│   │   ├── layout/                  # Nav, header, sidebar
│   │   ├── catalog/                 # Catalog components
│   │   ├── proposals/               # Proposal components
│   │   ├── projects/                # Project components
│   │   ├── clients/                 # Client components
│   │   ├── teaching/                # Teaching components
│   │   └── messages/                # Message components
│   ├── hooks/                       # Custom React hooks ✅
│   │   ├── use-search.ts            ✅
│   │   ├── use-style-profile.ts     ✅
│   │   ├── use-projects.ts          ✅
│   │   └── use-comms.ts             ✅
│   ├── lib/                         # Core libraries ✅
│   │   ├── auth.ts                  # TO BUILD
│   │   ├── api-client.ts            ✅
│   │   ├── react-query.ts           ✅
│   │   ├── env.ts                   ✅
│   │   └── utils.ts                 # TO BUILD
│   ├── stores/                      # Zustand stores (TO BUILD)
│   ├── providers/                   # Context providers ✅
│   └── types/                       # TypeScript types
├── public/                          # Static assets
├── e2e/                            # E2E tests (TO BUILD)
├── __tests__/                      # Unit tests (TO BUILD)
└── Documentation files:
    ├── BLOCKER_002_RESOLUTION_PLAN.md      ✅
    ├── TECHNICAL_SPECIFICATION.md          ✅
    ├── IMPLEMENTATION_QUICKSTART.md        ✅
    ├── FOXTROT2_MISSION_SUMMARY.md         ✅ (this file)
    ├── IMPLEMENTATION_SUMMARY.md           ✅
    ├── NEXT_STEPS.md                       ✅
    └── README.md                           ✅
```

---

## Key Workflows to Implement

### 1. Catalog Search → Add to Proposal
```
User searches catalog → Applies filters → Views product detail
→ Clicks "Add to Proposal" → Selects/creates proposal
→ Product added to board → Budget updated
```

**Components Needed:**
- SearchBar with autocomplete
- FacetFilters sidebar
- ProductGrid/ProductCard
- ProductDetailModal
- AddToProposalModal
- ProposalBoard

### 2. Client Onboarding
```
Designer creates client → Client takes style quiz
→ Profile computed → Designer views profile
→ Creates first proposal
```

**Components Needed:**
- ClientForm
- StyleProfileViewer
- QuizDisplay
- FacetChart

### 3. Proposal Creation & Approval
```
Designer creates proposal → Adds products via search/drag
→ Organizes sections → Reviews budget
→ Sends to client → Tracks approval status
```

**Components Needed:**
- ProposalForm
- ProposalBoard (drag-and-drop)
- BoardSection
- ProposalItem
- BudgetTracker
- SendProposalModal

### 4. Teaching Feedback
```
Designer browses catalog → Clicks approve/reject on product
→ Feedback sent to backend → Profile recomputed
→ Recommendations updated
```

**Components Needed:**
- ProductCard with teaching actions
- TeachingFeedbackToast
- TeachingHistory
- RuleBuilder

---

## Development Workflow

### Daily Routine

**Morning (9:00 AM):**
- Daily standup (#designer-portal-dev Slack)
- Review yesterday's progress
- Plan today's tasks

**Development:**
- Create feature branch from `main`
- Implement components/pages
- Write tests alongside code
- Run `pnpm type-check` and `pnpm lint`

**End of Day:**
- Commit progress
- Push to remote
- Update team on blockers

**Code Review:**
- All PRs require review
- Test locally before approving
- Merge to `main` when approved

### Testing Strategy

**Unit Tests (Jest + RTL):**
```bash
pnpm test
pnpm test:watch
pnpm test:coverage
```

**E2E Tests (Playwright):**
```bash
pnpm test:e2e
pnpm playwright test --ui
```

**Manual Testing:**
- Test on Chrome, Firefox, Safari
- Test on mobile (responsive)
- Test with screen reader (accessibility)

---

## Dependencies to Install (As Needed)

### Week 11 (Auth & Layout):
```bash
pnpm add next-auth@beta @auth/core
pnpm add @heroicons/react
```

### Week 12-13 (Core Features):
```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
pnpm add react-hook-form @hookform/resolvers
pnpm add @react-pdf/renderer
```

### Week 14-15 (Advanced):
```bash
pnpm add recharts
pnpm add @google/model-viewer
pnpm add date-fns
```

### Week 16 (Testing):
```bash
pnpm add -D msw
pnpm add -D @testing-library/user-event
pnpm add -D @tanstack/react-virtual
```

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| OIDC integration issues | Medium | High | Test with sandbox environment first |
| Performance with large datasets | Medium | Medium | Implement virtual scrolling early |
| Complex drag-and-drop bugs | Medium | Medium | Use established @dnd-kit patterns |
| API timeout errors | Low | Medium | Implement retry logic and error UI |
| Schedule delays | Medium | High | Prioritize MVP, defer nice-to-haves |

---

## Support & Communication

**Team Lead:** Team Foxtrot2
**Slack Channel:** `#designer-portal-dev`
**Daily Standup:** 9:00 AM
**Sprint Duration:** 1 week
**Demo Days:** End of each week

**Key Contacts:**
- Backend Services: Team Echo, Team Delta
- Design System: Team Golf
- DevOps: Team India
- Product: Designer PM

---

## Success Metrics Dashboard

Track these metrics weekly:

**Development Velocity:**
- [ ] Week 11: Auth + Layout complete
- [ ] Week 12: Dashboard + Clients complete
- [ ] Week 13: Catalog + Proposals complete
- [ ] Week 14: Style Profile + Teaching complete
- [ ] Week 15: Messaging + Projects complete
- [ ] Week 16: Testing + Optimization complete

**Quality Metrics:**
- [ ] TypeScript strict mode (0 errors)
- [ ] Lint passing (0 errors, <10 warnings)
- [ ] Test coverage >80%
- [ ] Performance: LCP ≤ 2.5s, TTI ≤ 3.5s
- [ ] Accessibility: WCAG AA (0 critical issues)

**Deployment Readiness:**
- [ ] All features functional
- [ ] Documentation complete
- [ ] E2E tests passing
- [ ] Security audit passed
- [ ] Performance targets met

---

## Next Actions (Priority Order)

### Immediate (Start Now):
1. ✅ Read this mission summary
2. ✅ Review [IMPLEMENTATION_QUICKSTART.md](./IMPLEMENTATION_QUICKSTART.md)
3. ⏳ Set up development environment
4. ⏳ Install NextAuth dependencies
5. ⏳ Configure OIDC with OCI Identity Domains
6. ⏳ Implement authentication flow

### Week 11 (Days 1-5):
7. Build auth pages
8. Create navigation components
9. Implement dashboard layout
10. Build dashboard page
11. Create base UI components

### Week 12-13:
12. Client management module
13. Catalog search implementation
14. Proposal builder
15. Drag-and-drop board

### Continuous:
- Write tests alongside features
- Update documentation
- Performance monitoring
- Code reviews

---

## Closing Remarks

You have everything you need to succeed:

✅ **Infrastructure:** Complete Next.js app with API clients and hooks
✅ **Backend:** All 6 services operational with 200+ endpoints
✅ **Documentation:** Comprehensive guides and specifications
✅ **Design System:** Foundation components and tokens
✅ **Support:** Full team backing and clear communication channels

**Your mission is clear:** Build the UI that brings the Patina platform to life for interior designers.

**Timeline is achievable:** 6 weeks with well-defined milestones and deliverables.

**Success is measurable:** Clear technical and user metrics to track progress.

**Let's ship this! 🚀**

---

## Quick Reference Links

- **Implementation Plan:** [BLOCKER_002_RESOLUTION_PLAN.md](./BLOCKER_002_RESOLUTION_PLAN.md)
- **Technical Spec:** [TECHNICAL_SPECIFICATION.md](./TECHNICAL_SPECIFICATION.md)
- **Quick Start:** [IMPLEMENTATION_QUICKSTART.md](./IMPLEMENTATION_QUICKSTART.md)
- **API Docs:** [API_ENDPOINTS.md](../../API_ENDPOINTS.md)
- **PRD:** [Designer Portal PRD](../../docs/features/08-designer-portal/Patina_Designer_Portal_PRD_OCI.md)
- **Design System:** [Design System README](../../packages/patina-design-system/README.md)

**Application Location:** `/home/middle/patina/apps/designer-portal`
**Services Location:** `/home/middle/patina/services`

---

**Generated:** 2025-10-03
**Team:** Foxtrot2 - Designer Portal UI Implementation
**Status:** 🟢 Ready for Implementation
**Next Review:** End of Week 11

---

*Good luck, Team Foxtrot2. Make it great!* ⚡
