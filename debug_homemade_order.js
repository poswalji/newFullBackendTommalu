const mongoose = require('mongoose');
const DailyMenu = require('./models/dailyMenu');
const Order = require('./models/orderSchema');
const Store = require('./models/store');
const MenuItem = require('./models/menuItems');
require('dotenv').config();

const runDebug = async () => {
    try {
        console.log("🔌 Connecting to DB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Connected.");

        // 1. Check if DailyMenu exists for today
        const todayStr = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).toISOString().split('T')[0];
        console.log(`📅 Today's Date String: ${todayStr}`);

        const menu = await DailyMenu.findOne({ date: todayStr });
        if (!menu) {
            console.error("❌ DailyMenu not found for today. Run the server once to auto-create it.");
            process.exit(1);
        }
        console.log("✅ DailyMenu found.");

        // 2. Simulate Order Creation (like dailyMenuController.js)
        // Ensure refs
        let store = await Store.findOne({ storeName: "Tommalu Home Kitchen" });
        if (!store) {
            console.log("⚠️ Store not found, creating dummy...");
            store = await Store.create({
                storeName: "Tommalu Home Kitchen",
                address: "Debug Address",
                city: "Debug City",
                pincode: "000000",
                phone: "0000000000",
                category: "Homemade Food",
                isOpen: true
            });
        }

        let dailyItem = await MenuItem.findOne({ name: "DAILY HOME-MADE THALI", storeId: store._id });
        if (!dailyItem) {
            console.log("⚠️ Item not found, creating dummy...");
            dailyItem = await MenuItem.create({
                storeId: store._id,
                name: "DAILY HOME-MADE THALI",
                price: 89,
                category: "Homemade Food",
                description: "Debug item",
                foodType: "veg"
            });
        }

        const payload = {
            customerName: "Debug User",
            mobileNumber: "9999999999",
            area: "Debug Area",
            customAddress: "Debug House",
            quantity: 1,
            slot: "Lunch"
        };

        const price = 89;

        console.log("Creating Order...");
        const order = await Order.create({
            userId: new mongoose.Types.ObjectId(),
            storeId: store._id,
            deliveryAddress: {
                street: `${payload.customAddress}, ${payload.area}`,
                city: 'Jaipur',
                pincode: '303002',
                label: 'Home'
            },
            items: [{
                menuItemId: dailyItem._id,
                itemName: dailyItem.name,
                quantity: payload.quantity,
                itemPrice: price,
            }],
            totalAmount: price,
            finalPrice: price,
            paymentMethod: 'cash_on_delivery',
            status: 'Pending',
            metadata: {
                dailyMenuDate: todayStr,
                isHomemade: true, // EXPLICITLY SETTING THIS
                customerName: payload.customerName,
                customerPhone: payload.mobileNumber,
                mealType: payload.slot
            }
        });

        console.log(`✅ Order created with ID: ${order._id}`);
        console.log("Checking Metadata:", order.metadata);

        // 3. Verify Fetch (like dailyMenuController.getAllOrders)
        console.log("🔍 Attempting to fetch using Admin Filter...");
        const foundOrder = await Order.findOne({
            _id: order._id,
            'metadata.isHomemade': true
        });

        if (foundOrder) {
            console.log("✅ SUCCESS: Order found via { 'metadata.isHomemade': true } query.");
        } else {
            console.error("❌ FAILURE: Order NOT found via Admin query!");

            // Check why
            const check = await Order.findById(order._id);
            console.log("Direct Fetch Metadata:", check.metadata);
        }

    } catch (e) {
        console.error("❌ Error:", e);
    } finally {
        await mongoose.disconnect();
    }
};

runDebug();
