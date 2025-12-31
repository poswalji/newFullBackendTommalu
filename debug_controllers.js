require('dotenv').config();
const mongoose = require('mongoose');
const Store = require('./models/store');
const { isStoreOpen } = require('./utils/storeUtils');
const MenuItem = require('./models/menuItems'); // Required if models rely on it

const STORE_ID = '692ab1e3f7770e1b5f04b8ac';
const MONGO_URI = process.env.MONGO_URI;

const runComparison = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected.');

        // 1. Simulate getStoresByCategory behavior
        // logic: Store.find({ category: ..., available: true }) ...
        const storeFromList = await Store.findById(STORE_ID); // Simplified fetch
        if (!storeFromList) {
            console.log('Store not found via ID');
            return;
        }

        console.log('--- Store Object Data ---');
        console.log(`Open Time: ${storeFromList.openingTime}`);
        console.log(`Close Time: ${storeFromList.closingTime}`);
        console.log(`IsOpen Flag: ${storeFromList.isOpen}`);

        const listStatus = isStoreOpen(storeFromList);
        console.log(`STATUS via List Logic: ${listStatus.isOpen}`);
        if (!listStatus.isOpen) console.log(`Reason: ${listStatus.reason}`);

        // 2. Simulate getStoreMenu behavior
        // logic: Store.findById(storeId).select('...')
        // menuController line 160: 
        // .select('storeName address phone category description openingTime closingTime deliveryTime minOrder deliveryFee isOpen rating totalReviews image ownerId');

        const storeFromMenu = await Store.findById(STORE_ID)
            .select('storeName address phone category description openingTime closingTime deliveryTime minOrder deliveryFee isOpen rating totalReviews image ownerId status available');

        const menuStatus = isStoreOpen(storeFromMenu);
        console.log(`STATUS via Menu Logic: ${menuStatus.isOpen}`);
        if (!menuStatus.isOpen) console.log(`Reason: ${menuStatus.reason}`);

        if (listStatus.isOpen !== menuStatus.isOpen) {
            console.log('MISMATCH DETECTED!');
        } else {
            console.log('Both consistent.');
        }

    } catch (e) {
        console.log(e);
    } finally {
        await mongoose.disconnect();
    }
}

runComparison();
