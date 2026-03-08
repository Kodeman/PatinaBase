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
exports.ProjectsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const project_response_dto_1 = require("./dto/project-response.dto");
const auth_guard_1 = require("../common/guards/auth.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const project_access_guard_1 = require("../common/guards/project-access.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
let ProjectsController = (() => {
    let _classDecorators = [(0, swagger_1.ApiTags)('projects'), (0, swagger_1.ApiBearerAuth)(), (0, common_1.Controller)('projects'), (0, common_1.UseGuards)(auth_guard_1.AuthGuard, roles_guard_1.RolesGuard)];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _create_decorators;
    let _findAll_decorators;
    let _findOne_decorators;
    let _update_decorators;
    let _getStats_decorators;
    let _findByIds_decorators;
    let _getClientView_decorators;
    let _getProgress_decorators;
    let _getActivityFeed_decorators;
    let _getUpcoming_decorators;
    var ProjectsController = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _create_decorators = [(0, common_1.Post)(), (0, roles_decorator_1.Roles)('admin', 'designer'), (0, swagger_1.ApiOperation)({ summary: 'Create a new project' }), (0, swagger_1.ApiResponse)({ status: 201, description: 'Project created successfully', type: project_response_dto_1.ProjectResponseDto }), (0, swagger_1.ApiResponse)({ status: 403, description: 'Forbidden' })];
            _findAll_decorators = [(0, common_1.Get)(), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Get all projects (filtered by role)' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Projects retrieved successfully', type: [project_response_dto_1.ProjectResponseDto] })];
            _findOne_decorators = [(0, common_1.Get)(':id'), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, common_1.UseGuards)(project_access_guard_1.ProjectAccessGuard), (0, swagger_1.ApiOperation)({ summary: 'Get project by ID' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Project retrieved successfully', type: project_response_dto_1.ProjectResponseDto }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Project not found' })];
            _update_decorators = [(0, common_1.Patch)(':id'), (0, roles_decorator_1.Roles)('admin', 'designer'), (0, common_1.UseGuards)(project_access_guard_1.ProjectAccessGuard), (0, swagger_1.ApiOperation)({ summary: 'Update project' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Project updated successfully', type: project_response_dto_1.ProjectResponseDto }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Project not found' })];
            _getStats_decorators = [(0, common_1.Get)(':id/stats'), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, common_1.UseGuards)(project_access_guard_1.ProjectAccessGuard), (0, swagger_1.ApiOperation)({ summary: 'Get project statistics' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Statistics retrieved successfully' })];
            _findByIds_decorators = [(0, common_1.Post)('batch'), (0, common_1.HttpCode)(common_1.HttpStatus.OK), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Batch fetch projects by IDs' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Projects retrieved in order of requested IDs', type: [project_response_dto_1.ProjectResponseDto] })];
            _getClientView_decorators = [(0, common_1.Get)(':id/client-view'), (0, roles_decorator_1.Roles)('client'), (0, common_1.UseGuards)(project_access_guard_1.ProjectAccessGuard), (0, swagger_1.ApiOperation)({ summary: 'Get client-safe project data for client portal' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Client-safe data retrieved' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Project not found or access denied' })];
            _getProgress_decorators = [(0, common_1.Get)(':id/progress'), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, common_1.UseGuards)(project_access_guard_1.ProjectAccessGuard), (0, swagger_1.ApiOperation)({ summary: 'Get comprehensive project progress metrics' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Progress metrics retrieved' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Project not found' })];
            _getActivityFeed_decorators = [(0, common_1.Get)(':id/activity-feed'), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, common_1.UseGuards)(project_access_guard_1.ProjectAccessGuard), (0, swagger_1.ApiOperation)({ summary: 'Get activity feed for project' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Activity feed retrieved' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Project not found' })];
            _getUpcoming_decorators = [(0, common_1.Get)(':id/upcoming'), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, common_1.UseGuards)(project_access_guard_1.ProjectAccessGuard), (0, swagger_1.ApiOperation)({ summary: 'Get upcoming events and deadlines' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Upcoming events retrieved' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Project not found' })];
            __esDecorate(this, null, _create_decorators, { kind: "method", name: "create", static: false, private: false, access: { has: obj => "create" in obj, get: obj => obj.create }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _findAll_decorators, { kind: "method", name: "findAll", static: false, private: false, access: { has: obj => "findAll" in obj, get: obj => obj.findAll }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _findOne_decorators, { kind: "method", name: "findOne", static: false, private: false, access: { has: obj => "findOne" in obj, get: obj => obj.findOne }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _update_decorators, { kind: "method", name: "update", static: false, private: false, access: { has: obj => "update" in obj, get: obj => obj.update }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getStats_decorators, { kind: "method", name: "getStats", static: false, private: false, access: { has: obj => "getStats" in obj, get: obj => obj.getStats }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _findByIds_decorators, { kind: "method", name: "findByIds", static: false, private: false, access: { has: obj => "findByIds" in obj, get: obj => obj.findByIds }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getClientView_decorators, { kind: "method", name: "getClientView", static: false, private: false, access: { has: obj => "getClientView" in obj, get: obj => obj.getClientView }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getProgress_decorators, { kind: "method", name: "getProgress", static: false, private: false, access: { has: obj => "getProgress" in obj, get: obj => obj.getProgress }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getActivityFeed_decorators, { kind: "method", name: "getActivityFeed", static: false, private: false, access: { has: obj => "getActivityFeed" in obj, get: obj => obj.getActivityFeed }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getUpcoming_decorators, { kind: "method", name: "getUpcoming", static: false, private: false, access: { has: obj => "getUpcoming" in obj, get: obj => obj.getUpcoming }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ProjectsController = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        projectsService = __runInitializers(this, _instanceExtraInitializers);
        constructor(projectsService) {
            this.projectsService = projectsService;
        }
        async create(createDto, userId) {
            const project = await this.projectsService.create(createDto, userId);
            return project_response_dto_1.ProjectResponseDto.fromPrisma(project);
        }
        async findAll(query, user) {
            const projects = await this.projectsService.findAll(query, user.id, user.role);
            return project_response_dto_1.ProjectResponseDto.fromPrismaMany(projects);
        }
        async findOne(id) {
            const project = await this.projectsService.findOne(id);
            return project_response_dto_1.ProjectResponseDto.fromPrisma(project);
        }
        async update(id, updateDto, userId) {
            const project = await this.projectsService.update(id, updateDto, userId);
            return project_response_dto_1.ProjectResponseDto.fromPrisma(project);
        }
        getStats(id) {
            return this.projectsService.getStats(id);
        }
        async findByIds(body) {
            const projects = await this.projectsService.findByIds(body.ids);
            // CRITICAL: Return in same order as requested IDs for DataLoader
            const projectsMap = new Map(projects.map(p => [p.id, p]));
            return body.ids.map(id => {
                const project = projectsMap.get(id);
                return project ? project_response_dto_1.ProjectResponseDto.fromPrisma(project) : null;
            });
        }
        getClientView(id, clientId) {
            return this.projectsService.getClientSafeData(id, clientId);
        }
        getProgress(id) {
            return this.projectsService.calculateProgress(id);
        }
        getActivityFeed(id, limit, offset) {
            const limitNum = limit ? parseInt(limit, 10) : 50;
            const offsetNum = offset ? parseInt(offset, 10) : 0;
            return this.projectsService.getActivityFeed(id, limitNum, offsetNum);
        }
        getUpcoming(id, days) {
            const daysAhead = days ? parseInt(days, 10) : 30;
            return this.projectsService.getUpcomingEvents(id, daysAhead);
        }
    };
    return ProjectsController = _classThis;
})();
exports.ProjectsController = ProjectsController;
//# sourceMappingURL=projects.controller.js.map