/**
 * Tests for useImmersiveTimeline hook
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock the WebSocket module before importing the hook
const mockUseWebSocket = jest.fn();
jest.mock('@/lib/websocket', () => ({
  useWebSocket: () => mockUseWebSocket(),
}));

import { useImmersiveTimeline, useCelebrations, useSegmentMedia, useRecordCelebrationView } from '../use-immersive-timeline';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Create a wrapper with QueryClientProvider
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// Mock data
const mockTimeline = {
  projectId: 'project-123',
  projectTitle: 'Modern Living Room',
  projectStatus: 'active',
  progress: {
    overall: 65,
    timeElapsed: 45,
    milestones: { completed: 3, total: 5, percentage: 60 },
    approvals: { approved: 8, pending: 2, total: 10, percentage: 80 },
  },
  segments: [
    {
      id: 'segment-1',
      title: 'Design Phase',
      description: 'Initial design work',
      phase: 'design',
      status: 'completed',
      progress: 100,
      startDate: '2024-01-01',
      endDate: '2024-02-15',
      order: 1,
      media: [{ id: 'media-1', url: '/image1.jpg', type: 'image' }],
      pendingApprovalsCount: 0,
      activitiesCount: 12,
    },
    {
      id: 'segment-2',
      title: 'Manufacturing',
      phase: 'production',
      status: 'in_progress',
      progress: 50,
      startDate: '2024-02-16',
      endDate: '2024-04-30',
      order: 2,
      pendingApprovalsCount: 2,
      activitiesCount: 5,
    },
  ],
  activeSegmentId: 'segment-2',
  nextMilestone: {
    id: 'milestone-1',
    title: 'First Prototype Review',
    targetDate: '2024-03-15',
    daysUntil: 15,
  },
  attentionRequired: {
    pendingApprovals: 2,
    overdueItems: 0,
    unreadMessages: 3,
  },
};

const mockCelebration = {
  id: 'milestone-1',
  title: 'Design Approved',
  description: 'All design concepts have been approved',
  completedAt: '2024-02-14T10:30:00Z',
  completedBy: 'Designer John',
  designerMessage: 'Congratulations on approving the designs!',
  achievementType: 'major_decision',
  milestoneNumber: 2,
  totalMilestones: 5,
  celebrationMedia: [{ id: 'media-c1', url: '/celebration.jpg', type: 'image' }],
};

describe('useImmersiveTimeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();

    // Set up default WebSocket mock
    mockUseWebSocket.mockReturnValue({
      onMilestoneUpdate: jest.fn(() => jest.fn()),
      onMilestoneCompleted: jest.fn(() => jest.fn()),
      onActivityUpdate: jest.fn(() => jest.fn()),
      isConnected: true,
    });
  });

  it('should return loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

    const { result } = renderHook(() => useImmersiveTimeline('project-123'), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.timeline).toBeUndefined();
  });

  it('should fetch timeline data successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockTimeline,
    });

    const { result } = renderHook(() => useImmersiveTimeline('project-123'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.timeline).toEqual(mockTimeline);
    expect(result.current.isError).toBe(false);
    expect(mockFetch).toHaveBeenCalledWith('/api/projects/project-123/timeline/immersive');
  });

  it('should handle fetch error gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const { result } = renderHook(() => useImmersiveTimeline('project-123'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.timeline).toBeUndefined();
  });

  it('should not fetch when projectId is null', () => {
    const { result } = renderHook(() => useImmersiveTimeline(null), {
      wrapper: createWrapper(),
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });

  it('should subscribe to WebSocket updates', () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockTimeline,
    });

    const onMilestoneUpdate = jest.fn(() => jest.fn());
    const onMilestoneCompleted = jest.fn(() => jest.fn());
    const onActivityUpdate = jest.fn(() => jest.fn());

    mockUseWebSocket.mockReturnValue({
      onMilestoneUpdate,
      onMilestoneCompleted,
      onActivityUpdate,
      isConnected: true,
    });

    renderHook(() => useImmersiveTimeline('project-123'), {
      wrapper: createWrapper(),
    });

    expect(onMilestoneUpdate).toHaveBeenCalled();
    expect(onMilestoneCompleted).toHaveBeenCalled();
    expect(onActivityUpdate).toHaveBeenCalled();
  });

  it('should dismiss celebration', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockTimeline,
    });

    const { result } = renderHook(() => useImmersiveTimeline('project-123'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Initial state - no celebration
    expect(result.current.showCelebration).toBeNull();

    // Dismiss should work without errors
    act(() => {
      result.current.dismissCelebration();
    });

    expect(result.current.showCelebration).toBeNull();
  });

  it('should expose refetch function', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockTimeline,
    });

    const { result } = renderHook(() => useImmersiveTimeline('project-123'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(typeof result.current.refetch).toBe('function');

    // Call refetch
    await act(async () => {
      await result.current.refetch();
    });

    // Should have called fetch twice (initial + refetch)
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('useCelebrations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  it('should fetch celebrations list', async () => {
    const celebrations = [mockCelebration];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => celebrations,
    });

    const { result } = renderHook(() => useCelebrations('project-123'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(celebrations);
    expect(mockFetch).toHaveBeenCalledWith('/api/projects/project-123/timeline/celebrations?limit=5');
  });

  it('should accept custom limit', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    renderHook(() => useCelebrations('project-123', 10), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/projects/project-123/timeline/celebrations?limit=10');
    });
  });

  it('should not fetch when projectId is null', () => {
    renderHook(() => useCelebrations(null), {
      wrapper: createWrapper(),
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('useSegmentMedia', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  it('should fetch segment media', async () => {
    const mockMedia = {
      segmentId: 'segment-1',
      media: [
        { id: 'media-1', url: '/image1.jpg', type: 'image', caption: 'Design concept' },
        { id: 'media-2', url: '/image2.jpg', type: 'image', caption: 'Color palette' },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockMedia,
    });

    const { result } = renderHook(() => useSegmentMedia('project-123', 'segment-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockMedia);
    expect(mockFetch).toHaveBeenCalledWith('/api/projects/project-123/timeline/segment/segment-1/media');
  });

  it('should not fetch when projectId is null', () => {
    renderHook(() => useSegmentMedia(null, 'segment-1'), {
      wrapper: createWrapper(),
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should not fetch when segmentId is null', () => {
    renderHook(() => useSegmentMedia('project-123', null), {
      wrapper: createWrapper(),
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('useRecordCelebrationView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  it('should record celebration view on mutation', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ recorded: true }),
    });

    const { result } = renderHook(() => useRecordCelebrationView('project-123'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync('milestone-1');
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/project-123/timeline/celebrations/milestone-1/viewed',
      { method: 'POST' }
    );
  });

  it('should handle error when recording view', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useRecordCelebrationView('project-123'), {
      wrapper: createWrapper(),
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync('milestone-1');
      })
    ).rejects.toThrow();
  });
});
