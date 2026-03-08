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
exports.ProjectCacheInvalidationListener = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
let ProjectCacheInvalidationListener = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _onProjectMutations_decorators;
    let _onTaskEvents_decorators;
    let _onChangeOrderEvents_decorators;
    let _onRfiEvents_decorators;
    let _onIssueEvents_decorators;
    let _onMilestoneEvents_decorators;
    let _onTimelineEvents_decorators;
    let _onApprovalEvents_decorators;
    let _onLogOrDocumentEvents_decorators;
    var ProjectCacheInvalidationListener = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _onProjectMutations_decorators = [(0, event_emitter_1.OnEvent)('project.created'), (0, event_emitter_1.OnEvent)('project.status_changed')];
            _onTaskEvents_decorators = [(0, event_emitter_1.OnEvent)('task.created'), (0, event_emitter_1.OnEvent)('task.status_changed'), (0, event_emitter_1.OnEvent)('task.completed'), (0, event_emitter_1.OnEvent)('task.deleted'), (0, event_emitter_1.OnEvent)('task.bulk_updated')];
            _onChangeOrderEvents_decorators = [(0, event_emitter_1.OnEvent)('change_order.created'), (0, event_emitter_1.OnEvent)('change_order.submitted'), (0, event_emitter_1.OnEvent)('change_order.approved'), (0, event_emitter_1.OnEvent)('change_order.rejected'), (0, event_emitter_1.OnEvent)('change_order.implemented')];
            _onRfiEvents_decorators = [(0, event_emitter_1.OnEvent)('rfi.created'), (0, event_emitter_1.OnEvent)('rfi.status_changed'), (0, event_emitter_1.OnEvent)('rfi.answered')];
            _onIssueEvents_decorators = [(0, event_emitter_1.OnEvent)('issue.created'), (0, event_emitter_1.OnEvent)('issue.status_changed'), (0, event_emitter_1.OnEvent)('issue.resolved')];
            _onMilestoneEvents_decorators = [(0, event_emitter_1.OnEvent)('milestone.created'), (0, event_emitter_1.OnEvent)('milestone.status_changed'), (0, event_emitter_1.OnEvent)('milestone.completed')];
            _onTimelineEvents_decorators = [(0, event_emitter_1.OnEvent)('timeline.segment.created'), (0, event_emitter_1.OnEvent)('timeline.segment.updated'), (0, event_emitter_1.OnEvent)('activity.logged')];
            _onApprovalEvents_decorators = [(0, event_emitter_1.OnEvent)('approval.requested'), (0, event_emitter_1.OnEvent)('approval.approved'), (0, event_emitter_1.OnEvent)('approval.rejected'), (0, event_emitter_1.OnEvent)('approval.discussed')];
            _onLogOrDocumentEvents_decorators = [(0, event_emitter_1.OnEvent)('log.created'), (0, event_emitter_1.OnEvent)('document.uploaded')];
            __esDecorate(this, null, _onProjectMutations_decorators, { kind: "method", name: "onProjectMutations", static: false, private: false, access: { has: obj => "onProjectMutations" in obj, get: obj => obj.onProjectMutations }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _onTaskEvents_decorators, { kind: "method", name: "onTaskEvents", static: false, private: false, access: { has: obj => "onTaskEvents" in obj, get: obj => obj.onTaskEvents }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _onChangeOrderEvents_decorators, { kind: "method", name: "onChangeOrderEvents", static: false, private: false, access: { has: obj => "onChangeOrderEvents" in obj, get: obj => obj.onChangeOrderEvents }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _onRfiEvents_decorators, { kind: "method", name: "onRfiEvents", static: false, private: false, access: { has: obj => "onRfiEvents" in obj, get: obj => obj.onRfiEvents }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _onIssueEvents_decorators, { kind: "method", name: "onIssueEvents", static: false, private: false, access: { has: obj => "onIssueEvents" in obj, get: obj => obj.onIssueEvents }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _onMilestoneEvents_decorators, { kind: "method", name: "onMilestoneEvents", static: false, private: false, access: { has: obj => "onMilestoneEvents" in obj, get: obj => obj.onMilestoneEvents }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _onTimelineEvents_decorators, { kind: "method", name: "onTimelineEvents", static: false, private: false, access: { has: obj => "onTimelineEvents" in obj, get: obj => obj.onTimelineEvents }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _onApprovalEvents_decorators, { kind: "method", name: "onApprovalEvents", static: false, private: false, access: { has: obj => "onApprovalEvents" in obj, get: obj => obj.onApprovalEvents }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _onLogOrDocumentEvents_decorators, { kind: "method", name: "onLogOrDocumentEvents", static: false, private: false, access: { has: obj => "onLogOrDocumentEvents" in obj, get: obj => obj.onLogOrDocumentEvents }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ProjectCacheInvalidationListener = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        cacheService = __runInitializers(this, _instanceExtraInitializers);
        logger = new common_1.Logger(ProjectCacheInvalidationListener.name);
        constructor(cacheService) {
            this.cacheService = cacheService;
        }
        async invalidateProjectCache(projectId) {
            if (!projectId) {
                return;
            }
            await this.cacheService.invalidateProject(projectId);
            this.logger.debug(`Invalidated cache for project ${projectId}`);
        }
        async onProjectMutations(payload) {
            await this.invalidateProjectCache(payload.projectId);
        }
        async onTaskEvents(payload) {
            await this.invalidateProjectCache(payload.projectId);
        }
        async onChangeOrderEvents(payload) {
            await this.invalidateProjectCache(payload.projectId);
        }
        async onRfiEvents(payload) {
            await this.invalidateProjectCache(payload.projectId);
        }
        async onIssueEvents(payload) {
            await this.invalidateProjectCache(payload.projectId);
        }
        async onMilestoneEvents(payload) {
            await this.invalidateProjectCache(payload.projectId);
        }
        async onTimelineEvents(payload) {
            await this.invalidateProjectCache(payload.projectId);
        }
        async onApprovalEvents(payload) {
            await this.invalidateProjectCache(payload.projectId);
        }
        async onLogOrDocumentEvents(payload) {
            await this.invalidateProjectCache(payload.projectId);
        }
    };
    return ProjectCacheInvalidationListener = _classThis;
})();
exports.ProjectCacheInvalidationListener = ProjectCacheInvalidationListener;
//# sourceMappingURL=project-cache.listener.js.map