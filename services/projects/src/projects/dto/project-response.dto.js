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
exports.ProjectResponseDto = void 0;
const class_transformer_1 = require("class-transformer");
const swagger_1 = require("@nestjs/swagger");
/**
 * Project Response DTO
 * Excludes sensitive internal fields
 */
let ProjectResponseDto = (() => {
    let _classDecorators = [(0, class_transformer_1.Exclude)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _id_decorators;
    let _id_initializers = [];
    let _id_extraInitializers = [];
    let _proposalId_decorators;
    let _proposalId_initializers = [];
    let _proposalId_extraInitializers = [];
    let _title_decorators;
    let _title_initializers = [];
    let _title_extraInitializers = [];
    let _clientId_decorators;
    let _clientId_initializers = [];
    let _clientId_extraInitializers = [];
    let _designerId_decorators;
    let _designerId_initializers = [];
    let _designerId_extraInitializers = [];
    let _status_decorators;
    let _status_initializers = [];
    let _status_extraInitializers = [];
    let _startDate_decorators;
    let _startDate_initializers = [];
    let _startDate_extraInitializers = [];
    let _endDate_decorators;
    let _endDate_initializers = [];
    let _endDate_extraInitializers = [];
    let _actualEnd_decorators;
    let _actualEnd_initializers = [];
    let _actualEnd_extraInitializers = [];
    let _budget_decorators;
    let _budget_initializers = [];
    let _budget_extraInitializers = [];
    let _currency_decorators;
    let _currency_initializers = [];
    let _currency_extraInitializers = [];
    let _description_decorators;
    let _description_initializers = [];
    let _description_extraInitializers = [];
    let _createdAt_decorators;
    let _createdAt_initializers = [];
    let _createdAt_extraInitializers = [];
    let _updatedAt_decorators;
    let _updatedAt_initializers = [];
    let _updatedAt_extraInitializers = [];
    var ProjectResponseDto = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _id_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({ description: 'Project ID', example: '123e4567-e89b-12d3-a456-426614174000' })];
            _proposalId_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({ description: 'Proposal ID', nullable: true, example: '123e4567-e89b-12d3-a456-426614174001' })];
            _title_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({ description: 'Project title', example: 'Modern Living Room Redesign' })];
            _clientId_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({ description: 'Client ID', example: '123e4567-e89b-12d3-a456-426614174002' })];
            _designerId_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({ description: 'Designer ID', example: '123e4567-e89b-12d3-a456-426614174003' })];
            _status_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({
                    description: 'Project status',
                    enum: ['draft', 'active', 'substantial_completion', 'closed'],
                    example: 'active',
                })];
            _startDate_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({ description: 'Project start date', nullable: true })];
            _endDate_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({ description: 'Planned end date', nullable: true })];
            _actualEnd_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({ description: 'Actual end date', nullable: true })];
            _budget_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({ description: 'Budget amount (decimal)', nullable: true, example: '50000.00' })];
            _currency_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({ description: 'Currency code', example: 'USD' })];
            _description_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({ description: 'Project description', nullable: true })];
            _createdAt_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({ description: 'Project creation date' })];
            _updatedAt_decorators = [(0, class_transformer_1.Expose)(), (0, swagger_1.ApiProperty)({ description: 'Project last update date' })];
            __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
            __esDecorate(null, null, _proposalId_decorators, { kind: "field", name: "proposalId", static: false, private: false, access: { has: obj => "proposalId" in obj, get: obj => obj.proposalId, set: (obj, value) => { obj.proposalId = value; } }, metadata: _metadata }, _proposalId_initializers, _proposalId_extraInitializers);
            __esDecorate(null, null, _title_decorators, { kind: "field", name: "title", static: false, private: false, access: { has: obj => "title" in obj, get: obj => obj.title, set: (obj, value) => { obj.title = value; } }, metadata: _metadata }, _title_initializers, _title_extraInitializers);
            __esDecorate(null, null, _clientId_decorators, { kind: "field", name: "clientId", static: false, private: false, access: { has: obj => "clientId" in obj, get: obj => obj.clientId, set: (obj, value) => { obj.clientId = value; } }, metadata: _metadata }, _clientId_initializers, _clientId_extraInitializers);
            __esDecorate(null, null, _designerId_decorators, { kind: "field", name: "designerId", static: false, private: false, access: { has: obj => "designerId" in obj, get: obj => obj.designerId, set: (obj, value) => { obj.designerId = value; } }, metadata: _metadata }, _designerId_initializers, _designerId_extraInitializers);
            __esDecorate(null, null, _status_decorators, { kind: "field", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status, set: (obj, value) => { obj.status = value; } }, metadata: _metadata }, _status_initializers, _status_extraInitializers);
            __esDecorate(null, null, _startDate_decorators, { kind: "field", name: "startDate", static: false, private: false, access: { has: obj => "startDate" in obj, get: obj => obj.startDate, set: (obj, value) => { obj.startDate = value; } }, metadata: _metadata }, _startDate_initializers, _startDate_extraInitializers);
            __esDecorate(null, null, _endDate_decorators, { kind: "field", name: "endDate", static: false, private: false, access: { has: obj => "endDate" in obj, get: obj => obj.endDate, set: (obj, value) => { obj.endDate = value; } }, metadata: _metadata }, _endDate_initializers, _endDate_extraInitializers);
            __esDecorate(null, null, _actualEnd_decorators, { kind: "field", name: "actualEnd", static: false, private: false, access: { has: obj => "actualEnd" in obj, get: obj => obj.actualEnd, set: (obj, value) => { obj.actualEnd = value; } }, metadata: _metadata }, _actualEnd_initializers, _actualEnd_extraInitializers);
            __esDecorate(null, null, _budget_decorators, { kind: "field", name: "budget", static: false, private: false, access: { has: obj => "budget" in obj, get: obj => obj.budget, set: (obj, value) => { obj.budget = value; } }, metadata: _metadata }, _budget_initializers, _budget_extraInitializers);
            __esDecorate(null, null, _currency_decorators, { kind: "field", name: "currency", static: false, private: false, access: { has: obj => "currency" in obj, get: obj => obj.currency, set: (obj, value) => { obj.currency = value; } }, metadata: _metadata }, _currency_initializers, _currency_extraInitializers);
            __esDecorate(null, null, _description_decorators, { kind: "field", name: "description", static: false, private: false, access: { has: obj => "description" in obj, get: obj => obj.description, set: (obj, value) => { obj.description = value; } }, metadata: _metadata }, _description_initializers, _description_extraInitializers);
            __esDecorate(null, null, _createdAt_decorators, { kind: "field", name: "createdAt", static: false, private: false, access: { has: obj => "createdAt" in obj, get: obj => obj.createdAt, set: (obj, value) => { obj.createdAt = value; } }, metadata: _metadata }, _createdAt_initializers, _createdAt_extraInitializers);
            __esDecorate(null, null, _updatedAt_decorators, { kind: "field", name: "updatedAt", static: false, private: false, access: { has: obj => "updatedAt" in obj, get: obj => obj.updatedAt, set: (obj, value) => { obj.updatedAt = value; } }, metadata: _metadata }, _updatedAt_initializers, _updatedAt_extraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ProjectResponseDto = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        id = __runInitializers(this, _id_initializers, void 0);
        proposalId = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _proposalId_initializers, void 0));
        title = (__runInitializers(this, _proposalId_extraInitializers), __runInitializers(this, _title_initializers, void 0));
        clientId = (__runInitializers(this, _title_extraInitializers), __runInitializers(this, _clientId_initializers, void 0));
        designerId = (__runInitializers(this, _clientId_extraInitializers), __runInitializers(this, _designerId_initializers, void 0));
        status = (__runInitializers(this, _designerId_extraInitializers), __runInitializers(this, _status_initializers, void 0));
        startDate = (__runInitializers(this, _status_extraInitializers), __runInitializers(this, _startDate_initializers, void 0));
        endDate = (__runInitializers(this, _startDate_extraInitializers), __runInitializers(this, _endDate_initializers, void 0));
        actualEnd = (__runInitializers(this, _endDate_extraInitializers), __runInitializers(this, _actualEnd_initializers, void 0));
        budget = (__runInitializers(this, _actualEnd_extraInitializers), __runInitializers(this, _budget_initializers, void 0));
        currency = (__runInitializers(this, _budget_extraInitializers), __runInitializers(this, _currency_initializers, void 0));
        description = (__runInitializers(this, _currency_extraInitializers), __runInitializers(this, _description_initializers, void 0));
        createdAt = (__runInitializers(this, _description_extraInitializers), __runInitializers(this, _createdAt_initializers, void 0));
        updatedAt = (__runInitializers(this, _createdAt_extraInitializers), __runInitializers(this, _updatedAt_initializers, void 0));
        // EXCLUDED FIELDS:
        // - metadata (internal)
        static fromPrisma(project) {
            if (!project)
                return undefined;
            const dto = new ProjectResponseDto();
            dto.id = project.id;
            dto.proposalId = project.proposalId;
            dto.title = project.title;
            dto.clientId = project.clientId;
            dto.designerId = project.designerId;
            dto.status = project.status;
            dto.startDate = project.startDate;
            dto.endDate = project.endDate;
            dto.actualEnd = project.actualEnd;
            // Transform Decimal to string
            dto.budget = project.budget ? project.budget.toString() : null;
            dto.currency = project.currency;
            dto.description = project.description;
            dto.createdAt = project.createdAt;
            dto.updatedAt = project.updatedAt;
            return dto;
        }
        static fromPrismaMany(projects) {
            return (projects?.map((p) => this.fromPrisma(p)).filter((p) => p !== undefined) || []);
        }
        constructor() {
            __runInitializers(this, _updatedAt_extraInitializers);
        }
    };
    return ProjectResponseDto = _classThis;
})();
exports.ProjectResponseDto = ProjectResponseDto;
//# sourceMappingURL=project-response.dto.js.map