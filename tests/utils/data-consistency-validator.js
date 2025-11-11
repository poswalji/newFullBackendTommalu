/**
 * Data Consistency Validator
 * Validates relationships between Orders, Payments, and Payouts
 */

const mongoose = require('mongoose');
const Order = require('../../models/orderSchema');
const Payment = require('../../models/payment');
const Payout = require('../../models/payout');
const Store = require('../../models/store');
const User = require('../../models/user');

class DataConsistencyValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  async validateAll() {
    console.log('Starting data consistency validation...\n');

    await this.validateOrders();
    await this.validatePayments();
    await this.validatePayouts();
    await this.validateRelationships();

    this.printResults();
    return {
      errors: this.errors,
      warnings: this.warnings,
      isValid: this.errors.length === 0
    };
  }

  async validateOrders() {
    console.log('Validating Orders...');
    
    const orders = await Order.find({});
    
    for (const order of orders) {
      // Check if order has paymentId
      if (order.paymentId) {
        const payment = await Payment.findById(order.paymentId);
        if (!payment) {
          this.errors.push(`Order ${order._id} has invalid paymentId: ${order.paymentId}`);
        } else {
          // Verify payment references correct order
          if (payment.orderId.toString() !== order._id.toString()) {
            this.errors.push(`Order ${order._id} payment mismatch: payment.orderId is ${payment.orderId}`);
          }
        }
      }

      // Validate order status transitions
      const validStatuses = ['Pending', 'Confirmed', 'OutForDelivery', 'Delivered', 'Cancelled', 'Rejected'];
      if (!validStatuses.includes(order.status)) {
        this.errors.push(`Order ${order._id} has invalid status: ${order.status}`);
      }

      // If delivered, should have deliveredTime
      if (order.status === 'Delivered' && !order.deliveredTime) {
        this.warnings.push(`Order ${order._id} is Delivered but missing deliveredTime`);
      }
    }

    console.log(`  ✓ Validated ${orders.length} orders`);
  }

  async validatePayments() {
    console.log('Validating Payments...');
    
    const payments = await Payment.find({});
    
    for (const payment of payments) {
      // Check if payment has valid orderId
      const order = await Order.findById(payment.orderId);
      if (!order) {
        this.errors.push(`Payment ${payment._id} has invalid orderId: ${payment.orderId}`);
      } else {
        // Verify order references correct payment
        if (order.paymentId && order.paymentId.toString() !== payment._id.toString()) {
          this.errors.push(`Payment ${payment._id} order mismatch: order.paymentId is ${order.paymentId}`);
        }
      }

      // Check if payment has valid storeId
      const store = await Store.findById(payment.storeId);
      if (!store) {
        this.errors.push(`Payment ${payment._id} has invalid storeId: ${payment.storeId}`);
      }

      // Check if payment has valid userId
      const user = await User.findById(payment.userId);
      if (!user) {
        this.errors.push(`Payment ${payment._id} has invalid userId: ${payment.userId}`);
      }

      // Validate payment status
      const validStatuses = ['pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'];
      if (!validStatuses.includes(payment.status)) {
        this.errors.push(`Payment ${payment._id} has invalid status: ${payment.status}`);
      }

      // Validate payout status
      const validPayoutStatuses = ['pending', 'eligible', 'processing', 'completed', 'cancelled'];
      if (!validPayoutStatuses.includes(payment.payoutStatus)) {
        this.errors.push(`Payment ${payment._id} has invalid payoutStatus: ${payment.payoutStatus}`);
      }

      // Validate commission calculation
      const expectedCommission = (payment.amount * payment.commissionRate) / 100;
      if (Math.abs(payment.commissionAmount - expectedCommission) > 0.01) {
        this.errors.push(
          `Payment ${payment._id} commission mismatch: expected ${expectedCommission}, got ${payment.commissionAmount}`
        );
      }

      // Validate payout amount calculation
      const expectedPayout = payment.amount - payment.commissionAmount;
      if (Math.abs(payment.storePayoutAmount - expectedPayout) > 0.01) {
        this.errors.push(
          `Payment ${payment._id} payout amount mismatch: expected ${expectedPayout}, got ${payment.storePayoutAmount}`
        );
      }

      // If payment is completed, should be eligible or completed for payout
      if (payment.status === 'completed' && payment.payoutStatus === 'pending') {
        this.warnings.push(`Payment ${payment._id} is completed but not eligible for payout`);
      }

      // If payment is eligible, should be completed
      if (payment.payoutStatus === 'eligible' && payment.status !== 'completed') {
        this.errors.push(`Payment ${payment._id} is eligible for payout but status is ${payment.status}`);
      }
    }

    console.log(`  ✓ Validated ${payments.length} payments`);
  }

  async validatePayouts() {
    console.log('Validating Payouts...');
    
    const payouts = await Payout.find({});
    
    for (const payout of payouts) {
      // Check if payout has valid storeId
      const store = await Store.findById(payout.storeId);
      if (!store) {
        this.errors.push(`Payout ${payout._id} has invalid storeId: ${payout.storeId}`);
      }

      // Check if payout has valid ownerId
      const owner = await User.findById(payout.ownerId);
      if (!owner) {
        this.errors.push(`Payout ${payout._id} has invalid ownerId: ${payout.ownerId}`);
      }

      // Validate payout status
      const validStatuses = ['pending', 'approved', 'processing', 'completed', 'failed', 'cancelled'];
      if (!validStatuses.includes(payout.status)) {
        this.errors.push(`Payout ${payout._id} has invalid status: ${payout.status}`);
      }

      // Validate paymentIds
      for (const paymentId of payout.paymentIds) {
        const payment = await Payment.findById(paymentId);
        if (!payment) {
          this.errors.push(`Payout ${payout._id} has invalid paymentId: ${paymentId}`);
        } else {
          // Verify payment references correct store
          if (payment.storeId.toString() !== payout.storeId.toString()) {
            this.errors.push(
              `Payout ${payout._id} payment ${paymentId} store mismatch: payment.storeId is ${payment.storeId}`
            );
          }
        }
      }

      // Validate totals
      const payments = await Payment.find({ _id: { $in: payout.paymentIds } });
      const expectedTotal = payments.reduce((sum, p) => sum + p.amount, 0);
      const expectedCommission = payments.reduce((sum, p) => sum + p.commissionAmount, 0);
      const expectedPayout = expectedTotal - expectedCommission;

      if (Math.abs(payout.totalAmount - expectedTotal) > 0.01) {
        this.errors.push(
          `Payout ${payout._id} totalAmount mismatch: expected ${expectedTotal}, got ${payout.totalAmount}`
        );
      }

      if (Math.abs(payout.commissionDeducted - expectedCommission) > 0.01) {
        this.errors.push(
          `Payout ${payout._id} commissionDeducted mismatch: expected ${expectedCommission}, got ${payout.commissionDeducted}`
        );
      }

      if (Math.abs(payout.netPayoutAmount - expectedPayout) > 0.01) {
        this.errors.push(
          `Payout ${payout._id} netPayoutAmount mismatch: expected ${expectedPayout}, got ${payout.netPayoutAmount}`
        );
      }

      // If payout is completed, payments should be marked as completed
      if (payout.status === 'completed') {
        for (const paymentId of payout.paymentIds) {
          const payment = await Payment.findById(paymentId);
          if (payment && payment.payoutStatus !== 'completed') {
            this.errors.push(
              `Payout ${payout._id} is completed but payment ${paymentId} payoutStatus is ${payment.payoutStatus}`
            );
          }
        }
      }
    }

    console.log(`  ✓ Validated ${payouts.length} payouts`);
  }

  async validateRelationships() {
    console.log('Validating Relationships...');

    // Check for orphaned payments (no order)
    const payments = await Payment.find({});
    for (const payment of payments) {
      const order = await Order.findById(payment.orderId);
      if (!order) {
        this.errors.push(`Payment ${payment._id} is orphaned (no order found)`);
      }
    }

    // Check for orders without payments (if they should have one)
    const orders = await Order.find({ status: { $in: ['Confirmed', 'OutForDelivery', 'Delivered'] } });
    for (const order of orders) {
      if (!order.paymentId) {
        this.warnings.push(`Order ${order._id} is ${order.status} but has no paymentId`);
      }
    }

    // Check for duplicate payments in payouts
    const payouts = await Payout.find({});
    const allPaymentIds = [];
    for (const payout of payouts) {
      for (const paymentId of payout.paymentIds) {
        if (allPaymentIds.includes(paymentId.toString())) {
          this.errors.push(`Payment ${paymentId} is included in multiple payouts`);
        }
        allPaymentIds.push(paymentId.toString());
      }
    }

    console.log('  ✓ Validated relationships');
  }

  printResults() {
    console.log('\n=== Validation Results ===\n');

    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('✓ All validations passed! Data is consistent.\n');
      return;
    }

    if (this.errors.length > 0) {
      console.log(`✗ Found ${this.errors.length} errors:\n`);
      this.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
      console.log('');
    }

    if (this.warnings.length > 0) {
      console.log(`⚠ Found ${this.warnings.length} warnings:\n`);
      this.warnings.forEach((warning, index) => {
        console.log(`  ${index + 1}. ${warning}`);
      });
      console.log('');
    }
  }
}

// Run validator if called directly
if (require.main === module) {
  const validator = new DataConsistencyValidator();
  validator.validateAll()
    .then(result => {
      process.exit(result.isValid ? 0 : 1);
    })
    .catch(err => {
      console.error('Validation error:', err);
      process.exit(1);
    });
}

module.exports = DataConsistencyValidator;

