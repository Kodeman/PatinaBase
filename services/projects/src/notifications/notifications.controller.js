"use strict";
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_guard_1 = require("../common/guards/auth.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
let NotificationsController = (() => {
    let _classDecorators = [(0, swagger_1.ApiTags)('notifications'), (0, swagger_1.ApiBearerAuth)(), (0, common_1.Controller)('notifications'), (0, common_1.UseGuards)(auth_guard_1.AuthGuard, roles_guard_1.RolesGuard)];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _create_decorators;
    let _createBatch_decorators;
    let _findForUser_decorators;
    let _markAsRead_decorators;
    let _markAllAsRead_decorators;
    let _getPreferences_decorators;
    let _updatePreferences_decorators;
    let _registerPushToken_decorators;
    var NotificationsController = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _create_decorators = [(0, common_1.Post)(), (0, roles_decorator_1.Roles)('admin', 'designer'), (0, swagger_1.ApiOperation)({ summary: 'Create a new notification (admin/designer only)' }), (0, swagger_1.ApiResponse)({ status: 201, description: 'Notification created and queued' })];
            _createBatch_decorators = [(0, common_1.Post)('batch'), (0, roles_decorator_1.Roles)('admin', 'designer'), (0, swagger_1.ApiOperation)({ summary: 'Create multiple notifications in batch' }), (0, swagger_1.ApiResponse)({ status: 201, description: 'Notifications created' })];
            _findForUser_decorators = [(0, common_1.Get)(), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Get notifications for current user' }), (0, swagger_1.ApiQuery)({ name: 'status', required: false }), (0, swagger_1.ApiQuery)({ name: 'projectId', required: false }), (0, swagger_1.ApiQuery)({ name: 'limit', required: false }), (0, swagger_1.ApiQuery)({ name: 'offset', required: false }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Notifications retrieved' })];
            _markAsRead_decorators = [(0, common_1.Patch)(':id/read'), (0, common_1.HttpCode)(common_1.HttpStatus.OK), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Mark notification as read' }), (0, swagger_1.ApiParam)({ name: 'id', description: 'Notification ID' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Notification marked as read' }), (0, swagger_1.ApiResponse)({ status: 404, description: 'Notification not found' })];
            _markAllAsRead_decorators = [(0, common_1.Post)('read-all'), (0, common_1.HttpCode)(common_1.HttpStatus.OK), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Mark all notifications as read' }), (0, swagger_1.ApiQuery)({ name: 'projectId', required: false, description: 'Limit to specific project' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'All notifications marked as read' })];
            _getPreferences_decorators = [(0, common_1.Get)('preferences'), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Get notification preferences for current user' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Preferences retrieved' })];
            _updatePreferences_decorators = [(0, common_1.Patch)('preferences'), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Update notification preferences' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Preferences updated' })];
            _registerPushToken_decorators = [(0, common_1.Post)('push-token'), (0, common_1.HttpCode)(common_1.HttpStatus.OK), (0, roles_decorator_1.Roles)('admin', 'designer', 'client'), (0, swagger_1.ApiOperation)({ summary: 'Register a push notification token' }), (0, swagger_1.ApiResponse)({ status: 200, description: 'Token registered' })];
            __esDecorate(this, null, _create_decorators, { kind: "method", name: "create", static: false, private: false, access: { has: obj => "create" in obj, get: obj => obj.create }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _createBatch_decorators, { kind: "method", name: "createBatch", static: false, private: false, access: { has: obj => "createBatch" in obj, get: obj => obj.createBatch }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _findForUser_decorators, { kind: "method", name: "findForUser", static: false, private: false, access: { has: obj => "findForUser" in obj, get: obj => obj.findForUser }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _markAsRead_decorators, { kind: "method", name: "markAsRead", static: false, private: false, access: { has: obj => "markAsRead" in obj, get: obj => obj.markAsRead }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _markAllAsRead_decorators, { kind: "method", name: "markAllAsRead", static: false, private: false, access: { has: obj => "markAllAsRead" in obj, get: obj => obj.markAllAsRead }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getPreferences_decorators, { kind: "method", name: "getPreferences", static: false, private: false, access: { has: obj => "getPreferences" in obj, get: obj => obj.getPreferences }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _updatePreferences_decorators, { kind: "method", name: "updatePreferences", static: false, private: false, access: { has: obj => "updatePreferences" in obj, get: obj => obj.updatePreferences }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _registerPushToken_decorators, { kind: "method", name: "registerPushToken", static: false, private: false, access: { has: obj => "registerPushToken" in obj, get: obj => obj.registerPushToken }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            NotificationsController = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        notificationsService = __runInitializers(this, _instanceExtraInitializers);
        constructor(notificationsService) {
            this.notificationsService = notificationsService;
        }
        create(createDto) {
            return this.notificationsService.create(createDto);
        }
        createBatch(notifications) {
            return this.notificationsService.createBatch(notifications);
        }
        findForUser(userId, status, projectId, limit, offset) {
            return this.notificationsService.findForUser(userId, {
                status,
                projectId,
                limit: limit ? parseInt(limit, 10) : undefined,
                offset: offset ? parseInt(offset, 10) : undefined,
            });
        }
        markAsRead(id, userId) {
            return this.notificationsService.markAsRead(id, userId);
        }
        markAllAsRead(userId, projectId) {
            return this.notificationsService.markAllAsRead(userId, projectId);
        }
        getPreferences(userId) {
            return this.notificationsService.getOrCreatePreferences(userId);
        }
        updatePreferences(userId, updateDto) {
            return this.notificationsService.updatePreferences(userId, updateDto);
        }
        registerPushToken(userId, body) {
            return this.notificationsService.registerPushToken(userId, body.token);
        }
    };
    return NotificationsController = _classThis;
})();
exports.NotificationsController = NotificationsController;
//# sourceMappingURL=notifications.controller.js.map