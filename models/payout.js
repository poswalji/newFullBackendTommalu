const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema({
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true,
    index: true
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Payout Details
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  commissionDeducted: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  netPayoutAmount: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Payment Period
  periodStart: {
    type: Date,
    required: true
  },
  periodEnd: {
    type: Date,
    required: true
  },
  
  // Payment IDs included in this payout
  paymentIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment'
  }],
  orderCount: {
    type: Number,
    default: 0
  },
  
  // Payout Status
  status: {
    type: String,
    enum: ['pending', 'approved', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  },
  
  // Bank Details (snapshot at payout time)
  bankDetails: {
    accountNumber: String,
    ifscCode: String,
    accountHolderName: String,
    bankName: String
  },
  
  // Transfer Details
  transferId: {
    type: String,
    sparse: true
  },
  transferMethod: {
    type: String,
    enum: ['NEFT', 'RTGS', 'IMPS', 'UPI', 'Wallet'],
    default: 'NEFT'
  },
  transferResponse: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Processing Info
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  processedAt: {
    type: Date
  },
  failureReason: {
    type: String,
    maxlength: 500
  },
  
  // Metadata
  notes: {
    type: String,
    maxlength: 1000
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes
payoutSchema.index({ ownerId: 1, status: 1 });
payoutSchema.index({ storeId: 1, status: 1 });
payoutSchema.index({ periodStart: -1, periodEnd: -1 });
payoutSchema.index({ createdAt: -1 });

// Method to calculate totals
payoutSchema.methods.calculateTotals = function(payments) {
  this.totalAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
  this.commissionDeducted = payments.reduce((sum, payment) => sum + payment.commissionAmount, 0);
  this.netPayoutAmount = this.totalAmount - this.commissionDeducted;
  this.orderCount = payments.length;
  this.paymentIds = payments.map(p => p._id);
  return this;
};

// Method to approve payout
payoutSchema.methods.approve = function(adminId) {
  this.status = 'approved';
  this.processedBy = adminId;
  return this.save();
};

// Method to mark as processing
payoutSchema.methods.markProcessing = function() {
  this.status = 'processing';
  this.processedAt = new Date();
  return this.save();
};

// Method to complete payout
payoutSchema.methods.complete = function(transferId, transferResponse) {
  this.status = 'completed';
  this.transferId = transferId;
  this.transferResponse = transferResponse;
  this.processedAt = new Date();
  return this.save();
};

// Method to fail payout
payoutSchema.methods.fail = function(reason) {
  this.status = 'failed';
  this.failureReason = reason;
  this.processedAt = new Date();
  return this.save();
};

module.exports = mongoose.model('Payout', payoutSchema);

