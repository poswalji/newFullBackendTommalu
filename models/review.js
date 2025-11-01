const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true,
    unique: true // One review per order
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
  
  // Store Rating
  storeRating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    index: true
  },
  storeComment: {
    type: String,
    maxlength: 1000,
    trim: true
  },
  
  // Item Ratings
  itemRatings: [{
    menuItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MenuItem',
      required: true
    },
    itemName: {
      type: String,
      required: true
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      maxlength: 500,
      trim: true
    }
  }],
  
  // Delivery Rating
  deliveryRating: {
    type: Number,
    min: 1,
    max: 5
  },
  deliveryComment: {
    type: String,
    maxlength: 500,
    trim: true
  },
  
  // Review Status
  status: {
    type: String,
    enum: ['active', 'reported', 'hidden', 'deleted'],
    default: 'active',
    index: true
  },
  
  // Moderation
  reportedBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: {
      type: String,
      enum: ['spam', 'fake', 'inappropriate', 'other']
    },
    reportedAt: {
      type: Date,
      default: Date.now
    }
  }],
  moderatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  moderationNotes: {
    type: String,
    maxlength: 500
  },
  
  // Store Owner Response
  storeResponse: {
    response: {
      type: String,
      maxlength: 500,
      trim: true
    },
    respondedAt: {
      type: Date
    },
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  
  // Helpful Count
  helpfulCount: {
    type: Number,
    default: 0,
    min: 0
  },
  helpfulUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Editability (reviews can only be edited within 24 hours)
  editableUntil: {
    type: Date,
    default: function() {
      return new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from creation
    }
  }
}, {
  timestamps: true
});

// Indexes
reviewSchema.index({ storeId: 1, status: 1, createdAt: -1 });
reviewSchema.index({ userId: 1, createdAt: -1 });
reviewSchema.index({ storeRating: -1 });
reviewSchema.index({ status: 1 });

// Method to check if review is editable
reviewSchema.methods.isEditable = function() {
  return this.editableUntil && new Date() < this.editableUntil;
};

// Method to mark as helpful
reviewSchema.methods.markHelpful = function(userId) {
  if (!this.helpfulUsers.includes(userId)) {
    this.helpfulUsers.push(userId);
    this.helpfulCount += 1;
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to report review
reviewSchema.methods.report = function(userId, reason) {
  const existingReport = this.reportedBy.find(
    report => report.userId.toString() === userId.toString()
  );
  
  if (!existingReport) {
    this.reportedBy.push({
      userId,
      reason,
      reportedAt: new Date()
    });
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to add store response
reviewSchema.methods.addStoreResponse = function(ownerId, response) {
  if (!this.storeResponse.response) {
    this.storeResponse = {
      response,
      respondedAt: new Date(),
      respondedBy: ownerId
    };
    return this.save();
  }
  return Promise.resolve(this);
};

// Static method to get average rating for store
reviewSchema.statics.getAverageRating = async function(storeId) {
  const result = await this.aggregate([
    {
      $match: {
        storeId: new mongoose.Types.ObjectId(storeId),
        status: 'active'
      }
    },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$storeRating' },
        totalReviews: { $sum: 1 }
      }
    }
  ]);
  
  if (result.length > 0) {
    return {
      averageRating: Math.round(result[0].averageRating * 10) / 10,
      totalReviews: result[0].totalReviews
    };
  }
  
  return {
    averageRating: 0,
    totalReviews: 0
  };
};

module.exports = mongoose.model('Review', reviewSchema);

