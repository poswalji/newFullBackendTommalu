const mongoose = require('mongoose');

const subscriptionRequestSchema = new mongoose.Schema({
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
    planName: String,
    price: Number,
    planType: {
        type: String,
        enum: ['lunch', 'dinner', 'both'],
        required: true
    },
    startDate: {
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
    status: {
        type: String,
        enum: ['pending', 'rejected', 'approved'],
        default: 'pending'
    },
    rejectionReason: String,
    adminNotes: String
}, {
    timestamps: true
});

module.exports = mongoose.model('SubscriptionRequest', subscriptionRequestSchema);
