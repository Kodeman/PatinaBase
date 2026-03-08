"use strict";
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketProjectsGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
let WebSocketProjectsGateway = (() => {
    let _classDecorators = [(0, websockets_1.WebSocketGateway)({
            cors: {
                origin: process.env.CORS_ORIGIN || '*',
                credentials: true,
            },
            namespace: '/projects',
        })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _server_decorators;
    let _server_initializers = [];
    let _server_extraInitializers = [];
    let _handleProjectSubscribe_decorators;
    let _handleProjectUnsubscribe_decorators;
    let _handlePing_decorators;
    let _handleGetPresence_decorators;
    let _handleTimelineSegmentUpdate_decorators;
    let _handleApprovalRequested_decorators;
    let _handleApprovalApproved_decorators;
    let _handleApprovalRejected_decorators;
    let _handleApprovalDiscussed_decorators;
    let _handleProjectStatusChange_decorators;
    let _handleActivityLogged_decorators;
    var WebSocketProjectsGateway = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _server_decorators = [(0, websockets_1.WebSocketServer)()];
            _handleProjectSubscribe_decorators = [(0, websockets_1.SubscribeMessage)('subscribe:project')];
            _handleProjectUnsubscribe_decorators = [(0, websockets_1.SubscribeMessage)('unsubscribe:project')];
            _handlePing_decorators = [(0, websockets_1.SubscribeMessage)('ping')];
            _handleGetPresence_decorators = [(0, websockets_1.SubscribeMessage)('presence:get')];
            _handleTimelineSegmentUpdate_decorators = [(0, event_emitter_1.OnEvent)('timeline.segment.updated')];
            _handleApprovalRequested_decorators = [(0, event_emitter_1.OnEvent)('approval.requested')];
            _handleApprovalApproved_decorators = [(0, event_emitter_1.OnEvent)('approval.approved')];
            _handleApprovalRejected_decorators = [(0, event_emitter_1.OnEvent)('approval.rejected')];
            _handleApprovalDiscussed_decorators = [(0, event_emitter_1.OnEvent)('approval.discussed')];
            _handleProjectStatusChange_decorators = [(0, event_emitter_1.OnEvent)('project.status_changed')];
            _handleActivityLogged_decorators = [(0, event_emitter_1.OnEvent)('activity.logged')];
            __esDecorate(this, null, _handleProjectSubscribe_decorators, { kind: "method", name: "handleProjectSubscribe", static: false, private: false, access: { has: obj => "handleProjectSubscribe" in obj, get: obj => obj.handleProjectSubscribe }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleProjectUnsubscribe_decorators, { kind: "method", name: "handleProjectUnsubscribe", static: false, private: false, access: { has: obj => "handleProjectUnsubscribe" in obj, get: obj => obj.handleProjectUnsubscribe }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handlePing_decorators, { kind: "method", name: "handlePing", static: false, private: false, access: { has: obj => "handlePing" in obj, get: obj => obj.handlePing }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleGetPresence_decorators, { kind: "method", name: "handleGetPresence", static: false, private: false, access: { has: obj => "handleGetPresence" in obj, get: obj => obj.handleGetPresence }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleTimelineSegmentUpdate_decorators, { kind: "method", name: "handleTimelineSegmentUpdate", static: false, private: false, access: { has: obj => "handleTimelineSegmentUpdate" in obj, get: obj => obj.handleTimelineSegmentUpdate }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleApprovalRequested_decorators, { kind: "method", name: "handleApprovalRequested", static: false, private: false, access: { has: obj => "handleApprovalRequested" in obj, get: obj => obj.handleApprovalRequested }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleApprovalApproved_decorators, { kind: "method", name: "handleApprovalApproved", static: false, private: false, access: { has: obj => "handleApprovalApproved" in obj, get: obj => obj.handleApprovalApproved }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleApprovalRejected_decorators, { kind: "method", name: "handleApprovalRejected", static: false, private: false, access: { has: obj => "handleApprovalRejected" in obj, get: obj => obj.handleApprovalRejected }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleApprovalDiscussed_decorators, { kind: "method", name: "handleApprovalDiscussed", static: false, private: false, access: { has: obj => "handleApprovalDiscussed" in obj, get: obj => obj.handleApprovalDiscussed }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleProjectStatusChange_decorators, { kind: "method", name: "handleProjectStatusChange", static: false, private: false, access: { has: obj => "handleProjectStatusChange" in obj, get: obj => obj.handleProjectStatusChange }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleActivityLogged_decorators, { kind: "method", name: "handleActivityLogged", static: false, private: false, access: { has: obj => "handleActivityLogged" in obj, get: obj => obj.handleActivityLogged }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, null, _server_decorators, { kind: "field", name: "server", static: false, private: false, access: { has: obj => "server" in obj, get: obj => obj.server, set: (obj, value) => { obj.server = value; } }, metadata: _metadata }, _server_initializers, _server_extraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            WebSocketProjectsGateway = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        prisma = __runInitializers(this, _instanceExtraInitializers);
        server = __runInitializers(this, _server_initializers, void 0);
        logger = (__runInitializers(this, _server_extraInitializers), new common_1.Logger(WebSocketProjectsGateway.name));
        constructor(prisma) {
            this.prisma = prisma;
        }
        /**
         * Handle client connection
         */
        async handleConnection(client) {
            try {
                // Extract auth token from handshake
                const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.split(' ')[1];
                if (!token) {
                    this.logger.warn(`Client ${client.id} connection rejected: No auth token`);
                    client.disconnect();
                    return;
                }
                // TODO: Verify JWT token and extract user info
                // For now, we'll assume the token contains userId
                // In production, use proper JWT verification
                const userId = this.extractUserIdFromToken(token);
                const userRole = this.extractUserRoleFromToken(token);
                if (!userId) {
                    this.logger.warn(`Client ${client.id} connection rejected: Invalid token`);
                    client.disconnect();
                    return;
                }
                client.userId = userId;
                client.userRole = userRole ?? undefined;
                // Store connection in database
                await this.prisma.activeConnection.create({
                    data: {
                        userId,
                        socketId: client.id,
                        userAgent: client.handshake.headers['user-agent'],
                        ipAddress: client.handshake.address,
                    },
                });
                this.logger.log(`Client connected: ${client.id} (User: ${userId})`);
                // Send connection confirmation
                client.emit('connected', {
                    socketId: client.id,
                    userId,
                    timestamp: new Date(),
                });
            }
            catch (error) {
                this.logger.error(`Connection error for client ${client.id}:`, error);
                client.disconnect();
            }
        }
        /**
         * Handle client disconnection
         */
        async handleDisconnect(client) {
            try {
                // Remove connection from database
                await this.prisma.activeConnection.delete({
                    where: { socketId: client.id },
                }).catch(() => {
                    // Connection might not exist in DB
                });
                this.logger.log(`Client disconnected: ${client.id} (User: ${client.userId})`);
            }
            catch (error) {
                this.logger.error(`Disconnect error for client ${client.id}:`, error);
            }
        }
        /**
         * Subscribe to project updates
         */
        async handleProjectSubscribe(client, data) {
            try {
                const { projectId } = data;
                // Verify user has access to project
                const hasAccess = await this.verifyProjectAccess(client.userId, projectId);
                if (!hasAccess) {
                    client.emit('error', {
                        event: 'subscribe:project',
                        message: 'Access denied to project',
                    });
                    return;
                }
                // Join project room
                client.join(`project:${projectId}`);
                // Update connection record
                await this.prisma.activeConnection.update({
                    where: { socketId: client.id },
                    data: { projectId },
                });
                this.logger.log(`Client ${client.id} subscribed to project ${projectId}`);
                client.emit('subscribed:project', {
                    projectId,
                    timestamp: new Date(),
                });
            }
            catch (error) {
                this.logger.error('Project subscribe error:', error);
                client.emit('error', {
                    event: 'subscribe:project',
                    message: 'Failed to subscribe to project',
                });
            }
        }
        /**
         * Unsubscribe from project updates
         */
        async handleProjectUnsubscribe(client, data) {
            const { projectId } = data;
            client.leave(`project:${projectId}`);
            // Update connection record
            await this.prisma.activeConnection.update({
                where: { socketId: client.id },
                data: { projectId: null },
            }).catch(() => {
                // Connection might not exist
            });
            this.logger.log(`Client ${client.id} unsubscribed from project ${projectId}`);
            client.emit('unsubscribed:project', {
                projectId,
                timestamp: new Date(),
            });
        }
        /**
         * Handle ping to keep connection alive
         */
        async handlePing(client) {
            // Update last ping time
            await this.prisma.activeConnection.update({
                where: { socketId: client.id },
                data: { lastPingAt: new Date() },
            }).catch(() => {
                // Connection might not exist
            });
            client.emit('pong', { timestamp: new Date() });
        }
        /**
         * Get presence information for a project
         */
        async handleGetPresence(client, data) {
            try {
                const { projectId } = data;
                // Get active connections for project
                const activeUsers = await this.prisma.activeConnection.findMany({
                    where: {
                        projectId,
                        lastPingAt: {
                            gte: new Date(Date.now() - 5 * 60 * 1000), // Active in last 5 minutes
                        },
                    },
                    select: {
                        userId: true,
                        connectedAt: true,
                        lastPingAt: true,
                    },
                });
                // Get unique users
                const uniqueUsers = Array.from(new Map(activeUsers.map(u => [u.userId, u])).values());
                client.emit('presence:update', {
                    projectId,
                    activeUsers: uniqueUsers,
                    count: uniqueUsers.length,
                    timestamp: new Date(),
                });
            }
            catch (error) {
                this.logger.error('Get presence error:', error);
            }
        }
        // Event Listeners
        /**
         * Handle timeline segment updates
         */
        handleTimelineSegmentUpdate(payload) {
            this.server.to(`project:${payload.projectId}`).emit('timeline:segment:updated', {
                segmentId: payload.segmentId,
                projectId: payload.projectId,
                oldStatus: payload.oldStatus,
                newStatus: payload.newStatus,
                oldProgress: payload.oldProgress,
                newProgress: payload.newProgress,
                timestamp: payload.timestamp,
            });
        }
        /**
         * Handle approval requests
         */
        handleApprovalRequested(payload) {
            this.server.to(`project:${payload.projectId}`).emit('approval:requested', {
                approvalId: payload.approvalId,
                projectId: payload.projectId,
                assignedTo: payload.assignedTo,
                approvalType: payload.approvalType,
                priority: payload.priority,
                timestamp: payload.timestamp,
            });
        }
        /**
         * Handle approval approved
         */
        handleApprovalApproved(payload) {
            this.server.to(`project:${payload.projectId}`).emit('approval:approved', {
                approvalId: payload.approvalId,
                projectId: payload.projectId,
                approvedBy: payload.approvedBy,
                timestamp: payload.timestamp,
            });
        }
        /**
         * Handle approval rejected
         */
        handleApprovalRejected(payload) {
            this.server.to(`project:${payload.projectId}`).emit('approval:rejected', {
                approvalId: payload.approvalId,
                projectId: payload.projectId,
                rejectedBy: payload.rejectedBy,
                reason: payload.reason,
                timestamp: payload.timestamp,
            });
        }
        /**
         * Handle approval discussion
         */
        handleApprovalDiscussed(payload) {
            this.server.to(`project:${payload.projectId}`).emit('approval:discussed', {
                approvalId: payload.approvalId,
                projectId: payload.projectId,
                userId: payload.userId,
                timestamp: payload.timestamp,
            });
        }
        /**
         * Handle project status changes
         */
        handleProjectStatusChange(payload) {
            this.server.to(`project:${payload.projectId}`).emit('project:status:changed', {
                projectId: payload.projectId,
                oldStatus: payload.oldStatus,
                newStatus: payload.newStatus,
                timestamp: payload.timestamp,
            });
        }
        /**
         * Handle activity logged
         */
        handleActivityLogged(payload) {
            // Broadcast presence update
            this.server.to(`project:${payload.projectId}`).emit('activity:logged', {
                projectId: payload.projectId,
                userId: payload.userId,
                activityType: payload.activityType,
                timestamp: payload.timestamp,
            });
        }
        // Helper Methods
        /**
         * Extract user ID from JWT token
         * TODO: Implement proper JWT verification
         */
        extractUserIdFromToken(token) {
            try {
                // This is a placeholder - implement proper JWT verification
                // using @nestjs/jwt in production
                const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
                return payload.sub || payload.userId || null;
            }
            catch {
                return null;
            }
        }
        /**
         * Extract user role from JWT token
         */
        extractUserRoleFromToken(token) {
            try {
                const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
                return payload.role || null;
            }
            catch {
                return null;
            }
        }
        /**
         * Verify user has access to project
         */
        async verifyProjectAccess(userId, projectId) {
            try {
                const project = await this.prisma.project.findUnique({
                    where: { id: projectId },
                    select: { clientId: true, designerId: true },
                });
                if (!project)
                    return false;
                // User has access if they are client, designer, or admin
                return project.clientId === userId || project.designerId === userId;
            }
            catch {
                return false;
            }
        }
        /**
         * Broadcast message to all users in a project
         */
        broadcastToProject(projectId, event, data) {
            this.server.to(`project:${projectId}`).emit(event, data);
        }
        /**
         * Send message to specific user
         */
        async sendToUser(userId, event, data) {
            const connections = await this.prisma.activeConnection.findMany({
                where: { userId },
                select: { socketId: true },
            });
            connections.forEach(conn => {
                this.server.to(conn.socketId).emit(event, data);
            });
        }
    };
    return WebSocketProjectsGateway = _classThis;
})();
exports.WebSocketProjectsGateway = WebSocketProjectsGateway;
//# sourceMappingURL=websocket.gateway.js.map