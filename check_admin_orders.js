const mongoose = require('mongoose');
const Order = require('./models/orderSchema'); // Ensure path is correct relative to execution
const HomemadeFoodOrder = require('./models/homemadeFood').HomemadeFoodOrder;
require('dotenv').config();

const runCheck = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ DB Connected");

        // Simulate getAllOrders logic
        const homemadeFilter = {};
        const orderFilter = { 'metadata.isHomemade': true };

        console.log("🔍 Querying with:", JSON.stringify(orderFilter));

        const [legacyOrders, newOrders] = await Promise.all([
            HomemadeFoodOrder.find(homemadeFilter).sort({ createdAt: -1 }).lean(),
            Order.find(orderFilter).sort({ createdAt: -1 }).lean()
        ]);

        console.log(`📊 Found ${legacyOrders.length} Legacy Orders`);
        console.log(`📊 Found ${newOrders.length} New Orders`);

        if (newOrders.length > 0) {
            console.log("📝 First New Order Sample:", JSON.stringify(newOrders[0], null, 2));
            console.log("📝 Metadata of First New Order:", newOrders[0].metadata);
        }

        const mappedNew = newOrders.map(o => {
            let simpleFoodName = 'Homemade Thali';
            if (o.metadata?.mealType) simpleFoodName = `${o.metadata.mealType} Thali`;
            else if (o.items?.[0]?.itemName) simpleFoodName = o.items[0].itemName;

            return {
                _id: o._id,
                source: 'new',
                orderNumber: o.orderNumber || o._id.toString().slice(-6).toUpperCase(),
                customerName: o.metadata?.customerName || 'Unknown',
                status: o.status,
                foodName: simpleFoodName
            };
        });

        console.log("🗺️ Mapped Result Sample:", mappedNew.slice(0, 3));

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
};

runCheck();
