const express = require("express");
const router = express.Router();
const homemadeFoodController = require("../controllers/homemadeFoodController");
const { protect, requireAdmin } = require("../middleware/authMiddleware");

// ============================================
// ADMIN ROUTES (Protected)
// ============================================

// Food Item Management
router.get("/", protect, requireAdmin, homemadeFoodController.getAllHomemadeFoods);
router.post("/", protect, requireAdmin, homemadeFoodController.createHomemadeFood);
router.put("/:id", protect, requireAdmin, homemadeFoodController.updateHomemadeFood);
router.delete("/:id", protect, requireAdmin, homemadeFoodController.deleteHomemadeFood);
router.patch("/:id/set-todays-special", protect, requireAdmin, homemadeFoodController.setTodaysSpecial);

// Order Management
router.get("/orders", protect, requireAdmin, homemadeFoodController.getAllOrders);
router.get("/orders/export", protect, requireAdmin, homemadeFoodController.exportOrders);
router.get("/orders/:id", protect, requireAdmin, homemadeFoodController.getOrderById);
router.patch("/orders/:id/status", protect, requireAdmin, homemadeFoodController.updateOrderStatus);
router.patch("/orders/:id/payment", protect, requireAdmin, homemadeFoodController.updatePaymentStatus);

// Analytics
router.get("/analytics", protect, requireAdmin, homemadeFoodController.getAnalytics);

module.exports = router;

