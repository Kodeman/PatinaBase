/**
 * MSW handlers for Timeline API endpoints
 * Use these for integration tests and Storybook
 */

import { http, HttpResponse, delay } from 'msw';
import {
  createImmersiveTimeline,
  createMilestoneCelebration,
  createSegmentMedia,
  type ImmersiveTimeline,
  type MilestoneCelebration,
} from '../../factories';

// Default mock data
let mockTimeline: ImmersiveTimeline = createImmersiveTimeline({ projectId: 'project-123' });
let mockCelebrations: MilestoneCelebration[] = [
  createMilestoneCelebration({ id: 'milestone-1' }),
  createMilestoneCelebration({
    id: 'milestone-2',
    title: 'Manufacturing Started',
    achievementType: 'major_decision',
  }),
];

/**
 * Reset mock data to defaults
 */
export const resetTimelineMocks = () => {
  mockTimeline = createImmersiveTimeline({ projectId: 'project-123' });
  mockCelebrations = [
    createMilestoneCelebration({ id: 'milestone-1' }),
    createMilestoneCelebration({
      id: 'milestone-2',
      title: 'Manufacturing Started',
      achievementType: 'major_decision',
    }),
  ];
};

/**
 * Set custom timeline for testing
 */
export const setMockTimeline = (timeline: ImmersiveTimeline) => {
  mockTimeline = timeline;
};

/**
 * Set custom celebrations for testing
 */
export const setMockCelebrations = (celebrations: MilestoneCelebration[]) => {
  mockCelebrations = celebrations;
};

/**
 * Timeline API handlers
 */
export const timelineHandlers = [
  // GET /api/projects/:projectId/timeline/immersive
  http.get('/api/projects/:projectId/timeline/immersive', async ({ params }) => {
    const { projectId } = params;
    await delay(100); // Simulate network delay

    if (projectId === 'not-found') {
      return HttpResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    if (projectId === 'error') {
      return HttpResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }

    return HttpResponse.json({
      ...mockTimeline,
      projectId,
    });
  }),

  // GET /api/projects/:projectId/timeline/celebrations
  http.get('/api/projects/:projectId/timeline/celebrations', async ({ request, params }) => {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '5', 10);

    await delay(100);

    return HttpResponse.json(mockCelebrations.slice(0, limit));
  }),

  // GET /api/projects/:projectId/timeline/celebrations/:milestoneId
  http.get(
    '/api/projects/:projectId/timeline/celebrations/:milestoneId',
    async ({ params }) => {
      const { milestoneId } = params;
      await delay(100);

      const celebration = mockCelebrations.find((c) => c.id === milestoneId);

      if (!celebration) {
        return HttpResponse.json(
          { error: 'Celebration not found' },
          { status: 404 }
        );
      }

      return HttpResponse.json(celebration);
    }
  ),

  // POST /api/projects/:projectId/timeline/celebrations/:milestoneId/viewed
  http.post(
    '/api/projects/:projectId/timeline/celebrations/:milestoneId/viewed',
    async () => {
      await delay(50);
      return HttpResponse.json({ recorded: true });
    }
  ),

  // GET /api/projects/:projectId/timeline/segment/:segmentId/media
  http.get(
    '/api/projects/:projectId/timeline/segment/:segmentId/media',
    async ({ params }) => {
      const { segmentId } = params;
      await delay(100);

      const segmentMedia = createSegmentMedia(segmentId as string);
      return HttpResponse.json(segmentMedia);
    }
  ),

  // GET /api/projects/:projectId/timeline/progress
  http.get('/api/projects/:projectId/timeline/progress', async () => {
    await delay(100);
    return HttpResponse.json(mockTimeline.progress);
  }),

  // GET /api/projects/:projectId/timeline/upcoming
  http.get('/api/projects/:projectId/timeline/upcoming', async ({ request }) => {
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '30', 10);

    await delay(100);

    return HttpResponse.json({
      segments: mockTimeline.segments
        .filter((s) => s.status === 'in_progress')
        .slice(0, 3),
      milestones: mockTimeline.nextMilestone ? [mockTimeline.nextMilestone] : [],
      approvals: [],
      withinDays: days,
    });
  }),
];

/**
 * Error simulation handlers
 * Use these to test error states
 */
export const timelineErrorHandlers = [
  http.get('/api/projects/:projectId/timeline/immersive', async () => {
    await delay(100);
    return HttpResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }),

  http.get('/api/projects/:projectId/timeline/celebrations', async () => {
    await delay(100);
    return HttpResponse.json(
      { error: 'Failed to fetch celebrations' },
      { status: 500 }
    );
  }),
];

/**
 * Network failure handlers
 * Use these to test offline/timeout scenarios
 */
export const timelineNetworkFailureHandlers = [
  http.get('/api/projects/:projectId/timeline/immersive', async () => {
    await delay(30000); // Long delay to simulate timeout
    return HttpResponse.error();
  }),
];
