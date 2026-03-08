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
exports.ApprovalsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_guard_1 = require("../common/guards/auth.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const project_access_guard_1 = require("../common/guards/project-access.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
let ApprovalsController = (() => {
    let _classDecorators = [(0, swagger_1.ApiTags)('approvals'), (0, swagger_1.ApiBearerAuth)(), (0, common_1.Controller)('projects/:projectId/approvals'), (0, common_1.UseGuards)(auth_guard_1.AuthGuard, roles_guard_1.RolesGuard, project_access_guard_1.ProjectAccessGuard)];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _create_decorators;
    let _findAll_decorators;
    let _getPending_decorators;
    let _getMetrics_decorators;
    let _findOne_decorators;
    let _approve_decorators;
    let _reject_decorators;
    let _discuss_decorators;
    let _addSignature_decorators;
    var ApprovalsController = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _create_decorators = [(0, common_1.Post)(), (0, roles_decorator_1.Roles)('admin', 'designer'), (0, swagger_1.ApiOperation)({ summary: 'Create a new approval request' }), (0, swagger_1.ApiParam)({ name: 'projectId', description: 'Project ID' }), (0, swagger_1.ApiResponse)({ status: 201, description: 'Approval created successfully' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Project not found' })];
            _findAll_decorators = [(0, common_1.Get)(), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Get all approvals for a project' }), (0, swagger_1.ApiParam)({ name: 'projectId', description: 'Project ID' }), (0, swagger_1.ApiQuery)({ name: 'status', required: false, description: 'Filter by status' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Approvals retrieved successfully' })];
            _getPending_decorators = [(0, common_1.Get)('pending'), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Get pending approvals for a project' }), (0, swagger_1.ApiParam)({ name: 'projectId', description: 'Project ID' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Pending approvals retrieved' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Project not found' })];
            _getMetrics_decorators = [(0, common_1.Get)('metrics'), (0, roles_decorator_1.Roles)('admin', 'designer'), (0, swagger_1.ApiOperation)({ summary: 'Get approval metrics for a project' }), (0, swagger_1.ApiParam)({ name: 'projectId', description: 'Project ID' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Metrics retrieved successfully' })];
            _findOne_decorators = [(0, common_1.Get)(':approvalId'), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Get specific approval details' }), (0, swagger_1.ApiParam)({ name: 'projectId', description: 'Project ID' }), (0, swagger_1.ApiParam)({ name: 'approvalId', description: 'Approval ID' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Approval retrieved successfully' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Approval not found' })];
            _approve_decorators = [(0, common_1.Post)(':approvalId/approve'), (0, common_1.HttpCode)(common_1.HttpStatus.OK), (0, roles_decorator_1.Roles)('admin', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Approve an approval request' }), (0, swagger_1.ApiParam)({ name: 'projectId', description: 'Project ID' }), (0, swagger_1.ApiParam)({ name: 'approvalId', description: 'Approval ID' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Approval approved successfully' }), (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid approval state' }), (0, swagger_1.ApiResponse)({ status: 403, description: 'Not authorized' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Approval not found' })];
            _reject_decorators = [(0, common_1.Post)(':approvalId/reject'), (0, common_1.HttpCode)(common_1.HttpStatus.OK), (0, roles_decorator_1.Roles)('admin', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Reject an approval request' }), (0, swagger_1.ApiParam)({ name: 'projectId', description: 'Project ID' }), (0, swagger_1.ApiParam)({ name: 'approvalId', description: 'Approval ID' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Approval rejected successfully' }), (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid approval state' }), (0, swagger_1.ApiResponse)({ status: 403, description: 'Not authorized' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Approval not found' })];
            _discuss_decorators = [(0, common_1.Post)(':approvalId/discuss'), (0, common_1.HttpCode)(common_1.HttpStatus.OK), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Add a discussion comment to an approval' }), (0, swagger_1.ApiParam)({ name: 'projectId', description: 'Project ID' }), (0, swagger_1.ApiParam)({ name: 'approvalId', description: 'Approval ID' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Comment added successfully' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Approval not found' })];
            _addSignature_decorators = [(0, common_1.Put)(':approvalId/signature'), (0, roles_decorator_1.Roles)('admin', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Add/update digital signature for an approval' }), (0, swagger_1.ApiParam)({ name: 'projectId', description: 'Project ID' }), (0, swagger_1.ApiParam)({ name: 'approvalId', description: 'Approval ID' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Signature added successfully' }), (0, swagger_1.ApiResponse)({ status: 403, description: 'Not authorized' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Approval not found' })];
            __esDecorate(this, null, _create_decorators, { kind: "method", name: "create", static: false, private: false, access: { has: obj => "create" in obj, get: obj => obj.create }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _findAll_decorators, { kind: "method", name: "findAll", static: false, private: false, access: { has: obj => "findAll" in obj, get: obj => obj.findAll }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getPending_decorators, { kind: "method", name: "getPending", static: false, private: false, access: { has: obj => "getPending" in obj, get: obj => obj.getPending }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getMetrics_decorators, { kind: "method", name: "getMetrics", static: false, private: false, access: { has: obj => "getMetrics" in obj, get: obj => obj.getMetrics }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _findOne_decorators, { kind: "method", name: "findOne", static: false, private: false, access: { has: obj => "findOne" in obj, get: obj => obj.findOne }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _approve_decorators, { kind: "method", name: "approve", static: false, private: false, access: { has: obj => "approve" in obj, get: obj => obj.approve }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _reject_decorators, { kind: "method", name: "reject", static: false, private: false, access: { has: obj => "reject" in obj, get: obj => obj.reject }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _discuss_decorators, { kind: "method", name: "discuss", static: false, private: false, access: { has: obj => "discuss" in obj, get: obj => obj.discuss }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _addSignature_decorators, { kind: "method", name: "addSignature", static: false, private: false, access: { has: obj => "addSignature" in obj, get: obj => obj.addSignature }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ApprovalsController = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        approvalsService = __runInitializers(this, _instanceExtraInitializers);
        constructor(approvalsService) {
            this.approvalsService = approvalsService;
        }
        create(projectId, createDto, userId) {
            return this.approvalsService.create(projectId, createDto, userId);
        }
        findAll(projectId, status) {
            return this.approvalsService.findByProject(projectId, status);
        }
        getPending(projectId) {
            return this.approvalsService.getPending(projectId);
        }
        getMetrics(projectId) {
            return this.approvalsService.getApprovalMetrics(projectId);
        }
        findOne(projectId, approvalId) {
            return this.approvalsService.findOne(projectId, approvalId);
        }
        approve(projectId, approvalId, approveDto, userId, req) {
            const ipAddress = req.ip || req.socket.remoteAddress;
            return this.approvalsService.approve(projectId, approvalId, approveDto, userId, ipAddress);
        }
        reject(projectId, approvalId, rejectDto, userId) {
            return this.approvalsService.reject(projectId, approvalId, rejectDto, userId);
        }
        discuss(projectId, approvalId, discussDto, userId) {
            return this.approvalsService.discuss(projectId, approvalId, discussDto, userId);
        }
        addSignature(projectId, approvalId, signatureDto, userId, req) {
            const ipAddress = req.ip || req.socket.remoteAddress;
            return this.approvalsService.addSignature(projectId, approvalId, signatureDto, userId, ipAddress);
        }
    };
    return ApprovalsController = _classThis;
})();
exports.ApprovalsController = ApprovalsController;
//# sourceMappingURL=approvals.controller.js.map