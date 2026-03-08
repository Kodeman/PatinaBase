"use strict";
/**
 * Project Validator (Domain Layer)
 *
 * Centralizes all business rule validation for projects.
 * Pure validation logic with no dependencies on infrastructure.
 *
 * Benefits:
 * - Testability: Can test all validation rules without database
 * - Maintainability: All business rules in one place
 * - Consistency: Same validation rules across all use cases
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
exports.ProjectValidator = void 0;
const common_1 = require("@nestjs/common");
const decimal_js_1 = require("decimal.js");
let ProjectValidator = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ProjectValidator = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ProjectValidator = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        /**
         * Validate project title
         */
        validateTitle(title) {
            if (!title || title.trim().length === 0) {
                throw new common_1.BadRequestException('Project title is required');
            }
            if (title.length < 3) {
                throw new common_1.BadRequestException('Project title must be at least 3 characters');
            }
            if (title.length > 200) {
                throw new common_1.BadRequestException('Project title must be less than 200 characters');
            }
        }
        /**
         * Validate project description
         */
        validateDescription(description) {
            if (description && description.length > 5000) {
                throw new common_1.BadRequestException('Project description must be less than 5000 characters');
            }
        }
        /**
         * Validate budget
         */
        validateBudget(budget) {
            const budgetValue = budget instanceof decimal_js_1.Decimal ? budget.toNumber() : budget;
            if (budgetValue < 0) {
                throw new common_1.BadRequestException('Budget cannot be negative');
            }
            if (budgetValue > 100000000) {
                throw new common_1.BadRequestException('Budget cannot exceed $100,000,000');
            }
        }
        /**
         * Validate date range
         */
        validateDateRange(startDate, endDate) {
            if (startDate && endDate && startDate > endDate) {
                throw new common_1.BadRequestException('Start date must be before end date');
            }
            if (startDate && startDate < new Date('2020-01-01')) {
                throw new common_1.BadRequestException('Start date cannot be before 2020');
            }
            if (endDate) {
                const maxDate = new Date();
                maxDate.setFullYear(maxDate.getFullYear() + 10);
                if (endDate > maxDate) {
                    throw new common_1.BadRequestException('End date cannot be more than 10 years in the future');
                }
            }
        }
        /**
         * Validate currency code
         */
        validateCurrency(currency) {
            const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'];
            if (!validCurrencies.includes(currency.toUpperCase())) {
                throw new common_1.BadRequestException(`Invalid currency. Supported: ${validCurrencies.join(', ')}`);
            }
        }
        /**
         * Validate status transition
         */
        validateStatusTransition(currentStatus, newStatus) {
            const validTransitions = {
                draft: ['pending_approval', 'cancelled'],
                pending_approval: ['draft', 'active', 'cancelled'],
                active: ['on_hold', 'completed', 'cancelled'],
                on_hold: ['active', 'cancelled'],
                completed: ['closed'],
                closed: [], // Cannot transition from closed
                cancelled: [], // Cannot transition from cancelled
            };
            const allowedTransitions = validTransitions[currentStatus];
            if (!allowedTransitions.includes(newStatus)) {
                throw new common_1.BadRequestException(`Cannot transition from '${currentStatus}' to '${newStatus}'. ` +
                    `Allowed transitions: ${allowedTransitions.join(', ') || 'none'}`);
            }
        }
        /**
         * Validate project can be modified
         */
        validateCanModify(status) {
            if (status === 'closed' || status === 'cancelled') {
                throw new common_1.BadRequestException(`Cannot modify project with status '${status}'`);
            }
        }
        /**
         * Validate project can add tasks
         */
        validateCanAddTasks(status) {
            if (status === 'closed' || status === 'cancelled') {
                throw new common_1.BadRequestException(`Cannot add tasks to a ${status} project`);
            }
        }
        /**
         * Validate project can be closed
         */
        validateCanClose(status, openTasks, openIssues) {
            if (status === 'closed' || status === 'cancelled') {
                throw new common_1.BadRequestException('Project is already closed or cancelled');
            }
            if (openTasks > 0) {
                throw new common_1.BadRequestException(`Cannot close project with ${openTasks} open tasks. Complete or cancel them first.`);
            }
            if (openIssues > 0) {
                throw new common_1.BadRequestException(`Cannot close project with ${openIssues} open issues. Resolve them first.`);
            }
        }
        /**
         * Validate complete project data for creation
         */
        validateCreateData(data) {
            // Required fields
            if (!data.title) {
                throw new common_1.BadRequestException('Title is required');
            }
            this.validateTitle(data.title);
            if (!data.clientId) {
                throw new common_1.BadRequestException('Client ID is required');
            }
            if (!data.designerId) {
                throw new common_1.BadRequestException('Designer ID is required');
            }
            // Optional fields
            if (data.description) {
                this.validateDescription(data.description);
            }
            if (data.budget !== undefined && data.budget !== null) {
                this.validateBudget(data.budget);
            }
            if (data.currency) {
                this.validateCurrency(data.currency);
            }
            if (data.startDate || data.endDate) {
                this.validateDateRange(data.startDate, data.endDate);
            }
        }
        /**
         * Validate partial project data for updates
         */
        validateUpdateData(data, currentStatus) {
            if (data.title !== undefined) {
                this.validateTitle(data.title);
            }
            if (data.description !== undefined) {
                this.validateDescription(data.description);
            }
            if (data.budget !== undefined && data.budget !== null) {
                this.validateBudget(data.budget);
            }
            if (data.currency !== undefined) {
                this.validateCurrency(data.currency);
            }
            if (data.startDate !== undefined || data.endDate !== undefined) {
                this.validateDateRange(data.startDate, data.endDate);
            }
            if (data.status !== undefined && currentStatus) {
                this.validateStatusTransition(currentStatus, data.status);
            }
        }
        /**
         * Validate user access based on role
         */
        validateUserAccess(projectOwnerId, userId, userRole, requiredRole) {
            if (requiredRole === 'owner' && projectOwnerId !== userId && userRole !== 'admin') {
                throw new common_1.BadRequestException('Only the project owner or admin can perform this action');
            }
        }
    };
    return ProjectValidator = _classThis;
})();
exports.ProjectValidator = ProjectValidator;
//# sourceMappingURL=project.validator.js.map