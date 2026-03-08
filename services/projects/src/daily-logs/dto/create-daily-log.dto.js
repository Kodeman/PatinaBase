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
exports.CreateDailyLogDto = exports.Weather = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
var Weather;
(function (Weather) {
    Weather["GOOD"] = "Good";
    Weather["FAIR"] = "Fair";
    Weather["POOR"] = "Poor";
    Weather["NA"] = "N/A";
})(Weather || (exports.Weather = Weather = {}));
let CreateDailyLogDto = (() => {
    let _date_decorators;
    let _date_initializers = [];
    let _date_extraInitializers = [];
    let _notes_decorators;
    let _notes_initializers = [];
    let _notes_extraInitializers = [];
    let _weather_decorators;
    let _weather_initializers = [];
    let _weather_extraInitializers = [];
    let _photos_decorators;
    let _photos_initializers = [];
    let _photos_extraInitializers = [];
    let _attendees_decorators;
    let _attendees_initializers = [];
    let _attendees_extraInitializers = [];
    let _activities_decorators;
    let _activities_initializers = [];
    let _activities_extraInitializers = [];
    return class CreateDailyLogDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _date_decorators = [(0, swagger_1.ApiProperty)({ description: 'Date of log entry' }), (0, class_validator_1.IsDateString)()];
            _notes_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Notes/observations' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _weather_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Weather conditions', enum: Weather }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsEnum)(Weather)];
            _photos_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Array of photo keys from object storage' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsArray)()];
            _attendees_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Array of attendee user IDs' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsArray)()];
            _activities_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: 'Array of activity descriptions' }), (0, class_validator_1.IsOptional)(), (0, class_validator_1.IsArray)()];
            __esDecorate(null, null, _date_decorators, { kind: "field", name: "date", static: false, private: false, access: { has: obj => "date" in obj, get: obj => obj.date, set: (obj, value) => { obj.date = value; } }, metadata: _metadata }, _date_initializers, _date_extraInitializers);
            __esDecorate(null, null, _notes_decorators, { kind: "field", name: "notes", static: false, private: false, access: { has: obj => "notes" in obj, get: obj => obj.notes, set: (obj, value) => { obj.notes = value; } }, metadata: _metadata }, _notes_initializers, _notes_extraInitializers);
            __esDecorate(null, null, _weather_decorators, { kind: "field", name: "weather", static: false, private: false, access: { has: obj => "weather" in obj, get: obj => obj.weather, set: (obj, value) => { obj.weather = value; } }, metadata: _metadata }, _weather_initializers, _weather_extraInitializers);
            __esDecorate(null, null, _photos_decorators, { kind: "field", name: "photos", static: false, private: false, access: { has: obj => "photos" in obj, get: obj => obj.photos, set: (obj, value) => { obj.photos = value; } }, metadata: _metadata }, _photos_initializers, _photos_extraInitializers);
            __esDecorate(null, null, _attendees_decorators, { kind: "field", name: "attendees", static: false, private: false, access: { has: obj => "attendees" in obj, get: obj => obj.attendees, set: (obj, value) => { obj.attendees = value; } }, metadata: _metadata }, _attendees_initializers, _attendees_extraInitializers);
            __esDecorate(null, null, _activities_decorators, { kind: "field", name: "activities", static: false, private: false, access: { has: obj => "activities" in obj, get: obj => obj.activities, set: (obj, value) => { obj.activities = value; } }, metadata: _metadata }, _activities_initializers, _activities_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        date = __runInitializers(this, _date_initializers, void 0);
        notes = (__runInitializers(this, _date_extraInitializers), __runInitializers(this, _notes_initializers, void 0));
        weather = (__runInitializers(this, _notes_extraInitializers), __runInitializers(this, _weather_initializers, void 0));
        photos = (__runInitializers(this, _weather_extraInitializers), __runInitializers(this, _photos_initializers, void 0));
        attendees = (__runInitializers(this, _photos_extraInitializers), __runInitializers(this, _attendees_initializers, void 0));
        activities = (__runInitializers(this, _attendees_extraInitializers), __runInitializers(this, _activities_initializers, void 0));
        constructor() {
            __runInitializers(this, _activities_extraInitializers);
        }
    };
})();
exports.CreateDailyLogDto = CreateDailyLogDto;
//# sourceMappingURL=create-daily-log.dto.js.map