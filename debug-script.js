require('dotenv').config();
const mongoose = require('mongoose');
const SubscriptionPlan = require('./models/subscriptionPlanSchema');

const mongoUri = process.env.MONGO_URI;

(async () => {
    try {
        await mongoose.connect(mongoUri);
        console.log("Connected to DB");

        const plans = await SubscriptionPlan.find({});
        console.log(`Found ${plans.length} plans`);

        plans.forEach(p => {
            console.log(`Plan: ${p.title} (ID: ${p._id})`);
            console.log(`  isActive: ${p.isActive} (Type: ${typeof p.isActive})`);
            console.log(`  startDate: ${p.startDate} (Type: ${typeof p.startDate})`);
            console.log(`  endDate: ${p.endDate} (Type: ${typeof p.endDate})`);

            // Check logic
            const now = new Date();
            const startValid = !p.startDate || p.startDate <= now;
            const endValid = !p.endDate || p.endDate >= now;
            console.log(`  Valid now? ${p.isActive && startValid && endValid}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
