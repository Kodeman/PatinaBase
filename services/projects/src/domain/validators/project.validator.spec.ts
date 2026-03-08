/**
 * Project Validator Tests
 *
 * Tests all business rule validation without database dependencies.
 * Fast execution (<100ms) and 100% coverage.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ProjectValidator } from './project.validator';
import { Decimal } from 'decimal.js';

describe('ProjectValidator', () => {
  let validator: ProjectValidator;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProjectValidator],
    }).compile();

    validator = module.get<ProjectValidator>(ProjectValidator);
  });

  describe('validateTitle', () => {
    it('should pass for valid title', () => {
      expect(() => {
        validator.validateTitle('Modern Living Room Renovation');
      }).not.toThrow();
    });

    it('should reject empty title', () => {
      expect(() => {
        validator.validateTitle('');
      }).toThrow('Project title is required');
    });

    it('should reject title that is too short', () => {
      expect(() => {
        validator.validateTitle('AB');
      }).toThrow('Project title must be at least 3 characters');
    });

    it('should reject title that is too long', () => {
      const longTitle = 'a'.repeat(201);
      expect(() => {
        validator.validateTitle(longTitle);
      }).toThrow('Project title must be less than 200 characters');
    });
  });

  describe('validateBudget', () => {
    it('should pass for valid budget as number', () => {
      expect(() => {
        validator.validateBudget(50000);
      }).not.toThrow();
    });

    it('should pass for valid budget as Decimal', () => {
      expect(() => {
        validator.validateBudget(new Decimal(50000));
      }).not.toThrow();
    });

    it('should reject negative budget', () => {
      expect(() => {
        validator.validateBudget(-1000);
      }).toThrow('Budget cannot be negative');
    });

    it('should reject budget exceeding maximum', () => {
      expect(() => {
        validator.validateBudget(150000000);
      }).toThrow('Budget cannot exceed $100,000,000');
    });
  });

  describe('validateDateRange', () => {
    it('should pass for valid date range', () => {
      const start = new Date('2025-01-01');
      const end = new Date('2025-12-31');

      expect(() => {
        validator.validateDateRange(start, end);
      }).not.toThrow();
    });

    it('should reject when start date is after end date', () => {
      const start = new Date('2025-12-31');
      const end = new Date('2025-01-01');

      expect(() => {
        validator.validateDateRange(start, end);
      }).toThrow('Start date must be before end date');
    });

    it('should reject start date before 2020', () => {
      const start = new Date('2019-12-31');
      const end = new Date('2025-12-31');

      expect(() => {
        validator.validateDateRange(start, end);
      }).toThrow('Start date cannot be before 2020');
    });

    it('should reject end date more than 10 years in future', () => {
      const start = new Date();
      const end = new Date();
      end.setFullYear(end.getFullYear() + 11);

      expect(() => {
        validator.validateDateRange(start, end);
      }).toThrow('End date cannot be more than 10 years in the future');
    });
  });

  describe('validateCurrency', () => {
    it('should pass for valid currencies', () => {
      const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'];

      validCurrencies.forEach(currency => {
        expect(() => {
          validator.validateCurrency(currency);
        }).not.toThrow();
      });
    });

    it('should reject invalid currency', () => {
      expect(() => {
        validator.validateCurrency('XYZ');
      }).toThrow('Invalid currency');
    });
  });

  describe('validateStatusTransition', () => {
    it('should allow draft to pending_approval', () => {
      expect(() => {
        validator.validateStatusTransition('draft', 'pending_approval');
      }).not.toThrow();
    });

    it('should allow pending_approval to active', () => {
      expect(() => {
        validator.validateStatusTransition('pending_approval', 'active');
      }).not.toThrow();
    });

    it('should allow active to completed', () => {
      expect(() => {
        validator.validateStatusTransition('active', 'completed');
      }).not.toThrow();
    });

    it('should reject invalid transition from closed', () => {
      expect(() => {
        validator.validateStatusTransition('closed', 'active');
      }).toThrow('Cannot transition from \'closed\' to \'active\'');
    });

    it('should reject invalid transition from cancelled', () => {
      expect(() => {
        validator.validateStatusTransition('cancelled', 'active');
      }).toThrow('Cannot transition from \'cancelled\' to \'active\'');
    });

    it('should reject invalid transition from draft to completed', () => {
      expect(() => {
        validator.validateStatusTransition('draft', 'completed');
      }).toThrow('Cannot transition from \'draft\' to \'completed\'');
    });
  });

  describe('validateCanModify', () => {
    it('should pass for modifiable statuses', () => {
      ['draft', 'pending_approval', 'active', 'on_hold', 'completed'].forEach(status => {
        expect(() => {
          validator.validateCanModify(status as any);
        }).not.toThrow();
      });
    });

    it('should reject closed project', () => {
      expect(() => {
        validator.validateCanModify('closed');
      }).toThrow('Cannot modify project with status \'closed\'');
    });

    it('should reject cancelled project', () => {
      expect(() => {
        validator.validateCanModify('cancelled');
      }).toThrow('Cannot modify project with status \'cancelled\'');
    });
  });

  describe('validateCanClose', () => {
    it('should pass when no open tasks or issues', () => {
      expect(() => {
        validator.validateCanClose('active', 0, 0);
      }).not.toThrow();
    });

    it('should reject when already closed', () => {
      expect(() => {
        validator.validateCanClose('closed', 0, 0);
      }).toThrow('Project is already closed or cancelled');
    });

    it('should reject when open tasks exist', () => {
      expect(() => {
        validator.validateCanClose('active', 5, 0);
      }).toThrow('Cannot close project with 5 open tasks');
    });

    it('should reject when open issues exist', () => {
      expect(() => {
        validator.validateCanClose('active', 0, 3);
      }).toThrow('Cannot close project with 3 open issues');
    });
  });

  describe('validateCreateData', () => {
    it('should pass for valid create data', () => {
      expect(() => {
        validator.validateCreateData({
          title: 'Modern Living Room',
          clientId: 'client-123',
          designerId: 'designer-456',
          budget: 50000,
          currency: 'USD',
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
        });
      }).not.toThrow();
    });

    it('should reject missing title', () => {
      expect(() => {
        validator.validateCreateData({
          clientId: 'client-123',
          designerId: 'designer-456',
        });
      }).toThrow('Title is required');
    });

    it('should reject missing clientId', () => {
      expect(() => {
        validator.validateCreateData({
          title: 'Modern Living Room',
          designerId: 'designer-456',
        });
      }).toThrow('Client ID is required');
    });

    it('should reject missing designerId', () => {
      expect(() => {
        validator.validateCreateData({
          title: 'Modern Living Room',
          clientId: 'client-123',
        });
      }).toThrow('Designer ID is required');
    });
  });

  describe('validateUpdateData', () => {
    it('should pass for valid update data', () => {
      expect(() => {
        validator.validateUpdateData({
          title: 'Updated Title',
          budget: 75000,
        }, 'draft');
      }).not.toThrow();
    });

    it('should validate status transition when provided', () => {
      expect(() => {
        validator.validateUpdateData({
          status: 'active',
        }, 'pending_approval');
      }).not.toThrow();
    });

    it('should reject invalid status transition', () => {
      expect(() => {
        validator.validateUpdateData({
          status: 'active',
        }, 'closed');
      }).toThrow('Cannot transition from \'closed\' to \'active\'');
    });
  });
});
