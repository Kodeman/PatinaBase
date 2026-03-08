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
exports.LogActivityDto = exports.EntityType = exports.ActivityType = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var ActivityType;
(function (ActivityType) {
    ActivityType["VIEW"] = "view";
    ActivityType["COMMENT"] = "comment";
    ActivityType["APPROVE"] = "approve";
    ActivityType["REJECT"] = "reject";
    ActivityType["UPLOAD"] = "upload";
    ActivityType["DOWNLOAD"] = "download";
    ActivityType["DISCUSS"] = "discuss";
})(ActivityType || (exports.ActivityType = ActivityType = {}));
var EntityType;
(function (EntityType) {
    EntityType["SEGMENT"] = "segment";
    EntityType["APPROVAL"] = "approval";
    EntityType["DOCUMENT"] = "document";
    EntityType["TASK"] = "task";
    EntityType["MILESTONE"] = "milestone";
})(EntityType || (exports.EntityType = EntityType = {}));
let LogActivityDto = (() => {
    let _segmentId_decorators;
    let _segmentId_initializers = [];
    let _segmentId_extraInitializers = [];
    let _activityType_decorators;
    let _activityType_initializers = [];
    let _activityType_extraInitializers = [];
    let _entityType_decorators;
    let _entityType_initializers = [];
    let _entityType_extraInitializers = [];
    let _entityId_decorators;
    let _entityId_initializers = [];
    let _entityId_extraInitializers = [];
    let _duration_decorators;
    let _duration_initializers = [];
    let _duration_extraInitializers = [];
    let _metadata_decorators;
    let _metadata_initializers = [];
    let _metadata_extraInitializers = [];
    return class LogActivityDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _segmentId_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Timeline segment ID (if applicable)' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsOptional)()];
            _activityType_decorators = [(0, swagger_1.ApiProperty)({ description: 'Activity type', enum: ActivityType }), (0, class_validator_1.IsEnum)(ActivityType)];
            _entityType_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Entity type being acted upon', enum: EntityType }), (0, class_validator_1.IsEnum)(EntityType), (0, class_validator_1.IsOptional)()];
            _entityId_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Entity ID being acted upon' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsOptional)()];
            _duration_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Duration in seconds (for view activities)', minimum: 0 }), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(0), (0, class_validator_1.IsOptional)()];
            _metadata_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Additional metadata' }), (0, class_validator_1.IsOptional)()];
            __esDecorate(null, null, _segmentId_decorators, { kind: "field", name: "segmentId", static: false, private: false, access: { has: obj => "segmentId" in obj, get: obj => obj.segmentId, set: (obj, value) => { obj.segmentId = value; } }, metadata: _metadata }, _segmentId_initializers, _segmentId_extraInitializers);
            __esDecorate(null, null, _activityType_decorators, { kind: "field", name: "activityType", static: false, private: false, access: { has: obj => "activityType" in obj, get: obj => obj.activityType, set: (obj, value) => { obj.activityType = value; } }, metadata: _metadata }, _activityType_initializers, _activityType_extraInitializers);
            __esDecorate(null, null, _entityType_decorators, { kind: "field", name: "entityType", static: false, private: false, access: { has: obj => "entityType" in obj, get: obj => obj.entityType, set: (obj, value) => { obj.entityType = value; } }, metadata: _metadata }, _entityType_initializers, _entityType_extraInitializers);
            __esDecorate(null, null, _entityId_decorators, { kind: "field", name: "entityId", static: false, private: false, access: { has: obj => "entityId" in obj, get: obj => obj.entityId, set: (obj, value) => { obj.entityId = value; } }, metadata: _metadata }, _entityId_initializers, _entityId_extraInitializers);
            __esDecorate(null, null, _duration_decorators, { kind: "field", name: "duration", static: false, private: false, access: { has: obj => "duration" in obj, get: obj => obj.duration, set: (obj, value) => { obj.duration = value; } }, metadata: _metadata }, _duration_initializers, _duration_extraInitializers);
            __esDecorate(null, null, _metadata_decorators, { kind: "field", name: "metadata", static: false, private: false, access: { has: obj => "metadata" in obj, get: obj => obj.metadata, set: (obj, value) => { obj.metadata = value; } }, metadata: _metadata }, _metadata_initializers, _metadata_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        segmentId = __runInitializers(this, _segmentId_initializers, void 0);
        activityType = (__runInitializers(this, _segmentId_extraInitializers), __runInitializers(this, _activityType_initializers, void 0));
        entityType = (__runInitializers(this, _activityType_extraInitializers), __runInitializers(this, _entityType_initializers, void 0));
        entityId = (__runInitializers(this, _entityType_extraInitializers), __runInitializers(this, _entityId_initializers, void 0));
        duration = (__runInitializers(this, _entityId_extraInitializers), __runInitializers(this, _duration_initializers, void 0));
        metadata = (__runInitializers(this, _duration_extraInitializers), __runInitializers(this, _metadata_initializers, void 0));
        constructor() {
            __runInitializers(this, _metadata_extraInitializers);
        }
    };
})();
exports.LogActivityDto = LogActivityDto;
//# sourceMappingURL=log-activity.dto.js.map