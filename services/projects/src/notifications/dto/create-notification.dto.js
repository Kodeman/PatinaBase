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
exports.CreateNotificationDto = exports.NotificationChannels = exports.NotificationPriority = exports.NotificationType = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var NotificationType;
(function (NotificationType) {
    NotificationType["APPROVAL_REQUESTED"] = "approval_requested";
    NotificationType["STATUS_UPDATE"] = "status_update";
    NotificationType["COMMENT"] = "comment";
    NotificationType["MILESTONE"] = "milestone";
    NotificationType["DEADLINE"] = "deadline";
    NotificationType["DOCUMENT_UPLOADED"] = "document_uploaded";
    NotificationType["CHANGE_ORDER"] = "change_order";
    NotificationType["RFI"] = "rfi";
    NotificationType["ISSUE"] = "issue";
    NotificationType["DAILY_LOG"] = "daily_log";
})(NotificationType || (exports.NotificationType = NotificationType = {}));
var NotificationPriority;
(function (NotificationPriority) {
    NotificationPriority["LOW"] = "low";
    NotificationPriority["NORMAL"] = "normal";
    NotificationPriority["HIGH"] = "high";
    NotificationPriority["URGENT"] = "urgent";
})(NotificationPriority || (exports.NotificationPriority = NotificationPriority = {}));
let NotificationChannels = (() => {
    let _email_decorators;
    let _email_initializers = [];
    let _email_extraInitializers = [];
    let _sms_decorators;
    let _sms_initializers = [];
    let _sms_extraInitializers = [];
    let _push_decorators;
    let _push_initializers = [];
    let _push_extraInitializers = [];
    return class NotificationChannels {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _email_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Send via email' })];
            _sms_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Send via SMS' })];
            _push_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Send via push notification' })];
            __esDecorate(null, null, _email_decorators, { kind: "field", name: "email", static: false, private: false, access: { has: obj => "email" in obj, get: obj => obj.email, set: (obj, value) => { obj.email = value; } }, metadata: _metadata }, _email_initializers, _email_extraInitializers);
            __esDecorate(null, null, _sms_decorators, { kind: "field", name: "sms", static: false, private: false, access: { has: obj => "sms" in obj, get: obj => obj.sms, set: (obj, value) => { obj.sms = value; } }, metadata: _metadata }, _sms_initializers, _sms_extraInitializers);
            __esDecorate(null, null, _push_decorators, { kind: "field", name: "push", static: false, private: false, access: { has: obj => "push" in obj, get: obj => obj.push, set: (obj, value) => { obj.push = value; } }, metadata: _metadata }, _push_initializers, _push_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        email = __runInitializers(this, _email_initializers, void 0);
        sms = (__runInitializers(this, _email_extraInitializers), __runInitializers(this, _sms_initializers, void 0));
        push = (__runInitializers(this, _sms_extraInitializers), __runInitializers(this, _push_initializers, void 0));
        constructor() {
            __runInitializers(this, _push_extraInitializers);
        }
    };
})();
exports.NotificationChannels = NotificationChannels;
let CreateNotificationDto = (() => {
    let _userId_decorators;
    let _userId_initializers = [];
    let _userId_extraInitializers = [];
    let _projectId_decorators;
    let _projectId_initializers = [];
    let _projectId_extraInitializers = [];
    let _type_decorators;
    let _type_initializers = [];
    let _type_extraInitializers = [];
    let _priority_decorators;
    let _priority_initializers = [];
    let _priority_extraInitializers = [];
    let _title_decorators;
    let _title_initializers = [];
    let _title_extraInitializers = [];
    let _message_decorators;
    let _message_initializers = [];
    let _message_extraInitializers = [];
    let _actionUrl_decorators;
    let _actionUrl_initializers = [];
    let _actionUrl_extraInitializers = [];
    let _channels_decorators;
    let _channels_initializers = [];
    let _channels_extraInitializers = [];
    let _metadata_decorators;
    let _metadata_initializers = [];
    let _metadata_extraInitializers = [];
    return class CreateNotificationDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _userId_decorators = [(0, swagger_1.ApiProperty)({ description: 'User ID to send notification to' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _projectId_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Project ID (if related to a project)' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsOptional)()];
            _type_decorators = [(0, swagger_1.ApiProperty)({ description: 'Notification type', enum: NotificationType }), (0, class_validator_1.IsEnum)(NotificationType)];
            _priority_decorators = [(0, swagger_1.ApiProperty)({ description: 'Notification priority', enum: NotificationPriority }), (0, class_validator_1.IsEnum)(NotificationPriority), (0, class_validator_1.IsOptional)()];
            _title_decorators = [(0, swagger_1.ApiProperty)({ description: 'Notification title' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _message_decorators = [(0, swagger_1.ApiProperty)({ description: 'Notification message' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _actionUrl_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Action URL (deep link)' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsOptional)()];
            _channels_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Delivery channels', type: NotificationChannels }), (0, class_validator_1.IsObject)(), (0, class_validator_1.IsOptional)()];
            _metadata_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Additional metadata' }), (0, class_validator_1.IsOptional)()];
            __esDecorate(null, null, _userId_decorators, { kind: "field", name: "userId", static: false, private: false, access: { has: obj => "userId" in obj, get: obj => obj.userId, set: (obj, value) => { obj.userId = value; } }, metadata: _metadata }, _userId_initializers, _userId_extraInitializers);
            __esDecorate(null, null, _projectId_decorators, { kind: "field", name: "projectId", static: false, private: false, access: { has: obj => "projectId" in obj, get: obj => obj.projectId, set: (obj, value) => { obj.projectId = value; } }, metadata: _metadata }, _projectId_initializers, _projectId_extraInitializers);
            __esDecorate(null, null, _type_decorators, { kind: "field", name: "type", static: false, private: false, access: { has: obj => "type" in obj, get: obj => obj.type, set: (obj, value) => { obj.type = value; } }, metadata: _metadata }, _type_initializers, _type_extraInitializers);
            __esDecorate(null, null, _priority_decorators, { kind: "field", name: "priority", static: false, private: false, access: { has: obj => "priority" in obj, get: obj => obj.priority, set: (obj, value) => { obj.priority = value; } }, metadata: _metadata }, _priority_initializers, _priority_extraInitializers);
            __esDecorate(null, null, _title_decorators, { kind: "field", name: "title", static: false, private: false, access: { has: obj => "title" in obj, get: obj => obj.title, set: (obj, value) => { obj.title = value; } }, metadata: _metadata }, _title_initializers, _title_extraInitializers);
            __esDecorate(null, null, _message_decorators, { kind: "field", name: "message", static: false, private: false, access: { has: obj => "message" in obj, get: obj => obj.message, set: (obj, value) => { obj.message = value; } }, metadata: _metadata }, _message_initializers, _message_extraInitializers);
            __esDecorate(null, null, _actionUrl_decorators, { kind: "field", name: "actionUrl", static: false, private: false, access: { has: obj => "actionUrl" in obj, get: obj => obj.actionUrl, set: (obj, value) => { obj.actionUrl = value; } }, metadata: _metadata }, _actionUrl_initializers, _actionUrl_extraInitializers);
            __esDecorate(null, null, _channels_decorators, { kind: "field", name: "channels", static: false, private: false, access: { has: obj => "channels" in obj, get: obj => obj.channels, set: (obj, value) => { obj.channels = value; } }, metadata: _metadata }, _channels_initializers, _channels_extraInitializers);
            __esDecorate(null, null, _metadata_decorators, { kind: "field", name: "metadata", static: false, private: false, access: { has: obj => "metadata" in obj, get: obj => obj.metadata, set: (obj, value) => { obj.metadata = value; } }, metadata: _metadata }, _metadata_initializers, _metadata_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        userId = __runInitializers(this, _userId_initializers, void 0);
        projectId = (__runInitializers(this, _userId_extraInitializers), __runInitializers(this, _projectId_initializers, void 0));
        type = (__runInitializers(this, _projectId_extraInitializers), __runInitializers(this, _type_initializers, void 0));
        priority = (__runInitializers(this, _type_extraInitializers), __runInitializers(this, _priority_initializers, void 0));
        title = (__runInitializers(this, _priority_extraInitializers), __runInitializers(this, _title_initializers, void 0));
        message = (__runInitializers(this, _title_extraInitializers), __runInitializers(this, _message_initializers, void 0));
        actionUrl = (__runInitializers(this, _message_extraInitializers), __runInitializers(this, _actionUrl_initializers, void 0));
        channels = (__runInitializers(this, _actionUrl_extraInitializers), __runInitializers(this, _channels_initializers, void 0));
        metadata = (__runInitializers(this, _channels_extraInitializers), __runInitializers(this, _metadata_initializers, void 0));
        constructor() {
            __runInitializers(this, _metadata_extraInitializers);
        }
    };
})();
exports.CreateNotificationDto = CreateNotificationDto;
//# sourceMappingURL=create-notification.dto.js.map