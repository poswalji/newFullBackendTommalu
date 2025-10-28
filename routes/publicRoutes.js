const express = require('express');
const router = express.Router();
const menuItemController = require('../controllers/menuController');
const storeOwnerController = require('../controllers/storeOwnerController');

// ✅ PUBLIC ROUTES - No authentication needed

// Get all stores (Customers ko stores dikhane ke liye)
router.get('/stores', storeOwnerController.getAllStores);

// Get store menu (Customers ko menu dikhane ke liye)
router.get('/stores/:storeId/menu', menuItemController.getStoreMenu);

// Search stores (Optional)
router.get('/stores/search', storeOwnerController.searchStores);

module.exports = router;