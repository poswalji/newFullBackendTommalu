/**
 * Notifications API Test Cases
 * Tests notification endpoints for all user roles
 */

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const Notification = require('../../models/notificationSchema');
const Order = require('../../models/orderSchema');
const User = require('../../models/user');
const Store = require('../../models/store');

describe('Notifications API Tests', () => {
  let customerToken, customerId;
  let storeOwnerToken, storeOwnerId;
  let adminToken, adminId;

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
  });

  afterAll(async () => {
    await Notification.deleteMany({});
    await Order.deleteMany({});
    await User.deleteMany({});
    await mongoose.connection.close();
  });

  describe('GET /api/notifications - Get Notifications', () => {
    test('TC-NOTIF-001: Should get user notifications', async () => {
      // Create test notification
      await Notification.create({
        userId: customerId,
        title: 'Test Notification',
        message: 'Test message',
        type: 'general',
        read: false
      });

      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('TC-NOTIF-002: Should filter unread notifications', async () => {
      const res = await request(app)
        .get('/api/notifications?unreadOnly=true')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      res.body.data.forEach(notif => {
        expect(notif.read).toBe(false);
      });
    });
  });

  describe('GET /api/notifications/unread-count - Get Unread Count', () => {
    test('TC-NOTIF-003: Should get unread notification count', async () => {
      // Create unread notifications
      await Notification.create({
        userId: customerId,
        title: 'Unread 1',
        message: 'Message 1',
        type: 'general',
        read: false
      });

      await Notification.create({
        userId: customerId,
        title: 'Unread 2',
        message: 'Message 2',
        type: 'general',
        read: false
      });

      const res = await request(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.unreadCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('PUT /api/notifications/:id/read - Mark as Read', () => {
    test('TC-NOTIF-004: Should mark notification as read', async () => {
      const notification = await Notification.create({
        userId: customerId,
        title: 'Test Notification',
        message: 'Test message',
        type: 'general',
        read: false
      });

      const res = await request(app)
        .put(`/api/notifications/${notification._id}/read`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.read).toBe(true);
    });
  });

  describe('PUT /api/notifications/read-all - Mark All as Read', () => {
    test('TC-NOTIF-005: Should mark all notifications as read', async () => {
      // Create unread notifications
      await Notification.create({
        userId: customerId,
        title: 'Unread 1',
        message: 'Message 1',
        type: 'general',
        read: false
      });

      const res = await request(app)
        .put('/api/notifications/read-all')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('DELETE /api/notifications/:id - Delete Notification', () => {
    test('TC-NOTIF-006: Should delete notification', async () => {
      const notification = await Notification.create({
        userId: customerId,
        title: 'Test Notification',
        message: 'Test message',
        type: 'general',
        read: false
      });

      const res = await request(app)
        .delete(`/api/notifications/${notification._id}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      // Verify notification is deleted
      const deleted = await Notification.findById(notification._id);
      expect(deleted).toBeNull();
    });
  });
});

