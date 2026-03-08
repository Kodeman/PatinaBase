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
exports.EventsService = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const schedule_1 = require("@nestjs/schedule");
let EventsService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _handleProjectCreated_decorators;
    let _handleProjectStatusChanged_decorators;
    let _handleTaskCreated_decorators;
    let _handleTaskStatusChanged_decorators;
    let _handleTaskCompleted_decorators;
    let _handleTaskDeleted_decorators;
    let _handleTaskBulkUpdated_decorators;
    let _handleRFICreated_decorators;
    let _handleRFIStatusChanged_decorators;
    let _handleRFIAnswered_decorators;
    let _handleChangeOrderCreated_decorators;
    let _handleChangeOrderSubmitted_decorators;
    let _handleChangeOrderApproved_decorators;
    let _handleChangeOrderRejected_decorators;
    let _handleChangeOrderImplemented_decorators;
    let _handleIssueCreated_decorators;
    let _handleIssueStatusChanged_decorators;
    let _handleIssueResolved_decorators;
    let _handleLogCreated_decorators;
    let _handleDocumentUploaded_decorators;
    let _handleMilestoneCreated_decorators;
    let _handleMilestoneStatusChanged_decorators;
    let _handleMilestoneCompleted_decorators;
    let _processOutboxEvents_decorators;
    let _cleanupPublishedEvents_decorators;
    var EventsService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _handleProjectCreated_decorators = [(0, event_emitter_1.OnEvent)('project.created')];
            _handleProjectStatusChanged_decorators = [(0, event_emitter_1.OnEvent)('project.status_changed')];
            _handleTaskCreated_decorators = [(0, event_emitter_1.OnEvent)('task.created')];
            _handleTaskStatusChanged_decorators = [(0, event_emitter_1.OnEvent)('task.status_changed')];
            _handleTaskCompleted_decorators = [(0, event_emitter_1.OnEvent)('task.completed')];
            _handleTaskDeleted_decorators = [(0, event_emitter_1.OnEvent)('task.deleted')];
            _handleTaskBulkUpdated_decorators = [(0, event_emitter_1.OnEvent)('task.bulk_updated')];
            _handleRFICreated_decorators = [(0, event_emitter_1.OnEvent)('rfi.created')];
            _handleRFIStatusChanged_decorators = [(0, event_emitter_1.OnEvent)('rfi.status_changed')];
            _handleRFIAnswered_decorators = [(0, event_emitter_1.OnEvent)('rfi.answered')];
            _handleChangeOrderCreated_decorators = [(0, event_emitter_1.OnEvent)('change_order.created')];
            _handleChangeOrderSubmitted_decorators = [(0, event_emitter_1.OnEvent)('change_order.submitted')];
            _handleChangeOrderApproved_decorators = [(0, event_emitter_1.OnEvent)('change_order.approved')];
            _handleChangeOrderRejected_decorators = [(0, event_emitter_1.OnEvent)('change_order.rejected')];
            _handleChangeOrderImplemented_decorators = [(0, event_emitter_1.OnEvent)('change_order.implemented')];
            _handleIssueCreated_decorators = [(0, event_emitter_1.OnEvent)('issue.created')];
            _handleIssueStatusChanged_decorators = [(0, event_emitter_1.OnEvent)('issue.status_changed')];
            _handleIssueResolved_decorators = [(0, event_emitter_1.OnEvent)('issue.resolved')];
            _handleLogCreated_decorators = [(0, event_emitter_1.OnEvent)('log.created')];
            _handleDocumentUploaded_decorators = [(0, event_emitter_1.OnEvent)('document.uploaded')];
            _handleMilestoneCreated_decorators = [(0, event_emitter_1.OnEvent)('milestone.created')];
            _handleMilestoneStatusChanged_decorators = [(0, event_emitter_1.OnEvent)('milestone.status_changed')];
            _handleMilestoneCompleted_decorators = [(0, event_emitter_1.OnEvent)('milestone.completed')];
            _processOutboxEvents_decorators = [(0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_10_SECONDS)];
            _cleanupPublishedEvents_decorators = [(0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_2AM)];
            __esDecorate(this, null, _handleProjectCreated_decorators, { kind: "method", name: "handleProjectCreated", static: false, private: false, access: { has: obj => "handleProjectCreated" in obj, get: obj => obj.handleProjectCreated }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleProjectStatusChanged_decorators, { kind: "method", name: "handleProjectStatusChanged", static: false, private: false, access: { has: obj => "handleProjectStatusChanged" in obj, get: obj => obj.handleProjectStatusChanged }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleTaskCreated_decorators, { kind: "method", name: "handleTaskCreated", static: false, private: false, access: { has: obj => "handleTaskCreated" in obj, get: obj => obj.handleTaskCreated }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleTaskStatusChanged_decorators, { kind: "method", name: "handleTaskStatusChanged", static: false, private: false, access: { has: obj => "handleTaskStatusChanged" in obj, get: obj => obj.handleTaskStatusChanged }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleTaskCompleted_decorators, { kind: "method", name: "handleTaskCompleted", static: false, private: false, access: { has: obj => "handleTaskCompleted" in obj, get: obj => obj.handleTaskCompleted }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleTaskDeleted_decorators, { kind: "method", name: "handleTaskDeleted", static: false, private: false, access: { has: obj => "handleTaskDeleted" in obj, get: obj => obj.handleTaskDeleted }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleTaskBulkUpdated_decorators, { kind: "method", name: "handleTaskBulkUpdated", static: false, private: false, access: { has: obj => "handleTaskBulkUpdated" in obj, get: obj => obj.handleTaskBulkUpdated }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleRFICreated_decorators, { kind: "method", name: "handleRFICreated", static: false, private: false, access: { has: obj => "handleRFICreated" in obj, get: obj => obj.handleRFICreated }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleRFIStatusChanged_decorators, { kind: "method", name: "handleRFIStatusChanged", static: false, private: false, access: { has: obj => "handleRFIStatusChanged" in obj, get: obj => obj.handleRFIStatusChanged }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleRFIAnswered_decorators, { kind: "method", name: "handleRFIAnswered", static: false, private: false, access: { has: obj => "handleRFIAnswered" in obj, get: obj => obj.handleRFIAnswered }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleChangeOrderCreated_decorators, { kind: "method", name: "handleChangeOrderCreated", static: false, private: false, access: { has: obj => "handleChangeOrderCreated" in obj, get: obj => obj.handleChangeOrderCreated }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleChangeOrderSubmitted_decorators, { kind: "method", name: "handleChangeOrderSubmitted", static: false, private: false, access: { has: obj => "handleChangeOrderSubmitted" in obj, get: obj => obj.handleChangeOrderSubmitted }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleChangeOrderApproved_decorators, { kind: "method", name: "handleChangeOrderApproved", static: false, private: false, access: { has: obj => "handleChangeOrderApproved" in obj, get: obj => obj.handleChangeOrderApproved }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleChangeOrderRejected_decorators, { kind: "method", name: "handleChangeOrderRejected", static: false, private: false, access: { has: obj => "handleChangeOrderRejected" in obj, get: obj => obj.handleChangeOrderRejected }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleChangeOrderImplemented_decorators, { kind: "method", name: "handleChangeOrderImplemented", static: false, private: false, access: { has: obj => "handleChangeOrderImplemented" in obj, get: obj => obj.handleChangeOrderImplemented }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleIssueCreated_decorators, { kind: "method", name: "handleIssueCreated", static: false, private: false, access: { has: obj => "handleIssueCreated" in obj, get: obj => obj.handleIssueCreated }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleIssueStatusChanged_decorators, { kind: "method", name: "handleIssueStatusChanged", static: false, private: false, access: { has: obj => "handleIssueStatusChanged" in obj, get: obj => obj.handleIssueStatusChanged }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleIssueResolved_decorators, { kind: "method", name: "handleIssueResolved", static: false, private: false, access: { has: obj => "handleIssueResolved" in obj, get: obj => obj.handleIssueResolved }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleLogCreated_decorators, { kind: "method", name: "handleLogCreated", static: false, private: false, access: { has: obj => "handleLogCreated" in obj, get: obj => obj.handleLogCreated }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleDocumentUploaded_decorators, { kind: "method", name: "handleDocumentUploaded", static: false, private: false, access: { has: obj => "handleDocumentUploaded" in obj, get: obj => obj.handleDocumentUploaded }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleMilestoneCreated_decorators, { kind: "method", name: "handleMilestoneCreated", static: false, private: false, access: { has: obj => "handleMilestoneCreated" in obj, get: obj => obj.handleMilestoneCreated }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleMilestoneStatusChanged_decorators, { kind: "method", name: "handleMilestoneStatusChanged", static: false, private: false, access: { has: obj => "handleMilestoneStatusChanged" in obj, get: obj => obj.handleMilestoneStatusChanged }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _handleMilestoneCompleted_decorators, { kind: "method", name: "handleMilestoneCompleted", static: false, private: false, access: { has: obj => "handleMilestoneCompleted" in obj, get: obj => obj.handleMilestoneCompleted }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _processOutboxEvents_decorators, { kind: "method", name: "processOutboxEvents", static: false, private: false, access: { has: obj => "processOutboxEvents" in obj, get: obj => obj.processOutboxEvents }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _cleanupPublishedEvents_decorators, { kind: "method", name: "cleanupPublishedEvents", static: false, private: false, access: { has: obj => "cleanupPublishedEvents" in obj, get: obj => obj.cleanupPublishedEvents }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            EventsService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        prisma = __runInitializers(this, _instanceExtraInitializers);
        logger = new common_1.Logger(EventsService.name);
        constructor(prisma) {
            this.prisma = prisma;
        }
        // Project events
        async handleProjectCreated(payload) {
            await this.createOutboxEvent('project.created', payload);
        }
        async handleProjectStatusChanged(payload) {
            await this.createOutboxEvent('project.status_changed', payload);
        }
        // Task events
        async handleTaskCreated(payload) {
            await this.createOutboxEvent('task.created', payload);
        }
        async handleTaskStatusChanged(payload) {
            await this.createOutboxEvent('task.status_changed', payload);
        }
        async handleTaskCompleted(payload) {
            await this.createOutboxEvent('task.completed', payload);
        }
        async handleTaskDeleted(payload) {
            await this.createOutboxEvent('task.deleted', payload);
        }
        async handleTaskBulkUpdated(payload) {
            await this.createOutboxEvent('task.bulk_updated', payload);
        }
        // RFI events
        async handleRFICreated(payload) {
            await this.createOutboxEvent('rfi.created', payload);
        }
        async handleRFIStatusChanged(payload) {
            await this.createOutboxEvent('rfi.status_changed', payload);
        }
        async handleRFIAnswered(payload) {
            await this.createOutboxEvent('rfi.answered', payload);
        }
        // Change Order events
        async handleChangeOrderCreated(payload) {
            await this.createOutboxEvent('change_order.created', payload);
        }
        async handleChangeOrderSubmitted(payload) {
            await this.createOutboxEvent('change_order.submitted', payload);
        }
        async handleChangeOrderApproved(payload) {
            await this.createOutboxEvent('change_order.approved', payload);
        }
        async handleChangeOrderRejected(payload) {
            await this.createOutboxEvent('change_order.rejected', payload);
        }
        async handleChangeOrderImplemented(payload) {
            await this.createOutboxEvent('change_order.implemented', payload);
        }
        // Issue events
        async handleIssueCreated(payload) {
            await this.createOutboxEvent('issue.created', payload);
        }
        async handleIssueStatusChanged(payload) {
            await this.createOutboxEvent('issue.status_changed', payload);
        }
        async handleIssueResolved(payload) {
            await this.createOutboxEvent('issue.resolved', payload);
        }
        // Daily Log events
        async handleLogCreated(payload) {
            await this.createOutboxEvent('log.created', payload);
        }
        // Document events
        async handleDocumentUploaded(payload) {
            await this.createOutboxEvent('document.uploaded', payload);
        }
        // Milestone events
        async handleMilestoneCreated(payload) {
            await this.createOutboxEvent('milestone.created', payload);
        }
        async handleMilestoneStatusChanged(payload) {
            await this.createOutboxEvent('milestone.status_changed', payload);
        }
        async handleMilestoneCompleted(payload) {
            await this.createOutboxEvent('milestone.completed', payload);
        }
        /**
         * Create an outbox event for transactional publishing
         */
        async createOutboxEvent(type, payload) {
            try {
                await this.prisma.outboxEvent.create({
                    data: {
                        type,
                        payload,
                        headers: {
                            traceId: payload.traceId || 'none',
                            source: 'project-tracking-service',
                        },
                    },
                });
                this.logger.debug(`Outbox event created: ${type}`);
            }
            catch (error) {
                this.logger.error(`Failed to create outbox event: ${type}`, error);
            }
        }
        /**
         * Process outbox events - runs every 10 seconds
         */
        async processOutboxEvents() {
            const events = await this.prisma.outboxEvent.findMany({
                where: {
                    published: false,
                    retryCount: { lt: 5 }, // Max 5 retries
                },
                take: 100,
                orderBy: { createdAt: 'asc' },
            });
            if (events.length === 0) {
                return;
            }
            this.logger.log(`Processing ${events.length} outbox events`);
            for (const event of events) {
                try {
                    // In production, publish to OCI Streaming
                    await this.publishToStream(event);
                    // Mark as published
                    await this.prisma.outboxEvent.update({
                        where: { id: event.id },
                        data: {
                            published: true,
                            publishedAt: new Date(),
                        },
                    });
                    this.logger.debug(`Event published: ${event.type} (${event.id})`);
                }
                catch (error) {
                    this.logger.error(`Failed to publish event ${event.id}:`, error);
                    // Increment retry count
                    await this.prisma.outboxEvent.update({
                        where: { id: event.id },
                        data: {
                            retryCount: event.retryCount + 1,
                            lastError: error instanceof Error ? error.message : 'Unknown error',
                        },
                    });
                }
            }
        }
        /**
         * Publish event to OCI Streaming
         */
        async publishToStream(event) {
            // In production, use OCI SDK to publish to streaming
            // For MVP, we'll just log
            this.logger.debug(`Publishing to stream: ${event.type}`, {
                eventId: event.id,
                payload: event.payload,
            });
            // Simulate async operation
            await new Promise((resolve) => setTimeout(resolve, 10));
            // Example OCI Streaming publish:
            // const client = new StreamClient({ authProvider });
            // await client.putMessages({
            //   streamId: process.env.OCI_STREAM_OCID,
            //   putMessagesDetails: {
            //     messages: [{
            //       key: event.id,
            //       value: Buffer.from(JSON.stringify(event.payload)).toString('base64'),
            //     }],
            //   },
            // });
        }
        /**
         * Clean up old published events - runs daily
         */
        async cleanupPublishedEvents() {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 7); // Keep 7 days
            const result = await this.prisma.outboxEvent.deleteMany({
                where: {
                    published: true,
                    publishedAt: { lt: cutoffDate },
                },
            });
            this.logger.log(`Cleaned up ${result.count} old outbox events`);
        }
    };
    return EventsService = _classThis;
})();
exports.EventsService = EventsService;
//# sourceMappingURL=events.service.js.map