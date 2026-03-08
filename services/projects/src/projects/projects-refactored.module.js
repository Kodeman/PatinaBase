"use strict";
/**
 * Projects Module (Refactored)
 * Clean architecture implementation with proper dependency injection
 *
 * Architecture Layers:
 * - Domain: Interfaces, validators, domain services
 * - Application: Use cases/services
 * - Infrastructure: Repositories, events, caching
 * - Presentation: Controllers, DTOs, Facade
 */
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
exports.ProjectsRefactoredModule = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const cache_1 = require("@patina/cache");
// Presentation Layer
const projects_controller_1 = require("./projects.controller");
// Application Layer
const project_management_service_1 = require("../application/services/project-management.service");
const project_progress_service_1 = require("../application/services/project-progress.service");
const project_activity_service_1 = require("../application/services/project-activity.service");
const approval_management_service_1 = require("../application/services/approval-management.service");
// Domain Layer
const project_validator_1 = require("../domain/validators/project.validator");
const approval_validator_1 = require("../domain/validators/approval.validator");
const progress_calculator_service_1 = require("../domain/services/progress-calculator.service");
const approval_workflow_service_1 = require("../domain/services/approval-workflow.service");
const project_repository_interface_1 = require("../domain/repositories/project.repository.interface");
const approval_repository_interface_1 = require("../domain/repositories/approval.repository.interface");
// Infrastructure Layer
const prisma_project_repository_1 = require("../infrastructure/repositories/prisma-project.repository");
const prisma_approval_repository_1 = require("../infrastructure/repositories/prisma-approval.repository");
// Common/Shared
const prisma_module_1 = require("../prisma/prisma.module");
// Facade for backward compatibility
const projects_refactored_service_1 = require("./projects-refactored.service");
let ProjectsRefactoredModule = (() => {
    let _classDecorators = [(0, common_1.Module)({
            imports: [prisma_module_1.PrismaModule, event_emitter_1.EventEmitterModule, cache_1.CacheModule],
            controllers: [projects_controller_1.ProjectsController],
            providers: [
                // ==========================================
                // FACADE (maintains compatibility with existing code)
                // ==========================================
                projects_refactored_service_1.ProjectsRefactoredService,
                // ==========================================
                // APPLICATION SERVICES
                // ==========================================
                project_management_service_1.ProjectManagementService,
                project_progress_service_1.ProjectProgressService,
                project_activity_service_1.ProjectActivityService,
                approval_management_service_1.ApprovalManagementService,
                // ==========================================
                // DOMAIN SERVICES (Pure Business Logic)
                // ==========================================
                project_validator_1.ProjectValidator,
                approval_validator_1.ApprovalValidator,
                progress_calculator_service_1.ProgressCalculatorService,
                approval_workflow_service_1.ApprovalWorkflowService,
                // ==========================================
                // INFRASTRUCTURE - REPOSITORY IMPLEMENTATIONS
                // ==========================================
                {
                    provide: project_repository_interface_1.PROJECT_REPOSITORY,
                    useClass: prisma_project_repository_1.PrismaProjectRepository,
                },
                {
                    provide: approval_repository_interface_1.APPROVAL_REPOSITORY,
                    useClass: prisma_approval_repository_1.PrismaApprovalRepository,
                },
            ],
            exports: [
                // Export facade for other modules
                projects_refactored_service_1.ProjectsRefactoredService,
                // Export application services for direct usage if needed
                project_management_service_1.ProjectManagementService,
                project_progress_service_1.ProjectProgressService,
                project_activity_service_1.ProjectActivityService,
                approval_management_service_1.ApprovalManagementService,
                // Export domain services for reuse
                progress_calculator_service_1.ProgressCalculatorService,
                approval_workflow_service_1.ApprovalWorkflowService,
            ],
        })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ProjectsRefactoredModule = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ProjectsRefactoredModule = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
    };
    return ProjectsRefactoredModule = _classThis;
})();
exports.ProjectsRefactoredModule = ProjectsRefactoredModule;
//# sourceMappingURL=projects-refactored.module.js.map