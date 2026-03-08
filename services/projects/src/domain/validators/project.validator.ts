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

import { Injectable, BadRequestException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { ProjectStatus } from '../repositories/project.repository.interface';

@Injectable()
export class ProjectValidator {
  /**
   * Validate project title
   */
  validateTitle(title: string): void {
    if (!title || title.trim().length === 0) {
      throw new BadRequestException('Project title is required');
    }

    if (title.length < 3) {
      throw new BadRequestException('Project title must be at least 3 characters');
    }

    if (title.length > 200) {
      throw new BadRequestException('Project title must be less than 200 characters');
    }
  }

  /**
   * Validate project description
   */
  validateDescription(description: string): void {
    if (description && description.length > 5000) {
      throw new BadRequestException('Project description must be less than 5000 characters');
    }
  }

  /**
   * Validate budget
   */
  validateBudget(budget: Decimal | number): void {
    const budgetValue = budget instanceof Decimal ? budget.toNumber() : budget;

    if (budgetValue < 0) {
      throw new BadRequestException('Budget cannot be negative');
    }

    if (budgetValue > 100000000) {
      throw new BadRequestException('Budget cannot exceed $100,000,000');
    }
  }

  /**
   * Validate date range
   */
  validateDateRange(startDate: Date | null, endDate: Date | null): void {
    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException('Start date must be before end date');
    }

    if (startDate && startDate < new Date('2020-01-01')) {
      throw new BadRequestException('Start date cannot be before 2020');
    }

    if (endDate) {
      const maxDate = new Date();
      maxDate.setFullYear(maxDate.getFullYear() + 10);
      if (endDate > maxDate) {
        throw new BadRequestException('End date cannot be more than 10 years in the future');
      }
    }
  }

  /**
   * Validate currency code
   */
  validateCurrency(currency: string): void {
    const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'];

    if (!validCurrencies.includes(currency.toUpperCase())) {
      throw new BadRequestException(
        `Invalid currency. Supported: ${validCurrencies.join(', ')}`
      );
    }
  }

  /**
   * Validate status transition
   */
  validateStatusTransition(currentStatus: ProjectStatus, newStatus: ProjectStatus): void {
    const validTransitions: Record<ProjectStatus, ProjectStatus[]> = {
      draft: ['pending_approval', 'cancelled'],
      pending_approval: ['draft', 'active', 'cancelled'],
      active: ['on_hold', 'completed', 'substantial_completion', 'cancelled'],
      on_hold: ['active', 'cancelled'],
      completed: ['closed'],
      substantial_completion: ['completed', 'closed'],
      closed: [], // Cannot transition from closed
      cancelled: [], // Cannot transition from cancelled
    };

    const allowedTransitions = validTransitions[currentStatus];

    if (!allowedTransitions.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from '${currentStatus}' to '${newStatus}'. ` +
        `Allowed transitions: ${allowedTransitions.join(', ') || 'none'}`
      );
    }
  }

  /**
   * Validate project can be modified
   */
  validateCanModify(status: ProjectStatus): void {
    if (status === 'closed' || status === 'cancelled') {
      throw new BadRequestException(
        `Cannot modify project with status '${status}'`
      );
    }
  }

  /**
   * Validate project can add tasks
   */
  validateCanAddTasks(status: ProjectStatus): void {
    if (status === 'closed' || status === 'cancelled') {
      throw new BadRequestException(
        `Cannot add tasks to a ${status} project`
      );
    }
  }

  /**
   * Validate project can be closed
   */
  validateCanClose(status: ProjectStatus, openTasks: number, openIssues: number): void {
    if (status === 'closed' || status === 'cancelled') {
      throw new BadRequestException('Project is already closed or cancelled');
    }

    if (openTasks > 0) {
      throw new BadRequestException(
        `Cannot close project with ${openTasks} open tasks. Complete or cancel them first.`
      );
    }

    if (openIssues > 0) {
      throw new BadRequestException(
        `Cannot close project with ${openIssues} open issues. Resolve them first.`
      );
    }
  }

  /**
   * Validate complete project data for creation
   */
  validateCreateData(data: any): void {
    // Required fields
    if (!data.title) {
      throw new BadRequestException('Title is required');
    }
    this.validateTitle(data.title);

    if (!data.clientId) {
      throw new BadRequestException('Client ID is required');
    }

    if (!data.designerId) {
      throw new BadRequestException('Designer ID is required');
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
  validateUpdateData(data: any, currentStatus?: ProjectStatus): void {
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
  validateUserAccess(
    projectOwnerId: string,
    userId: string,
    userRole: string,
    requiredRole: 'owner' | 'participant' | 'any'
  ): void {
    if (requiredRole === 'owner' && projectOwnerId !== userId && userRole !== 'admin') {
      throw new BadRequestException('Only the project owner or admin can perform this action');
    }
  }
}
