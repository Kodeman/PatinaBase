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
exports.IssuesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_guard_1 = require("../common/guards/auth.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const project_access_guard_1 = require("../common/guards/project-access.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
let IssuesController = (() => {
    let _classDecorators = [(0, swagger_1.ApiTags)('issues'), (0, swagger_1.ApiBearerAuth)(), (0, common_1.Controller)('projects/:projectId/issues'), (0, common_1.UseGuards)(auth_guard_1.AuthGuard, roles_guard_1.RolesGuard, project_access_guard_1.ProjectAccessGuard)];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _create_decorators;
    let _findAll_decorators;
    let _findOne_decorators;
    let _update_decorators;
    var IssuesController = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _create_decorators = [(0, common_1.Post)(), (0, roles_decorator_1.Roles)('admin', 'designer', 'contractor', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Create a new issue' }), (0, swagger_1.ApiResponse)({ status: 201, description: 'Issue created successfully' })];
            _findAll_decorators = [(0, common_1.Get)(), (0, roles_decorator_1.Roles)('admin', 'designer', 'client', 'contractor'), (0, swagger_1.ApiOperation)({ summary: 'Get all issues for a project' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Issues retrieved successfully' })];
            _findOne_decorators = [(0, common_1.Get)(':id'), (0, roles_decorator_1.Roles)('admin', 'designer', 'client', 'contractor'), (0, swagger_1.ApiOperation)({ summary: 'Get issue by ID' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Issue retrieved successfully' })];
            _update_decorators = [(0, common_1.Patch)(':id'), (0, roles_decorator_1.Roles)('admin', 'designer', 'contractor'), (0, swagger_1.ApiOperation)({ summary: 'Update issue' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Issue updated successfully' })];
            __esDecorate(this, null, _create_decorators, { kind: "method", name: "create", static: false, private: false, access: { has: obj => "create" in obj, get: obj => obj.create }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _findAll_decorators, { kind: "method", name: "findAll", static: false, private: false, access: { has: obj => "findAll" in obj, get: obj => obj.findAll }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _findOne_decorators, { kind: "method", name: "findOne", static: false, private: false, access: { has: obj => "findOne" in obj, get: obj => obj.findOne }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _update_decorators, { kind: "method", name: "update", static: false, private: false, access: { has: obj => "update" in obj, get: obj => obj.update }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            IssuesController = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        issuesService = __runInitializers(this, _instanceExtraInitializers);
        constructor(issuesService) {
            this.issuesService = issuesService;
        }
        create(projectId, createDto, userId) {
            return this.issuesService.create(projectId, createDto, userId);
        }
        findAll(projectId, status) {
            return this.issuesService.findAll(projectId, status);
        }
        findOne(id) {
            return this.issuesService.findOne(id);
        }
        update(id, updateDto, userId) {
            return this.issuesService.update(id, updateDto, userId);
        }
    };
    return IssuesController = _classThis;
})();
exports.IssuesController = IssuesController;
//# sourceMappingURL=issues.controller.js.map