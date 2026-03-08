/**
 * Order Entity Tests
 *
 * Tests for Order aggregate root business logic.
 */

import { Order, CreateOrderProps } from '../order.entity';
import { Money, AddressVO as Address } from '@patina/types';
import {
  OrderCannotBeModifiedError,
  InvalidOrderOperationError,
  InvalidOrderItemError,
} from '../../exceptions/order.exceptions';
import { OrderStatus } from '../../value-objects/order-status.vo';
import { CreateOrderItemProps } from '../order-item.entity';

describe('Order', () => {
  const mockAddress = Address.create({
    street1: '123 Main St',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94102',
    country: 'US',
  });

  const mockItem: CreateOrderItemProps = {
    productId: 'prod-1',
    name: 'Test Product',
    quantity: 2,
    unitPrice: Money.create(100, 'USD'),
    taxAmount: Money.create(10, 'USD'),
  };

  const mockOrderProps: CreateOrderProps = {
    userId: 'user-1',
    currency: 'USD',
    shippingAddress: mockAddress,
    items: [mockItem],
  };

  describe('create', () => {
    it('should create a new order with valid data', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');

      expect(order.getOrderNumber()).toBe('ORD-001');
      expect(order.getUserId()).toBe('user-1');
      expect(order.getStatus().getValue()).toBe('created');
      expect(order.getPaymentStatus().getValue()).toBe('pending');
      expect(order.getFulfillmentStatus().getValue()).toBe('unfulfilled');
      expect(order.getItems()).toHaveLength(1);
    });

    it('should throw error if user ID is missing', () => {
      const props = { ...mockOrderProps, userId: '' };
      expect(() => Order.create(props, 'ORD-001')).toThrow(InvalidOrderOperationError);
    });

    it('should throw error if items array is empty', () => {
      const props = { ...mockOrderProps, items: [] };
      expect(() => Order.create(props, 'ORD-001')).toThrow(InvalidOrderOperationError);
    });

    it('should use shipping address as billing address if not provided', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');
      expect(order.getBillingAddress()?.equals(mockAddress)).toBe(true);
    });

    it('should calculate totals correctly', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');
      // 2 items * $100 = $200
      expect(order.getSubtotal().getAmount()).toBe(200);
      // 2 items * $10 tax = $20
      expect(order.getTaxTotal().getAmount()).toBe(20);
      // $200 + $20 = $220
      expect(order.getTotal().getAmount()).toBe(220);
    });
  });

  describe('addItem', () => {
    it('should add item to order when status allows modifications', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');
      const newItem: CreateOrderItemProps = {
        productId: 'prod-2',
        name: 'New Product',
        quantity: 1,
        unitPrice: Money.create(50, 'USD'),
      };

      order.addItem(newItem);

      expect(order.getItems()).toHaveLength(2);
      expect(order.getSubtotal().getAmount()).toBe(250); // 200 + 50
    });

    it('should throw error when adding item to non-modifiable order', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');
      order.transitionStatus('processing');

      const newItem: CreateOrderItemProps = {
        productId: 'prod-2',
        name: 'New Product',
        quantity: 1,
        unitPrice: Money.create(50, 'USD'),
      };

      expect(() => order.addItem(newItem)).toThrow(OrderCannotBeModifiedError);
    });
  });

  describe('removeItem', () => {
    it('should remove item from order', () => {
      const item2: CreateOrderItemProps = {
        productId: 'prod-2',
        name: 'Product 2',
        quantity: 1,
        unitPrice: Money.create(50, 'USD'),
      };

      const order = Order.create({
        ...mockOrderProps,
        items: [mockItem, item2],
      }, 'ORD-001');

      const items = order.getItems();
      const itemToRemove = items[1];

      order.removeItem(itemToRemove.getId());

      expect(order.getItems()).toHaveLength(1);
    });

    it('should throw error when removing last item', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');
      const items = order.getItems();

      expect(() => order.removeItem(items[0].getId())).toThrow(InvalidOrderOperationError);
    });

    it('should throw error when removing non-existent item', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');

      expect(() => order.removeItem('non-existent-id')).toThrow(InvalidOrderItemError);
    });
  });

  describe('updateItemQuantity', () => {
    it('should update item quantity and recalculate totals', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');
      const items = order.getItems();

      order.updateItemQuantity(items[0].getId(), 3);

      expect(items[0].getQuantity()).toBe(3);
      expect(order.getSubtotal().getAmount()).toBe(300); // 3 * 100
    });

    it('should throw error when updating non-existent item', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');

      expect(() => order.updateItemQuantity('non-existent-id', 5)).toThrow(InvalidOrderItemError);
    });
  });

  describe('applyDiscount', () => {
    it('should apply discount and recalculate total', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');
      const discount = Money.create(20, 'USD');

      order.applyDiscount(discount);

      expect(order.getDiscountTotal().getAmount()).toBe(20);
      // $200 subtotal - $20 discount + $20 tax = $200
      expect(order.getTotal().getAmount()).toBe(200);
    });

    it('should throw error for negative discount', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');
      const discount = Money.create(-10, 'USD');

      expect(() => order.applyDiscount(discount)).toThrow(InvalidOrderOperationError);
    });

    it('should throw error when discount exceeds subtotal', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');
      const discount = Money.create(300, 'USD');

      expect(() => order.applyDiscount(discount)).toThrow(InvalidOrderOperationError);
    });
  });

  describe('setShippingCost', () => {
    it('should set shipping cost and recalculate total', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');
      const shipping = Money.create(15, 'USD');

      order.setShippingCost(shipping);

      expect(order.getShippingTotal().getAmount()).toBe(15);
      // $200 subtotal + $20 tax + $15 shipping = $235
      expect(order.getTotal().getAmount()).toBe(235);
    });

    it('should throw error for negative shipping cost', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');
      const shipping = Money.create(-5, 'USD');

      expect(() => order.setShippingCost(shipping)).toThrow(InvalidOrderOperationError);
    });
  });

  describe('transitionStatus', () => {
    it('should transition to valid next status', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');

      order.transitionStatus('paid');

      expect(order.getStatus().getValue()).toBe('paid');
    });

    it('should throw error for invalid transition', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');

      expect(() => order.transitionStatus('fulfilled')).toThrow();
    });
  });

  describe('markAsPaid', () => {
    it('should mark order as paid with payment details', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');

      order.markAsPaid('pi_123', 'cus_456');

      expect(order.getStatus().getValue()).toBe('paid');
      expect(order.getPaymentStatus().getValue()).toBe('captured');
      expect(order.getPaymentIntentId()).toBe('pi_123');
      expect(order.getCustomerId()).toBe('cus_456');
      expect(order.getPaidAt()).toBeInstanceOf(Date);
    });

    it('should throw error if already paid', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');
      order.markAsPaid();

      expect(() => order.markAsPaid()).toThrow(InvalidOrderOperationError);
    });
  });

  describe('markAsFulfilled', () => {
    it('should mark order as fulfilled when paid', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');
      order.markAsPaid();

      order.markAsFulfilled();

      expect(order.getStatus().getValue()).toBe('fulfilled');
      expect(order.getFulfillmentStatus().getValue()).toBe('fulfilled');
      expect(order.getFulfilledAt()).toBeInstanceOf(Date);
    });

    it('should throw error if not paid', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');

      expect(() => order.markAsFulfilled()).toThrow(InvalidOrderOperationError);
    });
  });

  describe('cancel', () => {
    it('should cancel unpaid order', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');

      order.cancel('Customer requested');

      expect(order.getStatus().getValue()).toBe('canceled');
      expect(order.getCanceledAt()).toBeInstanceOf(Date);
      expect(order.getInternalNotes()).toContain('Customer requested');
    });

    it('should throw error when canceling paid order', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');
      order.markAsPaid();

      expect(() => order.cancel()).toThrow(InvalidOrderOperationError);
    });
  });

  describe('refund', () => {
    it('should refund paid order', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');
      order.markAsPaid();

      order.refund();

      expect(order.getStatus().getValue()).toBe('refunded');
      expect(order.getPaymentStatus().getValue()).toBe('refunded');
    });

    it('should throw error when refunding unpaid order', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');

      expect(() => order.refund()).toThrow(InvalidOrderOperationError);
    });
  });

  describe('close', () => {
    it('should close fulfilled order', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');
      order.markAsPaid();
      order.markAsFulfilled();

      order.close();

      expect(order.getStatus().getValue()).toBe('closed');
      expect(order.getClosedAt()).toBeInstanceOf(Date);
    });

    it('should throw error when closing non-fulfilled order', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');
      order.markAsPaid();

      expect(() => order.close()).toThrow(InvalidOrderOperationError);
    });
  });

  describe('addInternalNotes', () => {
    it('should add internal notes', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');

      order.addInternalNotes('First note');
      expect(order.getInternalNotes()).toBe('First note');

      order.addInternalNotes('Second note');
      expect(order.getInternalNotes()).toBe('First note\nSecond note');
    });
  });

  describe('updateShippingAddress', () => {
    it('should update shipping address', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');
      const newAddress = Address.create({
        street1: '456 Oak Ave',
        city: 'Los Angeles',
        state: 'CA',
        postalCode: '90001',
        country: 'US',
      });

      order.updateShippingAddress(newAddress);

      expect(order.getShippingAddress()?.getStreet1()).toBe('456 Oak Ave');
    });

    it('should throw error when updating in non-modifiable state', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');
      order.transitionStatus('paid');
      order.transitionStatus('processing');

      const newAddress = Address.create({
        street1: '456 Oak Ave',
        city: 'Los Angeles',
        state: 'CA',
        postalCode: '90001',
        country: 'US',
      });

      expect(() => order.updateShippingAddress(newAddress)).toThrow(OrderCannotBeModifiedError);
    });
  });

  describe('canBeModified', () => {
    it('should return true for created status', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');
      expect(order.canBeModified()).toBe(true);
    });

    it('should return true for paid status', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');
      order.transitionStatus('paid');
      expect(order.canBeModified()).toBe(true);
    });

    it('should return false for processing status', () => {
      const order = Order.create(mockOrderProps, 'ORD-001');
      order.transitionStatus('paid');
      order.transitionStatus('processing');
      expect(order.canBeModified()).toBe(false);
    });
  });
});
