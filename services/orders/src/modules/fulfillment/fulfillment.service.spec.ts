/**
 * Fulfillment Service Tests
 *
 * Integration tests for carrier integration and fulfillment operations.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { FulfillmentService } from './fulfillment.service';
import { CarrierFactory } from './carriers/carrier.factory';
import { EasyPostCarrier } from './carriers/easypost.carrier';
import { PrismaClient } from '../../generated/prisma-client';

describe('FulfillmentService', () => {
  let service: FulfillmentService;
  let prisma: PrismaClient;
  let carrierFactory: CarrierFactory;

  const mockPrisma = {
    order: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    orderItem: {
      update: jest.fn(),
    },
    shipment: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockEventsService = {
    publish: jest.fn(),
  };

  const mockCarrier = {
    getName: jest.fn().mockReturnValue('EasyPost'),
    getRates: jest.fn(),
    createLabel: jest.fn(),
    getTracking: jest.fn(),
    validateAddress: jest.fn(),
    refundShipment: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FulfillmentService,
        {
          provide: PrismaClient,
          useValue: mockPrisma,
        },
        {
          provide: 'EVENTS_SERVICE',
          useValue: mockEventsService,
        },
        {
          provide: CarrierFactory,
          useValue: {
            getCarrier: jest.fn().mockReturnValue(mockCarrier),
          },
        },
      ],
    }).compile();

    service = module.get<FulfillmentService>(FulfillmentService);
    prisma = module.get<PrismaClient>(PrismaClient);
    carrierFactory = module.get<CarrierFactory>(CarrierFactory);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getRates', () => {
    it('should return shipping rates from carrier', async () => {
      const mockRates = [
        {
          carrier: 'USPS',
          service: 'Priority',
          rate: 7.99,
          currency: 'USD',
          deliveryDays: 2,
          rateId: 'rate_123',
        },
        {
          carrier: 'FedEx',
          service: 'Ground',
          rate: 12.50,
          currency: 'USD',
          deliveryDays: 3,
          rateId: 'rate_456',
        },
      ];

      mockCarrier.getRates.mockResolvedValue(mockRates);

      const getRatesDto = {
        fromAddress: {
          street1: '123 Main St',
          city: 'San Francisco',
          state: 'CA',
          zip: '94102',
          country: 'US',
        },
        toAddress: {
          street1: '456 Market St',
          city: 'Los Angeles',
          state: 'CA',
          zip: '90001',
          country: 'US',
        },
        parcel: {
          length: 10,
          width: 8,
          height: 6,
          weight: 16,
        },
      };

      const result = await service.getRates(getRatesDto);

      expect(result.rates).toHaveLength(2);
      expect(result.recommendedRate).toBeDefined();
      expect(result.recommendedRate?.carrier).toBe('USPS'); // Lowest rate
      expect(mockCarrier.getRates).toHaveBeenCalled();
    });
  });

  describe('createShipment', () => {
    it('should create shipment and generate label for paid order', async () => {
      const orderId = 'order-123';
      const mockOrder = {
        id: orderId,
        orderNumber: 'ORD-12345',
        paymentStatus: 'captured',
        items: [
          { id: 'item-1', qty: 2, qtyFulfilled: 0 },
        ],
      };

      const mockLabel = {
        trackingNumber: '9400111899562537845962',
        labelUrl: 'https://easypost.com/label.pdf',
        labelFormat: 'PDF',
        labelSize: '4x6',
      };

      const mockShipment = {
        id: 'shipment-123',
        orderId,
        trackingNumber: mockLabel.trackingNumber,
        labelUrl: mockLabel.labelUrl,
      };

      mockPrisma.order.findUnique.mockResolvedValue(mockOrder);
      mockCarrier.createLabel.mockResolvedValue(mockLabel);
      mockPrisma.shipment.create.mockResolvedValue(mockShipment);
      mockPrisma.orderItem.update.mockResolvedValue({});
      mockPrisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        items: [{ id: 'item-1', qty: 2, qtyFulfilled: 2 }],
      });
      mockPrisma.order.update.mockResolvedValue({});

      const createShipmentDto = {
        fromAddress: {
          street1: '123 Main St',
          city: 'San Francisco',
          state: 'CA',
          zip: '94102',
          country: 'US',
        },
        toAddress: {
          street1: '456 Market St',
          city: 'Los Angeles',
          state: 'CA',
          zip: '90001',
          country: 'US',
        },
        parcel: {
          length: 10,
          width: 8,
          height: 6,
          weight: 16,
        },
        carrier: 'USPS',
        service: 'Priority',
        items: [{ orderItemId: 'item-1', qty: 2 }],
      };

      const result = await service.createShipment(orderId, createShipmentDto);

      expect(result.trackingNumber).toBe(mockLabel.trackingNumber);
      expect(mockCarrier.createLabel).toHaveBeenCalled();
      expect(mockPrisma.shipment.create).toHaveBeenCalled();
      const shipmentPayload = mockPrisma.shipment.create.mock.calls[0][0];
      expect(shipmentPayload.data.shipmentNumber).toMatch(/^SHIP-\d+-[0-9A-Z]{9}$/);
      expect(mockEventsService.publish).toHaveBeenCalledWith(
        'shipment.created',
        expect.any(Object),
      );
    });

    it('should generate unique shipment numbers for consecutive shipments', async () => {
      const orderId = 'order-123';
      const mockOrder = {
        id: orderId,
        orderNumber: 'ORD-12345',
        paymentStatus: 'captured',
        items: [
          { id: 'item-1', qty: 2, qtyFulfilled: 0 },
        ],
      };

      const mockLabel = {
        trackingNumber: '9400111899562537845962',
        labelUrl: 'https://easypost.com/label.pdf',
        labelFormat: 'PDF',
        labelSize: '4x6',
      };

      mockPrisma.order.findUnique.mockResolvedValue(mockOrder);
      mockCarrier.createLabel.mockResolvedValue(mockLabel);
      mockPrisma.shipment.create.mockResolvedValue({ id: 'shipment-1' });
      mockPrisma.orderItem.update.mockResolvedValue({});
      mockPrisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        items: [{ id: 'item-1', qty: 2, qtyFulfilled: 2 }],
      });
      mockPrisma.order.update.mockResolvedValue({});

      const createShipmentDto = {
        fromAddress: { street1: '123 Main St', city: 'San Francisco', state: 'CA', zip: '94102', country: 'US' },
        toAddress: { street1: '456 Market St', city: 'Los Angeles', state: 'CA', zip: '90001', country: 'US' },
        parcel: { length: 10, width: 8, height: 6, weight: 16 },
        carrier: 'USPS',
        service: 'Priority',
        items: [{ orderItemId: 'item-1', qty: 2 }],
      };

      await service.createShipment(orderId, createShipmentDto);
      await service.createShipment(orderId, createShipmentDto);

      const shipmentNumbers = mockPrisma.shipment.create.mock.calls.map(call => call[0].data.shipmentNumber);
      expect(new Set(shipmentNumbers).size).toBe(shipmentNumbers.length);
    });

    it('should throw NotFoundException if order does not exist', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);

      const createShipmentDto = {
        fromAddress: {} as any,
        toAddress: {} as any,
        parcel: {} as any,
        items: [],
      };

      await expect(
        service.createShipment('invalid-order', createShipmentDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if order is not paid', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order-123',
        paymentStatus: 'pending',
        items: [],
      });

      const createShipmentDto = {
        fromAddress: {} as any,
        toAddress: {} as any,
        parcel: {} as any,
        items: [],
      };

      await expect(
        service.createShipment('order-123', createShipmentDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getTracking', () => {
    it('should return tracking details for shipment', async () => {
      const shipmentId = 'shipment-123';
      const mockShipment = {
        id: shipmentId,
        trackingNumber: '9400111899562537845962',
        carrier: 'USPS',
      };

      const mockTracking = {
        trackingNumber: '9400111899562537845962',
        carrier: 'USPS',
        status: 'in_transit',
        trackingEvents: [
          {
            status: 'in_transit',
            description: 'Package in transit',
            datetime: new Date(),
          },
        ],
      };

      mockPrisma.shipment.findUnique.mockResolvedValue(mockShipment);
      mockCarrier.getTracking.mockResolvedValue(mockTracking);
      mockPrisma.shipment.update.mockResolvedValue({});

      const result = await service.getTracking(shipmentId);

      expect(result.trackingNumber).toBe(mockTracking.trackingNumber);
      expect(result.status).toBe('in_transit');
      expect(mockCarrier.getTracking).toHaveBeenCalledWith(
        mockShipment.trackingNumber,
        mockShipment.carrier,
      );
    });

    it('should throw NotFoundException if shipment does not exist', async () => {
      mockPrisma.shipment.findUnique.mockResolvedValue(null);

      await expect(service.getTracking('invalid-shipment')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if shipment has no tracking number', async () => {
      mockPrisma.shipment.findUnique.mockResolvedValue({
        id: 'shipment-123',
        trackingNumber: null,
      });

      await expect(service.getTracking('shipment-123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('validateAddress', () => {
    it('should validate address via carrier', async () => {
      const addressDto = {
        street1: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        zip: '94102',
        country: 'US',
      };

      const mockValidation = {
        valid: true,
        address: addressDto,
        messages: [],
        warnings: [],
      };

      mockCarrier.validateAddress.mockResolvedValue(mockValidation);

      const result = await service.validateAddress(addressDto);

      expect(result.valid).toBe(true);
      expect(mockCarrier.validateAddress).toHaveBeenCalled();
    });
  });

  describe('updateShipmentStatus', () => {
    it('should update shipment status and publish event', async () => {
      const shipmentId = 'shipment-123';
      const mockShipment = {
        id: shipmentId,
        orderId: 'order-123',
        trackingNumber: '9400111899562537845962',
        status: 'pending',
      };

      mockPrisma.shipment.update.mockResolvedValue({
        ...mockShipment,
        status: 'in_transit',
      });

      const statusDto = {
        status: 'in_transit',
        statusDetail: 'Package in transit',
      };

      const result = await service.updateShipmentStatus(shipmentId, statusDto);

      expect(result.status).toBe('in_transit');
      expect(mockEventsService.publish).toHaveBeenCalledWith(
        'shipment.status_updated',
        expect.any(Object),
      );
    });
  });
});
