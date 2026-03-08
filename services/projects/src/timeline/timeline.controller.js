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
exports.TimelineController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_guard_1 = require("../common/guards/auth.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const project_access_guard_1 = require("../common/guards/project-access.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
let TimelineController = (() => {
    let _classDecorators = [(0, swagger_1.ApiTags)('timeline'), (0, swagger_1.ApiBearerAuth)(), (0, common_1.Controller)('projects/:projectId/timeline'), (0, common_1.UseGuards)(auth_guard_1.AuthGuard, roles_guard_1.RolesGuard, project_access_guard_1.ProjectAccessGuard)];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _createSegment_decorators;
    let _getTimeline_decorators;
    let _getSegment_decorators;
    let _updateSegment_decorators;
    let _logActivity_decorators;
    let _getUpcoming_decorators;
    let _getProgress_decorators;
    var TimelineController = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _createSegment_decorators = [(0, common_1.Post)('segments'), (0, roles_decorator_1.Roles)('admin', 'designer'), (0, swagger_1.ApiOperation)({ summary: 'Create a new timeline segment' }), (0, swagger_1.ApiParam)({ name: 'projectId', description: 'Project ID' }), (0, swagger_1.ApiResponse)({ status: 201, description: 'Segment created successfully' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Project not found' })];
            _getTimeline_decorators = [(0, common_1.Get)(), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Get full project timeline with all segments' }), (0, swagger_1.ApiParam)({ name: 'projectId', description: 'Project ID' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Timeline retrieved successfully' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Project not found' })];
            _getSegment_decorators = [(0, common_1.Get)('segment/:segmentId'), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Get specific timeline segment with details' }), (0, swagger_1.ApiParam)({ name: 'projectId', description: 'Project ID' }), (0, swagger_1.ApiParam)({ name: 'segmentId', description: 'Segment ID' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Segment retrieved successfully' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Segment not found' })];
            _updateSegment_decorators = [(0, common_1.Patch)('segment/:segmentId'), (0, roles_decorator_1.Roles)('admin', 'designer'), (0, swagger_1.ApiOperation)({ summary: 'Update timeline segment' }), (0, swagger_1.ApiParam)({ name: 'projectId', description: 'Project ID' }), (0, swagger_1.ApiParam)({ name: 'segmentId', description: 'Segment ID' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Segment updated successfully' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Segment not found' })];
            _logActivity_decorators = [(0, common_1.Post)('activity'), (0, common_1.HttpCode)(common_1.HttpStatus.CREATED), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Log client activity on timeline/project' }), (0, swagger_1.ApiParam)({ name: 'projectId', description: 'Project ID' }), (0, swagger_1.ApiResponse)({ status: 201, description: 'Activity logged successfully' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Project not found' })];
            _getUpcoming_decorators = [(0, common_1.Get)('upcoming'), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Get upcoming events, milestones, and deadlines' }), (0, swagger_1.ApiParam)({ name: 'projectId', description: 'Project ID' }), (0, swagger_1.ApiQuery)({ name: 'days', required: false, description: 'Number of days ahead to look (default: 30)' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Upcoming events retrieved successfully' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Project not found' })];
            _getProgress_decorators = [(0, common_1.Get)('progress'), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Get detailed progress metrics for project' }), (0, swagger_1.ApiParam)({ name: 'projectId', description: 'Project ID' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Progress metrics retrieved successfully' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Project not found' })];
            __esDecorate(this, null, _createSegment_decorators, { kind: "method", name: "createSegment", static: false, private: false, access: { has: obj => "createSegment" in obj, get: obj => obj.createSegment }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getTimeline_decorators, { kind: "method", name: "getTimeline", static: false, private: false, access: { has: obj => "getTimeline" in obj, get: obj => obj.getTimeline }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getSegment_decorators, { kind: "method", name: "getSegment", static: false, private: false, access: { has: obj => "getSegment" in obj, get: obj => obj.getSegment }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _updateSegment_decorators, { kind: "method", name: "updateSegment", static: false, private: false, access: { has: obj => "updateSegment" in obj, get: obj => obj.updateSegment }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _logActivity_decorators, { kind: "method", name: "logActivity", static: false, private: false, access: { has: obj => "logActivity" in obj, get: obj => obj.logActivity }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getUpcoming_decorators, { kind: "method", name: "getUpcoming", static: false, private: false, access: { has: obj => "getUpcoming" in obj, get: obj => obj.getUpcoming }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getProgress_decorators, { kind: "method", name: "getProgress", static: false, private: false, access: { has: obj => "getProgress" in obj, get: obj => obj.getProgress }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            TimelineController = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        timelineService = __runInitializers(this, _instanceExtraInitializers);
        constructor(timelineService) {
            this.timelineService = timelineService;
        }
        createSegment(projectId, createDto, userId) {
            return this.timelineService.createSegment(projectId, createDto, userId);
        }
        getTimeline(projectId) {
            return this.timelineService.getProjectTimeline(projectId);
        }
        getSegment(projectId, segmentId) {
            return this.timelineService.getSegment(projectId, segmentId);
        }
        updateSegment(projectId, segmentId, updateDto, userId) {
            return this.timelineService.updateSegment(projectId, segmentId, updateDto, userId);
        }
        logActivity(projectId, logDto, userId, req) {
            const ipAddress = req.ip || req.socket.remoteAddress;
            const userAgent = req.headers['user-agent'];
            return this.timelineService.logActivity(projectId, logDto, userId, ipAddress, userAgent);
        }
        getUpcoming(projectId, days) {
            const daysAhead = days ? parseInt(days, 10) : 30;
            return this.timelineService.getUpcomingEvents(projectId, daysAhead);
        }
        getProgress(projectId) {
            return this.timelineService.getProgressMetrics(projectId);
        }
    };
    return TimelineController = _classThis;
})();
exports.TimelineController = TimelineController;
//# sourceMappingURL=timeline.controller.js.map