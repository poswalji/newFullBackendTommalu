const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema({
  storeId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Store", 
    required: true,
    index: true
  },
  
  name: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 100
  },
  
  description: {
    type: String,
    maxlength: 300
  },
  
  price: { 
    type: Number, 
    required: true,
    min: 1,
    max: 10000 // Reasonable max price
  },
  
  // ✅ Original price for discounts
  originalPrice: {
    type: Number,
    min: 0
  },
  
  // ✅ Improved categories - more organized
  category: { 
    type: String, 
    enum: [
      "Veg Main Course", 
      "Non-Veg Main Course", 
      "Starters & Snacks", 
      "Breads & Rice",
      "Drinks & Beverages", 
      "Dairy & Eggs", 
      "Groceries & Essentials", 
      "Fruits & Vegetables",
      "Sweets & Desserts", 
      "Fast Food", 
      "Bakery Items", 
      "Grains & Pulses",
      "Meat & Seafood",
      "Other"
    ], 
    required: true,
    default: "Veg Main Course"
  },
  
  // ✅ Food type - important for local customers
  foodType: {
    type: String,
    enum: ["veg", "non-veg", "egg", "vegan"],
    default: "veg"
  },
  
  // ✅ Multiple images support
  images: [{
    type: String // URLs array
  }],
  
  // ✅ Availability & Inventory
  isAvailable: { 
    type: Boolean, 
    default: true 
  },
  inStock: {
    type: Boolean,
    default: true
  },
  stockQuantity: {
    type: Number,
    default: 0
  },
  
  // ✅ Preparation time (restaurants ke liye)
  preparationTime: {
    type: Number, // minutes mein
    min: 0,
    max: 240, // 4 hours max
    default: 15
  },
  
  // ✅ Customization options
  customizations: [{
    name: String, // "Spice Level", "Toppings", etc.
    options: [{
      name: String, // "Mild", "Medium", "Spicy"
      price: { type: Number, default: 0 }
    }],
    isRequired: { type: Boolean, default: false }
  }],
  
  // ✅ Nutritional info (optional)
  nutritionalInfo: {
    calories: Number,
    protein: Number,
    carbs: Number,
    fats: Number
  },
  
  // ✅ Popularity & Performance tracking
  timesOrdered: {
    type: Number,
    default: 0
  },
  totalRevenue: {
    type: Number,
    default: 0
  },
  
  // ✅ Special flags
  isSpecial: {
    type: Boolean,
    default: false
  },
  isBestSeller: {
    type: Boolean,
    default: false
  },
  
  // ✅ Discount & Offers
  discount: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  
  // ✅ Tags for better search
  tags: [String]

}, { 
  timestamps: true 
});

// ✅ Indexes for better performance
menuItemSchema.index({ storeId: 1, isAvailable: 1 });
menuItemSchema.index({ storeId: 1, category: 1 });
menuItemSchema.index({ storeId: 1, foodType: 1 });
menuItemSchema.index({ storeId: 1, isBestSeller: 1 });

// ✅ Virtual for discount price
menuItemSchema.virtual('discountPrice').get(function() {
  if (this.discount > 0) {
    return this.price - (this.price * this.discount / 100);
  }
  return this.price;
});

// ✅ Virtual for popularity
menuItemSchema.virtual('isPopular').get(function() {
  return this.timesOrdered > 15;
});

// ✅ Check if item is in stock
menuItemSchema.virtual('isInStock').get(function() {
  return this.inStock && this.stockQuantity > 0;
});

// ✅ Method to increment orders
menuItemSchema.methods.incrementOrders = function(quantity = 1) {
  this.timesOrdered += quantity;
  this.totalRevenue += this.price * quantity;
  return this.save();
};

// ✅ Method to update stock
menuItemSchema.methods.updateStock = function(quantity) {
  this.stockQuantity += quantity;
  this.inStock = this.stockQuantity > 0;
  return this.save();
};

// ✅ Method to toggle availability
menuItemSchema.methods.toggleAvailable = function() {
  this.isAvailable = !this.isAvailable;
  return this.save();
};

// ✅ Static method to get popular items by store
menuItemSchema.statics.getPopularItems = function(storeId, limit = 10) {
  return this.find({ storeId, isAvailable: true })
    .sort({ timesOrdered: -1 })
    .limit(limit);
};

// ✅ Pre-save middleware to handle original price
menuItemSchema.pre('save', function(next) {
  if (this.isModified('price') && !this.originalPrice) {
    this.originalPrice = this.price;
  }
  next();
});

module.exports = mongoose.model("MenuItem", menuItemSchema);