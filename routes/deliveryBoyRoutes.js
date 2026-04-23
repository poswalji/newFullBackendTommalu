const express = require('express');
const router = express.Router();
const deliveryBoyController = require('../controllers/deliveryBoyController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// Public route for delivery boy login
router.post('/login', deliveryBoyController.loginDeliveryBoy);

// All routes below are protected and restricted to admin
router.use(protect);
router.use(restrictTo('admin'));

router.get('/', deliveryBoyController.getAllDeliveryBoys);
router.post('/', deliveryBoyController.createDeliveryBoy);
router.put('/:id', deliveryBoyController.updateDeliveryBoy);
router.delete('/:id', deliveryBoyController.deactivateDeliveryBoy);

module.exports = router;
