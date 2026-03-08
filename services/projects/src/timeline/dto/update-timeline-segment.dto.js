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
exports.UpdateTimelineSegmentDto = exports.TimelineSegmentStatus = void 0;
const swagger_1 = require("@nestjs/swagger");
const create_timeline_segment_dto_1 = require("./create-timeline-segment.dto");
const swagger_2 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var TimelineSegmentStatus;
(function (TimelineSegmentStatus) {
    TimelineSegmentStatus["PENDING"] = "pending";
    TimelineSegmentStatus["IN_PROGRESS"] = "in_progress";
    TimelineSegmentStatus["COMPLETED"] = "completed";
    TimelineSegmentStatus["DELAYED"] = "delayed";
})(TimelineSegmentStatus || (exports.TimelineSegmentStatus = TimelineSegmentStatus = {}));
let UpdateTimelineSegmentDto = (() => {
    let _classSuper = (0, swagger_1.PartialType)(create_timeline_segment_dto_1.CreateTimelineSegmentDto);
    let _status_decorators;
    let _status_initializers = [];
    let _status_extraInitializers = [];
    return class UpdateTimelineSegmentDto extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _status_decorators = [(0, swagger_2.ApiPropertyOptional)({ description: 'Segment status', enum: TimelineSegmentStatus }), (0, class_validator_1.IsEnum)(TimelineSegmentStatus), (0, class_validator_1.IsOptional)()];
            __esDecorate(null, null, _status_decorators, { kind: "field", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status, set: (obj, value) => { obj.status = value; } }, metadata: _metadata }, _status_initializers, _status_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        status = __runInitializers(this, _status_initializers, void 0);
        constructor() {
            super(...arguments);
            __runInitializers(this, _status_extraInitializers);
        }
    };
})();
exports.UpdateTimelineSegmentDto = UpdateTimelineSegmentDto;
//# sourceMappingURL=update-timeline-segment.dto.js.map