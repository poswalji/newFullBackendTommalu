const mongoose = require('mongoose');

const dailyDeliverySchema = new mongoose.Schema({
    subscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subscription',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    date: {
        type: Date,
        required: true
    },
    slot: {
        type: String,
        enum: ['lunch', 'dinner'],
        required: true
    },
    status: {
        type: String,
        enum: ['scheduled', 'out_for_delivery', 'delivered', 'cancelled', 'skipped'],
        default: 'scheduled'
    },
    menuItems: [{
        name: String,
        quantity: Number
    }],
    deliveryAddress: {
        street: String,
        city: String,
        pincode: String
    },
    deliveryBoyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    notes: String
}, {
    timestamps: true
});

// Compound index to ensure one delivery per slot per subscription per day
dailyDeliverySchema.index({ subscriptionId: 1, date: 1, slot: 1 }, { unique: true });

module.exports = mongoose.model('DailyDelivery', dailyDeliverySchema);
