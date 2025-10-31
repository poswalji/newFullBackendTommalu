const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect, requireAdmin, restrictAdminTo } = require('../middleware/authMiddleware');

// All admin routes require authenticated admin
router.use(protect, requireAdmin);

// Users management
router.get('/users', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.listUsers);
router.patch('/users/:id/suspend', restrictAdminTo('superAdmin'), adminController.suspendUser);
router.patch('/users/:id/reactivate', restrictAdminTo('superAdmin'), adminController.reactivateUser);
router.post('/users/:id/reset-password', restrictAdminTo('superAdmin'), adminController.resetPassword);
router.get('/users/:id/history/orders', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.getUserOrders);
router.get('/users/:id/history/transactions', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.getUserTransactions);

// Store verification & moderation (verification subset here)
router.get('/stores/pending', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.listPendingStores);
router.post('/stores/:id/approve', restrictAdminTo('superAdmin'), adminController.approveStore);
router.post('/stores/:id/reject', restrictAdminTo('superAdmin'), adminController.rejectStore);

// Store moderation
router.patch('/stores/:id/suspend', restrictAdminTo('superAdmin'), adminController.suspendStore);
router.patch('/stores/:id/metadata', restrictAdminTo('superAdmin'), adminController.updateStoreMetadata);
router.patch('/stores/:id/commission', restrictAdminTo('superAdmin'), adminController.updateStoreCommission);

module.exports = router;


