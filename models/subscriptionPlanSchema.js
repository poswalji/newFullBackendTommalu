const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema({
    planType: {
        type: String,
        enum: ['lunch', 'dinner', 'both'],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        default: "30 Days Home Cooked Meals"
    },
    price: {
        type: Number,
        required: true
    },
    discountPercentage: {
        type: Number,
        default: 0
    },
    startDate: {
        type: Date
    },
    endDate: {
        type: Date
    },
    features: [{
        type: String
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    colorTheme: {
        type: String,
        default: "orange" // orange, blue, green (for UI styling)
    }
}, { timestamps: true });

module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
