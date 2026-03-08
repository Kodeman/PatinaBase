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
exports.AnalyticsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_guard_1 = require("../common/guards/auth.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const project_access_guard_1 = require("../common/guards/project-access.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
let AnalyticsController = (() => {
    let _classDecorators = [(0, swagger_1.ApiTags)('analytics'), (0, swagger_1.ApiBearerAuth)(), (0, common_1.Controller)(), (0, common_1.UseGuards)(auth_guard_1.AuthGuard, roles_guard_1.RolesGuard)];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _getDashboard_decorators;
    let _getEngagement_decorators;
    let _getActivityBreakdown_decorators;
    let _getTimeBasedAnalytics_decorators;
    let _getApprovalVelocity_decorators;
    let _getSatisfactionMetrics_decorators;
    let _getUserAnalytics_decorators;
    let _getEntityInteractions_decorators;
    let _updateSatisfactionScore_decorators;
    var AnalyticsController = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _getDashboard_decorators = [(0, common_1.Get)('projects/:projectId/analytics'), (0, common_1.UseGuards)(project_access_guard_1.ProjectAccessGuard), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Get comprehensive analytics dashboard for a project' }), (0, swagger_1.ApiParam)({ name: 'projectId', description: 'Project ID' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Dashboard analytics retrieved' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Project not found' })];
            _getEngagement_decorators = [(0, common_1.Get)('projects/:projectId/analytics/engagement'), (0, common_1.UseGuards)(project_access_guard_1.ProjectAccessGuard), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Get detailed engagement metrics for a project' }), (0, swagger_1.ApiParam)({ name: 'projectId', description: 'Project ID' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Engagement metrics retrieved' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Project not found' })];
            _getActivityBreakdown_decorators = [(0, common_1.Get)('projects/:projectId/analytics/activity'), (0, common_1.UseGuards)(project_access_guard_1.ProjectAccessGuard), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Get activity breakdown for a project' }), (0, swagger_1.ApiParam)({ name: 'projectId', description: 'Project ID' }), (0, swagger_1.ApiQuery)({ name: 'days', required: false, description: 'Number of days to analyze (default: 30)' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Activity breakdown retrieved' })];
            _getTimeBasedAnalytics_decorators = [(0, common_1.Get)('projects/:projectId/analytics/time-based'), (0, common_1.UseGuards)(project_access_guard_1.ProjectAccessGuard), (0, roles_decorator_1.Roles)('admin', 'designer'), (0, swagger_1.ApiOperation)({ summary: 'Get time-based analytics (daily/hourly patterns)' }), (0, swagger_1.ApiParam)({ name: 'projectId', description: 'Project ID' }), (0, swagger_1.ApiQuery)({ name: 'days', required: false, description: 'Number of days to analyze (default: 30)' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Time-based analytics retrieved' })];
            _getApprovalVelocity_decorators = [(0, common_1.Get)('projects/:projectId/analytics/approvals'), (0, common_1.UseGuards)(project_access_guard_1.ProjectAccessGuard), (0, roles_decorator_1.Roles)('admin', 'designer'), (0, swagger_1.ApiOperation)({ summary: 'Get approval velocity and metrics' }), (0, swagger_1.ApiParam)({ name: 'projectId', description: 'Project ID' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Approval metrics retrieved' })];
            _getSatisfactionMetrics_decorators = [(0, common_1.Get)('projects/:projectId/analytics/satisfaction'), (0, common_1.UseGuards)(project_access_guard_1.ProjectAccessGuard), (0, roles_decorator_1.Roles)('admin', 'designer'), (0, swagger_1.ApiOperation)({ summary: 'Get client satisfaction metrics' }), (0, swagger_1.ApiParam)({ name: 'projectId', description: 'Project ID' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Satisfaction metrics retrieved' })];
            _getUserAnalytics_decorators = [(0, common_1.Get)('analytics/user'), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Get analytics for current user across all projects' }), (0, swagger_1.ApiQuery)({ name: 'projectId', required: false, description: 'Filter by specific project' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'User analytics retrieved' })];
            _getEntityInteractions_decorators = [(0, common_1.Get)('projects/:projectId/analytics/entity/:entityType/:entityId'), (0, common_1.UseGuards)(project_access_guard_1.ProjectAccessGuard), (0, roles_decorator_1.Roles)('admin', 'designer'), (0, swagger_1.ApiOperation)({ summary: 'Get interaction tracking for specific entity' }), (0, swagger_1.ApiParam)({ name: 'projectId', description: 'Project ID' }), (0, swagger_1.ApiParam)({ name: 'entityType', description: 'Entity type (segment, document, etc.)' }), (0, swagger_1.ApiParam)({ name: 'entityId', description: 'Entity ID' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Entity interactions retrieved' })];
            _updateSatisfactionScore_decorators = [(0, common_1.Put)('projects/:projectId/analytics/satisfaction'), (0, common_1.UseGuards)(project_access_guard_1.ProjectAccessGuard), (0, common_1.HttpCode)(common_1.HttpStatus.OK), (0, roles_decorator_1.Roles)('admin', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Update satisfaction score for a project' }), (0, swagger_1.ApiParam)({ name: 'projectId', description: 'Project ID' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Satisfaction score updated' }), (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid score value' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Metrics not found' })];
            __esDecorate(this, null, _getDashboard_decorators, { kind: "method", name: "getDashboard", static: false, private: false, access: { has: obj => "getDashboard" in obj, get: obj => obj.getDashboard }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getEngagement_decorators, { kind: "method", name: "getEngagement", static: false, private: false, access: { has: obj => "getEngagement" in obj, get: obj => obj.getEngagement }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getActivityBreakdown_decorators, { kind: "method", name: "getActivityBreakdown", static: false, private: false, access: { has: obj => "getActivityBreakdown" in obj, get: obj => obj.getActivityBreakdown }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getTimeBasedAnalytics_decorators, { kind: "method", name: "getTimeBasedAnalytics", static: false, private: false, access: { has: obj => "getTimeBasedAnalytics" in obj, get: obj => obj.getTimeBasedAnalytics }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getApprovalVelocity_decorators, { kind: "method", name: "getApprovalVelocity", static: false, private: false, access: { has: obj => "getApprovalVelocity" in obj, get: obj => obj.getApprovalVelocity }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getSatisfactionMetrics_decorators, { kind: "method", name: "getSatisfactionMetrics", static: false, private: false, access: { has: obj => "getSatisfactionMetrics" in obj, get: obj => obj.getSatisfactionMetrics }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getUserAnalytics_decorators, { kind: "method", name: "getUserAnalytics", static: false, private: false, access: { has: obj => "getUserAnalytics" in obj, get: obj => obj.getUserAnalytics }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getEntityInteractions_decorators, { kind: "method", name: "getEntityInteractions", static: false, private: false, access: { has: obj => "getEntityInteractions" in obj, get: obj => obj.getEntityInteractions }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _updateSatisfactionScore_decorators, { kind: "method", name: "updateSatisfactionScore", static: false, private: false, access: { has: obj => "updateSatisfactionScore" in obj, get: obj => obj.updateSatisfactionScore }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            AnalyticsController = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        analyticsService = __runInitializers(this, _instanceExtraInitializers);
        constructor(analyticsService) {
            this.analyticsService = analyticsService;
        }
        getDashboard(projectId) {
            return this.analyticsService.getDashboardAnalytics(projectId);
        }
        getEngagement(projectId) {
            return this.analyticsService.getProjectEngagement(projectId);
        }
        getActivityBreakdown(projectId, days) {
            const daysNum = days ? parseInt(days, 10) : 30;
            return this.analyticsService.getActivityBreakdown(projectId, daysNum);
        }
        getTimeBasedAnalytics(projectId, days) {
            const daysNum = days ? parseInt(days, 10) : 30;
            return this.analyticsService.getTimeBasedAnalytics(projectId, daysNum);
        }
        getApprovalVelocity(projectId) {
            return this.analyticsService.getApprovalVelocity(projectId);
        }
        getSatisfactionMetrics(projectId) {
            return this.analyticsService.getClientSatisfactionMetrics(projectId);
        }
        getUserAnalytics(userId, projectId) {
            return this.analyticsService.getUserAnalytics(userId, projectId);
        }
        getEntityInteractions(projectId, entityType, entityId) {
            return this.analyticsService.getEntityInteractions(projectId, entityType, entityId);
        }
        updateSatisfactionScore(projectId, body) {
            return this.analyticsService.updateSatisfactionScore(projectId, body.score);
        }
    };
    return AnalyticsController = _classThis;
})();
exports.AnalyticsController = AnalyticsController;
//# sourceMappingURL=analytics.controller.js.map