/**
 * Store Owner API Test Cases
 * Tests all store owner-facing endpoints for orders, payments, and payouts
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const Order = require('../../models/orderSchema');
const Payment = require('../../models/payment');
const Payout = require('../../models/payout');
const Store = require('../../models/store');
const User = require('../../models/user');
const MenuItem = require('../../models/menuItems');

describe('Store Owner API Tests', () => {
  let storeOwnerToken, storeOwnerId;
  let customerId, storeId, menuItemId;
  let testOrderId, testPaymentId;

  beforeAll(async () => {
    // Create test store owner (verified for tests)
    const storeOwner = await User.create({
      name: 'Test Store Owner',
      email: 'storeowner@test.com',
      phone: '1234567891',
      password: 'password123',
      role: 'storeOwner',
      emailVerified: true // Auto-verify for tests
    });
    storeOwnerId = storeOwner._id;

    // Login to get token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'storeowner@test.com', password: 'password123' });
    storeOwnerToken = loginRes.body.token;

    // Create test customer (verified for tests)
    const customer = await User.create({
      name: 'Test Customer',
      email: 'customer@test.com',
      phone: '1234567890',
      password: 'password123',
      role: 'customer',
      emailVerified: true // Auto-verify for tests
    });
    customerId = customer._id;

    // Create store
    const store = await Store.create({
      ownerId: storeOwnerId,
      storeName: 'Test Store',
      address: '123 Test St',
      phone: '1234567892',
      category: 'Restaurant',
      commissionRate: 10,
      status: 'active',
      isOpen: true,
      available: true
    });
    storeId = store._id;

    const menuItem = await MenuItem.create({
      storeId: storeId,
      name: 'Test Item',
      price: 100,
      isAvailable: true
    });
    menuItemId = menuItem._id;
  });

  afterAll(async () => {
    await Order.deleteMany({});
    await Payment.deleteMany({});
    await Payout.deleteMany({});
    await MenuItem.deleteMany({});
    await Store.deleteMany({});
    await User.deleteMany({});
    await mongoose.connection.close();
  });

  describe('GET /api/store-owner/orders - Get Store Orders', () => {
    test('TC-STORE-001: Should get all store orders', async () => {
      // Create test order
      const order = await Order.create({
        storeId: storeId,
        userId: customerId,
        items: [{ menuItemId: menuItemId, itemName: 'Test Item', quantity: 1, itemPrice: 100 }],
        finalPrice: 130,
        deliveryAddress: { street: '123 Test St', city: 'Test City', pincode: '123456' },
        status: 'Pending'
      });
      testOrderId = order._id;

      const res = await request(app)
        .get('/api/store-owner/orders')
        .set('Authorization', `Bearer ${storeOwnerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('TC-STORE-002: Should return orders with correct structure', async () => {
      const res = await request(app)
        .get('/api/store-owner/orders')
        .set('Authorization', `Bearer ${storeOwnerToken}`)
        .expect(200);

      if (res.body.data.length > 0) {
        const order = res.body.data[0];
        expect(order).toHaveProperty('id');
        expect(order).toHaveProperty('status');
        expect(order).toHaveProperty('finalPrice');
        expect(order).toHaveProperty('customerName');
      }
    });
  });

  describe('PUT /api/orders/:id/status - Update Order Status (Store Owner)', () => {
    test('TC-STORE-003: Should update order status from Pending to Confirmed', async () => {
      const order = await Order.create({
        storeId: storeId,
        userId: customerId,
        items: [{ menuItemId: menuItemId, itemName: 'Test Item', quantity: 1, itemPrice: 100 }],
        finalPrice: 130,
        deliveryAddress: { street: '123 Test St', city: 'Test City', pincode: '123456' },
        status: 'Pending'
      });

      const res = await request(app)
        .patch(`/api/store-owner/orders/${order._id}/status`)
        .set('Authorization', `Bearer ${storeOwnerToken}`)
        .send({ status: 'Confirmed' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Confirmed');
    });

    test('TC-STORE-004: Should update order status from Confirmed to OutForDelivery', async () => {
      const order = await Order.create({
        storeId: storeId,
        userId: customerId,
        items: [{ menuItemId: menuItemId, itemName: 'Test Item', quantity: 1, itemPrice: 100 }],
        finalPrice: 130,
        deliveryAddress: { street: '123 Test St', city: 'Test City', pincode: '123456' },
        status: 'Confirmed'
      });

      const res = await request(app)
        .patch(`/api/store-owner/orders/${order._id}/status`)
        .set('Authorization', `Bearer ${storeOwnerToken}`)
        .send({ status: 'OutForDelivery' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('OutForDelivery');
    });

    test('TC-STORE-005: Should update order status to Delivered and mark payment as completed', async () => {
      const order = await Order.create({
        storeId: storeId,
        userId: customerId,
        items: [{ menuItemId: menuItemId, itemName: 'Test Item', quantity: 1, itemPrice: 100 }],
        finalPrice: 130,
        deliveryAddress: { street: '123 Test St', city: 'Test City', pincode: '123456' },
        status: 'OutForDelivery'
      });

      const payment = await Payment.create({
        orderId: order._id,
        userId: customerId,
        storeId: storeId,
        amount: 130,
        commissionRate: 10,
        paymentMethod: 'cash_on_delivery',
        status: 'pending',
        payoutStatus: 'pending'
      });
      payment.commissionAmount = 13;
      payment.storePayoutAmount = 117;
      await payment.save();

      const res = await request(app)
        .patch(`/api/store-owner/orders/${order._id}/status`)
        .set('Authorization', `Bearer ${storeOwnerToken}`)
        .send({ status: 'Delivered' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Delivered');

      // Verify payment is marked as completed and eligible
      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.status).toBe('completed');
      expect(updatedPayment.payoutStatus).toBe('eligible');
    });

    test('TC-STORE-006: Should reject order with reason', async () => {
      const order = await Order.create({
        storeId: storeId,
        userId: customerId,
        items: [{ menuItemId: menuItemId, itemName: 'Test Item', quantity: 1, itemPrice: 100 }],
        finalPrice: 130,
        deliveryAddress: { street: '123 Test St', city: 'Test City', pincode: '123456' },
        status: 'Pending'
      });

      const res = await request(app)
        .patch(`/api/store-owner/orders/${order._id}/status`)
        .set('Authorization', `Bearer ${storeOwnerToken}`)
        .send({
          status: 'Rejected',
          rejectionReason: 'Out of stock'
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Rejected');
      expect(res.body.data.rejectionReason).toBe('Out of stock');

      // Verify payment is cancelled
      const payment = await Payment.findOne({ orderId: order._id });
      if (payment) {
        expect(payment.status).toBe('cancelled');
        expect(payment.payoutStatus).toBe('cancelled');
      }
    });

    test('TC-STORE-007: Should fail with invalid status transition', async () => {
      const order = await Order.create({
        storeId: storeId,
        userId: customerId,
        items: [{ menuItemId: menuItemId, itemName: 'Test Item', quantity: 1, itemPrice: 100 }],
        finalPrice: 130,
        deliveryAddress: { street: '123 Test St', city: 'Test City', pincode: '123456' },
        status: 'Pending'
      });

      const res = await request(app)
        .patch(`/api/store-owner/orders/${order._id}/status`)
        .set('Authorization', `Bearer ${storeOwnerToken}`)
        .send({ status: 'Delivered' }) // Cannot go directly from Pending to Delivered
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/payments/store/payments - Get Store Payments', () => {
    test('TC-STORE-008: Should get all store payments', async () => {
      const payment = await Payment.create({
        orderId: testOrderId,
        userId: customerId,
        storeId: storeId,
        amount: 130,
        commissionRate: 10,
        paymentMethod: 'cash_on_delivery',
        status: 'completed',
        payoutStatus: 'eligible'
      });
      payment.commissionAmount = 13;
      payment.storePayoutAmount = 117;
      await payment.save();
      testPaymentId = payment._id;

      const res = await request(app)
        .get('/api/payments/store/payments')
        .set('Authorization', `Bearer ${storeOwnerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.totals).toBeDefined();
    });

    test('TC-STORE-009: Should filter payments by status', async () => {
      const res = await request(app)
        .get('/api/payments/store/payments?status=completed')
        .set('Authorization', `Bearer ${storeOwnerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      res.body.data.forEach(payment => {
        expect(payment.status).toBe('completed');
      });
    });

    test('TC-STORE-010: Should filter payments by payoutStatus', async () => {
      const res = await request(app)
        .get('/api/payments/store/payments?payoutStatus=eligible')
        .set('Authorization', `Bearer ${storeOwnerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      res.body.data.forEach(payment => {
        expect(payment.payoutStatus).toBe('eligible');
      });
    });
  });

  describe('GET /api/payments/store/payouts/eligible/:storeId - Get Eligible Payouts', () => {
    test('TC-STORE-011: Should get eligible payments for payout', async () => {
      const res = await request(app)
        .get(`/api/payments/store/payouts/eligible/${storeId}`)
        .set('Authorization', `Bearer ${storeOwnerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('payments');
      expect(res.body.data).toHaveProperty('summary');
      expect(res.body.data.summary).toHaveProperty('totalPayout');
    });

    test('TC-STORE-012: Should fail with invalid store ID', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/payments/store/payouts/eligible/${fakeId}`)
        .set('Authorization', `Bearer ${storeOwnerToken}`)
        .expect(404);
    });
  });

  describe('GET /api/payouts/store-owner/dashboard - Get Earnings Dashboard', () => {
    test('TC-STORE-013: Should get earnings dashboard', async () => {
      const res = await request(app)
        .get('/api/payouts/store-owner/dashboard')
        .set('Authorization', `Bearer ${storeOwnerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('summary');
      expect(res.body.data.summary).toHaveProperty('totalEarnings');
      expect(res.body.data.summary).toHaveProperty('pendingEarnings');
      expect(res.body.data.summary).toHaveProperty('totalPayoutsReceived');
      expect(res.body.data).toHaveProperty('payouts');
      expect(res.body.data).toHaveProperty('recentPayments');
    });

    test('TC-STORE-014: Should filter dashboard by date range', async () => {
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date().toISOString();

      const res = await request(app)
        .get(`/api/payouts/store-owner/dashboard?startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${storeOwnerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/payouts/store-owner/my-payouts - Get My Payouts', () => {
    test('TC-STORE-015: Should get all payouts for store owner', async () => {
      const payout = await Payout.create({
        storeId: storeId,
        ownerId: storeOwnerId,
        totalAmount: 130,
        commissionDeducted: 13,
        netPayoutAmount: 117,
        periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        periodEnd: new Date(),
        status: 'completed',
        paymentIds: [testPaymentId]
      });

      const res = await request(app)
        .get('/api/payouts/store-owner/my-payouts')
        .set('Authorization', `Bearer ${storeOwnerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.summary).toBeDefined();
    });

    test('TC-STORE-016: Should filter payouts by status', async () => {
      const res = await request(app)
        .get('/api/payouts/store-owner/my-payouts?status=completed')
        .set('Authorization', `Bearer ${storeOwnerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      res.body.data.forEach(payout => {
        expect(payout.status).toBe('completed');
      });
    });
  });

  describe('GET /api/payouts/store-owner/payouts/:id - Get Payout by ID', () => {
    test('TC-STORE-017: Should get payout details', async () => {
      const payout = await Payout.create({
        storeId: storeId,
        ownerId: storeOwnerId,
        totalAmount: 130,
        commissionDeducted: 13,
        netPayoutAmount: 117,
        periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        periodEnd: new Date(),
        status: 'completed',
        paymentIds: [testPaymentId]
      });

      const res = await request(app)
        .get(`/api/payouts/store-owner/payouts/${payout._id}`)
        .set('Authorization', `Bearer ${storeOwnerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data._id.toString()).toBe(payout._id.toString());
    });

    test('TC-STORE-018: Should fail with invalid payout ID', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/payouts/store-owner/payouts/${fakeId}`)
        .set('Authorization', `Bearer ${storeOwnerToken}`)
        .expect(404);
    });
  });

  describe('GET /api/payouts/store-owner/earnings-statement - Get Earnings Statement', () => {
    test('TC-STORE-019: Should get earnings statement', async () => {
      const res = await request(app)
        .get('/api/payouts/store-owner/earnings-statement')
        .set('Authorization', `Bearer ${storeOwnerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.summary).toBeDefined();
      expect(res.body.summary).toHaveProperty('totalRevenue');
      expect(res.body.summary).toHaveProperty('totalCommission');
      expect(res.body.summary).toHaveProperty('totalPayout');
    });

    test('TC-STORE-020: Should filter statement by date range', async () => {
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date().toISOString();

      const res = await request(app)
        .get(`/api/payouts/store-owner/earnings-statement?startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${storeOwnerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });
});

