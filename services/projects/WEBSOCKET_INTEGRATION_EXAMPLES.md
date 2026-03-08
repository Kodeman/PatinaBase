# WebSocket Integration Examples

This guide shows how to integrate real-time WebSocket updates into your React components using the provided utilities.

## Table of Contents

1. [Approvals Page Integration](#approvals-page-integration)
2. [Documents Page Integration](#documents-page-integration)
3. [Project Dashboard Integration](#project-dashboard-integration)
4. [Connection Status Component](#connection-status-component)

## Approvals Page Integration

### Step 1: Add WebSocket Hook

```tsx
'use client';

import { useWebSocket, useOptimisticUpdate } from '@patina/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

export default function ApprovalsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // WebSocket connection with real-time updates
  const { isConnected, connectionQuality, subscribe, unsubscribe } = useWebSocket(
    {
      namespace: '/projects',
      url: process.env.NEXT_PUBLIC_PROJECTS_API_URL,
      onConnect: () => {
        console.log('WebSocket connected');
        toast({
          title: 'Connected',
          description: 'Real-time updates are now active',
          duration: 2000,
        });
      },
      onDisconnect: () => {
        console.log('WebSocket disconnected');
      },
      onQueuedMessages: (messages) => {
        // Handle messages received while offline
        console.log(`Received ${messages.length} queued messages`);
        messages.forEach((msg) => {
          // Process each queued message
          if (msg.event === 'approval:created' || msg.event === 'approval:approved') {
            queryClient.invalidateQueries({ queryKey: ['client-approvals'] });
          }
        });
      },
    },
    {
      // Real-time event handlers
      'approval:created': (data) => {
        // New approval created
        queryClient.setQueryData(['client-approvals'], (old: Approval[]) =>
          [data.approval, ...(old || [])]
        );

        toast({
          title: 'New Approval',
          description: data.approval.title,
          action: <button onClick={() => handleApprovalClick(data.approval)}>Review</button>,
        });
      },

      'approval:approved': (data) => {
        // Approval approved by someone else
        queryClient.setQueryData(['client-approvals'], (old: Approval[]) =>
          old?.map(a => a.id === data.approvalId
            ? { ...a, status: 'approved', approvedBy: data.approvedBy, approvedAt: data.timestamp }
            : a
          ) || []
        );

        toast({
          title: 'Approval Updated',
          description: 'An approval has been approved',
        });
      },

      'approval:rejected': (data) => {
        // Approval rejected
        queryClient.setQueryData(['client-approvals'], (old: Approval[]) =>
          old?.map(a => a.id === data.approvalId
            ? { ...a, status: 'rejected', rejectedBy: data.rejectedBy, rejectionReason: data.reason }
            : a
          ) || []
        );
      },

      'approval:discussed': (data) => {
        // New discussion activity
        queryClient.invalidateQueries({ queryKey: ['approval-discussions', data.approvalId] });
      },
    }
  );

  // Subscribe to current project when available
  useEffect(() => {
    if (isConnected && projectId) {
      subscribe(projectId);
      return () => unsubscribe(projectId);
    }
  }, [isConnected, projectId, subscribe, unsubscribe]);

  // ... rest of component
}
```

### Step 2: Add Connection Status Indicator

```tsx
// Add to component JSX, near header
{isConnected ? (
  <div className="flex items-center gap-2 text-sm">
    <div className={`w-2 h-2 rounded-full ${
      connectionQuality === 'excellent' || connectionQuality === 'good'
        ? 'bg-green-500 animate-pulse'
        : connectionQuality === 'fair'
        ? 'bg-yellow-500'
        : 'bg-red-500'
    }`} />
    <span className="text-slate-600">Live updates active</span>
  </div>
) : (
  <div className="flex items-center gap-2 text-sm text-slate-500">
    <div className="w-2 h-2 rounded-full bg-slate-400" />
    <span>Reconnecting...</span>
  </div>
)}
```

### Step 3: Add Optimistic Updates for Approval Actions

```tsx
// Use optimistic update hook for approve action
const { mutate: optimisticApprove, isPending: isApproving } = useOptimisticUpdate({
  queryKey: ['client-approvals'],
  mutationFn: async ({ approvalId, signature }: { approvalId: string; signature?: string }) => {
    return projectsApi.approveApproval(approvalId, { signature });
  },
  updateFn: (oldData: Approval[], { approvalId }) => {
    return oldData.map(approval =>
      approval.id === approvalId
        ? { ...approval, status: 'approved', approvedAt: new Date().toISOString() }
        : approval
    );
  },
  timeout: 5000, // Roll back if no confirmation in 5 seconds
  onSuccess: () => {
    toast({ title: 'Approved', description: 'Approval submitted successfully' });
    setShowTheater(false);
  },
  onError: (error) => {
    toast({
      title: 'Error',
      description: error.message || 'Failed to approve',
      variant: 'destructive'
    });
  },
});

// Use in approval handler
const handleApprove = (approvalId: string, signature?: string) => {
  optimisticApprove({ approvalId, signature });
};
```

## Documents Page Integration

```tsx
'use client';

import { useWebSocket } from '@patina/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  const { isConnected, subscribe } = useWebSocket(
    {
      namespace: '/projects',
    },
    {
      'document:uploaded': (data) => {
        // New document uploaded
        queryClient.setQueryData(['client-documents', data.projectId], (old: Document[]) =>
          [data.document, ...(old || [])]
        );

        // Clear upload progress
        setUploadProgress(prev => {
          const next = { ...prev };
          delete next[data.documentId];
          return next;
        });

        toast({
          title: 'Document Uploaded',
          description: `${data.name} is now available`,
        });
      },

      'document:upload:progress': (data) => {
        // Update upload progress (only for current user's uploads)
        setUploadProgress(prev => ({
          ...prev,
          [data.documentId]: data.percent,
        }));
      },

      'document:version:created': (data) => {
        // New document version created
        queryClient.invalidateQueries({
          queryKey: ['document-versions', data.documentId]
        });

        toast({
          title: 'New Version',
          description: `Version ${data.version} created`,
        });
      },
    }
  );

  // Display upload progress
  return (
    <div>
      {/* Upload progress indicators */}
      {Object.entries(uploadProgress).map(([docId, percent]) => (
        <div key={docId} className="mb-2">
          <div className="flex justify-between text-sm mb-1">
            <span>Uploading...</span>
            <span>{percent}%</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      ))}

      {/* Document list */}
      {/* ... */}
    </div>
  );
}
```

## Project Dashboard Integration

```tsx
'use client';

import { useWebSocket } from '@patina/utils';
import { useQueryClient } from '@tanstack/react-query';

export default function ProjectDashboard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();

  const { isConnected, subscribe, unsubscribe } = useWebSocket(
    {
      namespace: '/projects',
    },
    {
      'task:created': (data) => {
        queryClient.invalidateQueries({ queryKey: ['project-tasks', projectId] });
        showNotification('New task created');
      },

      'task:status:changed': (data) => {
        // Update task status in real-time
        queryClient.setQueryData(['project-tasks', projectId], (old: Task[]) =>
          old?.map(task =>
            task.id === data.taskId
              ? { ...task, status: data.newStatus }
              : task
          ) || []
        );
      },

      'milestone:completed': (data) => {
        // Milestone completed - show celebration
        showMilestoneCelebration(data.milestone);
        queryClient.invalidateQueries({ queryKey: ['project-milestones', projectId] });
      },

      'project:status:changed': (data) => {
        // Project status changed
        queryClient.setQueryData(['project', projectId], (old: Project) => ({
          ...old,
          status: data.newStatus,
        }));
      },

      'rfi:created': (data) => {
        queryClient.invalidateQueries({ queryKey: ['project-rfis', projectId] });
      },

      'change_order:submitted': (data) => {
        queryClient.invalidateQueries({ queryKey: ['project-change-orders', projectId] });
        showNotification('New change order submitted');
      },

      'issue:created': (data) => {
        if (data.severity === 'critical' || data.severity === 'high') {
          showUrgentNotification('Critical issue reported', data);
        }
        queryClient.invalidateQueries({ queryKey: ['project-issues', projectId] });
      },
    }
  );

  // Subscribe to project updates
  useEffect(() => {
    if (isConnected && projectId) {
      subscribe(projectId);
      return () => unsubscribe(projectId);
    }
  }, [isConnected, projectId, subscribe, unsubscribe]);

  // ... rest of component
}
```

## Connection Status Component

Create a reusable connection status component:

```tsx
// components/connection-status.tsx
'use client';

import { useWebSocket, type ConnectionQuality } from '@patina/utils';
import { Wifi, WifiOff, Activity } from 'lucide-react';

const qualityIcons = {
  excellent: { icon: Activity, color: 'text-green-600', bg: 'bg-green-100' },
  good: { icon: Wifi, color: 'text-green-600', bg: 'bg-green-100' },
  fair: { icon: Wifi, color: 'text-yellow-600', bg: 'bg-yellow-100' },
  poor: { icon: Wifi, color: 'text-orange-600', bg: 'bg-orange-100' },
  disconnected: { icon: WifiOff, color: 'text-red-600', bg: 'bg-red-100' },
};

const qualityLabels = {
  excellent: 'Excellent Connection',
  good: 'Good Connection',
  fair: 'Fair Connection',
  poor: 'Poor Connection',
  disconnected: 'Disconnected',
};

export function ConnectionStatus() {
  const { isConnected, connectionQuality } = useWebSocket({
    namespace: '/projects',
  }, {});

  const { icon: Icon, color, bg } = qualityIcons[connectionQuality];
  const label = qualityLabels[connectionQuality];

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-white">
      <div className={`p-1 rounded-full ${bg}`}>
        <Icon className={`h-3 w-3 ${color} ${isConnected ? 'animate-pulse' : ''}`} />
      </div>
      <span className="text-xs font-medium text-slate-700">{label}</span>
    </div>
  );
}
```

## Advanced Patterns

### Presence Detection

```tsx
const { emit, isConnected } = useWebSocket(
  { namespace: '/projects' },
  {
    'presence:update': (data) => {
      // Update list of active users
      setActiveUsers(data.activeUsers);
    },
  }
);

// Request presence information
useEffect(() => {
  if (isConnected && projectId) {
    emit('presence:get', { projectId });
  }
}, [isConnected, projectId, emit]);
```

### Typing Indicators

```tsx
const [typingUsers, setTypingUsers] = useState<string[]>([]);
const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

const { emit } = useWebSocket(
  { namespace: '/projects' },
  {
    'user:typing': (data) => {
      setTypingUsers(prev => [...new Set([...prev, data.userId])]);

      // Remove user after 3 seconds of no typing
      setTimeout(() => {
        setTypingUsers(prev => prev.filter(id => id !== data.userId));
      }, 3000);
    },
  }
);

// Emit typing event
const handleInputChange = (value: string) => {
  setText(value);

  // Debounce typing indicator
  if (typingTimeoutRef.current) {
    clearTimeout(typingTimeoutRef.current);
  }

  emit('user:typing', { projectId, userId: currentUserId });

  typingTimeoutRef.current = setTimeout(() => {
    emit('user:stopped-typing', { projectId, userId: currentUserId });
  }, 1000);
};
```

### Conflict Resolution

```tsx
const { isConnected } = useWebSocket(
  { namespace: '/projects' },
  {
    'task:updated': (data) => {
      // Check for conflicts with local unsaved changes
      const localTask = getLocalTask(data.taskId);
      const hasLocalChanges = hasUnsavedChanges(localTask);

      if (hasLocalChanges) {
        // Show conflict resolution UI
        showConflictDialog({
          local: localTask,
          remote: data.task,
          onResolve: (resolved) => {
            updateTask(resolved);
          },
        });
      } else {
        // No conflict, apply remote changes
        updateTask(data.task);
      }
    },
  }
);
```

## Error Handling

```tsx
const { isConnected, reconnect } = useWebSocket(
  {
    namespace: '/projects',
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    onError: (error) => {
      console.error('WebSocket error:', error);

      // Show error to user
      toast({
        title: 'Connection Error',
        description: 'Lost connection to server. Retrying...',
        variant: 'destructive',
      });
    },
    onDisconnect: () => {
      // Show warning banner
      setShowOfflineBanner(true);
    },
    onConnect: () => {
      // Hide warning banner
      setShowOfflineBanner(false);

      // Refetch data to ensure sync
      queryClient.invalidateQueries({ queryKey: ['client-approvals'] });
    },
  },
  {}
);

// Manual reconnect button
<button onClick={reconnect} disabled={isConnected}>
  Reconnect
</button>
```

## Testing WebSocket Integration

```tsx
// __tests__/approvals-websocket.test.tsx
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from '@patina/utils';
import { io } from 'socket.io-client';

jest.mock('socket.io-client');

describe('Approvals WebSocket Integration', () => {
  it('should handle new approval events', async () => {
    const mockSocket = {
      on: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
      connected: true,
    };

    (io as jest.Mock).mockReturnValue(mockSocket);

    const onApprovalCreated = jest.fn();

    const { result } = renderHook(() =>
      useWebSocket(
        { namespace: '/projects' },
        { 'approval:created': onApprovalCreated }
      )
    );

    // Simulate receiving event
    act(() => {
      const handler = mockSocket.on.mock.calls.find(
        call => call[0] === 'approval:created'
      )[1];
      handler({ approvalId: '123', title: 'Test Approval' });
    });

    expect(onApprovalCreated).toHaveBeenCalledWith({
      approvalId: '123',
      title: 'Test Approval',
    });
  });
});
```

## Best Practices

1. **Always unsubscribe from rooms when component unmounts**
   ```tsx
   useEffect(() => {
     if (isConnected && projectId) {
       subscribe(projectId);
       return () => unsubscribe(projectId);
     }
   }, [isConnected, projectId]);
   ```

2. **Handle offline scenarios gracefully**
   - Show offline indicator
   - Queue actions for when connection returns
   - Use optimistic updates for better UX

3. **Debounce frequent events**
   - Typing indicators
   - Presence updates
   - Progress updates

4. **Use optimistic updates for mutations**
   - Immediate UI feedback
   - Automatic rollback on error
   - Confirmation via WebSocket events

5. **Monitor connection quality**
   - Show connection status to users
   - Adjust behavior based on quality
   - Log metrics for debugging

6. **Security**
   - Always authenticate WebSocket connections
   - Verify user permissions on subscriptions
   - Validate all incoming events

7. **Performance**
   - Limit number of subscriptions
   - Batch updates when possible
   - Use React.memo for components with WebSocket data
