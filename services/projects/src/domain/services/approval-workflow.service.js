"use strict";
/**
 * Approval Workflow Domain Service
 *
 * Pure domain service for approval workflow logic and state transitions.
 * Contains ZERO dependencies on infrastructure or external services.
 *
 * This service can be tested with simple objects without database access.
 *
 * Benefits:
 * - Pure business logic: No side effects
 * - Highly testable: No mocking required
 * - Reusable: Can be used across different contexts
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
exports.ApprovalWorkflowService = void 0;
const common_1 = require("@nestjs/common");
let ApprovalWorkflowService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ApprovalWorkflowService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ApprovalWorkflowService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        /**
         * Get allowed next states for current status
         */
        getAllowedTransitions(currentStatus) {
            const transitions = {
                pending: ['needs_discussion', 'approved', 'rejected', 'cancelled'],
                needs_discussion: ['pending', 'approved', 'rejected', 'cancelled'],
                approved: [],
                rejected: [],
                cancelled: [],
            };
            return transitions[currentStatus] || [];
        }
        /**
         * Check if transition is allowed
         */
        canTransition(currentStatus, newStatus) {
            const allowed = this.getAllowedTransitions(currentStatus);
            return allowed.includes(newStatus);
        }
        /**
         * Build approval workflow state
         */
        buildApprovalState(currentStatus, action, userId, comment, reason) {
            const now = new Date();
            const timestamp = now.toISOString();
            const newComment = {
                userId,
                action: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'discussed',
                comment: action === 'reject' ? reason : comment,
                timestamp,
            };
            const state = {
                status: currentStatus,
                comments: [newComment],
            };
            if (action === 'approve') {
                state.status = 'approved';
                state.approvedBy = userId;
                state.approvedAt = now;
            }
            else if (action === 'reject') {
                state.status = 'rejected';
                state.rejectedBy = userId;
                state.rejectedAt = now;
                state.rejectionReason = reason;
            }
            else if (action === 'discuss') {
                state.status = 'needs_discussion';
            }
            return state;
        }
        /**
         * Add comment to existing comments array
         */
        addComment(existingComments, userId, action, comment) {
            const newComment = {
                userId,
                action,
                comment,
                timestamp: new Date().toISOString(),
            };
            return [...existingComments, newComment];
        }
        /**
         * Calculate approval turnaround time in hours
         */
        calculateTurnaroundTime(createdAt, completedAt) {
            const diff = completedAt.getTime() - createdAt.getTime();
            return Math.round((diff / (1000 * 60 * 60)) * 10) / 10; // Hours, 1 decimal
        }
        /**
         * Calculate approval velocity (approvals per day)
         */
        calculateApprovalVelocity(approvals) {
            const completed = approvals.filter(a => a.approvedAt);
            if (completed.length === 0)
                return 0;
            const oldest = completed[0].createdAt;
            const newest = completed[completed.length - 1].approvedAt;
            const days = (newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24);
            if (days === 0)
                return completed.length;
            return Math.round((completed.length / days) * 10) / 10;
        }
        /**
         * Determine if approval is at risk (close to due date or overdue)
         */
        isApprovalAtRisk(status, dueDate, riskThresholdHours = 24) {
            if (status !== 'pending' && status !== 'needs_discussion') {
                return false;
            }
            if (!dueDate)
                return false;
            const now = new Date();
            const hoursUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
            return hoursUntilDue <= riskThresholdHours;
        }
        /**
         * Check if approval is overdue
         */
        isOverdue(status, dueDate) {
            if (status !== 'pending' && status !== 'needs_discussion') {
                return false;
            }
            if (!dueDate)
                return false;
            return dueDate < new Date();
        }
        /**
         * Calculate SLA compliance
         */
        calculateSLACompliance(approvals) {
            const withDueDate = approvals.filter(a => a.dueDate);
            const total = withDueDate.length;
            if (total === 0) {
                return { total: 0, compliant: 0, complianceRate: 100 };
            }
            const compliant = withDueDate.filter(a => {
                if (a.status === 'approved' && a.approvedAt) {
                    return a.approvedAt <= a.dueDate;
                }
                if (a.status === 'pending' || a.status === 'needs_discussion') {
                    return a.dueDate >= new Date();
                }
                return false;
            }).length;
            const complianceRate = Math.round((compliant / total) * 100);
            return { total, compliant, complianceRate };
        }
        /**
         * Prioritize approvals based on urgency
         */
        prioritizeApprovals(approvals) {
            const priorityWeights = {
                urgent: 4,
                high: 3,
                normal: 2,
                low: 1,
            };
            const now = new Date();
            const scored = approvals.map(approval => {
                let score = priorityWeights[approval.priority];
                // Add urgency based on due date
                if (approval.dueDate) {
                    const hoursUntilDue = (approval.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
                    if (hoursUntilDue < 0) {
                        score += 10; // Overdue
                    }
                    else if (hoursUntilDue < 24) {
                        score += 5; // Due soon
                    }
                    else if (hoursUntilDue < 72) {
                        score += 2; // Due in 3 days
                    }
                }
                // Add age factor (older approvals get slight boost)
                const age = (now.getTime() - approval.createdAt.getTime()) / (1000 * 60 * 60 * 24);
                score += Math.min(age * 0.1, 2); // Max 2 points for age
                return { id: approval.id, score };
            });
            // Sort by score descending
            scored.sort((a, b) => b.score - a.score);
            return scored.map(s => s.id);
        }
        /**
         * Group approvals by type
         */
        groupByType(approvals) {
            return approvals.reduce((acc, approval) => {
                acc[approval.approvalType] = (acc[approval.approvalType] || 0) + 1;
                return acc;
            }, {});
        }
        /**
         * Calculate discussion time (time spent in needs_discussion status)
         */
        calculateDiscussionTime(comments) {
            const discussionComments = comments.filter(c => c.action === 'discussed');
            if (discussionComments.length < 2)
                return 0;
            const first = new Date(discussionComments[0].timestamp);
            const last = new Date(discussionComments[discussionComments.length - 1].timestamp);
            return (last.getTime() - first.getTime()) / (1000 * 60 * 60); // Hours
        }
        /**
         * Determine approval bottlenecks
         */
        findBottlenecks(approvals) {
            const userApprovals = approvals.reduce((acc, approval) => {
                if (approval.status === 'pending' || approval.status === 'needs_discussion') {
                    if (!acc[approval.assignedTo]) {
                        acc[approval.assignedTo] = [];
                    }
                    acc[approval.assignedTo].push(approval);
                }
                return acc;
            }, {});
            const now = new Date();
            return Object.entries(userApprovals)
                .map(([userId, userApprovals]) => {
                const pendingCount = userApprovals.length;
                const avgAge = userApprovals.reduce((sum, a) => {
                    const age = (now.getTime() - a.createdAt.getTime()) / (1000 * 60 * 60 * 24);
                    return sum + age;
                }, 0) / pendingCount;
                return { userId, pendingCount, avgAge: Math.round(avgAge * 10) / 10 };
            })
                .filter(b => b.pendingCount >= 3 || b.avgAge >= 7) // Bottleneck if 3+ pending or avg age 7+ days
                .sort((a, b) => b.pendingCount - a.pendingCount);
        }
        /**
         * Calculate approval health score (0-100)
         */
        calculateHealthScore(metrics) {
            let score = 100;
            // Approval rate factor (0-40 points)
            score -= (100 - metrics.approvalRate) * 0.4;
            // Turnaround time factor (0-30 points)
            if (metrics.avgApprovalTimeDays > 7)
                score -= 30;
            else if (metrics.avgApprovalTimeDays > 5)
                score -= 20;
            else if (metrics.avgApprovalTimeDays > 3)
                score -= 10;
            // Overdue factor (0-20 points)
            if (metrics.overdueCount > 0) {
                score -= Math.min(metrics.overdueCount * 5, 20);
            }
            // Pending backlog factor (0-10 points)
            if (metrics.totalPending > 10)
                score -= 10;
            else if (metrics.totalPending > 5)
                score -= 5;
            return Math.max(0, Math.min(100, Math.round(score)));
        }
    };
    return ApprovalWorkflowService = _classThis;
})();
exports.ApprovalWorkflowService = ApprovalWorkflowService;
//# sourceMappingURL=approval-workflow.service.js.map