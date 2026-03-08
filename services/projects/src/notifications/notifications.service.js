"use strict";
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
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
let NotificationsService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var NotificationsService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            NotificationsService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        prisma;
        eventEmitter;
        notificationQueue;
        logger = new common_1.Logger(NotificationsService.name);
        constructor(prisma, eventEmitter, notificationQueue) {
            this.prisma = prisma;
            this.eventEmitter = eventEmitter;
            this.notificationQueue = notificationQueue;
        }
        /**
         * Create and send a notification
         */
        async create(createDto) {
            // Get user preferences
            const preferences = await this.getOrCreatePreferences(createDto.userId);
            // Determine which channels to use
            const channels = this.resolveChannels(createDto, preferences);
            // Create notification record
            const notification = await this.prisma.notification.create({
                data: {
                    userId: createDto.userId,
                    projectId: createDto.projectId,
                    type: createDto.type,
                    priority: createDto.priority || 'normal',
                    title: createDto.title,
                    message: createDto.message,
                    actionUrl: createDto.actionUrl,
                    channels,
                    metadata: createDto.metadata,
                },
            });
            // Queue for delivery based on user preferences
            if (preferences.frequency === 'immediate') {
                await this.queueForDelivery(notification, channels, preferences);
            }
            else {
                // Will be picked up by batch digest job
                this.logger.log(`Notification ${notification.id} queued for ${preferences.frequency}`);
            }
            return notification;
        }
        /**
         * Batch create notifications
         */
        async createBatch(notifications) {
            const created = await Promise.all(notifications.map(dto => this.create(dto)));
            this.logger.log(`Created ${created.length} notifications in batch`);
            return created;
        }
        /**
         * Get notifications for a user
         */
        async findForUser(userId, options = {}) {
            const { status, projectId, limit = 50, offset = 0 } = options;
            const where = { userId };
            if (status)
                where.status = status;
            if (projectId)
                where.projectId = projectId;
            const [notifications, total] = await Promise.all([
                this.prisma.notification.findMany({
                    where,
                    orderBy: { createdAt: 'desc' },
                    take: limit,
                    skip: offset,
                }),
                this.prisma.notification.count({ where }),
            ]);
            return {
                data: notifications,
                total,
                unread: await this.prisma.notification.count({
                    where: { userId, readAt: null },
                }),
            };
        }
        /**
         * Mark notification as read
         */
        async markAsRead(id, userId) {
            const notification = await this.prisma.notification.findFirst({
                where: { id, userId },
            });
            if (!notification) {
                throw new common_1.NotFoundException('Notification not found');
            }
            return this.prisma.notification.update({
                where: { id },
                data: { readAt: new Date(), status: 'read' },
            });
        }
        /**
         * Mark all notifications as read for a user
         */
        async markAllAsRead(userId, projectId) {
            const where = { userId, readAt: null };
            if (projectId)
                where.projectId = projectId;
            const result = await this.prisma.notification.updateMany({
                where,
                data: { readAt: new Date(), status: 'read' },
            });
            return { updated: result.count };
        }
        /**
         * Get or create user notification preferences
         */
        async getOrCreatePreferences(userId) {
            let preferences = await this.prisma.notificationPreference.findUnique({
                where: { userId },
            });
            if (!preferences) {
                preferences = await this.prisma.notificationPreference.create({
                    data: { userId },
                });
            }
            return preferences;
        }
        /**
         * Update user notification preferences
         */
        async updatePreferences(userId, updateDto) {
            const existing = await this.getOrCreatePreferences(userId);
            return this.prisma.notificationPreference.update({
                where: { userId },
                data: {
                    email: updateDto.email ?? existing.email,
                    emailAddress: updateDto.emailAddress ?? existing.emailAddress,
                    sms: updateDto.sms ?? existing.sms,
                    phoneNumber: updateDto.phoneNumber ?? existing.phoneNumber,
                    push: updateDto.push ?? existing.push,
                    pushTokens: (updateDto.pushTokens ?? existing.pushTokens),
                    channels: (updateDto.channels ?? existing.channels),
                    frequency: updateDto.frequency ?? existing.frequency,
                    quietHours: (updateDto.quietHours ?? existing.quietHours),
                },
            });
        }
        /**
         * Register a push notification token for a user
         */
        async registerPushToken(userId, token) {
            const preferences = await this.getOrCreatePreferences(userId);
            const currentTokens = preferences.pushTokens || [];
            if (!currentTokens.includes(token)) {
                currentTokens.push(token);
                return this.prisma.notificationPreference.update({
                    where: { userId },
                    data: { pushTokens: currentTokens },
                });
            }
            return preferences;
        }
        /**
         * Send digest notifications (called by scheduled job)
         */
        async sendDigests(frequency) {
            this.logger.log(`Processing ${frequency} notifications`);
            // Get users with this frequency preference
            const users = await this.prisma.notificationPreference.findMany({
                where: { frequency },
            });
            for (const user of users) {
                await this.sendDigestForUser(user.userId, frequency);
            }
            this.logger.log(`Completed ${frequency} for ${users.length} users`);
        }
        /**
         * Private: Resolve which channels to use for a notification
         */
        resolveChannels(createDto, preferences) {
            // Start with user's global preferences
            const channels = {
                email: preferences.email,
                sms: preferences.sms,
                push: preferences.push,
            };
            // Override with notification-specific preferences if available
            if (preferences.channels && preferences.channels[createDto.type]) {
                const typePrefs = preferences.channels[createDto.type];
                if (typePrefs.email !== undefined)
                    channels.email = typePrefs.email;
                if (typePrefs.sms !== undefined)
                    channels.sms = typePrefs.sms;
                if (typePrefs.push !== undefined)
                    channels.push = typePrefs.push;
            }
            // Override with explicit channels from request if provided
            if (createDto.channels) {
                if (createDto.channels.email !== undefined)
                    channels.email = createDto.channels.email;
                if (createDto.channels.sms !== undefined)
                    channels.sms = createDto.channels.sms;
                if (createDto.channels.push !== undefined)
                    channels.push = createDto.channels.push;
            }
            // Check quiet hours
            if (this.isInQuietHours(preferences.quietHours)) {
                // Only urgent notifications during quiet hours
                if (createDto.priority !== 'urgent') {
                    channels.sms = false;
                    channels.push = false;
                }
            }
            return channels;
        }
        /**
         * Private: Queue notification for delivery
         */
        async queueForDelivery(notification, channels, preferences) {
            const jobs = [];
            if (channels.email && preferences.emailAddress) {
                jobs.push(this.notificationQueue.add('send-email', {
                    notificationId: notification.id,
                    to: preferences.emailAddress,
                    subject: notification.title,
                    message: notification.message,
                    actionUrl: notification.actionUrl,
                }));
            }
            if (channels.sms && preferences.phoneNumber) {
                jobs.push(this.notificationQueue.add('send-sms', {
                    notificationId: notification.id,
                    to: preferences.phoneNumber,
                    message: `${notification.title}: ${notification.message}`,
                }));
            }
            if (channels.push && preferences.pushTokens && Array.isArray(preferences.pushTokens)) {
                jobs.push(this.notificationQueue.add('send-push', {
                    notificationId: notification.id,
                    tokens: preferences.pushTokens,
                    title: notification.title,
                    body: notification.message,
                    data: {
                        actionUrl: notification.actionUrl,
                        type: notification.type,
                    },
                }));
            }
            await Promise.all(jobs);
            // Update notification status
            await this.prisma.notification.update({
                where: { id: notification.id },
                data: { status: 'sent', sentAt: new Date() },
            });
            this.logger.log(`Queued ${jobs.length} delivery jobs for notification ${notification.id}`);
        }
        /**
         * Private: Check if current time is in quiet hours
         */
        isInQuietHours(quietHours) {
            if (!quietHours || !quietHours.start || !quietHours.end) {
                return false;
            }
            const now = new Date();
            const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            return currentTime >= quietHours.start && currentTime <= quietHours.end;
        }
        /**
         * Private: Send digest for a single user
         */
        async sendDigestForUser(userId, frequency) {
            const cutoffDate = new Date();
            if (frequency === 'daily_digest') {
                cutoffDate.setDate(cutoffDate.getDate() - 1);
            }
            else {
                cutoffDate.setDate(cutoffDate.getDate() - 7);
            }
            // Get pending notifications since cutoff
            const notifications = await this.prisma.notification.findMany({
                where: {
                    userId,
                    status: 'pending',
                    createdAt: { gte: cutoffDate },
                },
                orderBy: { createdAt: 'desc' },
            });
            if (notifications.length === 0) {
                return;
            }
            // Group by project
            const byProject = notifications.reduce((acc, notif) => {
                const key = notif.projectId || 'general';
                if (!acc[key])
                    acc[key] = [];
                acc[key].push(notif);
                return acc;
            }, {});
            // Send digest email
            const preferences = await this.getOrCreatePreferences(userId);
            if (preferences.email && preferences.emailAddress) {
                await this.notificationQueue.add('send-digest', {
                    to: preferences.emailAddress,
                    frequency,
                    notifications: byProject,
                    totalCount: notifications.length,
                });
            }
            // Mark as sent
            await this.prisma.notification.updateMany({
                where: {
                    id: { in: notifications.map(n => n.id) },
                },
                data: { status: 'sent', sentAt: new Date() },
            });
        }
    };
    return NotificationsService = _classThis;
})();
exports.NotificationsService = NotificationsService;
//# sourceMappingURL=notifications.service.js.map