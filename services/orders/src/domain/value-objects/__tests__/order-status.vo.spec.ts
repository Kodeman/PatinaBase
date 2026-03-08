/**
 * OrderStatus Value Object Tests
 *
 * Tests for the state machine logic.
 */

import { OrderStatus, OrderStatusValue } from '../order-status.vo';
import {
  InvalidOrderStatusError,
  InvalidStatusTransitionError,
} from '../../exceptions/order.exceptions';

describe('OrderStatus', () => {
  describe('create', () => {
    it('should create valid status', () => {
      const status = OrderStatus.create('created');
      expect(status.getValue()).toBe('created');
    });

    it('should throw error for invalid status', () => {
      expect(() => OrderStatus.create('invalid' as OrderStatusValue)).toThrow(InvalidOrderStatusError);
    });
  });

  describe('createInitial', () => {
    it('should create initial status as "created"', () => {
      const status = OrderStatus.createInitial();
      expect(status.getValue()).toBe('created');
    });
  });

  describe('transitionTo', () => {
    it('should allow valid transition from created to paid', () => {
      const status = OrderStatus.create('created');
      const newStatus = status.transitionTo('paid');
      expect(newStatus.getValue()).toBe('paid');
    });

    it('should allow valid transition from created to canceled', () => {
      const status = OrderStatus.create('created');
      const newStatus = status.transitionTo('canceled');
      expect(newStatus.getValue()).toBe('canceled');
    });

    it('should allow valid transition from paid to processing', () => {
      const status = OrderStatus.create('paid');
      const newStatus = status.transitionTo('processing');
      expect(newStatus.getValue()).toBe('processing');
    });

    it('should allow valid transition from processing to fulfilled', () => {
      const status = OrderStatus.create('processing');
      const newStatus = status.transitionTo('fulfilled');
      expect(newStatus.getValue()).toBe('fulfilled');
    });

    it('should allow valid transition from fulfilled to closed', () => {
      const status = OrderStatus.create('fulfilled');
      const newStatus = status.transitionTo('closed');
      expect(newStatus.getValue()).toBe('closed');
    });

    it('should throw error for invalid transition from created to fulfilled', () => {
      const status = OrderStatus.create('created');
      expect(() => status.transitionTo('fulfilled')).toThrow(InvalidStatusTransitionError);
    });

    it('should throw error for invalid transition from closed to paid', () => {
      const status = OrderStatus.create('closed');
      expect(() => status.transitionTo('paid')).toThrow(InvalidStatusTransitionError);
    });

    it('should throw error for transition from terminal state', () => {
      const status = OrderStatus.create('canceled');
      expect(() => status.transitionTo('paid')).toThrow(InvalidStatusTransitionError);
    });
  });

  describe('canTransitionTo', () => {
    it('should return true for valid transition', () => {
      const status = OrderStatus.create('created');
      expect(status.canTransitionTo('paid')).toBe(true);
      expect(status.canTransitionTo('canceled')).toBe(true);
    });

    it('should return false for invalid transition', () => {
      const status = OrderStatus.create('created');
      expect(status.canTransitionTo('fulfilled')).toBe(false);
      expect(status.canTransitionTo('closed')).toBe(false);
    });

    it('should return false for transition from terminal state', () => {
      const status = OrderStatus.create('closed');
      expect(status.canTransitionTo('paid')).toBe(false);
      expect(status.canTransitionTo('fulfilled')).toBe(false);
    });
  });

  describe('isTerminal', () => {
    it('should return true for terminal states', () => {
      expect(OrderStatus.create('closed').isTerminal()).toBe(true);
      expect(OrderStatus.create('canceled').isTerminal()).toBe(true);
    });

    it('should return false for non-terminal states', () => {
      expect(OrderStatus.create('created').isTerminal()).toBe(false);
      expect(OrderStatus.create('paid').isTerminal()).toBe(false);
      expect(OrderStatus.create('processing').isTerminal()).toBe(false);
      expect(OrderStatus.create('fulfilled').isTerminal()).toBe(false);
    });
  });

  describe('allowsModifications', () => {
    it('should return true for modifiable states', () => {
      expect(OrderStatus.create('created').allowsModifications()).toBe(true);
      expect(OrderStatus.create('paid').allowsModifications()).toBe(true);
    });

    it('should return false for non-modifiable states', () => {
      expect(OrderStatus.create('processing').allowsModifications()).toBe(false);
      expect(OrderStatus.create('fulfilled').allowsModifications()).toBe(false);
      expect(OrderStatus.create('closed').allowsModifications()).toBe(false);
      expect(OrderStatus.create('canceled').allowsModifications()).toBe(false);
    });
  });

  describe('isPaid', () => {
    it('should return true for paid states', () => {
      expect(OrderStatus.create('paid').isPaid()).toBe(true);
      expect(OrderStatus.create('processing').isPaid()).toBe(true);
      expect(OrderStatus.create('fulfilled').isPaid()).toBe(true);
      expect(OrderStatus.create('closed').isPaid()).toBe(true);
    });

    it('should return false for non-paid states', () => {
      expect(OrderStatus.create('created').isPaid()).toBe(false);
      expect(OrderStatus.create('refunded').isPaid()).toBe(false);
      expect(OrderStatus.create('canceled').isPaid()).toBe(false);
    });
  });

  describe('isFulfilled', () => {
    it('should return true for fulfilled states', () => {
      expect(OrderStatus.create('fulfilled').isFulfilled()).toBe(true);
      expect(OrderStatus.create('closed').isFulfilled()).toBe(true);
    });

    it('should return false for non-fulfilled states', () => {
      expect(OrderStatus.create('created').isFulfilled()).toBe(false);
      expect(OrderStatus.create('paid').isFulfilled()).toBe(false);
      expect(OrderStatus.create('processing').isFulfilled()).toBe(false);
    });
  });

  describe('isCanceledOrRefunded', () => {
    it('should return true for canceled or refunded states', () => {
      expect(OrderStatus.create('canceled').isCanceledOrRefunded()).toBe(true);
      expect(OrderStatus.create('refunded').isCanceledOrRefunded()).toBe(true);
    });

    it('should return false for other states', () => {
      expect(OrderStatus.create('created').isCanceledOrRefunded()).toBe(false);
      expect(OrderStatus.create('paid').isCanceledOrRefunded()).toBe(false);
      expect(OrderStatus.create('fulfilled').isCanceledOrRefunded()).toBe(false);
    });
  });

  describe('equals', () => {
    it('should return true for equal statuses', () => {
      const status1 = OrderStatus.create('created');
      const status2 = OrderStatus.create('created');
      expect(status1.equals(status2)).toBe(true);
    });

    it('should return false for different statuses', () => {
      const status1 = OrderStatus.create('created');
      const status2 = OrderStatus.create('paid');
      expect(status1.equals(status2)).toBe(false);
    });
  });

  describe('toString/toJSON', () => {
    it('should return status value as string', () => {
      const status = OrderStatus.create('paid');
      expect(status.toString()).toBe('paid');
      expect(status.toJSON()).toBe('paid');
    });
  });

  describe('static methods', () => {
    it('getAllStatuses should return all valid statuses', () => {
      const statuses = OrderStatus.getAllStatuses();
      expect(statuses).toContain('created');
      expect(statuses).toContain('paid');
      expect(statuses).toContain('processing');
      expect(statuses).toContain('fulfilled');
      expect(statuses).toContain('closed');
      expect(statuses).toContain('refunded');
      expect(statuses).toContain('canceled');
    });

    it('getValidTransitions should return valid transitions for a status', () => {
      const transitions = OrderStatus.getValidTransitions('created');
      expect(transitions).toContain('paid');
      expect(transitions).toContain('canceled');
      expect(transitions).toHaveLength(2);
    });

    it('isValidStatus should validate status strings', () => {
      expect(OrderStatus.isValidStatus('created')).toBe(true);
      expect(OrderStatus.isValidStatus('paid')).toBe(true);
      expect(OrderStatus.isValidStatus('invalid')).toBe(false);
    });
  });
});
