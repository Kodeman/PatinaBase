/**
 * WebSocket Utilities
 *
 * Provides React hooks and utilities for real-time WebSocket connections
 * with connection monitoring, optimistic updates, and automatic reconnection.
 */

export { ConnectionMonitor } from './connection-monitor';
export type { ConnectionQuality, ConnectionStats } from './connection-monitor';

export { useWebSocket } from './useWebSocket';
export type {
  UseWebSocketConfig,
  WebSocketEvents,
  UseWebSocketReturn,
} from './useWebSocket';

export {
  useOptimisticUpdate,
  useOptimisticUpdateConfirmation,
} from './useOptimisticUpdate';
export type {
  UseOptimisticUpdateConfig,
  UseOptimisticUpdateReturn,
} from './useOptimisticUpdate';
