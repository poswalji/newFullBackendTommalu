const mongoose = require('mongoose');

const subscriptionPriceLogSchema = new mongoose.Schema({
    subscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subscription',
        required: true
    },
    oldPrice: {
        type: Number,
        required: true
    },
    newPrice: {
        type: Number,
        required: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reason: {
        type: String,
        default: 'Admin manual update'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('SubscriptionPriceLog', subscriptionPriceLogSchema);
