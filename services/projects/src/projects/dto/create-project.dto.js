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
exports.CreateProjectDto = exports.ProjectStatus = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
var ProjectStatus;
(function (ProjectStatus) {
    ProjectStatus["DRAFT"] = "draft";
    ProjectStatus["ACTIVE"] = "active";
    ProjectStatus["SUBSTANTIAL_COMPLETION"] = "substantial_completion";
    ProjectStatus["CLOSED"] = "closed";
})(ProjectStatus || (exports.ProjectStatus = ProjectStatus = {}));
let CreateProjectDto = (() => {
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
    let _startDate_decorators;
    let _startDate_initializers = [];
    let _startDate_extraInitializers = [];
    let _endDate_decorators;
    let _endDate_initializers = [];
    let _endDate_extraInitializers = [];
    let _budget_decorators;
    let _budget_initializers = [];
    let _budget_extraInitializers = [];
    let _currency_decorators;
    let _currency_initializers = [];
    let _currency_extraInitializers = [];
    let _description_decorators;
    let _description_initializers = [];
    let _description_extraInitializers = [];
    let _metadata_decorators;
    let _metadata_initializers = [];
    let _metadata_extraInitializers = [];
    return class CreateProjectDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _proposalId_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'ID of approved proposal to import from' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)()];
            _title_decorators = [(0, swagger_1.ApiProperty)({ description: 'Project title' }), (0, class_validator_1.IsString)()];
            _clientId_decorators = [(0, swagger_1.ApiProperty)({ description: 'Client user ID' }), (0, class_validator_1.IsUUID)()];
            _designerId_decorators = [(0, swagger_1.ApiProperty)({ description: 'Designer user ID' }), (0, class_validator_1.IsUUID)()];
            _startDate_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Project start date' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsDateString)()];
            _endDate_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Estimated end date' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsDateString)()];
            _budget_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Project budget' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsNumber)(), (0, class_transformer_1.Type)(() => Number)];
            _currency_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Currency code', default: 'USD' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _description_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Project description' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _metadata_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Additional metadata' }), (0, class_validator_1.IsOptional)()];
            __esDecorate(null, null, _proposalId_decorators, { kind: "field", name: "proposalId", static: false, private: false, access: { has: obj => "proposalId" in obj, get: obj => obj.proposalId, set: (obj, value) => { obj.proposalId = value; } }, metadata: _metadata }, _proposalId_initializers, _proposalId_extraInitializers);
            __esDecorate(null, null, _title_decorators, { kind: "field", name: "title", static: false, private: false, access: { has: obj => "title" in obj, get: obj => obj.title, set: (obj, value) => { obj.title = value; } }, metadata: _metadata }, _title_initializers, _title_extraInitializers);
            __esDecorate(null, null, _clientId_decorators, { kind: "field", name: "clientId", static: false, private: false, access: { has: obj => "clientId" in obj, get: obj => obj.clientId, set: (obj, value) => { obj.clientId = value; } }, metadata: _metadata }, _clientId_initializers, _clientId_extraInitializers);
            __esDecorate(null, null, _designerId_decorators, { kind: "field", name: "designerId", static: false, private: false, access: { has: obj => "designerId" in obj, get: obj => obj.designerId, set: (obj, value) => { obj.designerId = value; } }, metadata: _metadata }, _designerId_initializers, _designerId_extraInitializers);
            __esDecorate(null, null, _startDate_decorators, { kind: "field", name: "startDate", static: false, private: false, access: { has: obj => "startDate" in obj, get: obj => obj.startDate, set: (obj, value) => { obj.startDate = value; } }, metadata: _metadata }, _startDate_initializers, _startDate_extraInitializers);
            __esDecorate(null, null, _endDate_decorators, { kind: "field", name: "endDate", static: false, private: false, access: { has: obj => "endDate" in obj, get: obj => obj.endDate, set: (obj, value) => { obj.endDate = value; } }, metadata: _metadata }, _endDate_initializers, _endDate_extraInitializers);
            __esDecorate(null, null, _budget_decorators, { kind: "field", name: "budget", static: false, private: false, access: { has: obj => "budget" in obj, get: obj => obj.budget, set: (obj, value) => { obj.budget = value; } }, metadata: _metadata }, _budget_initializers, _budget_extraInitializers);
            __esDecorate(null, null, _currency_decorators, { kind: "field", name: "currency", static: false, private: false, access: { has: obj => "currency" in obj, get: obj => obj.currency, set: (obj, value) => { obj.currency = value; } }, metadata: _metadata }, _currency_initializers, _currency_extraInitializers);
            __esDecorate(null, null, _description_decorators, { kind: "field", name: "description", static: false, private: false, access: { has: obj => "description" in obj, get: obj => obj.description, set: (obj, value) => { obj.description = value; } }, metadata: _metadata }, _description_initializers, _description_extraInitializers);
            __esDecorate(null, null, _metadata_decorators, { kind: "field", name: "metadata", static: false, private: false, access: { has: obj => "metadata" in obj, get: obj => obj.metadata, set: (obj, value) => { obj.metadata = value; } }, metadata: _metadata }, _metadata_initializers, _metadata_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        proposalId = __runInitializers(this, _proposalId_initializers, void 0);
        title = (__runInitializers(this, _proposalId_extraInitializers), __runInitializers(this, _title_initializers, void 0));
        clientId = (__runInitializers(this, _title_extraInitializers), __runInitializers(this, _clientId_initializers, void 0));
        designerId = (__runInitializers(this, _clientId_extraInitializers), __runInitializers(this, _designerId_initializers, void 0));
        startDate = (__runInitializers(this, _designerId_extraInitializers), __runInitializers(this, _startDate_initializers, void 0));
        endDate = (__runInitializers(this, _startDate_extraInitializers), __runInitializers(this, _endDate_initializers, void 0));
        budget = (__runInitializers(this, _endDate_extraInitializers), __runInitializers(this, _budget_initializers, void 0));
        currency = (__runInitializers(this, _budget_extraInitializers), __runInitializers(this, _currency_initializers, void 0));
        description = (__runInitializers(this, _currency_extraInitializers), __runInitializers(this, _description_initializers, void 0));
        metadata = (__runInitializers(this, _description_extraInitializers), __runInitializers(this, _metadata_initializers, void 0));
        constructor() {
            __runInitializers(this, _metadata_extraInitializers);
        }
    };
})();
exports.CreateProjectDto = CreateProjectDto;
//# sourceMappingURL=create-project.dto.js.map