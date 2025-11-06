const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: [
      "order_created",
      "order_confirmed",
      "order_cancelled",
      "order_delivered",
      "order_rejected",
      "order_status_updated",
      "payment_received",
      "payout_processed",
      "dispute_created",
      "dispute_resolved",
      "store_approved",
      "store_rejected",
      "general"
    ],
    default: "general"
  },
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: "relatedModel"
  },
  relatedModel: {
    type: String,
    enum: ["Order", "Payment", "Payout", "Dispute", "Store", null]
  },
  read: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: {
    type: Date
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Index for efficient queries
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);

