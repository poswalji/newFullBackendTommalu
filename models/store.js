const mongoose = require("mongoose");

const storeSchema = new mongoose.Schema({
  ownerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  storeName: { 
    type: String, 
    required: true,
    trim: true
  },
  address: { 
    type: String, 
    required: true 
  },
  
  // ✅ Location Coordinates for delivery calculation
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: '2dsphere'
    }
  },
  
  phone: { 
    type: String, 
    required: true,
    match: [/^\d{10}$/, 'Please enter a valid 10-digit phone number']
  },
  
  // ✅ LICENSE INFORMATION (Internal use only)
  licenseNumber: { 
    type: String, 
    required: true 
  },
  licenseType: { 
    type: String,
    enum: ["FSSAI", "GST", "Shop Act", "Trade License", "Other"],
    required: true 
  },
  licenseDocument: { // Store license document URL
    type: String,
    required: false
  },
  
  // ✅ Enhanced Category System
  category: { 
    type: String, 
    enum: [
      "Restaurant", 
      "Grocery Store", 
      "Bakery", 
      "Pharmacy",
      "Vegetable & Fruits",
      "Meat & Fish",
      "Dairy",
      "Other"
    ],
    required: true,
    default: "Restaurant"
  },
  
  // ✅ Store Images
  storeImages: [{
    type: String, // URL of images
  }],
  
  // ✅ Store Basic Info
  description: { 
    type: String,
    maxlength: 500
  },
  
  // ✅ Enhanced Delivery Info
  deliveryTime: { 
    type: String, 
    default: "20-30 min" 
  },
  minOrder: { 
    type: Number, 
    default: 49,
    min: 0
  },
  deliveryFee: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // ✅ Store Timing
  openingTime: {
    type: String,
    default: "09:00"
  },
  closingTime: {
    type: String,
    default: "23:00"
  },
  
  // ✅ Enhanced Rating System
  rating: { 
    type: Number, 
    default: 4.2, 
    min: 0, 
    max: 5 
  },
  totalReviews: { 
    type: Number, 
    default: 0 
  },
  reviews: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    rating: { type: Number, min: 1, max: 5 },
    comment: String,
    createdAt: { type: Date, default: Date.now }
  }],
  
  // ✅ Order Tracking
  timesOrdered: { 
    type: Number, 
    default: 0 
  },
  totalEarnings: {
    type: Number,
    default: 0
  },
  
  // ✅ Store Status
  isOpen: { 
    type: Boolean, 
    default: true 
  },
  available: { 
    type: Boolean, 
    default: true 
  },
  
  // ✅ License Verification Status (Internal)
  isVerified: { 
    type: Boolean, 
    default: false 
  },
  verificationNotes: { // Admin can add notes for verification
    type: String
  },

  // ✅ Store lifecycle status for admin verification & moderation
  status: {
    type: String,
    enum: [
      'draft',
      'submitted',
      'pendingApproval',
      'approved',
      'active',
      'rejected',
      'suspended'
    ],
    default: 'draft'
  },
  rejectionReason: { type: String },

  // ✅ Commission rate set by admin (percentage 0-100)
  commissionRate: {
    type: Number,
    min: 0,
    max: 100,
    default: 10
  }

}, { 
  timestamps: true 
});

// ✅ Index for better performance
storeSchema.index({ ownerId: 1 });
storeSchema.index({ location: '2dsphere' });
storeSchema.index({ category: 1, isOpen: 1, available: 1 });

// ✅ Virtual for average rating calculation
storeSchema.virtual('averageRating').get(function() {
  if (this.reviews.length === 0) return 0;
  const sum = this.reviews.reduce((acc, review) => acc + review.rating, 0);
  return (sum / this.reviews.length).toFixed(1);
});

// ✅ Method to check if store is currently open
storeSchema.methods.isCurrentlyOpen = function() {
  if (!this.isOpen || !this.available) return false;
  
  const now = new Date();
  const currentTime = now.getHours().toString().padStart(2, '0') + ':' + 
                     now.getMinutes().toString().padStart(2, '0');
  
  return currentTime >= this.openingTime && currentTime <= this.closingTime;
};

// ✅ Virtual populate for menu items
storeSchema.virtual("menu", {
  ref: "MenuItem",
  localField: "_id", 
  foreignField: "storeId"
});

// ✅ Virtual populate for orders
storeSchema.virtual("orders", {
  ref: "Order",
  localField: "_id",
  foreignField: "storeId"
});

storeSchema.set("toObject", { virtuals: true });
storeSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Store", storeSchema);