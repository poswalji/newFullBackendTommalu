const mongoose = require('mongoose');

const disputeSchema = new mongoose.Schema({
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
  
  // Dispute Details
  type: {
    type: String,
    enum: ['order_issue', 'payment_issue', 'quality_issue', 'delivery_issue', 'other'],
    required: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 200,
    trim: true
  },
  description: {
    type: String,
    required: true,
    maxlength: 2000,
    trim: true
  },
  
  // Attachments
  attachments: [{
    type: String // URLs
  }],
  
  // Status
  status: {
    type: String,
    enum: ['open', 'under_review', 'escalated', 'resolved', 'closed', 'rejected'],
    default: 'open',
    index: true
  },
  
  // Resolution
  resolution: {
    action: {
      type: String,
      enum: ['refund_full', 'refund_partial', 'store_action', 'no_action', 'other']
    },
    amount: {
      type: Number,
      min: 0
    },
    notes: {
      type: String,
      maxlength: 1000
    },
    resolvedAt: {
      type: Date
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  
  // Timeline
  timeline: [{
    action: {
      type: String,
      required: true
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    notes: {
      type: String,
      maxlength: 500
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Priority
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
    index: true
  },
  
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes
disputeSchema.index({ status: 1, priority: 1, createdAt: -1 });
disputeSchema.index({ userId: 1, status: 1 });
disputeSchema.index({ storeId: 1, status: 1 });
disputeSchema.index({ type: 1, status: 1 });

// Method to add timeline entry
disputeSchema.methods.addTimelineEntry = function(action, performedBy, notes) {
  this.timeline.push({
    action,
    performedBy,
    notes,
    timestamp: new Date()
  });
  return this.save();
};

// Method to resolve dispute
disputeSchema.methods.resolve = function(adminId, resolution) {
  this.status = 'resolved';
  this.resolution = {
    ...resolution,
    resolvedBy: adminId,
    resolvedAt: new Date()
  };
  this.addTimelineEntry('Dispute resolved', adminId, resolution.notes);
  return this.save();
};

// Method to escalate
disputeSchema.methods.escalate = function(adminId, notes) {
  this.status = 'escalated';
  this.priority = 'high';
  this.addTimelineEntry('Dispute escalated', adminId, notes);
  return this.save();
};

// Method to close dispute
disputeSchema.methods.close = function(adminId, notes) {
  this.status = 'closed';
  this.addTimelineEntry('Dispute closed', adminId, notes);
  return this.save();
};

module.exports = mongoose.model('Dispute', disputeSchema);

