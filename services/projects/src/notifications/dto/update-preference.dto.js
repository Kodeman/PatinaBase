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
exports.UpdatePreferenceDto = exports.QuietHours = exports.NotificationFrequency = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var NotificationFrequency;
(function (NotificationFrequency) {
    NotificationFrequency["IMMEDIATE"] = "immediate";
    NotificationFrequency["DAILY_DIGEST"] = "daily_digest";
    NotificationFrequency["WEEKLY_DIGEST"] = "weekly_digest";
})(NotificationFrequency || (exports.NotificationFrequency = NotificationFrequency = {}));
let QuietHours = (() => {
    let _start_decorators;
    let _start_initializers = [];
    let _start_extraInitializers = [];
    let _end_decorators;
    let _end_initializers = [];
    let _end_extraInitializers = [];
    return class QuietHours {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _start_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Start time (HH:MM format)' })];
            _end_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'End time (HH:MM format)' })];
            __esDecorate(null, null, _start_decorators, { kind: "field", name: "start", static: false, private: false, access: { has: obj => "start" in obj, get: obj => obj.start, set: (obj, value) => { obj.start = value; } }, metadata: _metadata }, _start_initializers, _start_extraInitializers);
            __esDecorate(null, null, _end_decorators, { kind: "field", name: "end", static: false, private: false, access: { has: obj => "end" in obj, get: obj => obj.end, set: (obj, value) => { obj.end = value; } }, metadata: _metadata }, _end_initializers, _end_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        start = __runInitializers(this, _start_initializers, void 0);
        end = (__runInitializers(this, _start_extraInitializers), __runInitializers(this, _end_initializers, void 0));
        constructor() {
            __runInitializers(this, _end_extraInitializers);
        }
    };
})();
exports.QuietHours = QuietHours;
let UpdatePreferenceDto = (() => {
    let _email_decorators;
    let _email_initializers = [];
    let _email_extraInitializers = [];
    let _emailAddress_decorators;
    let _emailAddress_initializers = [];
    let _emailAddress_extraInitializers = [];
    let _sms_decorators;
    let _sms_initializers = [];
    let _sms_extraInitializers = [];
    let _phoneNumber_decorators;
    let _phoneNumber_initializers = [];
    let _phoneNumber_extraInitializers = [];
    let _push_decorators;
    let _push_initializers = [];
    let _push_extraInitializers = [];
    let _pushTokens_decorators;
    let _pushTokens_initializers = [];
    let _pushTokens_extraInitializers = [];
    let _channels_decorators;
    let _channels_initializers = [];
    let _channels_extraInitializers = [];
    let _frequency_decorators;
    let _frequency_initializers = [];
    let _frequency_extraInitializers = [];
    let _quietHours_decorators;
    let _quietHours_initializers = [];
    let _quietHours_extraInitializers = [];
    return class UpdatePreferenceDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _email_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Enable email notifications' }), (0, class_validator_1.IsBoolean)(), (0, class_validator_1.IsOptional)()];
            _emailAddress_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Email address for notifications' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsOptional)()];
            _sms_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Enable SMS notifications' }), (0, class_validator_1.IsBoolean)(), (0, class_validator_1.IsOptional)()];
            _phoneNumber_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Phone number for SMS' }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsOptional)()];
            _push_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Enable push notifications' }), (0, class_validator_1.IsBoolean)(), (0, class_validator_1.IsOptional)()];
            _pushTokens_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Array of push notification device tokens' }), (0, class_validator_1.IsOptional)()];
            _channels_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Granular channel preferences by notification type' }), (0, class_validator_1.IsObject)(), (0, class_validator_1.IsOptional)()];
            _frequency_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Notification frequency', enum: NotificationFrequency }), (0, class_validator_1.IsEnum)(NotificationFrequency), (0, class_validator_1.IsOptional)()];
            _quietHours_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Quiet hours configuration', type: QuietHours }), (0, class_validator_1.IsObject)(), (0, class_validator_1.IsOptional)()];
            __esDecorate(null, null, _email_decorators, { kind: "field", name: "email", static: false, private: false, access: { has: obj => "email" in obj, get: obj => obj.email, set: (obj, value) => { obj.email = value; } }, metadata: _metadata }, _email_initializers, _email_extraInitializers);
            __esDecorate(null, null, _emailAddress_decorators, { kind: "field", name: "emailAddress", static: false, private: false, access: { has: obj => "emailAddress" in obj, get: obj => obj.emailAddress, set: (obj, value) => { obj.emailAddress = value; } }, metadata: _metadata }, _emailAddress_initializers, _emailAddress_extraInitializers);
            __esDecorate(null, null, _sms_decorators, { kind: "field", name: "sms", static: false, private: false, access: { has: obj => "sms" in obj, get: obj => obj.sms, set: (obj, value) => { obj.sms = value; } }, metadata: _metadata }, _sms_initializers, _sms_extraInitializers);
            __esDecorate(null, null, _phoneNumber_decorators, { kind: "field", name: "phoneNumber", static: false, private: false, access: { has: obj => "phoneNumber" in obj, get: obj => obj.phoneNumber, set: (obj, value) => { obj.phoneNumber = value; } }, metadata: _metadata }, _phoneNumber_initializers, _phoneNumber_extraInitializers);
            __esDecorate(null, null, _push_decorators, { kind: "field", name: "push", static: false, private: false, access: { has: obj => "push" in obj, get: obj => obj.push, set: (obj, value) => { obj.push = value; } }, metadata: _metadata }, _push_initializers, _push_extraInitializers);
            __esDecorate(null, null, _pushTokens_decorators, { kind: "field", name: "pushTokens", static: false, private: false, access: { has: obj => "pushTokens" in obj, get: obj => obj.pushTokens, set: (obj, value) => { obj.pushTokens = value; } }, metadata: _metadata }, _pushTokens_initializers, _pushTokens_extraInitializers);
            __esDecorate(null, null, _channels_decorators, { kind: "field", name: "channels", static: false, private: false, access: { has: obj => "channels" in obj, get: obj => obj.channels, set: (obj, value) => { obj.channels = value; } }, metadata: _metadata }, _channels_initializers, _channels_extraInitializers);
            __esDecorate(null, null, _frequency_decorators, { kind: "field", name: "frequency", static: false, private: false, access: { has: obj => "frequency" in obj, get: obj => obj.frequency, set: (obj, value) => { obj.frequency = value; } }, metadata: _metadata }, _frequency_initializers, _frequency_extraInitializers);
            __esDecorate(null, null, _quietHours_decorators, { kind: "field", name: "quietHours", static: false, private: false, access: { has: obj => "quietHours" in obj, get: obj => obj.quietHours, set: (obj, value) => { obj.quietHours = value; } }, metadata: _metadata }, _quietHours_initializers, _quietHours_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        email = __runInitializers(this, _email_initializers, void 0);
        emailAddress = (__runInitializers(this, _email_extraInitializers), __runInitializers(this, _emailAddress_initializers, void 0));
        sms = (__runInitializers(this, _emailAddress_extraInitializers), __runInitializers(this, _sms_initializers, void 0));
        phoneNumber = (__runInitializers(this, _sms_extraInitializers), __runInitializers(this, _phoneNumber_initializers, void 0));
        push = (__runInitializers(this, _phoneNumber_extraInitializers), __runInitializers(this, _push_initializers, void 0));
        pushTokens = (__runInitializers(this, _push_extraInitializers), __runInitializers(this, _pushTokens_initializers, void 0));
        channels = (__runInitializers(this, _pushTokens_extraInitializers), __runInitializers(this, _channels_initializers, void 0));
        frequency = (__runInitializers(this, _channels_extraInitializers), __runInitializers(this, _frequency_initializers, void 0));
        quietHours = (__runInitializers(this, _frequency_extraInitializers), __runInitializers(this, _quietHours_initializers, void 0));
        constructor() {
            __runInitializers(this, _quietHours_extraInitializers);
        }
    };
})();
exports.UpdatePreferenceDto = UpdatePreferenceDto;
//# sourceMappingURL=update-preference.dto.js.map