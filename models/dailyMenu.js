const mongoose = require('mongoose');

const dailyMenuSchema = new mongoose.Schema({
    date: {
        type: String, // Format: YYYY-MM-DD
        required: true,
        unique: true
    },
    dayOfWeek: {
        type: String,
        enum: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        required: true
    },
    // Emergency / Manual Service Off
    isServiceOff: {
        type: Boolean,
        default: false
    },
    // Weekday Configuration
    weekdayMenu: {
        lunchSabji: { type: String, default: '' },
        dinnerSabji: { type: String, default: '' },
        fixedPrice: { type: Number, default: 99 },
        // Distinct Menu Items for Lunch vs Dinner
        lunchItems: {
            type: [String],
            default: ['5 Ghee Roti', 'Salad', 'Dal OR Lahsun Chutney', 'Desi Chhach']
        },
        dinnerItems: {
            type: [String],
            default: ['5 Ghee Roti', 'Salad', 'Dal OR Lahsun Chutney', 'Desi Chhach']
        },
        // Deprecated but kept for backward compatibility (can be removed later)
        fixedItems: {
            type: [String],
            default: []
        },
        availableRotis: [{
            type: { type: String, required: true }, // e.g., 'Wheat', 'Bajra'
            priceExtra: { type: Number, default: 0 },
            isDefault: { type: Boolean, default: false }
        }],
        extraRotiPrice: { type: Number, default: 10 }
    },
    // Sunday Configuration
    sundayMenu: {
        specialItemName: { type: String, default: '' },
        price: { type: Number, default: 0 }, // Admin editable
        isDinnerSlotOpen: { type: Boolean, default: false } // Admin toggle
    },
    // Stats (Denormalized for quick access, or computed)
    stats: {
        lunchOrders: { type: Number, default: 0 },
        dinnerOrders: { type: Number, default: 0 },
        revenue: { type: Number, default: 0 }
    }
}, { timestamps: true });

module.exports = mongoose.model('DailyMenu', dailyMenuSchema);
