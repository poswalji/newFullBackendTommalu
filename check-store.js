require('dotenv').config();
const mongoose = require('mongoose');
const Store = require('./models/store');

const mongoUri = process.env.MONGO_URI;

(async () => {
    try {
        await mongoose.connect(mongoUri);
        console.log("Connected to DB");

        const store = await Store.findOne({ storeName: "Tommalu Home Kitchen" });
        if (store) {
            console.log(`Store Found: ${store.storeName} (${store._id})`);
        } else {
            console.log("Store 'Tommalu Home Kitchen' NOT FOUND.");
            // List all stores to see what exists
            const stores = await Store.find({}, 'storeName');
            console.log("Existing Stores:", stores.map(s => s.storeName));
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
