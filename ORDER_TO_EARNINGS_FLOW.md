# Order to Earnings Flow - Complete System Flow

This document explains the complete flow from when a customer places an order until the store owner receives their earnings, covering both frontend and backend processes.

---

## Table of Contents
1. [Order Placement Flow](#1-order-placement-flow)
2. [Payment Processing Flow](#2-payment-processing-flow)
3. [Order Fulfillment Flow](#3-order-fulfillment-flow)
4. [Order Completion Flow](#4-order-completion-flow)
5. [Commission Calculation Flow](#5-commission-calculation-flow)
6. [Payout Generation Flow](#6-payout-generation-flow)
7. [Store Earnings Flow](#7-store-earnings-flow)

---

## 1. Order Placement Flow

### Frontend Flow

1. **Customer Browsing**
   - Customer navigates through available stores
   - Views store details, menu items, ratings, and reviews
   - Filters stores by category, location, or ratings

2. **Cart Management**
   - Customer adds items to cart
   - Cart stores items locally (localStorage) and on backend
   - Customer can view cart, update quantities, or remove items
   - Cart calculates subtotal, delivery charges, and total amount

3. **Checkout Process**
   - Customer selects delivery address
   - Applies promo codes or discounts (if available)
   - Selects payment method (Cash on Delivery, Online Payment, Wallet)
   - Reviews order summary including:
     - Items with quantities and prices
     - Subtotal
     - Delivery charges
     - Discounts applied
     - Final total amount

4. **Order Creation Request**
   - Frontend sends order creation request with:
     - Cart items (menuItemId, itemName, quantity, itemPrice)
     - Delivery address details
     - Payment method selected
     - Discount and promo code (if any)
     - Final calculated price

### Backend Flow

1. **Order Validation**
   - Validates authenticated user (must be customer role)
   - Validates cart items exist and are available
   - Validates store is active and available
   - Checks minimum order value
   - Validates delivery address

2. **Fraud Detection Checks**
   - Checks for multiple recent cancelled orders (flags if > 3 in 24 hours)
   - Validates order value against user's average order value
   - Checks for suspicious patterns

3. **Order Creation**
   - Creates Order document with:
     - User ID (from authentication)
     - Store ID (from menu items)
     - Order items (snapshot of menu items with prices)
     - Delivery address (snapshot)
     - Payment method
     - Order status: "Pending"
     - Final price (calculated: subtotal + delivery charge - discount)

4. **Cart Clearing**
   - Clears customer's cart after successful order creation
   - Updates cart status in database

5. **Notifications**
   - Sends notification to customer: "Order placed successfully"
   - Sends notification to store owner: "New order received"
   - Creates notification records in database

6. **Response**
   - Returns order details to frontend
   - Includes order ID, status, estimated delivery time

---

## 2. Payment Processing Flow

### Frontend Flow

1. **Payment Method Selection**
   - If Cash on Delivery: Order proceeds without immediate payment
   - If Online Payment: Redirects to payment gateway
   - If Wallet: Deducts from customer wallet balance

2. **Online Payment Gateway**
   - Customer redirected to payment gateway (Razorpay/Stripe/Paytm)
   - Customer completes payment
   - Payment gateway redirects back to application
   - Frontend receives payment confirmation

3. **Payment Status Update**
   - Frontend sends payment status update to backend
   - Displays payment success/failure message to customer

### Backend Flow

1. **Payment Record Creation**
   - Creates Payment document when order is created
   - Links payment to order, user, and store
   - Sets initial payment status:
     - Cash on Delivery: "pending"
     - Online Payment: "processing"
     - Wallet: "processing"

2. **Commission Calculation**
   - Retrieves store's commission rate (default: 10%)
   - Calculates commission amount: (order amount × commission rate) / 100
   - Calculates store payout amount: order amount - commission amount
   - Stores these values in payment record

3. **Payment Status Updates**
   - For Online Payment:
     - Updates status to "completed" after gateway confirmation
     - Stores transaction ID and gateway response
     - Marks payment as eligible for payout
   - For Cash on Delivery:
     - Status remains "pending" until order delivery
     - Updated to "completed" when order is delivered

4. **Order Status Update**
   - Updates order status to "Confirmed" when payment is completed
   - Links payment ID to order document

5. **Notifications**
   - Notifies customer: "Payment successful"
   - Notifies store owner: "Payment received for order"

---

## 3. Order Fulfillment Flow

### Frontend Flow

1. **Store Owner Dashboard**
   - Store owner views new orders in their dashboard
   - Sees order details: items, customer address, payment status
   - Can accept or reject orders

2. **Order Status Updates**
   - Store owner updates order status:
     - "Confirmed" - Order accepted
     - "OutForDelivery" - Order prepared and out for delivery
     - "Delivered" - Order delivered to customer
     - "Rejected" - Order rejected (with reason)
   - Customer sees real-time status updates

3. **Customer Tracking**
   - Customer can track order status in real-time
   - Receives notifications for each status change
   - Views estimated delivery time

### Backend Flow

1. **Order Status Management**
   - Validates store owner has permission to update order
   - Updates order status in database
   - Records status change timestamp

2. **Status-Specific Actions**
   - **Confirmed**: 
     - Order is accepted by store
     - Store starts preparing order
   - **OutForDelivery**:
     - Order is ready and assigned to delivery partner
     - Estimated delivery time is set
   - **Delivered**:
     - Order completion timestamp is recorded
     - Payment status updated (if COD)
     - Payment marked as eligible for payout

3. **Notifications**
   - Sends real-time notifications for each status change
   - Updates customer and store owner via WebSocket/notifications

4. **Order Rejection**
   - If store rejects order:
     - Order status set to "Rejected"
     - Rejection reason stored
     - Payment refunded (if already paid)
     - Customer notified

---

## 4. Order Completion Flow

### Frontend Flow

1. **Order Delivered Confirmation**
   - Customer receives delivery confirmation
   - Can rate and review the order
   - Can view order details and receipt

2. **Review Submission**
   - Customer can submit rating (1-5 stars)
   - Customer can write review text
   - Review is linked to order and store

### Backend Flow

1. **Order Completion Processing**
   - When order status changes to "Delivered":
     - Records delivery timestamp
     - Updates store statistics (total orders, times ordered)
     - Updates customer order history

2. **Payment Completion (COD)**
   - If payment method was Cash on Delivery:
     - Payment status updated to "completed"
     - Payment marked as eligible for payout
     - Commission and payout amounts finalized

3. **Review Processing**
   - Stores customer review and rating
   - Updates store's average rating
   - Updates store's total review count
   - Calculates new average rating

4. **Statistics Update**
   - Updates store metrics:
     - Total orders count
     - Total revenue
     - Average order value
   - Updates customer metrics:
     - Total orders placed
     - Total amount spent

---

## 5. Commission Calculation Flow

### Backend Flow

1. **Commission Rate Retrieval**
   - Each store has a commission rate (default: 10%)
   - Admin can set custom commission rate per store
   - Commission rate stored in Store model

2. **Commission Calculation (During Payment Creation)**
   - When payment record is created:
     - Commission Amount = (Order Amount × Commission Rate) / 100
     - Store Payout Amount = Order Amount - Commission Amount
   - Example:
     - Order Amount: ₹1000
     - Commission Rate: 10%
     - Commission Amount: ₹100
     - Store Payout Amount: ₹900

3. **Commission Storage**
   - Commission amount stored in Payment document
   - Used for platform revenue tracking
   - Used for payout calculations

4. **Commission Updates**
   - If order is cancelled/refunded:
     - Commission is not charged
     - Payment status updated to "refunded"
     - Payout status set to "cancelled"

---

## 6. Payout Generation Flow

### Frontend Flow

1. **Store Owner Earnings View**
   - Store owner views earnings dashboard
   - Sees:
     - Total earnings
     - Pending payouts
     - Completed payouts
     - Earnings breakdown by period

2. **Payout Request (Optional)**
   - Store owner can request payout for eligible earnings
   - Selects date range for payout
   - Views payout summary before requesting

3. **Payout Status Tracking**
   - Store owner tracks payout status:
     - Pending (awaiting admin approval)
     - Approved (admin approved)
     - Processing (transfer initiated)
     - Completed (money received)
     - Failed (transfer failed)

### Backend Flow

1. **Eligible Payments Identification**
   - System identifies payments eligible for payout:
     - Payment status: "completed"
     - Payout status: "eligible"
     - Not already included in a payout
     - Within specified date range

2. **Payout Generation (Admin/System)**
   - Admin or system generates payout for a store
   - Selects date range (periodStart to periodEnd)
   - Retrieves all eligible payments for that period
   - Creates Payout document with:
     - Store ID and Owner ID
     - Period start and end dates
     - List of payment IDs included
     - Total amount (sum of all payments)
     - Commission deducted (sum of all commissions)
     - Net payout amount (total - commission)
     - Order count
     - Status: "pending"

3. **Payout Calculation**
   - Calculates totals from eligible payments:
     - Total Amount = Sum of all payment amounts
     - Commission Deducted = Sum of all commission amounts
     - Net Payout Amount = Total Amount - Commission Deducted
     - Order Count = Number of payments included

4. **Payout Approval (Admin)**
   - Admin reviews payout request
   - Verifies payment records
   - Approves or rejects payout
   - If approved: Status changes to "approved"
   - Admin can add notes

5. **Payout Processing**
   - Admin initiates bank transfer
   - Updates payout with:
     - Transfer ID
     - Transfer method (NEFT/RTGS/IMPS/UPI)
     - Transfer response from bank
   - Status changes to "processing"

6. **Payout Completion**
   - After successful transfer:
     - Status changes to "completed"
     - Processed timestamp recorded
     - All included payments marked as:
       - Payout status: "completed"
       - Payout date: current date
   - Store owner notified of payout completion

7. **Payout Failure Handling**
   - If transfer fails:
     - Status changes to "failed"
     - Failure reason recorded
     - Payments remain eligible for retry
     - Admin can retry payout

---

## 7. Store Earnings Flow

### Frontend Flow

1. **Earnings Dashboard**
   - Store owner views comprehensive earnings dashboard
   - Displays:
     - Total earnings (all time)
     - Pending earnings (not yet in payout)
     - Completed payouts (money received)
     - Earnings by period (daily, weekly, monthly)
     - Commission breakdown
     - Order statistics

2. **Earnings Breakdown**
   - View earnings by:
     - Date range
     - Order status
     - Payment method
   - See detailed transaction history

3. **Payout History**
   - View all past payouts
   - See payout details:
     - Period covered
     - Number of orders
     - Total amount
     - Commission deducted
     - Net payout amount
     - Status and dates

### Backend Flow

1. **Earnings Calculation**
   - Real-time earnings calculated from payments:
     - Total Earnings = Sum of all storePayoutAmount where status = "completed"
     - Pending Earnings = Sum of storePayoutAmount where payoutStatus = "eligible"
     - Completed Payouts = Sum of netPayoutAmount from completed payouts

2. **Earnings Aggregation**
   - Aggregates earnings by:
     - Time period (day, week, month, year)
     - Store performance metrics
     - Commission analysis

3. **Statistics Tracking**
   - Maintains store statistics:
     - Total orders count
     - Total revenue (sum of all order amounts)
     - Total earnings (sum of all payouts)
     - Average order value
     - Commission paid
     - Payout frequency

4. **Reporting**
   - Generates earnings reports for:
     - Store owners (their own earnings)
     - Admins (all stores earnings)
   - Includes charts and analytics

---

## Complete Flow Summary

### Customer Journey
1. Browse stores → Add to cart → Checkout → Place order
2. Make payment (if online) → Track order → Receive delivery
3. Rate and review → View order history

### Store Owner Journey
1. Receive order notification → Accept order → Prepare order
2. Update status to "OutForDelivery" → Order delivered
3. Payment completed → Earnings accumulate → Payout generated
4. Admin approves → Transfer processed → Money received

### Platform Journey
1. Order created → Payment processed → Commission calculated
2. Order fulfilled → Payment completed → Payout eligible
3. Payout generated → Admin approves → Transfer completed
4. Platform receives commission → Store receives earnings

### Key Data Flow
- **Order** → Contains order details, status, customer info
- **Payment** → Contains payment details, commission, payout amount
- **Payout** → Contains aggregated payments, net amount, transfer details
- **Store Statistics** → Contains earnings, orders, revenue metrics

---

## Important Notes

1. **Payment Methods**
   - Cash on Delivery: Payment completed when order is delivered
   - Online Payment: Payment completed immediately via gateway
   - Wallet: Payment deducted from customer wallet balance

2. **Commission**
   - Calculated at payment creation time
   - Based on store's commission rate
   - Deducted from order amount
   - Platform's revenue source

3. **Payout Eligibility**
   - Payments become eligible when:
     - Payment status is "completed"
     - Order is delivered (for COD)
     - No refunds or cancellations

4. **Payout Frequency**
   - Can be generated manually by admin
   - Can be automated (weekly, bi-weekly, monthly)
   - Based on store's payout schedule

5. **Refunds and Cancellations**
   - If order cancelled before delivery: Full refund
   - If order cancelled after delivery: Partial refund (case by case)
   - Commission not charged on refunded orders
   - Payout status updated to "cancelled"

---

## Status Flow Diagram

```
Order Status Flow:
Pending → Confirmed → OutForDelivery → Delivered
  ↓         ↓
Rejected  Cancelled

Payment Status Flow:
pending → processing → completed → (eligible for payout)
  ↓
failed/refunded/cancelled

Payout Status Flow:
pending → approved → processing → completed
  ↓
failed/cancelled
```

---

This flow ensures transparency, proper commission calculation, and timely payouts to store owners while maintaining platform revenue through commissions.

