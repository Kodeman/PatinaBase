/**
 * Approval Validator Tests
 *
 * Tests all approval business rule validation without database dependencies.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApprovalValidator } from './approval.validator';

describe('ApprovalValidator', () => {
  let validator: ApprovalValidator;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApprovalValidator],
    }).compile();

    validator = module.get<ApprovalValidator>(ApprovalValidator);
  });

  describe('validateTitle', () => {
    it('should pass for valid title', () => {
      expect(() => {
        validator.validateTitle('Design Concept Approval');
      }).not.toThrow();
    });

    it('should reject empty title', () => {
      expect(() => {
        validator.validateTitle('');
      }).toThrow('Approval title is required');
    });

    it('should reject title that is too short', () => {
      expect(() => {
        validator.validateTitle('Test');
      }).toThrow('Approval title must be at least 5 characters');
    });

    it('should reject title that is too long', () => {
      const longTitle = 'a'.repeat(201);
      expect(() => {
        validator.validateTitle(longTitle);
      }).toThrow('Approval title must be less than 200 characters');
    });
  });

  describe('validateDueDate', () => {
    it('should pass for valid future date', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      expect(() => {
        validator.validateDueDate(futureDate);
      }).not.toThrow();
    });

    it('should reject past date', () => {
      const pastDate = new Date('2020-01-01');

      expect(() => {
        validator.validateDueDate(pastDate);
      }).toThrow('Due date cannot be in the past');
    });

    it('should reject date more than 2 years in future', () => {
      const farFutureDate = new Date();
      farFutureDate.setFullYear(farFutureDate.getFullYear() + 3);

      expect(() => {
        validator.validateDueDate(farFutureDate);
      }).toThrow('Due date cannot be more than 2 years in the future');
    });
  });

  describe('validateApprovalType', () => {
    it('should pass for all valid approval types', () => {
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

      validTypes.forEach(type => {
        expect(() => {
          validator.validateApprovalType(type);
        }).not.toThrow();
      });
    });

    it('should reject invalid approval type', () => {
      expect(() => {
        validator.validateApprovalType('invalid_type');
      }).toThrow('Invalid approval type');
    });
  });

  describe('validatePriority', () => {
    it('should pass for all valid priorities', () => {
      ['low', 'normal', 'high', 'urgent'].forEach(priority => {
        expect(() => {
          validator.validatePriority(priority);
        }).not.toThrow();
      });
    });

    it('should reject invalid priority', () => {
      expect(() => {
        validator.validatePriority('critical');
      }).toThrow('Invalid priority');
    });
  });

  describe('validateDocuments', () => {
    it('should pass for valid documents array', () => {
      expect(() => {
        validator.validateDocuments([
          'https://example.com/doc1.pdf',
          'https://example.com/doc2.pdf',
        ]);
      }).not.toThrow();
    });

    it('should reject more than 50 documents', () => {
      const tooManyDocs = Array(51).fill('https://example.com/doc.pdf');

      expect(() => {
        validator.validateDocuments(tooManyDocs);
      }).toThrow('Cannot attach more than 50 documents');
    });

    it('should reject empty document path', () => {
      expect(() => {
        validator.validateDocuments(['https://example.com/doc1.pdf', '']);
      }).toThrow('Document at index 1 is invalid');
    });

    it('should reject document path that is too long', () => {
      const longPath = 'https://example.com/' + 'a'.repeat(500);

      expect(() => {
        validator.validateDocuments([longPath]);
      }).toThrow('Document path at index 0 is too long');
    });
  });

  describe('validateStatusTransition', () => {
    it('should allow pending to approved', () => {
      expect(() => {
        validator.validateStatusTransition('pending', 'approved');
      }).not.toThrow();
    });

    it('should allow pending to rejected', () => {
      expect(() => {
        validator.validateStatusTransition('pending', 'rejected');
      }).not.toThrow();
    });

    it('should allow needs_discussion to approved', () => {
      expect(() => {
        validator.validateStatusTransition('needs_discussion', 'approved');
      }).not.toThrow();
    });

    it('should reject transition from approved', () => {
      expect(() => {
        validator.validateStatusTransition('approved', 'rejected');
      }).toThrow('Cannot transition from \'approved\' to \'rejected\'');
    });

    it('should reject transition from rejected', () => {
      expect(() => {
        validator.validateStatusTransition('rejected', 'approved');
      }).toThrow('Cannot transition from \'rejected\' to \'approved\'');
    });
  });

  describe('validateCanProcess', () => {
    it('should pass for pending status', () => {
      expect(() => {
        validator.validateCanProcess('pending');
      }).not.toThrow();
    });

    it('should pass for needs_discussion status', () => {
      expect(() => {
        validator.validateCanProcess('needs_discussion');
      }).not.toThrow();
    });

    it('should reject approved status', () => {
      expect(() => {
        validator.validateCanProcess('approved');
      }).toThrow('Cannot process approval with status \'approved\'');
    });

    it('should reject rejected status', () => {
      expect(() => {
        validator.validateCanProcess('rejected');
      }).toThrow('Cannot process approval with status \'rejected\'');
    });
  });

  describe('validateUserAssignment', () => {
    it('should pass when user is assigned', () => {
      expect(() => {
        validator.validateUserAssignment('user-123', 'user-123');
      }).not.toThrow();
    });

    it('should reject when user is not assigned', () => {
      expect(() => {
        validator.validateUserAssignment('user-123', 'user-456');
      }).toThrow('You are not authorized to process this approval');
    });
  });

  describe('validateSignature', () => {
    it('should pass for valid signature', () => {
      expect(() => {
        validator.validateSignature({
          data: 'base64-signature-data',
          signerName: 'John Doe',
        });
      }).not.toThrow();
    });

    it('should reject missing signature data', () => {
      expect(() => {
        validator.validateSignature({
          data: '',
          signerName: 'John Doe',
        });
      }).toThrow('Signature data is required');
    });

    it('should reject signature data that is too large', () => {
      const largeData = 'a'.repeat(100001);

      expect(() => {
        validator.validateSignature({
          data: largeData,
          signerName: 'John Doe',
        });
      }).toThrow('Signature data is too large');
    });

    it('should reject missing signer name', () => {
      expect(() => {
        validator.validateSignature({
          data: 'base64-signature-data',
          signerName: '',
        });
      }).toThrow('Signer name is required');
    });
  });

  describe('validateRejectionReason', () => {
    it('should pass for valid rejection reason', () => {
      expect(() => {
        validator.validateRejectionReason('The design does not meet requirements');
      }).not.toThrow();
    });

    it('should reject empty reason', () => {
      expect(() => {
        validator.validateRejectionReason('');
      }).toThrow('Rejection reason is required');
    });

    it('should reject reason that is too short', () => {
      expect(() => {
        validator.validateRejectionReason('Too short');
      }).toThrow('Rejection reason must be at least 10 characters');
    });

    it('should reject reason that is too long', () => {
      const longReason = 'a'.repeat(1001);

      expect(() => {
        validator.validateRejectionReason(longReason);
      }).toThrow('Rejection reason must be less than 1000 characters');
    });
  });

  describe('validateCreateData', () => {
    it('should pass for valid create data', () => {
      expect(() => {
        validator.validateCreateData({
          title: 'Design Concept Approval',
          approvalType: 'design_concept',
          requestedBy: 'designer-123',
          assignedTo: 'client-456',
          priority: 'high',
          description: 'Please review the design concept',
        });
      }).not.toThrow();
    });

    it('should reject missing title', () => {
      expect(() => {
        validator.validateCreateData({
          approvalType: 'design_concept',
          requestedBy: 'designer-123',
          assignedTo: 'client-456',
        });
      }).toThrow('Title is required');
    });

    it('should reject missing approval type', () => {
      expect(() => {
        validator.validateCreateData({
          title: 'Design Concept Approval',
          requestedBy: 'designer-123',
          assignedTo: 'client-456',
        });
      }).toThrow('Approval type is required');
    });
  });
});
