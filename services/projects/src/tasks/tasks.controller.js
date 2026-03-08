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
exports.TasksController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const task_response_dto_1 = require("./dto/task-response.dto");
const auth_guard_1 = require("../common/guards/auth.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const project_access_guard_1 = require("../common/guards/project-access.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
let TasksController = (() => {
    let _classDecorators = [(0, swagger_1.ApiTags)('tasks'), (0, swagger_1.ApiBearerAuth)(), (0, common_1.Controller)('projects/:projectId/tasks'), (0, common_1.UseGuards)(auth_guard_1.AuthGuard, roles_guard_1.RolesGuard, project_access_guard_1.ProjectAccessGuard)];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _create_decorators;
    let _findAll_decorators;
    let _findOne_decorators;
    let _update_decorators;
    let _remove_decorators;
    let _bulkUpdate_decorators;
    var TasksController = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _create_decorators = [(0, common_1.Post)(), (0, roles_decorator_1.Roles)('admin', 'designer'), (0, swagger_1.ApiOperation)({ summary: 'Create a new task' }), (0, swagger_1.ApiResponse)({ status: 201, description: 'Task created successfully', type: task_response_dto_1.TaskResponseDto }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Project not found' })];
            _findAll_decorators = [(0, common_1.Get)(), (0, roles_decorator_1.Roles)('admin', 'designer', 'client', 'contractor'), (0, swagger_1.ApiOperation)({ summary: 'Get all tasks for a project' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Tasks retrieved successfully', type: [task_response_dto_1.TaskResponseDto] })];
            _findOne_decorators = [(0, common_1.Get)(':id'), (0, roles_decorator_1.Roles)('admin', 'designer', 'client', 'contractor'), (0, swagger_1.ApiOperation)({ summary: 'Get task by ID' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Task retrieved successfully', type: task_response_dto_1.TaskResponseDto }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Task not found' })];
            _update_decorators = [(0, common_1.Patch)(':id'), (0, roles_decorator_1.Roles)('admin', 'designer', 'contractor'), (0, swagger_1.ApiOperation)({ summary: 'Update task' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Task updated successfully', type: task_response_dto_1.TaskResponseDto }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Task not found' })];
            _remove_decorators = [(0, common_1.Delete)(':id'), (0, roles_decorator_1.Roles)('admin', 'designer'), (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT), (0, swagger_1.ApiOperation)({ summary: 'Delete task' }), (0, swagger_1.ApiResponse)({ status: 204, description: 'Task deleted successfully' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Task not found' })];
            _bulkUpdate_decorators = [(0, common_1.Post)('bulk-update'), (0, roles_decorator_1.Roles)('admin', 'designer'), (0, swagger_1.ApiOperation)({ summary: 'Bulk update task status' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Tasks updated successfully' })];
            __esDecorate(this, null, _create_decorators, { kind: "method", name: "create", static: false, private: false, access: { has: obj => "create" in obj, get: obj => obj.create }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _findAll_decorators, { kind: "method", name: "findAll", static: false, private: false, access: { has: obj => "findAll" in obj, get: obj => obj.findAll }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _findOne_decorators, { kind: "method", name: "findOne", static: false, private: false, access: { has: obj => "findOne" in obj, get: obj => obj.findOne }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _update_decorators, { kind: "method", name: "update", static: false, private: false, access: { has: obj => "update" in obj, get: obj => obj.update }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _remove_decorators, { kind: "method", name: "remove", static: false, private: false, access: { has: obj => "remove" in obj, get: obj => obj.remove }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _bulkUpdate_decorators, { kind: "method", name: "bulkUpdate", static: false, private: false, access: { has: obj => "bulkUpdate" in obj, get: obj => obj.bulkUpdate }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            TasksController = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        tasksService = __runInitializers(this, _instanceExtraInitializers);
        constructor(tasksService) {
            this.tasksService = tasksService;
        }
        async create(projectId, createDto, userId) {
            const task = await this.tasksService.create(projectId, createDto, userId);
            return task_response_dto_1.TaskResponseDto.fromPrisma(task);
        }
        async findAll(projectId, status) {
            const tasks = await this.tasksService.findAll(projectId, status);
            return task_response_dto_1.TaskResponseDto.fromPrismaMany(tasks);
        }
        async findOne(id) {
            const task = await this.tasksService.findOne(id);
            return task_response_dto_1.TaskResponseDto.fromPrisma(task);
        }
        async update(id, updateDto, userId) {
            const task = await this.tasksService.update(id, updateDto, userId);
            return task_response_dto_1.TaskResponseDto.fromPrisma(task);
        }
        remove(id, userId) {
            return this.tasksService.remove(id, userId);
        }
        async bulkUpdate(projectId, body, userId) {
            return this.tasksService.bulkUpdateStatus(projectId, body.taskIds, body.status, userId);
        }
    };
    return TasksController = _classThis;
})();
exports.TasksController = TasksController;
//# sourceMappingURL=tasks.controller.js.map