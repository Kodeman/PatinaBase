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
exports.CreateApprovalDto = exports.ApprovalPriority = exports.ApprovalType = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var ApprovalType;
(function (ApprovalType) {
    ApprovalType["DESIGN"] = "design";
    ApprovalType["BUDGET"] = "budget";
    ApprovalType["MATERIAL"] = "material";
    ApprovalType["MILESTONE"] = "milestone";
    ApprovalType["CHANGE_ORDER"] = "change_order";
    ApprovalType["FINAL"] = "final";
})(ApprovalType || (exports.ApprovalType = ApprovalType = {}));
var ApprovalPriority;
(function (ApprovalPriority) {
    ApprovalPriority["LOW"] = "low";
    ApprovalPriority["NORMAL"] = "normal";
    ApprovalPriority["HIGH"] = "high";
    ApprovalPriority["URGENT"] = "urgent";
})(ApprovalPriority || (exports.ApprovalPriority = ApprovalPriority = {}));
let CreateApprovalDto = (() => {
    let _segmentId_decorators;
    let _segmentId_initializers = [];
    let _segmentId_extraInitializers = [];
    let _title_decorators;
    let _title_initializers = [];
    let _title_extraInitializers = [];
    let _description_decorators;
    let _description_initializers = [];
    let _description_extraInitializers = [];
    let _approvalType_decorators;
    let _approvalType_initializers = [];
    let _approvalType_extraInitializers = [];
    let _priority_decorators;
    let _priority_initializers = [];
    let _priority_extraInitializers = [];
    let _assignedTo_decorators;
    let _assignedTo_initializers = [];
    let _assignedTo_extraInitializers = [];
    let _dueDate_decorators;
    let _dueDate_initializers = [];
    let _dueDate_extraInitializers = [];
    let _documents_decorators;
    let _documents_initializers = [];
    let _documents_extraInitializers = [];
    let _metadata_decorators;
    let _metadata_initializers = [];
    let _metadata_extraInitializers = [];
    return class CreateApprovalDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _segmentId_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Timeline segment ID (if related to a segment)' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsOptional)()];
            _title_decorators = [(0, swagger_1.ApiProperty)({ description: 'Approval title' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _description_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Approval description' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsOptional)()];
            _approvalType_decorators = [(0, swagger_1.ApiProperty)({ description: 'Approval type', enum: ApprovalType }), (0, class_validator_1.IsEnum)(ApprovalType)];
            _priority_decorators = [(0, swagger_1.ApiProperty)({ description: 'Priority', enum: ApprovalPriority }), (0, class_validator_1.IsEnum)(ApprovalPriority), (0, class_validator_1.IsOptional)()];
            _assignedTo_decorators = [(0, swagger_1.ApiProperty)({ description: 'Client user ID to assign approval to' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _dueDate_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Due date for approval' }), (0, class_validator_1.IsDateString)(), (0, class_validator_1.IsOptional)()];
            _documents_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Array of document IDs/keys', type: [String] }), (0, class_validator_1.IsArray)(), (0, class_validator_1.IsOptional)()];
            _metadata_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Additional metadata' }), (0, class_validator_1.IsOptional)()];
            __esDecorate(null, null, _segmentId_decorators, { kind: "field", name: "segmentId", static: false, private: false, access: { has: obj => "segmentId" in obj, get: obj => obj.segmentId, set: (obj, value) => { obj.segmentId = value; } }, metadata: _metadata }, _segmentId_initializers, _segmentId_extraInitializers);
            __esDecorate(null, null, _title_decorators, { kind: "field", name: "title", static: false, private: false, access: { has: obj => "title" in obj, get: obj => obj.title, set: (obj, value) => { obj.title = value; } }, metadata: _metadata }, _title_initializers, _title_extraInitializers);
            __esDecorate(null, null, _description_decorators, { kind: "field", name: "description", static: false, private: false, access: { has: obj => "description" in obj, get: obj => obj.description, set: (obj, value) => { obj.description = value; } }, metadata: _metadata }, _description_initializers, _description_extraInitializers);
            __esDecorate(null, null, _approvalType_decorators, { kind: "field", name: "approvalType", static: false, private: false, access: { has: obj => "approvalType" in obj, get: obj => obj.approvalType, set: (obj, value) => { obj.approvalType = value; } }, metadata: _metadata }, _approvalType_initializers, _approvalType_extraInitializers);
            __esDecorate(null, null, _priority_decorators, { kind: "field", name: "priority", static: false, private: false, access: { has: obj => "priority" in obj, get: obj => obj.priority, set: (obj, value) => { obj.priority = value; } }, metadata: _metadata }, _priority_initializers, _priority_extraInitializers);
            __esDecorate(null, null, _assignedTo_decorators, { kind: "field", name: "assignedTo", static: false, private: false, access: { has: obj => "assignedTo" in obj, get: obj => obj.assignedTo, set: (obj, value) => { obj.assignedTo = value; } }, metadata: _metadata }, _assignedTo_initializers, _assignedTo_extraInitializers);
            __esDecorate(null, null, _dueDate_decorators, { kind: "field", name: "dueDate", static: false, private: false, access: { has: obj => "dueDate" in obj, get: obj => obj.dueDate, set: (obj, value) => { obj.dueDate = value; } }, metadata: _metadata }, _dueDate_initializers, _dueDate_extraInitializers);
            __esDecorate(null, null, _documents_decorators, { kind: "field", name: "documents", static: false, private: false, access: { has: obj => "documents" in obj, get: obj => obj.documents, set: (obj, value) => { obj.documents = value; } }, metadata: _metadata }, _documents_initializers, _documents_extraInitializers);
            __esDecorate(null, null, _metadata_decorators, { kind: "field", name: "metadata", static: false, private: false, access: { has: obj => "metadata" in obj, get: obj => obj.metadata, set: (obj, value) => { obj.metadata = value; } }, metadata: _metadata }, _metadata_initializers, _metadata_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        segmentId = __runInitializers(this, _segmentId_initializers, void 0);
        title = (__runInitializers(this, _segmentId_extraInitializers), __runInitializers(this, _title_initializers, void 0));
        description = (__runInitializers(this, _title_extraInitializers), __runInitializers(this, _description_initializers, void 0));
        approvalType = (__runInitializers(this, _description_extraInitializers), __runInitializers(this, _approvalType_initializers, void 0));
        priority = (__runInitializers(this, _approvalType_extraInitializers), __runInitializers(this, _priority_initializers, void 0));
        assignedTo = (__runInitializers(this, _priority_extraInitializers), __runInitializers(this, _assignedTo_initializers, void 0));
        dueDate = (__runInitializers(this, _assignedTo_extraInitializers), __runInitializers(this, _dueDate_initializers, void 0));
        documents = (__runInitializers(this, _dueDate_extraInitializers), __runInitializers(this, _documents_initializers, void 0));
        metadata = (__runInitializers(this, _documents_extraInitializers), __runInitializers(this, _metadata_initializers, void 0));
        constructor() {
            __runInitializers(this, _metadata_extraInitializers);
        }
    };
})();
exports.CreateApprovalDto = CreateApprovalDto;
//# sourceMappingURL=create-approval.dto.js.map