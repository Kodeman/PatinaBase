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
exports.RfisController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_guard_1 = require("../common/guards/auth.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const project_access_guard_1 = require("../common/guards/project-access.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
let RfisController = (() => {
    let _classDecorators = [(0, swagger_1.ApiTags)('rfis'), (0, swagger_1.ApiBearerAuth)(), (0, common_1.Controller)('projects/:projectId/rfis'), (0, common_1.UseGuards)(auth_guard_1.AuthGuard, roles_guard_1.RolesGuard, project_access_guard_1.ProjectAccessGuard)];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _create_decorators;
    let _findAll_decorators;
    let _getOverdue_decorators;
    let _findOne_decorators;
    let _update_decorators;
    var RfisController = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _create_decorators = [(0, common_1.Post)(), (0, roles_decorator_1.Roles)('admin', 'designer', 'contractor'), (0, swagger_1.ApiOperation)({ summary: 'Create a new RFI' }), (0, swagger_1.ApiResponse)({ status: 201, description: 'RFI created successfully' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Project not found' })];
            _findAll_decorators = [(0, common_1.Get)(), (0, roles_decorator_1.Roles)('admin', 'designer', 'client', 'contractor'), (0, swagger_1.ApiOperation)({ summary: 'Get all RFIs for a project' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'RFIs retrieved successfully' })];
            _getOverdue_decorators = [(0, common_1.Get)('overdue'), (0, roles_decorator_1.Roles)('admin', 'designer'), (0, swagger_1.ApiOperation)({ summary: 'Get overdue RFIs' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Overdue RFIs retrieved successfully' })];
            _findOne_decorators = [(0, common_1.Get)(':id'), (0, roles_decorator_1.Roles)('admin', 'designer', 'client', 'contractor'), (0, swagger_1.ApiOperation)({ summary: 'Get RFI by ID' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'RFI retrieved successfully' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'RFI not found' })];
            _update_decorators = [(0, common_1.Patch)(':id'), (0, roles_decorator_1.Roles)('admin', 'designer', 'contractor'), (0, swagger_1.ApiOperation)({ summary: 'Update RFI (answer, status, etc.)' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'RFI updated successfully' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'RFI not found' })];
            __esDecorate(this, null, _create_decorators, { kind: "method", name: "create", static: false, private: false, access: { has: obj => "create" in obj, get: obj => obj.create }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _findAll_decorators, { kind: "method", name: "findAll", static: false, private: false, access: { has: obj => "findAll" in obj, get: obj => obj.findAll }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getOverdue_decorators, { kind: "method", name: "getOverdue", static: false, private: false, access: { has: obj => "getOverdue" in obj, get: obj => obj.getOverdue }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _findOne_decorators, { kind: "method", name: "findOne", static: false, private: false, access: { has: obj => "findOne" in obj, get: obj => obj.findOne }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _update_decorators, { kind: "method", name: "update", static: false, private: false, access: { has: obj => "update" in obj, get: obj => obj.update }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            RfisController = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        rfisService = __runInitializers(this, _instanceExtraInitializers);
        constructor(rfisService) {
            this.rfisService = rfisService;
        }
        create(projectId, createDto, userId) {
            return this.rfisService.create(projectId, createDto, userId);
        }
        findAll(projectId, status) {
            return this.rfisService.findAll(projectId, status);
        }
        getOverdue(projectId) {
            return this.rfisService.getOverdue(projectId);
        }
        findOne(id) {
            return this.rfisService.findOne(id);
        }
        update(id, updateDto, userId) {
            return this.rfisService.update(id, updateDto, userId);
        }
    };
    return RfisController = _classThis;
})();
exports.RfisController = RfisController;
//# sourceMappingURL=rfis.controller.js.map