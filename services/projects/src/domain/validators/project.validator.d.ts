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
import { Decimal } from 'decimal.js';
import { ProjectStatus } from '../repositories/project.repository.interface';
export declare class ProjectValidator {
    /**
     * Validate project title
     */
    validateTitle(title: string): void;
    /**
     * Validate project description
     */
    validateDescription(description: string): void;
    /**
     * Validate budget
     */
    validateBudget(budget: Decimal | number): void;
    /**
     * Validate date range
     */
    validateDateRange(startDate: Date | null, endDate: Date | null): void;
    /**
     * Validate currency code
     */
    validateCurrency(currency: string): void;
    /**
     * Validate status transition
     */
    validateStatusTransition(currentStatus: ProjectStatus, newStatus: ProjectStatus): void;
    /**
     * Validate project can be modified
     */
    validateCanModify(status: ProjectStatus): void;
    /**
     * Validate project can add tasks
     */
    validateCanAddTasks(status: ProjectStatus): void;
    /**
     * Validate project can be closed
     */
    validateCanClose(status: ProjectStatus, openTasks: number, openIssues: number): void;
    /**
     * Validate complete project data for creation
     */
    validateCreateData(data: any): void;
    /**
     * Validate partial project data for updates
     */
    validateUpdateData(data: any, currentStatus?: ProjectStatus): void;
    /**
     * Validate user access based on role
     */
    validateUserAccess(projectOwnerId: string, userId: string, userRole: string, requiredRole: 'owner' | 'participant' | 'any'): void;
}
//# sourceMappingURL=project.validator.d.ts.map