"use strict";
/**
 * Approval Validator (Domain Layer)
 *
 * Centralizes all business rule validation for approvals.
 * Pure validation logic with no dependencies on infrastructure.
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
exports.ApprovalValidator = void 0;
const common_1 = require("@nestjs/common");
let ApprovalValidator = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ApprovalValidator = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ApprovalValidator = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        /**
         * Validate approval title
         */
        validateTitle(title) {
            if (!title || title.trim().length === 0) {
                throw new common_1.BadRequestException('Approval title is required');
            }
            if (title.length < 5) {
                throw new common_1.BadRequestException('Approval title must be at least 5 characters');
            }
            if (title.length > 200) {
                throw new common_1.BadRequestException('Approval title must be less than 200 characters');
            }
        }
        /**
         * Validate approval description
         */
        validateDescription(description) {
            if (description && description.length > 2000) {
                throw new common_1.BadRequestException('Approval description must be less than 2000 characters');
            }
        }
        /**
         * Validate due date
         */
        validateDueDate(dueDate) {
            const now = new Date();
            if (dueDate < now) {
                throw new common_1.BadRequestException('Due date cannot be in the past');
            }
            const maxDate = new Date();
            maxDate.setFullYear(maxDate.getFullYear() + 2);
            if (dueDate > maxDate) {
                throw new common_1.BadRequestException('Due date cannot be more than 2 years in the future');
            }
        }
        /**
         * Validate approval type
         */
        validateApprovalType(type) {
            const validTypes = [
                'design_concept',
                'material_selection',
                'budget_change',
                'timeline_change',
                'final_delivery',
                'milestone',
                'change_order',
                'general',
            ];
            if (!validTypes.includes(type)) {
                throw new common_1.BadRequestException(`Invalid approval type. Valid types: ${validTypes.join(', ')}`);
            }
        }
        /**
         * Validate priority
         */
        validatePriority(priority) {
            const validPriorities = ['low', 'normal', 'high', 'urgent'];
            if (!validPriorities.includes(priority)) {
                throw new common_1.BadRequestException(`Invalid priority. Valid priorities: ${validPriorities.join(', ')}`);
            }
        }
        /**
         * Validate documents
         */
        validateDocuments(documents) {
            if (documents.length > 50) {
                throw new common_1.BadRequestException('Cannot attach more than 50 documents to an approval');
            }
            documents.forEach((doc, index) => {
                if (!doc || doc.trim().length === 0) {
                    throw new common_1.BadRequestException(`Document at index ${index} is invalid`);
                }
                if (doc.length > 500) {
                    throw new common_1.BadRequestException(`Document path at index ${index} is too long (max 500 chars)`);
                }
            });
        }
        /**
         * Validate status transition
         */
        validateStatusTransition(currentStatus, newStatus) {
            const validTransitions = {
                pending: ['needs_discussion', 'approved', 'rejected', 'cancelled'],
                needs_discussion: ['pending', 'approved', 'rejected', 'cancelled'],
                approved: [], // Cannot change from approved
                rejected: [], // Cannot change from rejected
                cancelled: [], // Cannot change from cancelled
            };
            const allowedTransitions = validTransitions[currentStatus];
            if (!allowedTransitions.includes(newStatus)) {
                throw new common_1.BadRequestException(`Cannot transition from '${currentStatus}' to '${newStatus}'. ` +
                    `Allowed transitions: ${allowedTransitions.join(', ') || 'none'}`);
            }
        }
        /**
         * Validate approval can be processed
         */
        validateCanProcess(status) {
            if (status === 'approved' || status === 'rejected' || status === 'cancelled') {
                throw new common_1.BadRequestException(`Cannot process approval with status '${status}'. Approval has already been processed.`);
            }
        }
        /**
         * Validate user is assigned to approval
         */
        validateUserAssignment(assignedTo, userId) {
            if (assignedTo !== userId) {
                throw new common_1.ForbiddenException('You are not authorized to process this approval');
            }
        }
        /**
         * Validate signature data
         */
        validateSignature(signature) {
            if (!signature.data || signature.data.trim().length === 0) {
                throw new common_1.BadRequestException('Signature data is required');
            }
            if (signature.data.length > 100000) {
                throw new common_1.BadRequestException('Signature data is too large (max 100KB)');
            }
            if (!signature.signerName || signature.signerName.trim().length === 0) {
                throw new common_1.BadRequestException('Signer name is required');
            }
            if (signature.signerName.length > 200) {
                throw new common_1.BadRequestException('Signer name must be less than 200 characters');
            }
        }
        /**
         * Validate rejection reason
         */
        validateRejectionReason(reason) {
            if (!reason || reason.trim().length === 0) {
                throw new common_1.BadRequestException('Rejection reason is required');
            }
            if (reason.length < 10) {
                throw new common_1.BadRequestException('Rejection reason must be at least 10 characters');
            }
            if (reason.length > 1000) {
                throw new common_1.BadRequestException('Rejection reason must be less than 1000 characters');
            }
        }
        /**
         * Validate comment
         */
        validateComment(comment) {
            if (comment && comment.length > 2000) {
                throw new common_1.BadRequestException('Comment must be less than 2000 characters');
            }
        }
        /**
         * Validate edit window (can only edit recent approvals)
         */
        validateEditWindow(createdAt, windowMinutes = 30) {
            const now = new Date();
            const cutoff = new Date(now.getTime() - windowMinutes * 60 * 1000);
            if (createdAt < cutoff) {
                throw new common_1.BadRequestException(`Approvals can only be edited within ${windowMinutes} minutes of creation`);
            }
        }
        /**
         * Validate approval is not overdue
         */
        validateNotOverdue(dueDate) {
            if (dueDate && dueDate < new Date()) {
                throw new common_1.BadRequestException('This approval is overdue');
            }
        }
        /**
         * Validate complete approval data for creation
         */
        validateCreateData(data) {
            // Required fields
            if (!data.title) {
                throw new common_1.BadRequestException('Title is required');
            }
            this.validateTitle(data.title);
            if (!data.approvalType) {
                throw new common_1.BadRequestException('Approval type is required');
            }
            this.validateApprovalType(data.approvalType);
            if (!data.requestedBy) {
                throw new common_1.BadRequestException('Requester is required');
            }
            if (!data.assignedTo) {
                throw new common_1.BadRequestException('Assignee is required');
            }
            // Optional fields
            if (data.description) {
                this.validateDescription(data.description);
            }
            if (data.priority) {
                this.validatePriority(data.priority);
            }
            if (data.dueDate) {
                this.validateDueDate(new Date(data.dueDate));
            }
            if (data.documents && data.documents.length > 0) {
                this.validateDocuments(data.documents);
            }
        }
        /**
         * Validate partial approval data for updates
         */
        validateUpdateData(data) {
            if (data.title !== undefined) {
                this.validateTitle(data.title);
            }
            if (data.description !== undefined) {
                this.validateDescription(data.description);
            }
            if (data.priority !== undefined) {
                this.validatePriority(data.priority);
            }
            if (data.dueDate !== undefined) {
                this.validateDueDate(new Date(data.dueDate));
            }
            if (data.documents !== undefined) {
                this.validateDocuments(data.documents);
            }
        }
        /**
         * Validate approval action (approve/reject/discuss)
         */
        validateApprovalAction(approval, userId, action) {
            // Check status
            this.validateCanProcess(approval.status);
            // Check user assignment
            this.validateUserAssignment(approval.assignedTo, userId);
            // Additional validation based on action
            if (action === 'reject' && !approval.rejectionReason) {
                throw new common_1.BadRequestException('Rejection reason is required when rejecting');
            }
        }
    };
    return ApprovalValidator = _classThis;
})();
exports.ApprovalValidator = ApprovalValidator;
//# sourceMappingURL=approval.validator.js.map