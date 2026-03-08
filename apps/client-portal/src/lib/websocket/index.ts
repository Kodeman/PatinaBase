// WebSocket service and utilities
export {
  WebSocketService,
  WebSocketEvent,
  getWebSocketService,
  disconnectWebSocket,
  type WebSocketMessage,
  type WebSocketMilestoneUpdate,
  type WebSocketApprovalUpdate,
  type WebSocketActivityUpdate,
  type WebSocketPresenceUpdate,
} from './websocket-service';

// React context and hooks
export {
  WebSocketProvider,
  useWebSocket,
  useMilestoneWebSocket,
  useActivityFeed,
  useTeamPresence,
} from './websocket-context';