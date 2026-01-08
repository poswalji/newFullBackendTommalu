const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, "Please enter a valid email"]
  },phone: {
  type: String,
  unique: false,
  validate: {
    validator: function (v) {
      // Allow empty / undefined phone numbers
      if (!v) return true;

      // Basic phone validation
      return /^\+?[\d\s\-()]{10,}$/.test(v);
    },
    message: "Please enter a valid phone number"
  }
  },


 password: {
    type: String,
    // ✅ CHANGE: Google users ke liye password optional
    required: function() {
      return !this.googleId; // Google users ke liye password not required
    },
    minlength: 6,
    select: false
  },
  googleId: {
    type: String,
    sparse: true // ✅ Allows multiple null values but unique for non-null
  },

  role: {
    type: String,
    enum: ["customer", "admin", "storeOwner", "delivery"],
    default: "customer"
  },

 
  // Account status controls access for moderation actions
  status: {
    type: String,
    enum: ["active", "suspended"],
    default: "active"
  },

  // ✅ Multiple saved addresses
  addresses: [
    {
      label: { type: String, enum: ["Home", "Work", "Other"], default: "Home" },
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String },
      pincode: { type: String, required: true },
      country: { type: String, default: "India" },
      isDefault: { type: Boolean, default: false }
    }
  ],

  // ✅ Email verification fields
  emailVerified: {
    type: Boolean,
    default: false
  },
  verificationCode: {
    type: String,
    select: false
  },
  verificationCodeExpires: {
    type: Date,
    select: false
  },
  
  // ✅ Password reset fields
  resetPasswordToken: {
    type: String,
    select: false
  },
  resetPasswordExpires: {
    type: Date,
    select: false
  },
  
  // ✅ Push notification token for mobile/web push notifications
  fcmToken: {
    type: String,
    sparse: true
  },
  
  // ✅ Notification preferences
  notificationSettings: {
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    sms: { type: Boolean, default: false }
  }

},
{
  timestamps: true
});


// ✅ Add password hashing middleware
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

// ✅ Instance method to check password
userSchema.methods.correctPassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword,this.password);
};

// ✅ Instance method to generate JWT token
userSchema.methods.generateAuthToken = function() {
    return jwt.sign(
        { id: this._id, role: this.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );
}; 
// ✅ Virtual for stores owned by storeOwner
userSchema.virtual("stores", {  
  ref: "Store",
  localField: "_id",
  foreignField: "ownerId"
});
// orders

userSchema.virtual("orders", {
  ref: "Order",
  localField: "_id",
  foreignField: "userId"
});



// Ensure virtuals appear in JSON and objects
userSchema.set("toObject", { virtuals: true });
userSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("User", userSchema);
