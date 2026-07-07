import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
interface AuthenticatedSocket extends Socket {
    userId?: string;
    userRole?: string;
}
export declare class WebSocketProjectsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private prisma;
    server: Server;
    private readonly logger;
    constructor(prisma: PrismaService);
    /**
     * Handle client connection
     */
    handleConnection(client: AuthenticatedSocket): Promise<void>;
    /**
     * Handle client disconnection
     */
    handleDisconnect(client: AuthenticatedSocket): Promise<void>;
    /**
     * Subscribe to project updates
     */
    handleProjectSubscribe(client: AuthenticatedSocket, data: {
        projectId: string;
    }): Promise<void>;
    /**
     * Unsubscribe from project updates
     */
    handleProjectUnsubscribe(client: AuthenticatedSocket, data: {
        projectId: string;
    }): Promise<void>;
    /**
     * Handle ping to keep connection alive
     */
    handlePing(client: AuthenticatedSocket): Promise<void>;
    /**
     * Get presence information for a project
     */
    handleGetPresence(client: AuthenticatedSocket, data: {
        projectId: string;
    }): Promise<void>;
    /**
     * Handle timeline segment updates
     */
    handleTimelineSegmentUpdate(payload: any): void;
    /**
     * Handle approval requests
     */
    handleApprovalRequested(payload: any): void;
    /**
     * Handle approval approved
     */
    handleApprovalApproved(payload: any): void;
    /**
     * Handle approval rejected
     */
    handleApprovalRejected(payload: any): void;
    /**
     * Handle approval discussion
     */
    handleApprovalDiscussed(payload: any): void;
    /**
     * Handle project status changes
     */
    handleProjectStatusChange(payload: any): void;
    /**
     * Handle activity logged
     */
    handleActivityLogged(payload: any): void;
    /**
     * Extract user ID from JWT token
     * TODO: Implement proper JWT verification
     */
    private extractUserIdFromToken;
    /**
     * Extract user role from JWT token
     */
    private extractUserRoleFromToken;
    /**
     * Verify user has access to project
     */
    private verifyProjectAccess;
    /**
     * Broadcast message to all users in a project
     */
    broadcastToProject(projectId: string, event: string, data: any): void;
    /**
     * Send message to specific user
     */
    sendToUser(userId: string, event: string, data: any): Promise<void>;
}
export {};
//# sourceMappingURL=websocket.gateway.d.ts.map