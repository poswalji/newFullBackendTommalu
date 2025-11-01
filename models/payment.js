const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true,
    index: true
  },
  
  // Payment Details
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  commissionAmount: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  storePayoutAmount: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  commissionRate: {
    type: Number,
    required: true,
    default: 10,
    min: 0,
    max: 100
  },
  
  // Payment Method
  paymentMethod: {
    type: String,
    enum: ['cash_on_delivery', 'online', 'wallet'],
    required: true,
    default: 'cash_on_delivery'
  },
  
  // Payment Status
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'],
    default: 'pending',
    index: true
  },
  
  // Online Payment Details
  paymentGateway: {
    type: String,
    enum: ['razorpay', 'stripe', 'paytm', null],
    default: null
  },
  transactionId: {
    type: String,
    sparse: true
  },
  gatewayOrderId: {
    type: String,
    sparse: true
  },
  gatewayResponse: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Refund Details
  refundAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  refundStatus: {
    type: String,
    enum: ['none', 'initiated', 'processing', 'completed', 'failed'],
    default: 'none'
  },
  refundTransactionId: {
    type: String,
    sparse: true
  },
  refundReason: {
    type: String,
    maxlength: 500
  },
  
  // Payout Status
  payoutStatus: {
    type: String,
    enum: ['pending', 'eligible', 'processing', 'completed', 'cancelled'],
    default: 'pending',
    index: true
  },
  payoutDate: {
    type: Date
  },
  
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes for performance
paymentSchema.index({ storeId: 1, payoutStatus: 1 });
paymentSchema.index({ userId: 1, status: 1 });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ status: 1, payoutStatus: 1 });

// Virtual for commission percentage
paymentSchema.virtual('commissionPercentage').get(function() {
  if (this.amount > 0) {
    return ((this.commissionAmount / this.amount) * 100).toFixed(2);
  }
  return 0;
});

// Method to calculate commission and payout
paymentSchema.methods.calculateCommission = function(commissionRate) {
  this.commissionRate = commissionRate || this.commissionRate;
  this.commissionAmount = (this.amount * this.commissionRate) / 100;
  this.storePayoutAmount = this.amount - this.commissionAmount;
  return this;
};

// Method to mark as eligible for payout
paymentSchema.methods.markEligibleForPayout = function() {
  if (this.status === 'completed' && this.payoutStatus === 'pending') {
    this.payoutStatus = 'eligible';
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to process refund
paymentSchema.methods.processRefund = function(reason) {
  this.refundStatus = 'initiated';
  this.refundAmount = this.amount;
  this.refundReason = reason;
  this.status = 'refunded';
  this.payoutStatus = 'cancelled';
  return this.save();
};

module.exports = mongoose.model('Payment', paymentSchema);

