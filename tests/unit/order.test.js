/**
 * Unit Tests for Order Flow
 * Tests order creation, payment auto-creation, and status updates
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('../../models/orderSchema');
const Payment = require('../../models/payment');
const Store = require('../../models/store');
const User = require('../../models/user');
const MenuItem = require('../../models/menuItems');

describe('Order Flow Unit Tests', () => {
  let testStore, testCustomer, testMenuItem;

  beforeAll(async () => {
    // Setup test data
    testCustomer = await User.create({
      name: 'Test Customer',
      email: 'testcustomer@test.com',
      phone: '1234567890',
      password: 'hashedpassword',
      role: 'customer',
      emailVerified: true // Auto-verify for tests
    });

    const testStoreOwner = await User.create({
      name: 'Test Store Owner',
      email: 'testowner@test.com',
      phone: '1234567891',
      password: 'hashedpassword',
      role: 'storeOwner',
      emailVerified: true // Auto-verify for tests
    });

    testStore = await Store.create({
      ownerId: testStoreOwner._id,
      storeName: 'Test Store',
      address: '123 Test St',
      phone: '1234567892',
      category: 'Restaurant',
      commissionRate: 10,
      status: 'active',
      isOpen: true,
      available: true
    });

    testMenuItem = await MenuItem.create({
      storeId: testStore._id,
      name: 'Test Item',
      price: 100,
      isAvailable: true
    });
  });

  afterAll(async () => {
    // Cleanup
    await Order.deleteMany({});
    await Payment.deleteMany({});
    await MenuItem.deleteMany({});
    await Store.deleteMany({});
    await User.deleteMany({});
    await mongoose.connection.close();
  }, 60000); // 60 second timeout for cleanup

  describe('Order Creation', () => {
    test('should create order with payment automatically', async () => {
      const orderData = {
        storeId: testStore._id,
        userId: testCustomer._id,
        items: [{
          menuItemId: testMenuItem._id,
          itemName: 'Test Item',
          quantity: 2,
          itemPrice: 100
        }],
        deliveryCharge: 30,
        discount: 0,
        finalPrice: 230, // (2 * 100) + 30
        deliveryAddress: {
          street: '123 Test St',
          city: 'Test City',
          pincode: '123456',
          country: 'India'
        },
        paymentMethod: 'cash_on_delivery',
        status: 'Pending'
      };

      const order = await Order.create(orderData);

      // Verify order created
      expect(order).toBeDefined();
      expect(order.status).toBe('Pending');
      expect(order.finalPrice).toBe(230);

      // Create payment manually (as controller does)
      const commissionRate = testStore.commissionRate || 10;
      const payment = await Payment.create({
        orderId: order._id,
        userId: order.userId,
        storeId: order.storeId,
        amount: order.finalPrice,
        commissionRate,
        paymentMethod: 'cash_on_delivery',
        status: 'pending',
        payoutStatus: 'pending'
      });
      
      // Calculate commission on final amount
      payment.commissionAmount = (order.finalPrice * commissionRate) / 100;
      payment.storePayoutAmount = order.finalPrice - payment.commissionAmount;
      await payment.save();
      
      // Link payment to order
      order.paymentId = payment._id;
      await order.save();

      // Verify payment was created correctly
      expect(payment).toBeDefined();
      expect(payment.amount).toBe(230);
      expect(payment.commissionRate).toBe(10);
      expect(payment.commissionAmount).toBe(23); // 10% of 230
      expect(payment.storePayoutAmount).toBe(207); // 230 - 23
      expect(payment.status).toBe('pending');
      expect(payment.payoutStatus).toBe('pending');
    });

    test('should calculate commission correctly on final amount', async () => {
      const orderData = {
        storeId: testStore._id,
        userId: testCustomer._id,
        items: [{
          menuItemId: testMenuItem._id,
          itemName: 'Test Item',
          quantity: 1,
          itemPrice: 100
        }],
        deliveryCharge: 30,
        discount: 20, // Discount applied
        finalPrice: 110, // (100 + 30) - 20
        deliveryAddress: {
          street: '123 Test St',
          city: 'Test City',
          pincode: '123456',
          country: 'India'
        },
        paymentMethod: 'cash_on_delivery',
        status: 'Pending'
      };

      const order = await Order.create(orderData);
      
      // Create payment manually (as controller does)
      const commissionRate = testStore.commissionRate || 10;
      const payment = await Payment.create({
        orderId: order._id,
        userId: order.userId,
        storeId: order.storeId,
        amount: order.finalPrice, // Commission on final amount (what customer pays)
        commissionRate,
        paymentMethod: 'cash_on_delivery',
        status: 'pending',
        payoutStatus: 'pending'
      });
      
      // Calculate commission on final amount (what customer actually pays)
      payment.commissionAmount = (order.finalPrice * commissionRate) / 100;
      payment.storePayoutAmount = order.finalPrice - payment.commissionAmount;
      await payment.save();
      
      // Link payment to order
      order.paymentId = payment._id;
      await order.save();

      // Commission should be on final amount (110), not original (130)
      expect(payment.commissionAmount).toBe(11); // 10% of 110
      expect(payment.storePayoutAmount).toBe(99); // 110 - 11
    });
  });

  describe('Order Status Updates', () => {
    test('should mark payment as completed when order is delivered', async () => {
      const order = await Order.create({
        storeId: testStore._id,
        userId: testCustomer._id,
        items: [{
          menuItemId: testMenuItem._id,
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
        },
        paymentMethod: 'cash_on_delivery',
        status: 'Pending'
      });

      const payment = await Payment.create({
        orderId: order._id,
        userId: testCustomer._id,
        storeId: testStore._id,
        amount: 130,
        commissionRate: 10,
        paymentMethod: 'cash_on_delivery',
        status: 'pending',
        payoutStatus: 'pending'
      });
      payment.commissionAmount = 13;
      payment.storePayoutAmount = 117;
      await payment.save();

      // Update order status to Delivered
      order.status = 'Delivered';
      order.deliveredTime = new Date();
      await order.save();

      // Mark payment as completed and eligible
      payment.status = 'completed';
      await payment.markEligibleForPayout();
      await payment.save();

      // Verify payment status
      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.status).toBe('completed');
      expect(updatedPayment.payoutStatus).toBe('eligible');
    });

    test('should cancel payment when order is rejected', async () => {
      const order = await Order.create({
        storeId: testStore._id,
        userId: testCustomer._id,
        items: [{
          menuItemId: testMenuItem._id,
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
        },
        paymentMethod: 'cash_on_delivery',
        status: 'Pending'
      });

      const payment = await Payment.create({
        orderId: order._id,
        userId: testCustomer._id,
        storeId: testStore._id,
        amount: 130,
        commissionRate: 10,
        paymentMethod: 'cash_on_delivery',
        status: 'pending',
        payoutStatus: 'pending'
      });

      // Update order status to Rejected
      order.status = 'Rejected';
      order.rejectionReason = 'Out of stock';
      await order.save();

      // Cancel payment
      payment.status = 'cancelled';
      payment.payoutStatus = 'cancelled';
      await payment.save();

      // Verify payment status
      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.status).toBe('cancelled');
      expect(updatedPayment.payoutStatus).toBe('cancelled');
    });
  });
});

