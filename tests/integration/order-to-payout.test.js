/**
 * Integration Tests for Order → Payment → Payout Flow
 * Tests the complete end-to-end flow
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('../../models/orderSchema');
const Payment = require('../../models/payment');
const Payout = require('../../models/payout');
const Store = require('../../models/store');
const User = require('../../models/user');
const MenuItem = require('../../models/menuItems');

describe('Order to Payout Integration Tests', () => {
  let testStore, testCustomer, testStoreOwner, testMenuItem;

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

    testStoreOwner = await User.create({
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
    await Payout.deleteMany({});
    await MenuItem.deleteMany({});
    await Store.deleteMany({});
    await User.deleteMany({});
    await mongoose.connection.close();
  }, 60000); // 60 second timeout for cleanup

  describe('Complete Order to Payout Flow', () => {
    test('should complete full flow: Order → Payment → Payout', async () => {
      // Step 1: Create Order
      const order = await Order.create({
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
        finalPrice: 230,
        deliveryAddress: {
          street: '123 Test St',
          city: 'Test City',
          pincode: '123456',
          country: 'India'
        },
        paymentMethod: 'cash_on_delivery',
        status: 'Pending'
      });

      // Step 2: Create Payment (auto-created in real flow)
      const payment = await Payment.create({
        orderId: order._id,
        userId: testCustomer._id,
        storeId: testStore._id,
        amount: 230,
        commissionRate: 10,
        paymentMethod: 'cash_on_delivery',
        status: 'pending',
        payoutStatus: 'pending'
      });
      payment.commissionAmount = 23; // 10% of 230
      payment.storePayoutAmount = 207; // 230 - 23
      await payment.save();

      // Link payment to order
      order.paymentId = payment._id;
      await order.save();

      // Step 3: Update Order Status to Delivered
      order.status = 'Delivered';
      order.deliveredTime = new Date();
      await order.save();

      // Step 4: Mark Payment as Completed and Eligible
      payment.status = 'completed';
      await payment.markEligibleForPayout();
      await payment.save();

      // Verify payment is eligible
      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.status).toBe('completed');
      expect(updatedPayment.payoutStatus).toBe('eligible');

      // Step 5: Generate Payout
      const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const periodEnd = new Date();

      const eligiblePayments = await Payment.find({
        storeId: testStore._id,
        status: 'completed',
        payoutStatus: 'eligible'
      });

      // Create payout with calculated totals
      const payout = new Payout({
        storeId: testStore._id,
        ownerId: testStoreOwner._id,
        periodStart,
        periodEnd,
        status: 'pending'
      });
      
      payout.calculateTotals(eligiblePayments);
      await payout.save();

      // Verify payout totals
      expect(payout.totalAmount).toBe(230);
      expect(payout.commissionDeducted).toBe(23);
      expect(payout.netPayoutAmount).toBe(207);
      expect(payout.orderCount).toBe(1);
      expect(payout.paymentIds.length).toBe(1);
      expect(payout.paymentIds[0].toString()).toBe(payment._id.toString());

      // Step 6: Approve Payout
      await payout.approve(testStoreOwner._id);
      expect(payout.status).toBe('approved');

      // Step 7: Complete Payout
      await payout.complete('TXN123456', { success: true });
      expect(payout.status).toBe('completed');

      // Step 8: Update Payment Payout Status
      await Payment.updateMany(
        { _id: { $in: payout.paymentIds } },
        { payoutStatus: 'completed', payoutDate: new Date() }
      );

      // Verify final payment status
      const finalPayment = await Payment.findById(payment._id);
      expect(finalPayment.payoutStatus).toBe('completed');
      expect(finalPayment.payoutDate).toBeDefined();
    });

    test('should prevent duplicate payments in payout', async () => {
      // Create order and payment
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
        status: 'Delivered'
      });

      const payment = await Payment.create({
        orderId: order._id,
        userId: testCustomer._id,
        storeId: testStore._id,
        amount: 130,
        commissionRate: 10,
        paymentMethod: 'cash_on_delivery',
        status: 'completed',
        payoutStatus: 'eligible'
      });
      payment.commissionAmount = 13;
      payment.storePayoutAmount = 117;
      await payment.save();

      // Create first payout
      const payout1 = new Payout({
        storeId: testStore._id,
        ownerId: testStoreOwner._id,
        periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        periodEnd: new Date(),
        status: 'pending'
      });
      payout1.calculateTotals([payment]);
      await payout1.save();

      // Try to create second payout with same payment
      const eligiblePayments = await Payment.find({
        storeId: testStore._id,
        status: 'completed',
        payoutStatus: 'eligible'
      });

      // Check if payment is already in a payout
      const existingPayouts = await Payout.find({
        paymentIds: payment._id
      });

      expect(existingPayouts.length).toBe(1);
      expect(existingPayouts[0]._id.toString()).toBe(payout1._id.toString());
    });
  });
});

