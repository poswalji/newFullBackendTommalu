// const mongoose = require("mongoose");
 const User = require("./user"); // import User model
 const Store = require("./store"); // import Store model

// const OrderSchema = new mongoose.Schema({
//   userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
//   storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
//   orderTime: { type: Date, default: Date.now },
//   deliveredTime: { type: Date },

//   // 📌 Snapshot of delivery address
//   deliveryAddress: {
//     label: { type: String, enum: ["Home", "Work", "Other"], default: "Home" },
//     street: { type: String, required: true },
//     city: { type: String, required: true },
//     state: { type: String },
//     pincode: { type: String, required: true },
//     country: { type: String, default: "India" }
//   },

//   items: [
//     {
//       menuId: { type: mongoose.Schema.Types.ObjectId, ref: "Menu", required: true },
//       itemName: { type: String, required: true },
//       quantity: { type: Number, default: 1 },
//       itemPrice: { type: Number, required: true }
//     }
//   ],

//   discount: { type: Number, default: 0 },
//   promoCode: { type: String },
//   finalPrice: { type: Number, required: true },

//   status: {
//     type: String,
//     enum: ["Pending", "Confirmed", "OutForDelivery", "Delivered", "Cancelled"],
//     default: "Pending"
//   }
// },
// { timestamps: true });


// // Ensure virtuals appear in JSON and objects



// OrderSchema.set("toObject", { virtuals: true });
// OrderSchema.set("toJSON", { virtuals: true });  

// module.exports = mongoose.model("Order", OrderSchema);
const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
  orderTime: { type: Date, default: Date.now },
  deliveredTime: { type: Date },

  deliveryAddress: {
    label: { type: String, enum: ["Home", "Work", "Other"], default: "Home" },
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String },
    pincode: { type: String, required: true },
    country: { type: String, default: "India" }
  },

  items: [
    {
      menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItem", required: true },
      itemName: { type: String, required: true },
      quantity: { type: Number, default: 1 },
      itemPrice: { type: Number, required: true }
    }
  ],

  discount: { type: Number, default: 0 },
  promoCode: { type: String },
  finalPrice: { type: Number, required: true },

  status: {
    type: String,
    enum: ["Pending", "Confirmed", "OutForDelivery", "Delivered", "Cancelled","Rejected"],
    default: "Pending"
  },
   rejectionReason: {
    type: String,
    maxlength: [500, "Rejection reason too long"]
  },

  // ✅ Cancellation reason bhi add karein
  cancellationReason: {
    type: String,
    maxlength: [500, "Cancellation reason too long"]
  }
},
{ timestamps: true });

// Pre-save hook to calculate finalPrice if not set
OrderSchema.pre('save', function(next) {
  // If finalPrice is not set, calculate it from items and discount
  if (this.isModified('items') || this.isModified('discount') || this.isNew) {
    let subtotal = 0;
    this.items.forEach(item => {
      subtotal += item.itemPrice * item.quantity;
    });
    this.finalPrice = subtotal - this.discount;
  }
  next();
});

module.exports = mongoose.model("Order", OrderSchema);