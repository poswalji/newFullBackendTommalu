const mongoose = require('mongoose');
const cartSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Store"
  },
  storeName: {
    type: String,
    required: true
  },
  items: [{
    menuItemId: {
      type: mongoose.Schema.Types.ObjectId,
    ref: "MenuItem",
    required: true
    },
    itemName: {
      type: String,
      required: true
    },
    price: {
      type: Number,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1
    },
    image: {
      type: String,
      required: true
    },
    // Additional fields if needed
    customization: String,
    specialInstructions: String
  }],
  totalAmount: {
    type: Number,
    default: 0
  },
  totalItems: {
    type: Number,
    default: 0
  },
  // Cart expiry - important for performance
  expiresAt: {
    type: Date,
    default: () => new Date(+new Date() + 7*24*60*60*1000), // 7 days
    index: { expires: '7d' }
  }
}, {
  timestamps: true
});

// Index for better performance
cartSchema.index({ userId: 1 });
cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('Cart', cartSchema);