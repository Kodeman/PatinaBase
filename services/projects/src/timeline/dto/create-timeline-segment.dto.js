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
exports.CreateTimelineSegmentDto = exports.TimelinePhase = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var TimelinePhase;
(function (TimelinePhase) {
    TimelinePhase["PLANNING"] = "planning";
    TimelinePhase["DESIGN"] = "design";
    TimelinePhase["PROCUREMENT"] = "procurement";
    TimelinePhase["CONSTRUCTION"] = "construction";
    TimelinePhase["COMPLETION"] = "completion";
})(TimelinePhase || (exports.TimelinePhase = TimelinePhase = {}));
let CreateTimelineSegmentDto = (() => {
    let _title_decorators;
    let _title_initializers = [];
    let _title_extraInitializers = [];
    let _description_decorators;
    let _description_initializers = [];
    let _description_extraInitializers = [];
    let _phase_decorators;
    let _phase_initializers = [];
    let _phase_extraInitializers = [];
    let _startDate_decorators;
    let _startDate_initializers = [];
    let _startDate_extraInitializers = [];
    let _endDate_decorators;
    let _endDate_initializers = [];
    let _endDate_extraInitializers = [];
    let _progress_decorators;
    let _progress_initializers = [];
    let _progress_extraInitializers = [];
    let _dependencies_decorators;
    let _dependencies_initializers = [];
    let _dependencies_extraInitializers = [];
    let _deliverables_decorators;
    let _deliverables_initializers = [];
    let _deliverables_extraInitializers = [];
    let _order_decorators;
    let _order_initializers = [];
    let _order_extraInitializers = [];
    let _metadata_decorators;
    let _metadata_initializers = [];
    let _metadata_extraInitializers = [];
    return class CreateTimelineSegmentDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _title_decorators = [(0, swagger_1.ApiProperty)({ description: 'Segment title' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _description_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Segment description' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsOptional)()];
            _phase_decorators = [(0, swagger_1.ApiProperty)({ description: 'Project phase', enum: TimelinePhase }), (0, class_validator_1.IsEnum)(TimelinePhase)];
            _startDate_decorators = [(0, swagger_1.ApiProperty)({ description: 'Segment start date' }), (0, class_validator_1.IsDateString)()];
            _endDate_decorators = [(0, swagger_1.ApiProperty)({ description: 'Segment end date' }), (0, class_validator_1.IsDateString)()];
            _progress_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Progress percentage (0-100)', minimum: 0, maximum: 100 }), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(0), (0, class_validator_1.Max)(100), (0, class_validator_1.IsOptional)()];
            _dependencies_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Array of dependent segment IDs', type: [String] }), (0, class_validator_1.IsArray)(), (0, class_validator_1.IsOptional)()];
            _deliverables_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Array of deliverable descriptions', type: [String] }), (0, class_validator_1.IsArray)(), (0, class_validator_1.IsOptional)()];
            _order_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Display order' }), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(0), (0, class_validator_1.IsOptional)()];
            _metadata_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Additional metadata' }), (0, class_validator_1.IsOptional)()];
            __esDecorate(null, null, _title_decorators, { kind: "field", name: "title", static: false, private: false, access: { has: obj => "title" in obj, get: obj => obj.title, set: (obj, value) => { obj.title = value; } }, metadata: _metadata }, _title_initializers, _title_extraInitializers);
            __esDecorate(null, null, _description_decorators, { kind: "field", name: "description", static: false, private: false, access: { has: obj => "description" in obj, get: obj => obj.description, set: (obj, value) => { obj.description = value; } }, metadata: _metadata }, _description_initializers, _description_extraInitializers);
            __esDecorate(null, null, _phase_decorators, { kind: "field", name: "phase", static: false, private: false, access: { has: obj => "phase" in obj, get: obj => obj.phase, set: (obj, value) => { obj.phase = value; } }, metadata: _metadata }, _phase_initializers, _phase_extraInitializers);
            __esDecorate(null, null, _startDate_decorators, { kind: "field", name: "startDate", static: false, private: false, access: { has: obj => "startDate" in obj, get: obj => obj.startDate, set: (obj, value) => { obj.startDate = value; } }, metadata: _metadata }, _startDate_initializers, _startDate_extraInitializers);
            __esDecorate(null, null, _endDate_decorators, { kind: "field", name: "endDate", static: false, private: false, access: { has: obj => "endDate" in obj, get: obj => obj.endDate, set: (obj, value) => { obj.endDate = value; } }, metadata: _metadata }, _endDate_initializers, _endDate_extraInitializers);
            __esDecorate(null, null, _progress_decorators, { kind: "field", name: "progress", static: false, private: false, access: { has: obj => "progress" in obj, get: obj => obj.progress, set: (obj, value) => { obj.progress = value; } }, metadata: _metadata }, _progress_initializers, _progress_extraInitializers);
            __esDecorate(null, null, _dependencies_decorators, { kind: "field", name: "dependencies", static: false, private: false, access: { has: obj => "dependencies" in obj, get: obj => obj.dependencies, set: (obj, value) => { obj.dependencies = value; } }, metadata: _metadata }, _dependencies_initializers, _dependencies_extraInitializers);
            __esDecorate(null, null, _deliverables_decorators, { kind: "field", name: "deliverables", static: false, private: false, access: { has: obj => "deliverables" in obj, get: obj => obj.deliverables, set: (obj, value) => { obj.deliverables = value; } }, metadata: _metadata }, _deliverables_initializers, _deliverables_extraInitializers);
            __esDecorate(null, null, _order_decorators, { kind: "field", name: "order", static: false, private: false, access: { has: obj => "order" in obj, get: obj => obj.order, set: (obj, value) => { obj.order = value; } }, metadata: _metadata }, _order_initializers, _order_extraInitializers);
            __esDecorate(null, null, _metadata_decorators, { kind: "field", name: "metadata", static: false, private: false, access: { has: obj => "metadata" in obj, get: obj => obj.metadata, set: (obj, value) => { obj.metadata = value; } }, metadata: _metadata }, _metadata_initializers, _metadata_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        title = __runInitializers(this, _title_initializers, void 0);
        description = (__runInitializers(this, _title_extraInitializers), __runInitializers(this, _description_initializers, void 0));
        phase = (__runInitializers(this, _description_extraInitializers), __runInitializers(this, _phase_initializers, void 0));
        startDate = (__runInitializers(this, _phase_extraInitializers), __runInitializers(this, _startDate_initializers, void 0));
        endDate = (__runInitializers(this, _startDate_extraInitializers), __runInitializers(this, _endDate_initializers, void 0));
        progress = (__runInitializers(this, _endDate_extraInitializers), __runInitializers(this, _progress_initializers, void 0));
        dependencies = (__runInitializers(this, _progress_extraInitializers), __runInitializers(this, _dependencies_initializers, void 0));
        deliverables = (__runInitializers(this, _dependencies_extraInitializers), __runInitializers(this, _deliverables_initializers, void 0));
        order = (__runInitializers(this, _deliverables_extraInitializers), __runInitializers(this, _order_initializers, void 0));
        metadata = (__runInitializers(this, _order_extraInitializers), __runInitializers(this, _metadata_initializers, void 0));
        constructor() {
            __runInitializers(this, _metadata_extraInitializers);
        }
    };
})();
exports.CreateTimelineSegmentDto = CreateTimelineSegmentDto;
//# sourceMappingURL=create-timeline-segment.dto.js.map