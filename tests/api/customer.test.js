/**
 * Customer API Test Cases
 * Tests all customer-facing endpoints for orders, payments, and cart
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const Order = require('../../models/orderSchema');
const Payment = require('../../models/payment');
const Cart = require('../../models/cartSchema');
const Store = require('../../models/store');
const User = require('../../models/user');
const MenuItem = require('../../models/menuItems');

describe('Customer API Tests', () => {
  let customerToken, customerId;
  let storeOwnerId, storeId, menuItemId;
  let testOrderId, testPaymentId;

  beforeAll(async () => {
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

    // Login to get token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'customer@test.com', password: 'password123' });
    customerToken = loginRes.body.token;

    // Create test store owner and store (verified for tests)
    const storeOwner = await User.create({
      name: 'Test Store Owner',
      email: 'storeowner@test.com',
      phone: '1234567891',
      password: 'password123',
      role: 'storeOwner',
      emailVerified: true // Auto-verify for tests
    });
    storeOwnerId = storeOwner._id;

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
    await Cart.deleteMany({});
    await MenuItem.deleteMany({});
    await Store.deleteMany({});
    await User.deleteMany({});
    await mongoose.connection.close();
  });

  describe('POST /api/orders - Create Order', () => {
    test('TC-CUST-001: Should create order successfully', async () => {
      const orderData = {
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
      };

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(orderData)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.status).toBe('Pending');
      expect(res.body.data.finalPrice).toBe(230);
      testOrderId = res.body.data.id;
    });

    test('TC-CUST-002: Should create payment automatically with order', async () => {
      const payment = await Payment.findOne({ orderId: testOrderId });
      expect(payment).toBeDefined();
      expect(payment.amount).toBe(230);
      expect(payment.commissionRate).toBe(10);
      expect(payment.commissionAmount).toBe(23); // 10% of 230
      expect(payment.storePayoutAmount).toBe(207); // 230 - 23
      expect(payment.status).toBe('pending');
      testPaymentId = payment._id;
    });

    test('TC-CUST-003: Should fail with missing required fields', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: []
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    test('TC-CUST-004: Should fail with invalid finalPrice', async () => {
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [{ menuItemId: menuItemId, quantity: 1, itemPrice: 100 }],
          finalPrice: -10
        })
        .expect(400);
    });

    test('TC-CUST-005: Should calculate commission on final amount with discount', async () => {
      const orderData = {
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
      };

      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(orderData)
        .expect(201);

      const payment = await Payment.findOne({ orderId: res.body.data.id });
      expect(payment.commissionAmount).toBe(11); // 10% of 110 (final amount)
      expect(payment.storePayoutAmount).toBe(99); // 110 - 11
    });
  });

  describe('POST /api/customer/orders/from-cart - Create Order from Cart', () => {
    test('TC-CUST-006: Should create order from cart successfully', async () => {
      // Create cart first
      const cart = await Cart.create({
        userId: customerId,
        storeId: storeId,
        items: [{
          menuItemId: menuItemId,
          quantity: 1,
          price: 100
        }],
        totalItems: 1,
        totalAmount: 100,
        deliveryCharge: 30,
        finalAmount: 130
      });

      const res = await request(app)
        .post('/api/customer/orders/from-cart')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          deliveryAddress: {
            street: '123 Test St',
            city: 'Test City',
            pincode: '123456',
            country: 'India'
          }
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.status).toBe('Pending');

      // Verify cart is cleared
      const updatedCart = await Cart.findById(cart._id);
      expect(updatedCart.items.length).toBe(0);
      expect(updatedCart.totalItems).toBe(0);
    });

    test('TC-CUST-007: Should fail with empty cart', async () => {
      const res = await request(app)
        .post('/api/customer/orders/from-cart')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          deliveryAddress: {
            street: '123 Test St',
            city: 'Test City',
            pincode: '123456',
            country: 'India'
          }
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/orders - Get Customer Orders', () => {
    test('TC-CUST-008: Should get all customer orders', async () => {
      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('TC-CUST-009: Should return orders with correct structure', async () => {
      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      if (res.body.data.length > 0) {
        const order = res.body.data[0];
        expect(order).toHaveProperty('id');
        expect(order).toHaveProperty('status');
        expect(order).toHaveProperty('finalPrice');
        expect(order).toHaveProperty('items');
      }
    });
  });

  describe('GET /api/orders/:id - Get Order by ID', () => {
    test('TC-CUST-010: Should get order details', async () => {
      const res = await request(app)
        .get(`/api/orders/${testOrderId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testOrderId);
    });

    test('TC-CUST-011: Should fail with invalid order ID', async () => {
      const res = await request(app)
        .get('/api/orders/invalid-id')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(400);
    });

    test('TC-CUST-012: Should fail with non-existent order', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/orders/${fakeId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(404);
    });
  });

  describe('POST /api/orders/:id/cancel - Cancel Order', () => {
    test('TC-CUST-013: Should cancel pending order', async () => {
      const order = await Order.create({
        storeId: storeId,
        userId: customerId,
        items: [{ menuItemId: menuItemId, itemName: 'Test Item', quantity: 1, itemPrice: 100 }],
        finalPrice: 130,
        deliveryAddress: { street: '123 Test St', city: 'Test City', pincode: '123456' },
        status: 'Pending'
      });

      const res = await request(app)
        .post(`/api/orders/${order._id}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ cancellationReason: 'Changed my mind' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Cancelled');

      // Verify payment is cancelled
      const payment = await Payment.findOne({ orderId: order._id });
      if (payment) {
        expect(payment.status).toBe('cancelled');
        expect(payment.payoutStatus).toBe('cancelled');
      }
    });

    test('TC-CUST-014: Should fail to cancel non-pending order', async () => {
      const order = await Order.create({
        storeId: storeId,
        userId: customerId,
        items: [{ menuItemId: menuItemId, itemName: 'Test Item', quantity: 1, itemPrice: 100 }],
        finalPrice: 130,
        deliveryAddress: { street: '123 Test St', city: 'Test City', pincode: '123456' },
        status: 'Confirmed'
      });

      const res = await request(app)
        .post(`/api/orders/${order._id}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/payments/customer/payments - Get Customer Payments', () => {
    test('TC-CUST-015: Should get customer payments', async () => {
      const res = await request(app)
        .get('/api/payments/customer/payments')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('TC-CUST-016: Should filter payments by status', async () => {
      const res = await request(app)
        .get('/api/payments/customer/payments?status=completed')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      res.body.data.forEach(payment => {
        expect(payment.status).toBe('completed');
      });
    });
  });
});

