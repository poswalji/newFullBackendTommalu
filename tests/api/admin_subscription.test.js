const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const User = require('../../models/user');
const SubscriptionPlan = require('../../models/subscriptionPlanSchema');
const SubscriptionRequest = require('../../models/subscriptionRequestSchema');
const Subscription = require('../../models/subscriptionSchema');
const SubscriptionPriceLog = require('../../models/subscriptionPriceLogSchema');

describe('Admin Subscription Management', () => {
    let adminToken;
    let customerToken;
    let adminUser;
    let customerUser;
    let planId;
    let subscriptionId;
    let requestId;

    beforeAll(async () => {
        console.log('DEBUG: Starting beforeAll');
        console.log('DEBUG: MONGO_URI from env:', process.env.MONGO_URI);
        console.log('DEBUG: Mongoose Connection State:', mongoose.connection.readyState);

        // Create Admin User
        try {
            adminUser = await User.create({
                name: 'Admin User',
                email: 'admin@test.com',
                password: 'password123',
                role: 'admin',
                phone: '9999999999'
            });
            console.log('DEBUG: Admin User Created', adminUser._id);
        } catch (e) {
            console.error('DEBUG: Failed to create admin', e);
        }

        // Create Customer User
        try {
            customerUser = await User.create({
                name: 'Customer User',
                email: 'customer@test.com',
                password: 'password123',
                role: 'customer',
                phone: '8888888888'
            });
            console.log('DEBUG: Customer User Created', customerUser._id);
        } catch (e) {
            console.error('DEBUG: Failed to create customer', e);
        }

        // Login Admin
        try {
            const adminLogin = await request(app)
                .post('/api/auth/login')
                .send({ email: 'admin@test.com', password: 'password123' });
            adminToken = adminLogin.body.token;
            console.log('DEBUG: Admin Token obtained', !!adminToken);
        } catch (e) {
            console.error('DEBUG: Admin login failed', e);
        }

        // Login Customer
        try {
            const customerLogin = await request(app)
                .post('/api/auth/login')
                .send({ email: 'customer@test.com', password: 'password123' });
            customerToken = customerLogin.body.token;
            console.log('DEBUG: Customer Token obtained', !!customerToken);
        } catch (e) {
            console.error('DEBUG: Customer login failed', e);
        }

        // Create Subscription Plan
        try {
            const plan = await SubscriptionPlan.create({
                title: 'Test Plan',
                price: 3000,
                planType: 'lunch',
                description: 'Test Description',
                features: ['Roti', 'Sabji']
            });
            planId = plan._id;
            console.log('DEBUG: Plan Created', planId);
        } catch (e) {
            console.error('DEBUG: Plan creation failed', e);
        }
    });

    afterAll(async () => {
        await User.deleteMany({});
        await SubscriptionPlan.deleteMany({});
        await SubscriptionRequest.deleteMany({});
        await Subscription.deleteMany({});
        await SubscriptionPriceLog.deleteMany({});
    });

    // 1. Customer creates a request
    it('should allow customer to create a subscription request', async () => {
        console.log('DEBUG: executing test 1');
        const res = await request(app)
            .post('/api/subscriptions/request')
            .set('Authorization', `Bearer ${customerToken}`)
            .send({
                planId: planId,
                customerName: 'Test Customer',
                mobileNumber: '8888888888',
                deliveryAddress: {
                    street: '123 St',
                    city: 'Test City',
                    pincode: '123456'
                },
                startDate: new Date().toISOString(),
                quantity: 1,
                rotiPreference: 'Startdard'
            });

        if (res.statusCode !== 201) {
            console.log('DEBUG: Test 1 Failed response:', JSON.stringify(res.body, null, 2));
        }

        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);
        requestId = res.body.data._id;
    });

    // 2. Admin views requests
    it('should allow admin to view pending requests', async () => {
        const res = await request(app)
            .get('/api/subscriptions/requests?status=pending')
            .set('Authorization', `Bearer ${adminToken}`);

        if (res.statusCode !== 200) console.log('DEBUG: Test 2 failed', res.body);
        expect(res.statusCode).toBe(200);
        expect(res.body.data.length).toBeGreaterThan(0);
        expect(res.body.data[0]._id).toBe(requestId);
    });

    // 3. Admin approves request
    it('should allow admin to approve request', async () => {
        const res = await request(app)
            .post(`/api/subscriptions/requests/${requestId}/approve`)
            .set('Authorization', `Bearer ${adminToken}`);

        if (res.statusCode !== 200) console.log('DEBUG: Test 3 failed', res.body);
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBe('active');
        subscriptionId = res.body.data._id;

        // Verify request is updated
        const reqUpdate = await SubscriptionRequest.findById(requestId);
        expect(reqUpdate.status).toBe('approved');
    });

    // 4. Admin views active subscriptions
    it('should allow admin to view active subscriptions', async () => {
        const res = await request(app)
            .get('/api/subscriptions?status=active')
            .set('Authorization', `Bearer ${adminToken}`);

        if (res.statusCode !== 200) console.log('DEBUG: Test 4 failed', res.body);
        expect(res.statusCode).toBe(200);
        expect(res.body.data.length).toBeGreaterThan(0);
        const found = res.body.data.find(s => s._id === subscriptionId);
        expect(found).toBeDefined();
    });

    // 5. Admin updates period
    it('should allow admin to update subscription period', async () => {
        const newEndDate = new Date();
        newEndDate.setDate(newEndDate.getDate() + 40); // Extend

        const res = await request(app)
            .patch(`/api/subscriptions/${subscriptionId}/period`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                endDate: newEndDate.toISOString()
            });

        if (res.statusCode !== 200) console.log('DEBUG: Test 5 failed', res.body);
        expect(res.statusCode).toBe(200);
        const updatedSub = await Subscription.findById(subscriptionId);
        // Rough check on date equality
        expect(new Date(updatedSub.endDate).getDate()).toBe(newEndDate.getDate());
    });

    // 6. Admin updates price
    it('should allow admin to update price and log it', async () => {
        const newPrice = 3500;
        const res = await request(app)
            .patch(`/api/subscriptions/${subscriptionId}/price`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                newPrice: newPrice
            });

        if (res.statusCode !== 200) console.log('DEBUG: Test 6 failed', res.body);
        expect(res.statusCode).toBe(200);
        expect(res.body.data.price).toBe(newPrice);

        // Verify Log
        const log = await SubscriptionPriceLog.findOne({ subscriptionId });
        expect(log).toBeTruthy();
        expect(log.oldPrice).toBe(3000);
        expect(log.newPrice).toBe(3500);
        expect(log.updatedBy.toString()).toBe(adminUser._id.toString());
    });

});
