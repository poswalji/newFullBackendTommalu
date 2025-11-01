const mongoose = require('mongoose');

const promotionSchema = new mongoose.Schema({
  // Promotion Identity
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
    match: [/^[A-Z0-9]+$/, 'Code must contain only uppercase letters and numbers']
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500,
    trim: true
  },
  
  // Promotion Type
  type: {
    type: String,
    enum: ['percentage', 'fixed', 'free_delivery', 'buy_one_get_one'],
    required: true,
    default: 'percentage'
  },
  
  // Discount Value
  discountValue: {
    type: Number,
    required: true,
    min: 0
  },
  maxDiscount: {
    type: Number,
    min: 0
  },
  minOrderAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Applicability
  applicableTo: {
    type: String,
    enum: ['all', 'category', 'store', 'item'],
    default: 'all'
  },
  categories: [{
    type: String
  }],
  storeIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store'
  }],
  itemIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MenuItem'
  }],
  
  // User Targeting
  targetUsers: {
    type: String,
    enum: ['all', 'new_users', 'existing_users', 'vip'],
    default: 'all'
  },
  cityFilter: [{
    type: String
  }],
  
  // Usage Limits
  maxUses: {
    type: Number,
    default: null // null = unlimited
  },
  usedCount: {
    type: Number,
    default: 0,
    min: 0
  },
  maxUsesPerUser: {
    type: Number,
    default: 1,
    min: 1
  },
  
  // Validity Period
  validFrom: {
    type: Date,
    required: true,
    default: Date.now
  },
  validUntil: {
    type: Date,
    required: true,
    index: true
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  
  // Created By
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Usage Tracking
  usedBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    usedAt: {
      type: Date,
      default: Date.now
    },
    discountApplied: {
      type: Number
    }
  }],
  
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes
promotionSchema.index({ code: 1, isActive: 1 });
promotionSchema.index({ validFrom: 1, validUntil: 1 });
promotionSchema.index({ isActive: 1, validUntil: 1 });
promotionSchema.index({ createdAt: -1 });

// Method to check if promotion is valid
promotionSchema.methods.isValid = function(userId = null, orderAmount = 0, storeId = null) {
  // Check if active
  if (!this.isActive) {
    return { valid: false, reason: 'Promotion is not active' };
  }
  
  // Check validity period
  const now = new Date();
  if (now < this.validFrom || now > this.validUntil) {
    return { valid: false, reason: 'Promotion is not valid at this time' };
  }
  
  // Check usage limits
  if (this.maxUses && this.usedCount >= this.maxUses) {
    return { valid: false, reason: 'Promotion usage limit exceeded' };
  }
  
  // Check user eligibility
  if (userId) {
    const userUses = this.usedBy.filter(
      usage => usage.userId.toString() === userId.toString()
    ).length;
    
    if (userUses >= this.maxUsesPerUser) {
      return { valid: false, reason: 'You have already used this promotion' };
    }
  }
  
  // Check minimum order amount
  if (orderAmount < this.minOrderAmount) {
    return { 
      valid: false, 
      reason: `Minimum order amount of ₹${this.minOrderAmount} required` 
    };
  }
  
  // Check store applicability
  if (this.applicableTo === 'store' && storeId) {
    const applicableStore = this.storeIds.find(
      id => id.toString() === storeId.toString()
    );
    if (!applicableStore) {
      return { valid: false, reason: 'Promotion not applicable to this store' };
    }
  }
  
  return { valid: true };
};

// Method to calculate discount
promotionSchema.methods.calculateDiscount = function(orderAmount) {
  let discount = 0;
  
  switch (this.type) {
    case 'percentage':
      discount = (orderAmount * this.discountValue) / 100;
      if (this.maxDiscount) {
        discount = Math.min(discount, this.maxDiscount);
      }
      break;
      
    case 'fixed':
      discount = Math.min(this.discountValue, orderAmount);
      break;
      
    case 'free_delivery':
      discount = 0; // Delivery fee will be set to 0
      break;
      
    case 'buy_one_get_one':
      // This would need special handling in order creation
      discount = 0;
      break;
  }
  
  return Math.round(discount * 100) / 100; // Round to 2 decimal places
};

// Method to apply promotion
promotionSchema.methods.apply = function(userId, orderId, orderAmount, discount) {
  this.usedCount += 1;
  this.usedBy.push({
    userId,
    orderId,
    usedAt: new Date(),
    discountApplied: discount
  });
  return this.save();
};

// Static method to find valid promotion by code
promotionSchema.statics.findValidByCode = async function(code, userId, orderAmount, storeId) {
  const promotion = await this.findOne({ code: code.toUpperCase(), isActive: true });
  
  if (!promotion) {
    return { promotion: null, reason: 'Promotion code not found' };
  }
  
  const validation = promotion.isValid(userId, orderAmount, storeId);
  if (!validation.valid) {
    return { promotion, reason: validation.reason };
  }
  
  return { promotion, reason: null };
};

module.exports = mongoose.model('Promotion', promotionSchema);

