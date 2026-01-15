const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },
    customerName: {
        type: String,
        required: [true, 'Customer name is required']
    },
    mobileNumber: {
        type: String,
        required: [true, 'Mobile number is required']
    },
    deliveryAddress: {
        street: { type: String, required: true },
        landmark: String,
        city: { type: String, required: true },
        pincode: { type: String, required: true },
        coordinates: {
            lat: Number,
            lng: Number
        }
    },
    planId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SubscriptionPlan',
        required: true
    },
    planName: String, // Snapshot of plan title
    price: Number,    // Snapshot of plan price
    planType: {
        type: String,
        enum: ['lunch', 'dinner', 'both'],
        required: true
    },
    duration: {
        type: Number,
        default: 30, // Fixed as per requirement
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'active', 'paused', 'completed', 'cancelled', 'rejected'],
        default: 'pending'
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    quantity: {
        type: Number,
        default: 1,
        min: 1
    },
    rotiPreference: {
        type: String,
        default: 'Standard'
    },
    adminNotes: String,

    // Logs for daily deliveries
    deliveryLogs: [{
        date: Date,
        status: {
            type: String,
            enum: ['scheduled', 'delivered', 'skipped', 'paused', 'cancelled'],
            default: 'scheduled'
        },
        deliverySlot: String, // 'lunch' or 'dinner'
        notes: String
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Subscription', subscriptionSchema);
