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
exports.ChangeOrdersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_guard_1 = require("../common/guards/auth.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const project_access_guard_1 = require("../common/guards/project-access.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
let ChangeOrdersController = (() => {
    let _classDecorators = [(0, swagger_1.ApiTags)('change-orders'), (0, swagger_1.ApiBearerAuth)(), (0, common_1.Controller)(), (0, common_1.UseGuards)(auth_guard_1.AuthGuard, roles_guard_1.RolesGuard)];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _create_decorators;
    let _findAll_decorators;
    let _getPendingApprovals_decorators;
    let _findOne_decorators;
    let _submit_decorators;
    let _approve_decorators;
    let _markImplemented_decorators;
    var ChangeOrdersController = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _create_decorators = [(0, common_1.Post)('projects/:projectId/change-orders'), (0, roles_decorator_1.Roles)('admin', 'designer'), (0, common_1.UseGuards)(project_access_guard_1.ProjectAccessGuard), (0, swagger_1.ApiOperation)({ summary: 'Create a new change order' }), (0, swagger_1.ApiResponse)({ status: 201, description: 'Change order created successfully' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Project not found' })];
            _findAll_decorators = [(0, common_1.Get)('projects/:projectId/change-orders'), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, common_1.UseGuards)(project_access_guard_1.ProjectAccessGuard), (0, swagger_1.ApiOperation)({ summary: 'Get all change orders for a project' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Change orders retrieved successfully' })];
            _getPendingApprovals_decorators = [(0, common_1.Get)('change-orders/pending-approvals'), (0, roles_decorator_1.Roles)('admin', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Get pending change order approvals for client' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Pending approvals retrieved successfully' })];
            _findOne_decorators = [(0, common_1.Get)('change-orders/:id'), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Get change order by ID' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Change order retrieved successfully' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Change order not found' })];
            _submit_decorators = [(0, common_1.Patch)('change-orders/:id/submit'), (0, roles_decorator_1.Roles)('admin', 'designer'), (0, swagger_1.ApiOperation)({ summary: 'Submit change order for client approval' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Change order submitted successfully' }), (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid status transition' })];
            _approve_decorators = [(0, common_1.Patch)('change-orders/:id/approve'), (0, roles_decorator_1.Roles)('admin', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Approve or reject change order' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Change order approval processed' }), (0, swagger_1.ApiResponse)({ status: 403, description: 'Only clients can approve change orders' })];
            _markImplemented_decorators = [(0, common_1.Patch)('change-orders/:id/implement'), (0, roles_decorator_1.Roles)('admin', 'designer'), (0, swagger_1.ApiOperation)({ summary: 'Mark change order as implemented' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Change order marked as implemented' }), (0, swagger_1.ApiResponse)({ status: 400, description: 'Change order not approved' })];
            __esDecorate(this, null, _create_decorators, { kind: "method", name: "create", static: false, private: false, access: { has: obj => "create" in obj, get: obj => obj.create }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _findAll_decorators, { kind: "method", name: "findAll", static: false, private: false, access: { has: obj => "findAll" in obj, get: obj => obj.findAll }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getPendingApprovals_decorators, { kind: "method", name: "getPendingApprovals", static: false, private: false, access: { has: obj => "getPendingApprovals" in obj, get: obj => obj.getPendingApprovals }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _findOne_decorators, { kind: "method", name: "findOne", static: false, private: false, access: { has: obj => "findOne" in obj, get: obj => obj.findOne }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _submit_decorators, { kind: "method", name: "submit", static: false, private: false, access: { has: obj => "submit" in obj, get: obj => obj.submit }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _approve_decorators, { kind: "method", name: "approve", static: false, private: false, access: { has: obj => "approve" in obj, get: obj => obj.approve }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _markImplemented_decorators, { kind: "method", name: "markImplemented", static: false, private: false, access: { has: obj => "markImplemented" in obj, get: obj => obj.markImplemented }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ChangeOrdersController = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        changeOrdersService = __runInitializers(this, _instanceExtraInitializers);
        constructor(changeOrdersService) {
            this.changeOrdersService = changeOrdersService;
        }
        create(projectId, createDto, userId) {
            return this.changeOrdersService.create(projectId, createDto, userId);
        }
        findAll(projectId, status) {
            return this.changeOrdersService.findAll(projectId, status);
        }
        getPendingApprovals(userId) {
            return this.changeOrdersService.getPendingApprovals(userId);
        }
        findOne(id) {
            return this.changeOrdersService.findOne(id);
        }
        submit(id, userId) {
            return this.changeOrdersService.submit(id, userId);
        }
        approve(id, approvalDto, user) {
            return this.changeOrdersService.approve(id, approvalDto, user.id, user.role);
        }
        markImplemented(id, userId) {
            return this.changeOrdersService.markImplemented(id, userId);
        }
    };
    return ChangeOrdersController = _classThis;
})();
exports.ChangeOrdersController = ChangeOrdersController;
//# sourceMappingURL=change-orders.controller.js.map