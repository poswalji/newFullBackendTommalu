/**
 * Razorpay Standard Web Checkout API Tests
 * Tests Order Creation (Step 1) and Signature Verification (Step 3)
 */

const request = require('supertest');
const crypto = require('crypto');
const app = require('../../app');
const razorpayController = require('../../controllers/razorpayController');

describe('Razorpay Standard Web Checkout API Tests', () => {
  const originalKeySecret = process.env.RAZORPAY_KEY_SECRET;
  let mockOrdersCreate;
  let getRazorpayClientSpy;

  beforeAll(() => {
    process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '9852LXt9kZ7jE4Y4iq0P5r0b';
    process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_ToHjwva7Ga4GdT';
  });

  beforeEach(() => {
    mockOrdersCreate = jest.fn();
    // restoreMocks in jest.config.js restores spies after each test, so re-spy in beforeEach
    getRazorpayClientSpy = jest.spyOn(razorpayController, 'getRazorpayClient').mockReturnValue({
      orders: {
        create: mockOrdersCreate
      }
    });
  });

  afterAll(() => {
    process.env.RAZORPAY_KEY_SECRET = originalKeySecret;
    if (getRazorpayClientSpy) {
      getRazorpayClientSpy.mockRestore();
    }
  });

  describe('STEP 1: POST /api/create-order', () => {
    it('should reject request when amount is missing', async () => {
      const response = await request(app)
        .post('/api/create-order')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/Amount is required/i);
    });

    it('should reject request when amount is less than 100 paise (minimum ₹1)', async () => {
      const response = await request(app)
        .post('/api/create-order')
        .send({ amount: 99 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/at least 100 paise/i);
    });

    it('should return 401 when Razorpay API rejects authentication', async () => {
      mockOrdersCreate.mockRejectedValueOnce({
        statusCode: 401,
        error: { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed' }
      });

      const response = await request(app)
        .post('/api/create-order')
        .send({
          amount: 50000,
          currency: 'INR',
          receipt: 'rcpt_test_123'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/authentication failed/i);
    });

    it('should return 500 when Razorpay API encounters an internal or network error', async () => {
      mockOrdersCreate.mockRejectedValueOnce({
        statusCode: 500,
        error: { code: 'GATEWAY_ERROR', description: 'Internal gateway error' }
      });

      const response = await request(app)
        .post('/api/create-order')
        .send({
          amount: 50000,
          currency: 'INR',
          receipt: 'rcpt_test_123'
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/Internal gateway error/i);
    });

    it('should successfully create order and return order_id, amount, and currency', async () => {
      mockOrdersCreate.mockResolvedValueOnce({
        id: 'order_test_999888777',
        amount: 50000,
        currency: 'INR',
        status: 'created',
        receipt: 'rcpt_test_123'
      });

      const response = await request(app)
        .post('/api/create-order')
        .send({
          amount: 50000,
          currency: 'INR',
          receipt: 'rcpt_test_123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.order_id).toBe('order_test_999888777');
      expect(response.body.amount).toBe(50000);
      expect(response.body.currency).toBe('INR');
    });
  });

  describe('STEP 3: POST /api/verify-payment', () => {
    it('should return 400 when required fields are missing', async () => {
      const response = await request(app)
        .post('/api/verify-payment')
        .send({
          razorpay_order_id: 'order_123'
          // missing razorpay_payment_id and razorpay_signature
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/missing required fields/i);
    });

    it('should return 400 and NOT mark as paid when signature does not match', async () => {
      const response = await request(app)
        .post('/api/verify-payment')
        .send({
          razorpay_order_id: 'order_1234567890',
          razorpay_payment_id: 'pay_1234567890',
          razorpay_signature: 'invalid_forged_signature_00000000000000000000000000000000'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/signature mismatch/i);
    });

    it('should return 200 and success when HMAC-SHA256 signature matches', async () => {
      const order_id = 'order_valid_123456';
      const payment_id = 'pay_valid_654321';
      const key_secret = process.env.RAZORPAY_KEY_SECRET;

      const validSignature = crypto
        .createHmac('sha256', key_secret)
        .update(`${order_id}|${payment_id}`)
        .digest('hex');

      const response = await request(app)
        .post('/api/verify-payment')
        .send({
          razorpay_order_id: order_id,
          razorpay_payment_id: payment_id,
          razorpay_signature: validSignature
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toMatch(/verified successfully/i);
      expect(response.body.data.razorpay_order_id).toBe(order_id);
      expect(response.body.data.razorpay_payment_id).toBe(payment_id);
    });
  });
});
