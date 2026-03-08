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
exports.AuditController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_guard_1 = require("../common/guards/auth.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
let AuditController = (() => {
    let _classDecorators = [(0, swagger_1.ApiTags)('audit'), (0, swagger_1.ApiBearerAuth)(), (0, common_1.Controller)('audit'), (0, common_1.UseGuards)(auth_guard_1.AuthGuard, roles_guard_1.RolesGuard), (0, roles_decorator_1.Roles)('admin')];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _queryLogs_decorators;
    let _getEntityHistory_decorators;
    let _getProjectAuditTrail_decorators;
    let _exportAuditTrail_decorators;
    var AuditController = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _queryLogs_decorators = [(0, common_1.Get)('logs'), (0, swagger_1.ApiOperation)({ summary: 'Query audit logs' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Audit logs retrieved successfully' })];
            _getEntityHistory_decorators = [(0, common_1.Get)('entity/:entityType/:entityId'), (0, swagger_1.ApiOperation)({ summary: 'Get full history of an entity' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Entity history retrieved successfully' })];
            _getProjectAuditTrail_decorators = [(0, common_1.Get)('projects/:projectId'), (0, swagger_1.ApiOperation)({ summary: 'Get complete audit trail for a project' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Project audit trail retrieved successfully' })];
            _exportAuditTrail_decorators = [(0, common_1.Get)('export'), (0, swagger_1.ApiOperation)({ summary: 'Export audit logs' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Audit logs exported successfully' })];
            __esDecorate(this, null, _queryLogs_decorators, { kind: "method", name: "queryLogs", static: false, private: false, access: { has: obj => "queryLogs" in obj, get: obj => obj.queryLogs }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getEntityHistory_decorators, { kind: "method", name: "getEntityHistory", static: false, private: false, access: { has: obj => "getEntityHistory" in obj, get: obj => obj.getEntityHistory }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getProjectAuditTrail_decorators, { kind: "method", name: "getProjectAuditTrail", static: false, private: false, access: { has: obj => "getProjectAuditTrail" in obj, get: obj => obj.getProjectAuditTrail }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _exportAuditTrail_decorators, { kind: "method", name: "exportAuditTrail", static: false, private: false, access: { has: obj => "exportAuditTrail" in obj, get: obj => obj.exportAuditTrail }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            AuditController = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        auditService = __runInitializers(this, _instanceExtraInitializers);
        constructor(auditService) {
            this.auditService = auditService;
        }
        queryLogs(entityType, entityId, action, actor, startDate, endDate, page, limit) {
            return this.auditService.queryLogs({
                entityType,
                entityId,
                action,
                actor,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
                page,
                limit,
            });
        }
        getEntityHistory(entityType, entityId) {
            return this.auditService.getEntityHistory(entityType, entityId);
        }
        getProjectAuditTrail(projectId) {
            return this.auditService.getProjectAuditTrail(projectId);
        }
        exportAuditTrail(entityType, entityId, action, actor, startDate, endDate) {
            return this.auditService.exportAuditTrail({
                entityType,
                entityId,
                action,
                actor,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
            });
        }
    };
    return AuditController = _classThis;
})();
exports.AuditController = AuditController;
//# sourceMappingURL=audit.controller.js.map