/**
 * Complete Flow Integration Tests
 * Tests the complete end-to-end flow: Order → Payment → Payout → Earnings
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
const Cart = require('../../models/cartSchema');

describe('Complete Flow Integration Tests', () => {
  let customerToken, customerId;
  let storeOwnerToken, storeOwnerId;
  let adminToken, adminId;
  let storeId, menuItemId;

  beforeAll(async () => {
    // Create test users (verified for tests)
    const customer = await User.create({
      name: 'Test Customer',
      email: 'customer@test.com',
      phone: '1234567890',
      password: 'password123',
      role: 'customer',
      emailVerified: true // Auto-verify for tests
    });
    customerId = customer._id;

    const storeOwner = await User.create({
      name: 'Test Store Owner',
      email: 'storeowner@test.com',
      phone: '1234567891',
      password: 'password123',
      role: 'storeOwner',
      emailVerified: true // Auto-verify for tests
    });
    storeOwnerId = storeOwner._id;

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

    // Login to get tokens
    const customerLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'customer@test.com', password: 'password123' });
    customerToken = customerLogin.body.token;

    const storeOwnerLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'storeowner@test.com', password: 'password123' });
    storeOwnerToken = storeOwnerLogin.body.token;

    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'password123' });
    adminToken = adminLogin.body.token;

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
    await Cart.deleteMany({});
    await MenuItem.deleteMany({});
    await Store.deleteMany({});
    await User.deleteMany({});
    await mongoose.connection.close();
  });

  describe('Complete Flow: Order → Payment → Payout → Earnings', () => {
    test('TC-FLOW-001: Complete end-to-end flow', async () => {
      // Step 1: Customer creates order
      const orderRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [{
            menuItemId: menuItemId,
            itemName: 'Test Item',
            quantity: 2,
            itemPrice: 100
          }],
          deliveryCharge: 30,
          discount: 0,
          finalPrice: 230,
          deliveryAddress: {
            street: '123 Test St',
            city: 'Test City',
            pincode: '123456',
            country: 'India'
          }
        })
        .expect(201);

      const orderId = orderRes.body.data.id;
      expect(orderRes.body.success).toBe(true);
      expect(orderRes.body.data.status).toBe('Pending');

      // Step 2: Verify payment was auto-created
      const payment = await Payment.findOne({ orderId });
      expect(payment).toBeDefined();
      // Payment amount should match order finalPrice (itemsTotal + deliveryCharge - discount)
      // Items: 2 * 100 = 200, deliveryCharge: 30, discount: 0, finalPrice: 230
      expect(payment.amount).toBe(230);
      expect(payment.commissionAmount).toBe(23); // 10% of 230
      expect(payment.storePayoutAmount).toBe(207); // 230 - 23
      expect(payment.status).toBe('pending');
      expect(payment.payoutStatus).toBe('pending');

      // Step 3: Store owner confirms order
      const confirmRes = await request(app)
        .patch(`/api/store-owner/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${storeOwnerToken}`)
        .send({ status: 'Confirmed' })
        .expect(200);

      expect(confirmRes.body.success).toBe(true);
      expect(confirmRes.body.data.status).toBe('Confirmed');

      // Step 4: Store owner marks order as OutForDelivery
      const outForDeliveryRes = await request(app)
        .patch(`/api/store-owner/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${storeOwnerToken}`)
        .send({ status: 'OutForDelivery' })
        .expect(200);

      expect(outForDeliveryRes.body.success).toBe(true);
      expect(outForDeliveryRes.body.data.status).toBe('OutForDelivery');

      // Step 5: Store owner marks order as Delivered
      const deliveredRes = await request(app)
        .patch(`/api/store-owner/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${storeOwnerToken}`)
        .send({ status: 'Delivered' })
        .expect(200);

      expect(deliveredRes.body.success).toBe(true);
      expect(deliveredRes.body.data.status).toBe('Delivered');

      // Step 6: Verify payment is marked as completed and eligible
      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.status).toBe('completed');
      expect(updatedPayment.payoutStatus).toBe('eligible');

      // Step 7: Admin generates payout
      const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const periodEnd = new Date();

      const payoutRes = await request(app)
        .post('/api/admin/payouts/generate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          storeId: storeId,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString()
        })
        .expect(201);

      const payoutId = payoutRes.body.data._id;
      expect(payoutRes.body.success).toBe(true);
      expect(payoutRes.body.data.status).toBe('pending');
      expect(payoutRes.body.data.totalAmount).toBe(230);
      expect(payoutRes.body.data.commissionDeducted).toBe(23);
      expect(payoutRes.body.data.netPayoutAmount).toBe(207);

      // Step 8: Admin approves payout
      const approveRes = await request(app)
        .post(`/api/admin/payouts/${payoutId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(approveRes.body.success).toBe(true);
      expect(approveRes.body.data.status).toBe('approved');

      // Step 9: Admin completes payout
      const completeRes = await request(app)
        .post(`/api/admin/payouts/${payoutId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          transferId: 'TXN123456',
          transferResponse: { success: true }
        })
        .expect(200);

      expect(completeRes.body.success).toBe(true);
      expect(completeRes.body.data.status).toBe('completed');

      // Step 10: Verify payment is marked as completed
      const finalPayment = await Payment.findById(payment._id);
      expect(finalPayment.payoutStatus).toBe('completed');
      expect(finalPayment.payoutDate).toBeDefined();

      // Step 11: Store owner checks earnings dashboard
      const dashboardRes = await request(app)
        .get('/api/payouts/store-owner/dashboard')
        .set('Authorization', `Bearer ${storeOwnerToken}`)
        .expect(200);

      expect(dashboardRes.body.success).toBe(true);
      expect(dashboardRes.body.data.summary.totalEarnings).toBeGreaterThanOrEqual(207);
      expect(dashboardRes.body.data.summary.totalPayoutsReceived).toBeGreaterThanOrEqual(207);
    });

    test('TC-FLOW-002: Order rejection flow', async () => {
      // Step 1: Customer creates order
      const orderRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [{
            menuItemId: menuItemId,
            itemName: 'Test Item',
            quantity: 1,
            itemPrice: 100
          }],
          deliveryCharge: 30,
          finalPrice: 130,
          deliveryAddress: {
            street: '123 Test St',
            city: 'Test City',
            pincode: '123456',
            country: 'India'
          }
        })
        .expect(201);

      const orderId = orderRes.body.data.id;

      // Step 2: Store owner rejects order
      const rejectRes = await request(app)
        .put(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${storeOwnerToken}`)
        .send({
          status: 'Rejected',
          rejectionReason: 'Out of stock'
        })
        .expect(200);

      expect(rejectRes.body.success).toBe(true);
      expect(rejectRes.body.data.status).toBe('Rejected');
      expect(rejectRes.body.data.rejectionReason).toBe('Out of stock');

      // Step 3: Verify payment is cancelled
      const payment = await Payment.findOne({ orderId });
      expect(payment.status).toBe('cancelled');
      expect(payment.payoutStatus).toBe('cancelled');
    });

    test('TC-FLOW-003: Order cancellation flow', async () => {
      // Step 1: Customer creates order
      const orderRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [{
            menuItemId: menuItemId,
            itemName: 'Test Item',
            quantity: 1,
            itemPrice: 100
          }],
          deliveryCharge: 30,
          finalPrice: 130,
          deliveryAddress: {
            street: '123 Test St',
            city: 'Test City',
            pincode: '123456',
            country: 'India'
          }
        })
        .expect(201);

      const orderId = orderRes.body.data.id;

      // Step 2: Customer cancels order
      const cancelRes = await request(app)
        .post(`/api/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ cancellationReason: 'Changed my mind' })
        .expect(200);

      expect(cancelRes.body.success).toBe(true);
      expect(cancelRes.body.data.status).toBe('Cancelled');

      // Step 3: Verify payment is cancelled
      const payment = await Payment.findOne({ orderId });
      expect(payment.status).toBe('cancelled');
      expect(payment.payoutStatus).toBe('cancelled');
    });

    test('TC-FLOW-004: Order with discount and commission calculation', async () => {
      // Step 1: Customer creates order with discount
      const orderRes = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [{
            menuItemId: menuItemId,
            itemName: 'Test Item',
            quantity: 1,
            itemPrice: 100
          }],
          deliveryCharge: 30,
          discount: 20,
          finalPrice: 110, // (100 + 30) - 20
          deliveryAddress: {
            street: '123 Test St',
            city: 'Test City',
            pincode: '123456',
            country: 'India'
          }
        })
        .expect(201);

      const orderId = orderRes.body.data.id;

      // Step 2: Verify commission is calculated on final amount
      const payment = await Payment.findOne({ orderId });
      expect(payment).toBeDefined();
      // Payment amount should match order finalPrice (itemsTotal + deliveryCharge - discount)
      // Items: 1 * 100 = 100, deliveryCharge: 30, discount: 20, finalPrice: 110
      expect(payment.amount).toBe(110);
      expect(payment.commissionAmount).toBe(11); // 10% of 110 (final amount)
      expect(payment.storePayoutAmount).toBe(99); // 110 - 11
    });

    test('TC-FLOW-005: Multiple orders in single payout', async () => {
      // Create multiple orders
      const orderIds = [];
      for (let i = 0; i < 3; i++) {
        const orderRes = await request(app)
          .post('/api/orders')
          .set('Authorization', `Bearer ${customerToken}`)
          .send({
            items: [{
              menuItemId: menuItemId,
              itemName: 'Test Item',
              quantity: 1,
              itemPrice: 100
            }],
            deliveryCharge: 30,
            finalPrice: 130,
            deliveryAddress: {
              street: '123 Test St',
              city: 'Test City',
              pincode: '123456',
              country: 'India'
            }
          })
          .expect(201);

        orderIds.push(orderRes.body.data.id);

        // Mark as delivered
        await request(app)
          .put(`/api/orders/${orderRes.body.data.id}/status`)
          .set('Authorization', `Bearer ${storeOwnerToken}`)
          .send({ status: 'Confirmed' })
          .expect(200);

        await request(app)
          .put(`/api/orders/${orderRes.body.data.id}/status`)
          .set('Authorization', `Bearer ${storeOwnerToken}`)
          .send({ status: 'OutForDelivery' })
          .expect(200);

        await request(app)
          .put(`/api/orders/${orderRes.body.data.id}/status`)
          .set('Authorization', `Bearer ${storeOwnerToken}`)
          .send({ status: 'Delivered' })
          .expect(200);
      }

      // Generate payout
      const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const periodEnd = new Date();

      const payoutRes = await request(app)
        .post('/api/admin/payouts/generate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          storeId: storeId,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString()
        })
        .expect(201);

      expect(payoutRes.body.success).toBe(true);
      expect(payoutRes.body.data.orderCount).toBeGreaterThanOrEqual(3);
      expect(payoutRes.body.data.totalAmount).toBeGreaterThanOrEqual(390); // 3 * 130
    });
  });
});

