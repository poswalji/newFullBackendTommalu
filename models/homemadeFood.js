const mongoose = require("mongoose");

// Today's Special / Homemade Food Item Schema
const HomemadeFoodSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Food name is required"],
    trim: true,
    maxlength: [100, "Name cannot exceed 100 characters"]
  },
  description: {
    type: String,
    required: [true, "Description is required"],
    trim: true,
    maxlength: [500, "Description cannot exceed 500 characters"]
  },
  image: {
    type: String,
    required: [true, "Image URL is required"]
  },
  price: {
    type: Number,
    required: [true, "Price is required"],
    min: [0, "Price cannot be negative"]
  },
  features: [{
    type: String,
    trim: true
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  isTodaysSpecial: {
    type: Boolean,
    default: false
  },
  availableQuantity: {
    type: Number,
    default: -1 // -1 means unlimited
  },
  servingSize: {
    type: String,
    default: "1 Thali"
  },
  preparationTime: {
    type: String,
    default: "30-45 mins"
  },
  cuisine: {
    type: String,
    default: "Indian"
  },
  tags: [{
    type: String,
    trim: true
  }],
  nutritionInfo: {
    calories: { type: Number },
    protein: { type: String },
    carbs: { type: String },
    fat: { type: String }
  }
}, { timestamps: true });

// Homemade Food Order Schema
const HomemadeFoodOrderSchema = new mongoose.Schema({
  // Customer Information (can be guest or registered user)
  customerName: {
    type: String,
    required: [true, "Customer name is required"],
    trim: true
  },
  mobileNumber: {
    type: String,
    required: [true, "Mobile number is required"],
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  // Reference to user if logged in
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  
  // Delivery Address
  deliveryAddress: {
    street: { type: String, required: true },
    landmark: { type: String },
    city: { type: String, required: true },
    state: { type: String },
    pincode: { type: String, required: true }
  },
  
  // Order Details
  foodItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "HomemadeFood",
    required: true
  },
  foodName: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, "Quantity must be at least 1"]
  },
  pricePerUnit: {
    type: Number,
    required: true
  },
  totalAmount: {
    type: Number,
    required: true
  },
  deliveryCharge: {
    type: Number,
    default: 0
  },
  finalAmount: {
    type: Number,
    required: true
  },
  
  // Order Status
  status: {
    type: String,
    enum: [
      'pending',
      'confirmed',
      'preparing',
      'ready',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'refund_initiated',
      'refund_completed',
      'payment_pending',
      'payment_received',
      'payment_failed'
    ],
    default: 'pending'
  },
  
  // Payment Information
  paymentMethod: {
    type: String,
    enum: ['cash_on_delivery', 'online', 'upi'],
    default: 'cash_on_delivery'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'received', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentId: {
    type: String,
    sparse: true
  },
  
  // Order Tracking
  orderNumber: {
    type: String,
    unique: true
  },
  estimatedDeliveryTime: {
    type: Date
  },
  actualDeliveryTime: {
    type: Date
  },
  
  // Admin Notes
  adminNotes: {
    type: String,
    maxlength: 500
  },
  cancellationReason: {
    type: String,
    maxlength: 500
  },
  refundDetails: {
    amount: { type: Number },
    reason: { type: String },
    processedAt: { type: Date },
    transactionId: { type: String }
  },
  
  // Special Instructions
  specialInstructions: {
    type: String,
    maxlength: 300
  },
  
  // Delivery Slot
  preferredDeliverySlot: {
    type: String,
    enum: ['morning', 'afternoon', 'evening', 'any'],
    default: 'any'
  }
}, { timestamps: true });

// Generate order number before saving
HomemadeFoodOrderSchema.pre('save', async function(next) {
  if (!this.orderNumber) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    this.orderNumber = `HMF${year}${month}${day}${random}`;
  }
  next();
});

// Calculate final amount
HomemadeFoodOrderSchema.pre('save', function(next) {
  if (this.isModified('quantity') || this.isModified('pricePerUnit') || this.isModified('deliveryCharge')) {
    this.totalAmount = this.quantity * this.pricePerUnit;
    this.finalAmount = this.totalAmount + (this.deliveryCharge || 0);
  }
  next();
});

// Indexes for better query performance
HomemadeFoodOrderSchema.index({ status: 1, createdAt: -1 });
HomemadeFoodOrderSchema.index({ mobileNumber: 1 });
// Note: orderNumber already has an index from unique: true
HomemadeFoodOrderSchema.index({ userId: 1 });

HomemadeFoodSchema.index({ isActive: 1, isTodaysSpecial: 1 });

const HomemadeFood = mongoose.model("HomemadeFood", HomemadeFoodSchema);
const HomemadeFoodOrder = mongoose.model("HomemadeFoodOrder", HomemadeFoodOrderSchema);

module.exports = { HomemadeFood, HomemadeFoodOrder };
