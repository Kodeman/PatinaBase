# WebSocket Setup Guide for Client Portal

## Current Status

The Client Portal currently uses a **stub implementation** for WebSocket functionality. This means:
- ✅ The app works without errors
- ✅ No connection spam in the console
- ✅ Graceful degradation to polling-based updates
- ❌ Real-time features are disabled
- ❌ Users won't see instant updates

## Why Stub Implementation?

The backend services (projects and comms) use **Socket.IO** for WebSocket connections, which requires the `socket.io-client` library. The native WebSocket API is not compatible with Socket.IO servers.

Previously, the app was trying to connect to `ws://localhost:3006/ws` which:
1. Was the wrong port (should be 3016 for projects service)
2. Was using wrong protocol (Socket.IO uses http/https, not ws/wss)
3. Was using wrong namespace (should be `/projects`, not `/ws`)
4. Was using native WebSocket instead of Socket.IO client

## Enabling Real-Time Features

### Step 1: Install Socket.IO Client

```bash
cd apps/client-portal
pnpm add socket.io-client
```

### Step 2: Update WebSocket Client

Replace `/src/lib/websocket.ts` with a proper Socket.IO implementation:

```typescript
import { io, Socket } from 'socket.io-client';
import { env } from './env';

// ... (keep existing types)

class WebSocketClient {
  private socket: Socket | null = null;
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();
  private connectionStateHandlers: Set<(connected: boolean) => void> = new Set();

  connect() {
    if (this.socket?.connected) {
      return; // Already connected
    }

    try {
      // Connect to projects service with Socket.IO
      this.socket = io(env.wsUrl, {
        path: env.wsNamespace,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        auth: {
          // Add authentication token here
          // token: getAuthToken(),
        },
      });

      this.socket.on('connect', () => {
        console.log('[WebSocket] Connected successfully');
        this.notifyConnectionState(true);
      });

      this.socket.on('disconnect', () => {
        console.log('[WebSocket] Disconnected');
        this.notifyConnectionState(false);
      });

      this.socket.on('connect_error', (error) => {
        console.error('[WebSocket] Connection error:', error.message);
        this.notifyConnectionState(false);
      });

      // Listen for project events
      this.socket.on('timeline:segment:updated', (data) => {
        this.handleMessage({ type: 'project_update', data, timestamp: new Date() });
      });

      this.socket.on('approval:requested', (data) => {
        this.handleMessage({ type: 'approval_requested', data, timestamp: new Date() });
      });

      // Add more event listeners as needed

    } catch (error) {
      console.error('[WebSocket] Connection failed:', error);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.notifyConnectionState(false);
  }

  send(event: string, data: any) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // ... (rest of the implementation)
}
```

### Step 3: Ensure Backend Services Are Running

The WebSocket connection requires the **projects service** to be running on port **3016**:

```bash
# Start infrastructure
pnpm db:up

# Start projects service
pnpm --filter @patina/projects dev
```

### Step 4: Update Environment Variables

If you have a `.env.local` file, ensure it has:

```env
# Enable real-time updates
NEXT_PUBLIC_ENABLE_REAL_TIME_UPDATES=true

# Projects service (correct port)
NEXT_PUBLIC_PROJECTS_API_URL=http://localhost:3016

# WebSocket configuration (uses http, not ws)
NEXT_PUBLIC_WS_URL=http://localhost:3016
NEXT_PUBLIC_WS_NAMESPACE=/projects

# Debug logging (optional, for development)
NEXT_PUBLIC_ENABLE_DEBUG=true
```

### Step 5: Test the Connection

1. Start the projects service
2. Start the client portal
3. Open browser console
4. Look for: `[WebSocket] Connected successfully`

## Architecture Details

### Service Ports (from CLAUDE.md)

- **user-management**: 3010
- **catalog**: 3011
- **style-profile**: 3012
- **search**: 3013
- **media**: 3014
- **orders**: 3015
- **projects**: 3016 ← WebSocket server
- **comms**: 3017 ← Alternative WebSocket server
- **notifications**: 3018

### WebSocket Namespaces

- **Projects Service**: `/projects` - Project updates, approvals, milestones
- **Comms Service**: `/messages` - Chat messages, typing indicators

### Socket.IO vs Native WebSocket

| Feature | Native WebSocket | Socket.IO |
|---------|------------------|-----------|
| Protocol | `ws://` or `wss://` | `http://` or `https://` |
| Namespaces | ❌ Not supported | ✅ Supported |
| Auto-reconnection | ❌ Manual | ✅ Automatic |
| Fallback to polling | ❌ No fallback | ✅ Automatic |
| Event-based API | ❌ Message-based | ✅ Event-based |
| Backend compatibility | ❌ Not compatible | ✅ Works with @nestjs/websockets |

## Troubleshooting

### "Failed to connect" errors

**Check:**
1. Is the projects service running? `pnpm --filter @patina/projects dev`
2. Is it running on port 3016? Check the logs
3. Is CORS configured correctly in the backend?

### "Connection refused" errors

**Possible causes:**
- Service not running
- Wrong port in configuration
- Firewall blocking the connection

### No real-time updates

**Check:**
1. Is `NEXT_PUBLIC_ENABLE_REAL_TIME_UPDATES=true`?
2. Is the WebSocket connected? Check browser console
3. Are you subscribed to the correct events?
4. Is the backend emitting events?

## Current Fallback Behavior

Without Socket.IO client installed, the app uses:
- **Polling**: TanStack Query refetches data periodically
- **Manual refresh**: Users can refresh to see updates
- **No typing indicators**: Real-time typing features disabled
- **No instant notifications**: Notifications appear on next poll

This provides a functional app without real-time features.

## Future Enhancements

Once Socket.IO is integrated, you can enable:
- ✅ Instant project updates
- ✅ Real-time approval notifications
- ✅ Typing indicators in comments
- ✅ Live presence indicators
- ✅ Instant milestone celebrations
- ✅ Real-time photo upload notifications

## Related Files

- `/apps/client-portal/src/lib/websocket.ts` - WebSocket client
- `/apps/client-portal/src/hooks/use-websocket.ts` - React hooks
- `/apps/client-portal/src/components/providers.tsx` - WebSocket provider
- `/apps/client-portal/.env.example` - Environment variables
- `/services/projects/src/websocket/websocket.gateway.ts` - Backend implementation

## Questions?

Check the following documentation:
- Socket.IO Client: https://socket.io/docs/v4/client-api/
- NestJS WebSockets: https://docs.nestjs.com/websockets/gateways
- Project CLAUDE.md: `/CLAUDE.md` - Service ports and architecture
