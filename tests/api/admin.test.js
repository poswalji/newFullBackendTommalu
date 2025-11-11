/**
 * Admin API Test Cases
 * Tests all admin-facing endpoints for orders, payments, and payouts
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

describe('Admin API Tests', () => {
  let adminToken, adminId;
  let storeOwnerId, customerId, storeId, menuItemId;
  let testOrderId, testPaymentId, testPayoutId;

  beforeAll(async () => {
    // Create test admin (verified for tests)
    const admin = await User.create({
      name: 'Test Admin',
      email: 'admin@test.com',
      phone: '1234567899',
      password: 'password123',
      role: 'admin',
      adminRole: 'superAdmin',
      emailVerified: true // Auto-verify for tests
    });
    adminId = admin._id;

    // Login to get token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'password123' });
    adminToken = loginRes.body.token;

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

  describe('GET /api/orders/admin - Get All Orders (Admin)', () => {
    test('TC-ADMIN-001: Should get all orders', async () => {
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
        .get('/api/orders/admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('TC-ADMIN-002: Should filter orders by status', async () => {
      const res = await request(app)
        .get('/api/orders/admin?status=Pending')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      res.body.data.forEach(order => {
        expect(order.status).toBe('Pending');
      });
    });
  });

  describe('PUT /api/orders/:id/status - Update Order Status (Admin)', () => {
    test('TC-ADMIN-003: Should update order status as admin', async () => {
      const order = await Order.create({
        storeId: storeId,
        userId: customerId,
        items: [{ menuItemId: menuItemId, itemName: 'Test Item', quantity: 1, itemPrice: 100 }],
        finalPrice: 130,
        deliveryAddress: { street: '123 Test St', city: 'Test City', pincode: '123456' },
        status: 'Pending'
      });

      const res = await request(app)
        .put(`/api/orders/${order._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'Confirmed' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Confirmed');
    });

    test('TC-ADMIN-004: Should mark payment as completed when order is delivered', async () => {
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
        .put(`/api/orders/${order._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'Delivered' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Delivered');

      // Verify payment is marked as completed and eligible
      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.status).toBe('completed');
      expect(updatedPayment.payoutStatus).toBe('eligible');
    });
  });

  describe('POST /api/admin/orders/:id/cancel - Cancel Order (Admin)', () => {
    test('TC-ADMIN-005: Should cancel order as admin', async () => {
      const order = await Order.create({
        storeId: storeId,
        userId: customerId,
        items: [{ menuItemId: menuItemId, itemName: 'Test Item', quantity: 1, itemPrice: 100 }],
        finalPrice: 130,
        deliveryAddress: { street: '123 Test St', city: 'Test City', pincode: '123456' },
        status: 'Confirmed'
      });

      const res = await request(app)
        .post(`/api/admin/orders/${order._id}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Cancelled by admin' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Cancelled');
    });
  });

  describe('GET /api/payments/admin/payments - Get All Payments (Admin)', () => {
    test('TC-ADMIN-006: Should get all payments', async () => {
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
        .get('/api/payments/admin/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('TC-ADMIN-007: Should filter payments by status', async () => {
      const res = await request(app)
        .get('/api/payments/admin/payments?status=completed')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      res.body.data.forEach(payment => {
        expect(payment.status).toBe('completed');
      });
    });

    test('TC-ADMIN-008: Should filter payments by storeId', async () => {
      const res = await request(app)
        .get(`/api/payments/admin/payments?storeId=${storeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      res.body.data.forEach(payment => {
        expect(payment.storeId.toString()).toBe(storeId.toString());
      });
    });
  });

  describe('GET /api/payments/admin/payments/:id - Get Payment by ID (Admin)', () => {
    test('TC-ADMIN-009: Should get payment details', async () => {
      const res = await request(app)
        .get(`/api/payments/admin/payments/${testPaymentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data._id.toString()).toBe(testPaymentId.toString());
    });
  });

  describe('POST /api/admin/payouts/generate - Generate Payout', () => {
    test('TC-ADMIN-010: Should generate payout successfully', async () => {
      const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const periodEnd = new Date();

      const res = await request(app)
        .post('/api/admin/payouts/generate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          storeId: storeId,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString()
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('_id');
      expect(res.body.data.status).toBe('pending');
      testPayoutId = res.body.data._id;
    });

    test('TC-ADMIN-011: Should fail with no eligible payments', async () => {
      const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const periodEnd = new Date();

      // Create store with no eligible payments
      const emptyStore = await Store.create({
        ownerId: storeOwnerId,
        storeName: 'Empty Store',
        address: '456 Test St',
        phone: '1234567893',
        category: 'Restaurant',
        commissionRate: 10,
        status: 'active'
      });

      const res = await request(app)
        .post('/api/admin/payouts/generate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          storeId: emptyStore._id,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString()
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    test('TC-ADMIN-012: Should prevent duplicate payments in payout', async () => {
      // First payout
      const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const periodEnd = new Date();

      const res1 = await request(app)
        .post('/api/admin/payouts/generate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          storeId: storeId,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString()
        })
        .expect(201);

      // Try to create second payout with same payments
      const res2 = await request(app)
        .post('/api/admin/payouts/generate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          storeId: storeId,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString()
        })
        .expect(400);

      expect(res2.body.success).toBe(false);
    });
  });

  describe('GET /api/admin/payouts - Get All Payouts (Admin)', () => {
    test('TC-ADMIN-013: Should get all payouts', async () => {
      const res = await request(app)
        .get('/api/admin/payouts')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('TC-ADMIN-014: Should filter payouts by status', async () => {
      const res = await request(app)
        .get('/api/admin/payouts?status=pending')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      res.body.data.forEach(payout => {
        expect(payout.status).toBe('pending');
      });
    });
  });

  describe('GET /api/admin/payouts/:id - Get Payout by ID (Admin)', () => {
    test('TC-ADMIN-015: Should get payout details', async () => {
      const res = await request(app)
        .get(`/api/admin/payouts/${testPayoutId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data._id.toString()).toBe(testPayoutId.toString());
    });
  });

  describe('POST /api/admin/payouts/:id/approve - Approve Payout', () => {
    test('TC-ADMIN-016: Should approve payout', async () => {
      const payout = await Payout.create({
        storeId: storeId,
        ownerId: storeOwnerId,
        totalAmount: 130,
        commissionDeducted: 13,
        netPayoutAmount: 117,
        periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        periodEnd: new Date(),
        status: 'pending',
        paymentIds: [testPaymentId]
      });

      const res = await request(app)
        .post(`/api/admin/payouts/${payout._id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('approved');
    });

    test('TC-ADMIN-017: Should fail to approve non-pending payout', async () => {
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
        .post(`/api/admin/payouts/${payout._id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/admin/payouts/:id/complete - Complete Payout', () => {
    test('TC-ADMIN-018: Should complete payout and update payment statuses', async () => {
      const payout = await Payout.create({
        storeId: storeId,
        ownerId: storeOwnerId,
        totalAmount: 130,
        commissionDeducted: 13,
        netPayoutAmount: 117,
        periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        periodEnd: new Date(),
        status: 'approved',
        paymentIds: [testPaymentId]
      });

      const res = await request(app)
        .post(`/api/admin/payouts/${payout._id}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          transferId: 'TXN123456',
          transferResponse: { success: true }
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('completed');

      // Verify payments are marked as completed
      const payment = await Payment.findById(testPaymentId);
      expect(payment.payoutStatus).toBe('completed');
      expect(payment.payoutDate).toBeDefined();
    });

    test('TC-ADMIN-019: Should fail to complete non-approved payout', async () => {
      const payout = await Payout.create({
        storeId: storeId,
        ownerId: storeOwnerId,
        totalAmount: 130,
        commissionDeducted: 13,
        netPayoutAmount: 117,
        periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        periodEnd: new Date(),
        status: 'pending',
        paymentIds: [testPaymentId]
      });

      const res = await request(app)
        .post(`/api/admin/payouts/${payout._id}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          transferId: 'TXN123456',
          transferResponse: { success: true }
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/admin/analytics/dashboard - Get Dashboard Analytics', () => {
    test('TC-ADMIN-020: Should get dashboard analytics', async () => {
      const res = await request(app)
        .get('/api/admin/analytics/dashboard')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('orders');
      expect(res.body.data).toHaveProperty('revenue');
      expect(res.body.data).toHaveProperty('users');
      expect(res.body.data).toHaveProperty('stores');
    });
  });
});

