# Testing the Client Portal

## Quick Start (No Backend Required)

The Client Portal includes mock data for testing the UI without needing backend services.

### 1. Start the Development Server

The dev server is already running at:
- **URL:** http://localhost:3002
- **Port:** 3002

### 2. Test with Mock Data

Mock data is available in `/src/lib/mock-data.ts` including:
- ✅ Test project: "Modern Mountain Retreat"
- ✅ 4 milestones (1 completed, 1 in progress, 2 pending)
- ✅ 2 approval records
- ✅ Timeline segments
- ✅ Sample photos
- ✅ Mock designer profile

### 3. Available Test Routes

| Route | Description |
|-------|-------------|
| `/` | Landing/Home page |
| `/projects` | Projects list (will show mock project) |
| `/project/test-project-1` | Project detail page |
| `/project/test-project-1/milestone/milestone-1` | Milestone detail |
| `/project/test-project-1/approval/approval-1` | Approval detail |
| `/settings` | Client settings |
| `/notifications` | Notifications |

### 4. Testing Features

You can test these features with mock data:

#### Immersive Timeline
- View project timeline with interactive segments
- See milestones and their status
- Navigate through project phases

#### Approval Theater
- Review design concepts and furniture selections
- See before/after comparisons
- Test approval workflows

#### Milestone Celebrations
- Experience milestone completion animations
- View achievement badges
- See progress tracking

#### Media Galleries
- Browse project photos
- View image carousels
- Test lightbox functionality

### 5. Mock Authentication

The app is configured to work without authentication in development mode:
- **Client ID:** `client-123`
- **Email:** `client@example.com`
- **Name:** Demo Client

## Testing with Real Backend (Optional)

If you want to test with real data, you'll need to:

1. **Set up PostgreSQL database:**
   ```bash
   # Create database
   createdb patina_projects
   ```

2. **Configure environment:**
   ```bash
   cd services/projects
   cp .env.example .env
   # Edit .env with your DATABASE_URL
   ```

3. **Run migrations:**
   ```bash
   cd services/projects
   pnpm prisma:migrate
   ```

4. **Seed the database:**
   ```bash
   cd services/projects
   pnpm prisma:seed
   ```

5. **Start the Projects service:**
   ```bash
   cd services/projects
   pnpm dev
   ```

## Troubleshooting

### Port Already in Use
If port 3002 is already in use:
```bash
PORT=3003 pnpm dev
```

### WebSocket Errors
WebSocket errors are expected when the backend is not running. These are non-blocking and the app will work fine without real-time updates.

### Auth Errors
If you see auth errors, ensure `.env.local` has:
```
AUTH_SECRET=dev-secret-change-in-production-min-32-chars-required
```

## Next Steps

1. Explore the UI components
2. Test the interactive timeline
3. Try the approval workflows
4. Check mobile responsiveness
5. Test different viewport sizes

For full functionality with real-time updates, set up the backend services as described above.
