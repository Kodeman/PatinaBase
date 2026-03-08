"use strict";
/**
 * Progress Calculator Domain Service
 *
 * Pure domain service for calculating project progress metrics.
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
exports.ProgressCalculatorService = void 0;
const common_1 = require("@nestjs/common");
let ProgressCalculatorService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ProgressCalculatorService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ProgressCalculatorService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        /**
         * Calculate overall progress from timeline segments
         */
        calculateOverallProgress(segments) {
            if (segments.length === 0)
                return 0;
            const totalProgress = segments.reduce((sum, seg) => sum + seg.progress, 0);
            return Math.round(totalProgress / segments.length);
        }
        /**
         * Calculate progress by phase
         */
        calculatePhaseProgress(segments) {
            const progressByPhase = segments.reduce((acc, seg) => {
                if (!acc[seg.phase]) {
                    acc[seg.phase] = { total: 0, count: 0 };
                }
                acc[seg.phase].total += seg.progress;
                acc[seg.phase].count += 1;
                return acc;
            }, {});
            return Object.entries(progressByPhase).reduce((acc, [phase, data]) => {
                acc[phase] = Math.round(data.total / data.count);
                return acc;
            }, {});
        }
        /**
         * Calculate time-based progress
         */
        calculateTimeProgress(timeline, now = new Date()) {
            if (!timeline.startDate || !timeline.endDate) {
                return {
                    timeProgress: 0,
                    daysElapsed: 0,
                    daysRemaining: 0,
                    totalDuration: 0,
                };
            }
            const nowTime = now.getTime();
            const startTime = timeline.startDate.getTime();
            const endTime = timeline.endDate.getTime();
            const totalDuration = Math.ceil((endTime - startTime) / (1000 * 60 * 60 * 24));
            const daysElapsed = Math.ceil((nowTime - startTime) / (1000 * 60 * 60 * 24));
            const daysRemaining = Math.ceil((endTime - nowTime) / (1000 * 60 * 60 * 24));
            // Calculate percentage (0-100)
            const timeProgress = Math.min(100, Math.max(0, Math.round((daysElapsed / totalDuration) * 100)));
            return {
                timeProgress,
                daysElapsed,
                daysRemaining,
                totalDuration,
            };
        }
        /**
         * Calculate task completion rate
         */
        calculateTaskCompletionRate(tasks) {
            if (tasks.total === 0)
                return 0;
            return Math.round((tasks.completed / tasks.total) * 100);
        }
        /**
         * Calculate milestone completion rate
         */
        calculateMilestoneCompletionRate(milestones) {
            if (milestones.total === 0)
                return 0;
            return Math.round((milestones.completed / milestones.total) * 100);
        }
        /**
         * Calculate project health indicators
         */
        calculateProjectHealth(overallProgress, timeProgress, tolerance = 10) {
            const isOnSchedule = Math.abs(timeProgress - overallProgress) <= tolerance;
            const isBehindSchedule = overallProgress < timeProgress - tolerance;
            const isAheadOfSchedule = overallProgress > timeProgress + tolerance;
            return {
                isOnSchedule,
                isBehindSchedule,
                isAheadOfSchedule,
            };
        }
        /**
         * Calculate comprehensive project progress
         * This is the main method that orchestrates all calculations
         */
        calculateProgress(segments, timeline, tasks, milestones, now = new Date()) {
            const overallProgress = this.calculateOverallProgress(segments);
            const phaseProgress = this.calculatePhaseProgress(segments);
            const { timeProgress, daysElapsed, daysRemaining, totalDuration } = this.calculateTimeProgress(timeline, now);
            const taskCompletionRate = this.calculateTaskCompletionRate(tasks);
            const milestoneCompletionRate = this.calculateMilestoneCompletionRate(milestones);
            const health = this.calculateProjectHealth(overallProgress, timeProgress);
            return {
                overallProgress,
                phaseProgress,
                timeProgress,
                taskCompletionRate,
                milestoneCompletionRate,
                timeline: {
                    totalDuration,
                    daysElapsed,
                    daysRemaining,
                    startDate: timeline.startDate,
                    endDate: timeline.endDate,
                },
                health,
            };
        }
        /**
         * Calculate estimated completion date based on current velocity
         */
        calculateEstimatedCompletion(currentProgress, timeline, now = new Date()) {
            if (!timeline.startDate || currentProgress === 0) {
                return null;
            }
            const startTime = timeline.startDate.getTime();
            const nowTime = now.getTime();
            const daysElapsed = (nowTime - startTime) / (1000 * 60 * 60 * 24);
            // Calculate velocity (progress per day)
            const velocity = currentProgress / daysElapsed;
            if (velocity === 0)
                return null;
            // Calculate remaining days
            const remainingProgress = 100 - currentProgress;
            const estimatedDaysRemaining = remainingProgress / velocity;
            // Calculate estimated completion date
            const estimatedCompletionTime = nowTime + (estimatedDaysRemaining * 24 * 60 * 60 * 1000);
            return new Date(estimatedCompletionTime);
        }
        /**
         * Calculate schedule variance (SV)
         * Negative = behind schedule, Positive = ahead of schedule
         */
        calculateScheduleVariance(overallProgress, timeProgress) {
            return overallProgress - timeProgress;
        }
        /**
         * Calculate completion percentage for a given entity count
         */
        calculateCompletionPercentage(total, completed) {
            if (total === 0)
                return 0;
            return Math.round((completed / total) * 100);
        }
        /**
         * Determine project phase based on progress
         */
        determineProjectPhase(overallProgress) {
            if (overallProgress < 10)
                return 'planning';
            if (overallProgress < 90)
                return 'execution';
            return 'closing';
        }
        /**
         * Calculate weighted progress across multiple categories
         */
        calculateWeightedProgress(weights) {
            let totalWeight = 0;
            let weightedSum = 0;
            Object.values(weights).forEach(({ progress, weight }) => {
                weightedSum += progress * weight;
                totalWeight += weight;
            });
            if (totalWeight === 0)
                return 0;
            return Math.round(weightedSum / totalWeight);
        }
    };
    return ProgressCalculatorService = _classThis;
})();
exports.ProgressCalculatorService = ProgressCalculatorService;
//# sourceMappingURL=progress-calculator.service.js.map