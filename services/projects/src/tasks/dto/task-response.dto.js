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
exports.TaskResponseDto = void 0;
const class_transformer_1 = require("class-transformer");
const swagger_1 = require("@nestjs/swagger");
/**
 * Task Response DTO
 * Excludes sensitive internal fields
 */
let TaskResponseDto = (() => {
    let _classDecorators = [(0, class_transformer_1.Exclude)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _id_decorators;
    let _id_initializers = [];
    let _id_extraInitializers = [];
    let _projectId_decorators;
    let _projectId_initializers = [];
    let _projectId_extraInitializers = [];
    let _title_decorators;
    let _title_initializers = [];
    let _title_extraInitializers = [];
    let _description_decorators;
    let _description_initializers = [];
    let _description_extraInitializers = [];
    let _assigneeId_decorators;
    let _assigneeId_initializers = [];
    let _assigneeId_extraInitializers = [];
    let _dueDate_decorators;
    let _dueDate_initializers = [];
    let _dueDate_extraInitializers = [];
    let _status_decorators;
    let _status_initializers = [];
    let _status_extraInitializers = [];
    let _priority_decorators;
    let _priority_initializers = [];
    let _priority_extraInitializers = [];
    let _order_decorators;
    let _order_initializers = [];
    let _order_extraInitializers = [];
    let _completedAt_decorators;
    let _completedAt_initializers = [];
    let _completedAt_extraInitializers = [];
    let _createdAt_decorators;
    let _createdAt_initializers = [];
    let _createdAt_extraInitializers = [];
    let _updatedAt_decorators;
    let _updatedAt_initializers = [];
    let _updatedAt_extraInitializers = [];
    var TaskResponseDto = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _id_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({ description: 'Task ID', example: '123e4567-e89b-12d3-a456-426614174000' })];
            _projectId_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({ description: 'Project ID', example: '123e4567-e89b-12d3-a456-426614174001' })];
            _title_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({ description: 'Task title', example: 'Install hardwood flooring' })];
            _description_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({ description: 'Task description', nullable: true, example: 'Install oak hardwood in living room' })];
            _assigneeId_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({ description: 'Assignee user ID', nullable: true, example: '123e4567-e89b-12d3-a456-426614174002' })];
            _dueDate_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({ description: 'Task due date', nullable: true })];
            _status_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({
                    description: 'Task status',
                    enum: ['todo', 'in_progress', 'blocked', 'done', 'cancelled'],
                    example: 'in_progress',
                })];
            _priority_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({
                    description: 'Task priority',
                    enum: ['low', 'medium', 'high', 'urgent'],
                    example: 'high',
                })];
            _order_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({ description: 'Sort order', example: 1 })];
            _completedAt_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({ description: 'Task completion date', nullable: true })];
            _createdAt_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({ description: 'Task creation date' })];
            _updatedAt_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({ description: 'Task last update date' })];
            __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
            __esDecorate(null, null, _projectId_decorators, { kind: "field", name: "projectId", static: false, private: false, access: { has: obj => "projectId" in obj, get: obj => obj.projectId, set: (obj, value) => { obj.projectId = value; } }, metadata: _metadata }, _projectId_initializers, _projectId_extraInitializers);
            __esDecorate(null, null, _title_decorators, { kind: "field", name: "title", static: false, private: false, access: { has: obj => "title" in obj, get: obj => obj.title, set: (obj, value) => { obj.title = value; } }, metadata: _metadata }, _title_initializers, _title_extraInitializers);
            __esDecorate(null, null, _description_decorators, { kind: "field", name: "description", static: false, private: false, access: { has: obj => "description" in obj, get: obj => obj.description, set: (obj, value) => { obj.description = value; } }, metadata: _metadata }, _description_initializers, _description_extraInitializers);
            __esDecorate(null, null, _assigneeId_decorators, { kind: "field", name: "assigneeId", static: false, private: false, access: { has: obj => "assigneeId" in obj, get: obj => obj.assigneeId, set: (obj, value) => { obj.assigneeId = value; } }, metadata: _metadata }, _assigneeId_initializers, _assigneeId_extraInitializers);
            __esDecorate(null, null, _dueDate_decorators, { kind: "field", name: "dueDate", static: false, private: false, access: { has: obj => "dueDate" in obj, get: obj => obj.dueDate, set: (obj, value) => { obj.dueDate = value; } }, metadata: _metadata }, _dueDate_initializers, _dueDate_extraInitializers);
            __esDecorate(null, null, _status_decorators, { kind: "field", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status, set: (obj, value) => { obj.status = value; } }, metadata: _metadata }, _status_initializers, _status_extraInitializers);
            __esDecorate(null, null, _priority_decorators, { kind: "field", name: "priority", static: false, private: false, access: { has: obj => "priority" in obj, get: obj => obj.priority, set: (obj, value) => { obj.priority = value; } }, metadata: _metadata }, _priority_initializers, _priority_extraInitializers);
            __esDecorate(null, null, _order_decorators, { kind: "field", name: "order", static: false, private: false, access: { has: obj => "order" in obj, get: obj => obj.order, set: (obj, value) => { obj.order = value; } }, metadata: _metadata }, _order_initializers, _order_extraInitializers);
            __esDecorate(null, null, _completedAt_decorators, { kind: "field", name: "completedAt", static: false, private: false, access: { has: obj => "completedAt" in obj, get: obj => obj.completedAt, set: (obj, value) => { obj.completedAt = value; } }, metadata: _metadata }, _completedAt_initializers, _completedAt_extraInitializers);
            __esDecorate(null, null, _createdAt_decorators, { kind: "field", name: "createdAt", static: false, private: false, access: { has: obj => "createdAt" in obj, get: obj => obj.createdAt, set: (obj, value) => { obj.createdAt = value; } }, metadata: _metadata }, _createdAt_initializers, _createdAt_extraInitializers);
            __esDecorate(null, null, _updatedAt_decorators, { kind: "field", name: "updatedAt", static: false, private: false, access: { has: obj => "updatedAt" in obj, get: obj => obj.updatedAt, set: (obj, value) => { obj.updatedAt = value; } }, metadata: _metadata }, _updatedAt_initializers, _updatedAt_extraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            TaskResponseDto = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        id = __runInitializers(this, _id_initializers, void 0);
        projectId = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _projectId_initializers, void 0));
        title = (__runInitializers(this, _projectId_extraInitializers), __runInitializers(this, _title_initializers, void 0));
        description = (__runInitializers(this, _title_extraInitializers), __runInitializers(this, _description_initializers, void 0));
        assigneeId = (__runInitializers(this, _description_extraInitializers), __runInitializers(this, _assigneeId_initializers, void 0));
        dueDate = (__runInitializers(this, _assigneeId_extraInitializers), __runInitializers(this, _dueDate_initializers, void 0));
        status = (__runInitializers(this, _dueDate_extraInitializers), __runInitializers(this, _status_initializers, void 0));
        priority = (__runInitializers(this, _status_extraInitializers), __runInitializers(this, _priority_initializers, void 0));
        order = (__runInitializers(this, _priority_extraInitializers), __runInitializers(this, _order_initializers, void 0));
        completedAt = (__runInitializers(this, _order_extraInitializers), __runInitializers(this, _completedAt_initializers, void 0));
        createdAt = (__runInitializers(this, _completedAt_extraInitializers), __runInitializers(this, _createdAt_initializers, void 0));
        updatedAt = (__runInitializers(this, _createdAt_extraInitializers), __runInitializers(this, _updatedAt_initializers, void 0));
        // EXCLUDED FIELDS:
        // - metadata (internal)
        static fromPrisma(task) {
            if (!task)
                return undefined;
            const dto = new TaskResponseDto();
            dto.id = task.id;
            dto.projectId = task.projectId;
            dto.title = task.title;
            dto.description = task.description;
            dto.assigneeId = task.assigneeId;
            dto.dueDate = task.dueDate;
            dto.status = task.status;
            dto.priority = task.priority;
            dto.order = task.order;
            dto.completedAt = task.completedAt;
            dto.createdAt = task.createdAt;
            dto.updatedAt = task.updatedAt;
            return dto;
        }
        static fromPrismaMany(tasks) {
            return tasks?.map((t) => this.fromPrisma(t)).filter((t) => t !== undefined) || [];
        }
        constructor() {
            __runInitializers(this, _updatedAt_extraInitializers);
        }
    };
    return TaskResponseDto = _classThis;
})();
exports.TaskResponseDto = TaskResponseDto;
//# sourceMappingURL=task-response.dto.js.map