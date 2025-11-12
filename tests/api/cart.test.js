/**
 * Cart API Test Cases
 * Tests all cart operations: add, update, remove, clear, discount, merge
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const Cart = require('../../models/cartSchema');
const Store = require('../../models/store');
const User = require('../../models/user');
const MenuItem = require('../../models/menuItems');
const Promotion = require('../../models/promotion');

describe('Cart API Tests', () => {
  let customerToken, customerId;
  let storeOwnerId, storeId, menuItemId1, menuItemId2;

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

    const menuItem1 = await MenuItem.create({
      storeId: storeId,
      name: 'Test Item 1',
      price: 100,
      isAvailable: true
    });
    menuItemId1 = menuItem1._id;

    const menuItem2 = await MenuItem.create({
      storeId: storeId,
      name: 'Test Item 2',
      price: 200,
      isAvailable: true
    });
    menuItemId2 = menuItem2._id;
  });

  afterAll(async () => {
    await Cart.deleteMany({});
    await Promotion.deleteMany({});
    await MenuItem.deleteMany({});
    await Store.deleteMany({});
    await User.deleteMany({});
    await mongoose.connection.close();
  });

  describe('POST /api/cart/add - Add to Cart', () => {
    test('TC-CART-001: Should add item to cart', async () => {
      const res = await request(app)
        .post('/api/cart/add')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          menuItemId: menuItemId1,
          quantity: 2
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThan(0);
    });

    test('TC-CART-002: Should update quantity if item already in cart', async () => {
      // Clear cart first to ensure clean state
      await Cart.deleteMany({ userId: customerId });
      
      // Add item first
      await request(app)
        .post('/api/cart/add')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          menuItemId: menuItemId1,
          quantity: 1
        })
        .expect(200);

      // Add same item again
      const res = await request(app)
        .post('/api/cart/add')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          menuItemId: menuItemId1,
          quantity: 2
        })
        .expect(200);

      const item = res.body.data.items.find(i => i.menuItemId.toString() === menuItemId1.toString());
      expect(item.quantity).toBe(3); // 1 + 2
    });

    test('TC-CART-003: Should fail with invalid menuItemId', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post('/api/cart/add')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          menuItemId: fakeId,
          quantity: 1
        })
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/cart - Get Cart', () => {
    test('TC-CART-004: Should get cart', async () => {
      const res = await request(app)
        .get('/api/cart')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('items');
      expect(res.body.data).toHaveProperty('totalAmount');
    });

    test('TC-CART-005: Should return empty cart if no items', async () => {
      // Clear cart first
      await request(app)
        .delete('/api/cart/clear')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      const res = await request(app)
        .get('/api/cart')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBe(0);
    });
  });

  describe('PATCH /api/cart/update - Update Cart Quantity', () => {
    test('TC-CART-006: Should update item quantity', async () => {
      // Add item first
      await request(app)
        .post('/api/cart/add')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          menuItemId: menuItemId1,
          quantity: 1
        })
        .expect(200);

      const res = await request(app)
        .patch('/api/cart/update')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          menuItemId: menuItemId1,
          quantity: 5
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      const item = res.body.data.items.find(i => i.menuItemId.toString() === menuItemId1.toString());
      expect(item.quantity).toBe(5);
    });

    test('TC-CART-007: Should fail with item not in cart', async () => {
      const res = await request(app)
        .patch('/api/cart/update')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          menuItemId: menuItemId2,
          quantity: 5
        })
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/cart/remove - Remove from Cart', () => {
    test('TC-CART-008: Should remove item from cart', async () => {
      // Add item first
      await request(app)
        .post('/api/cart/add')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          menuItemId: menuItemId2,
          quantity: 1
        })
        .expect(200);

      const res = await request(app)
        .delete('/api/cart/remove')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          menuItemId: menuItemId2
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      const item = res.body.data.items.find(i => i.menuItemId.toString() === menuItemId2.toString());
      expect(item).toBeUndefined();
    });
  });

  describe('DELETE /api/cart/clear - Clear Cart', () => {
    test('TC-CART-009: Should clear entire cart', async () => {
      // Add items first
      await request(app)
        .post('/api/cart/add')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          menuItemId: menuItemId1,
          quantity: 1
        })
        .expect(200);

      const res = await request(app)
        .delete('/api/cart/clear')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBe(0);
      expect(res.body.data.totalAmount).toBe(0);
    });
  });

  describe('POST /api/cart/apply-discount - Apply Discount', () => {
    test('TC-CART-010: Should apply discount to cart', async () => {
      // Create a promotion first
      const promotion = await Promotion.create({
        code: 'TEST10',
        name: 'Test Promotion',
        type: 'percentage',
        discountValue: 10,
        minOrderAmount: 0,
        maxDiscount: 100,
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Started yesterday
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Ends in 30 days
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Same as endDate
        isActive: true,
        applicableTo: 'all',
        usageLimit: 1000,
        usedCount: 0,
        createdBy: storeOwnerId // Required field
      });

      // Add items first
      await request(app)
        .post('/api/cart/add')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          menuItemId: menuItemId1,
          quantity: 2
        })
        .expect(200);

      const res = await request(app)
        .post('/api/cart/apply-discount')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          code: 'TEST10'
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.discount).toBeDefined();
      
      // Cleanup
      await Promotion.deleteMany({ code: 'TEST10' });
    });
  });

  describe('DELETE /api/cart/remove-discount - Remove Discount', () => {
    test('TC-CART-011: Should remove discount from cart', async () => {
      const res = await request(app)
        .delete('/api/cart/remove-discount')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.discount).toBeNull();
    });
  });

  describe('GET /api/cart/status - Get Cart Status', () => {
    test('TC-CART-012: Should get cart status', async () => {
      const res = await request(app)
        .get('/api/cart/status')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('totalItems');
      expect(res.body.data).toHaveProperty('totalAmount');
    });
  });
});

