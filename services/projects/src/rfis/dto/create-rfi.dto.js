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
exports.CreateRFIDto = exports.RFIPriority = exports.RFIStatus = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var RFIStatus;
(function (RFIStatus) {
    RFIStatus["OPEN"] = "open";
    RFIStatus["ANSWERED"] = "answered";
    RFIStatus["CLOSED"] = "closed";
    RFIStatus["CANCELLED"] = "cancelled";
})(RFIStatus || (exports.RFIStatus = RFIStatus = {}));
var RFIPriority;
(function (RFIPriority) {
    RFIPriority["NORMAL"] = "normal";
    RFIPriority["URGENT"] = "urgent";
})(RFIPriority || (exports.RFIPriority = RFIPriority = {}));
let CreateRFIDto = (() => {
    let _title_decorators;
    let _title_initializers = [];
    let _title_extraInitializers = [];
    let _question_decorators;
    let _question_initializers = [];
    let _question_extraInitializers = [];
    let _assignedTo_decorators;
    let _assignedTo_initializers = [];
    let _assignedTo_extraInitializers = [];
    let _dueDate_decorators;
    let _dueDate_initializers = [];
    let _dueDate_extraInitializers = [];
    let _priority_decorators;
    let _priority_initializers = [];
    let _priority_extraInitializers = [];
    let _metadata_decorators;
    let _metadata_initializers = [];
    let _metadata_extraInitializers = [];
    return class CreateRFIDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _title_decorators = [(0, swagger_1.ApiProperty)({ description: 'RFI title' }), (0, class_validator_1.IsString)()];
            _question_decorators = [(0, swagger_1.ApiProperty)({ description: 'RFI question/description' }), (0, class_validator_1.IsString)()];
            _assignedTo_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'User ID to assign RFI to' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)()];
            _dueDate_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Due date for response' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsDateString)()];
            _priority_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Priority level', enum: RFIPriority, default: 'normal' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsEnum)(RFIPriority)];
            _metadata_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Additional metadata (attachments, etc.)' }), (0, class_validator_1.IsOptional)()];
            __esDecorate(null, null, _title_decorators, { kind: "field", name: "title", static: false, private: false, access: { has: obj => "title" in obj, get: obj => obj.title, set: (obj, value) => { obj.title = value; } }, metadata: _metadata }, _title_initializers, _title_extraInitializers);
            __esDecorate(null, null, _question_decorators, { kind: "field", name: "question", static: false, private: false, access: { has: obj => "question" in obj, get: obj => obj.question, set: (obj, value) => { obj.question = value; } }, metadata: _metadata }, _question_initializers, _question_extraInitializers);
            __esDecorate(null, null, _assignedTo_decorators, { kind: "field", name: "assignedTo", static: false, private: false, access: { has: obj => "assignedTo" in obj, get: obj => obj.assignedTo, set: (obj, value) => { obj.assignedTo = value; } }, metadata: _metadata }, _assignedTo_initializers, _assignedTo_extraInitializers);
            __esDecorate(null, null, _dueDate_decorators, { kind: "field", name: "dueDate", static: false, private: false, access: { has: obj => "dueDate" in obj, get: obj => obj.dueDate, set: (obj, value) => { obj.dueDate = value; } }, metadata: _metadata }, _dueDate_initializers, _dueDate_extraInitializers);
            __esDecorate(null, null, _priority_decorators, { kind: "field", name: "priority", static: false, private: false, access: { has: obj => "priority" in obj, get: obj => obj.priority, set: (obj, value) => { obj.priority = value; } }, metadata: _metadata }, _priority_initializers, _priority_extraInitializers);
            __esDecorate(null, null, _metadata_decorators, { kind: "field", name: "metadata", static: false, private: false, access: { has: obj => "metadata" in obj, get: obj => obj.metadata, set: (obj, value) => { obj.metadata = value; } }, metadata: _metadata }, _metadata_initializers, _metadata_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        title = __runInitializers(this, _title_initializers, void 0);
        question = (__runInitializers(this, _title_extraInitializers), __runInitializers(this, _question_initializers, void 0));
        assignedTo = (__runInitializers(this, _question_extraInitializers), __runInitializers(this, _assignedTo_initializers, void 0));
        dueDate = (__runInitializers(this, _assignedTo_extraInitializers), __runInitializers(this, _dueDate_initializers, void 0));
        priority = (__runInitializers(this, _dueDate_extraInitializers), __runInitializers(this, _priority_initializers, void 0));
        metadata = (__runInitializers(this, _priority_extraInitializers), __runInitializers(this, _metadata_initializers, void 0));
        constructor() {
            __runInitializers(this, _metadata_extraInitializers);
        }
    };
})();
exports.CreateRFIDto = CreateRFIDto;
//# sourceMappingURL=create-rfi.dto.js.map