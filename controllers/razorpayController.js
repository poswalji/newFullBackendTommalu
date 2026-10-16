const Razorpay = require('razorpay');
const crypto = require('crypto');
const Order = require('../models/orderSchema');
const Payment = require('../models/payment');

const razorpayController = {
  /**
   * Helper to get configured Razorpay client instance
   */
  getRazorpayClient: () => {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;

    if (!key_id || !key_secret) {
      const error = new Error('Razorpay API credentials not configured in environment variables');
      error.statusCode = 500;
      throw error;
    }

    return new Razorpay({ key_id, key_secret });
  },

  /**
   * STEP 1: BACKEND - Create Order
   * Endpoint: POST /api/create-order and POST /api/payments/create-order
   * Request: { amount (paise), currency, receipt }
   * Return: { order_id, amount, currency }
   * Minimum amount: 100 paise
   */
  createRazorpayOrder: async (req, res) => {
    try {
      let { amount, currency, receipt, notes } = req.body;

      // Validate amount presence and type
      if (amount === undefined || amount === null || isNaN(amount)) {
        return res.status(400).json({
          success: false,
          message: 'Amount is required and must be a valid number'
        });
      }

      const numericAmount = Math.round(Number(amount));

      // Validate minimum amount: 100 paise (₹1)
      if (numericAmount < 100) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be at least 100 paise (₹1)'
        });
      }

      const key_id = process.env.RAZORPAY_KEY_ID;
      const key_secret = process.env.RAZORPAY_KEY_SECRET;

      if (!key_id || !key_secret) {
        return res.status(500).json({
          success: false,
          message: 'Razorpay API credentials not configured in environment variables'
        });
      }

      const razorpay = razorpayController.getRazorpayClient();

      const orderOptions = {
        amount: numericAmount,
        currency: currency || 'INR',
        receipt: receipt || `rcpt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        notes: notes || {}
      };

      const razorpayOrder = await razorpay.orders.create(orderOptions);

      return res.status(200).json({
        success: true,
        order_id: razorpayOrder.id,
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key_id: key_id
      });
    } catch (err) {
      console.error('Razorpay Order Creation Error:', err);

      // Handle Razorpay authentication failures (return 401)
      if (
        err.statusCode === 401 ||
        err.status === 401 ||
        (err.error && (
          err.error.code === 'BAD_REQUEST_ERROR' && /auth/i.test(err.error.description)
        ))
      ) {
        return res.status(401).json({
          success: false,
          message: 'Razorpay authentication failed: Invalid Key ID or Key Secret',
          error: err.error || err.message
        });
      }

      // Handle Razorpay API errors (return 500)
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.error?.description || err.message || 'Failed to create Razorpay order',
        error: err.error || err.message
      });
    }
  },

  /**
   * STEP 3: BACKEND - Verify Signature
   * Endpoint: POST /api/verify-payment and POST /api/payments/verify-payment
   * Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
   * Compare generated signature with razorpay_signature
   * Return success only if signatures match
   */
  verifyRazorpayPayment: async (req, res) => {
    try {
      const razorpay_order_id = req.body.razorpay_order_id || req.body.order_id || req.body.razorpayOrderId;
      const razorpay_payment_id = req.body.razorpay_payment_id || req.body.payment_id || req.body.razorpayPaymentId;
      const razorpay_signature = req.body.razorpay_signature || req.body.signature || req.body.razorpaySignature;
      const orderId = req.body.orderId || req.body.order_id_db; // Optional internal MongoDB order ID

      // Missing fields check (return 400)
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: razorpay_order_id, razorpay_payment_id, and razorpay_signature are required'
        });
      }

      const key_secret = process.env.RAZORPAY_KEY_SECRET;
      if (!key_secret) {
        return res.status(500).json({
          success: false,
          message: 'Razorpay secret key not configured in environment variables'
        });
      }

      // Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
      const generatedSignature = crypto
        .createHmac('sha256', key_secret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      // Constant-time safe comparison or string fallback
      let signaturesMatch = false;
      if (typeof razorpay_signature === 'string' && generatedSignature.length === razorpay_signature.length) {
        signaturesMatch = crypto.timingSafeEqual(
          Buffer.from(generatedSignature, 'utf-8'),
          Buffer.from(razorpay_signature, 'utf-8')
        );
      }

      if (!signaturesMatch) {
        // Signature mismatch: return 400, do NOT mark as paid
        return res.status(400).json({
          success: false,
          message: 'Payment verification failed: Signature mismatch'
        });
      }

      // Signatures match! Update database records if orderId is provided
      let updatedOrder = null;
      let paymentDoc = null;

      if (orderId) {
        try {
          const order = await Order.findById(orderId);
          if (order) {
            order.status = 'Confirmed';
            order.paymentMethod = 'online';

            let payment = await Payment.findOne({ orderId: order._id });
            const finalAmount = order.finalPrice || (order.totalAmount || 0);
            const commissionRate = 10;
            const commissionAmount = (finalAmount * commissionRate) / 100;
            const storePayoutAmount = finalAmount - commissionAmount;

            if (!payment) {
              payment = await Payment.create({
                orderId: order._id,
                userId: order.userId,
                storeId: order.storeId,
                amount: finalAmount,
                commissionRate,
                commissionAmount,
                storePayoutAmount,
                paymentMethod: 'online',
                paymentGateway: 'razorpay',
                transactionId: razorpay_payment_id,
                gatewayOrderId: razorpay_order_id,
                gatewayResponse: req.body,
                status: 'completed',
                payoutStatus: 'eligible'
              });
            } else {
              payment.paymentMethod = 'online';
              payment.paymentGateway = 'razorpay';
              payment.transactionId = razorpay_payment_id;
              payment.gatewayOrderId = razorpay_order_id;
              payment.gatewayResponse = req.body;
              payment.status = 'completed';
              payment.payoutStatus = 'eligible';
              await payment.save();
            }

            order.paymentId = payment._id;
            if (order.metadata) {
              order.metadata.razorpay_order_id = razorpay_order_id;
              order.metadata.razorpay_payment_id = razorpay_payment_id;
              order.markModified('metadata');
            }
            await order.save();
            updatedOrder = order;
            paymentDoc = payment;
          }
        } catch (dbErr) {
          console.error('Error updating order status in DB after verification:', dbErr);
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Payment verified successfully',
        data: {
          razorpay_order_id,
          razorpay_payment_id,
          order: updatedOrder,
          payment: paymentDoc
        }
      });
    } catch (err) {
      console.error('Payment Verification Error:', err);
      return res.status(500).json({
        success: false,
        message: err.message || 'Internal server error during payment verification'
      });
    }
  }
};

module.exports = razorpayController;
