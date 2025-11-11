# Test Suite for Order to Earnings Flow

This directory contains comprehensive tests for the Order → Payment → Commission → Payout → Earnings flow.

## Test Structure

### Unit Tests (`unit/`)
- `order.test.js` - Tests order creation, payment auto-creation, and status updates

### Integration Tests (`integration/`)
- `order-to-payout.test.js` - Tests the complete end-to-end flow from order creation to payout completion

### Utilities (`utils/`)
- `data-consistency-validator.js` - Validates data consistency between Orders, Payments, and Payouts

## Running Tests

### Setup
```bash
npm install --save-dev jest mongoose
```

### Run Unit Tests
```bash
npm test -- tests/unit/order.test.js
```

### Run Integration Tests
```bash
npm test -- tests/integration/order-to-payout.test.js
```

### Run Data Consistency Validator
```bash
node tests/utils/data-consistency-validator.js
```

## Test Coverage

### Order Creation
- ✅ Order creation with payment auto-creation
- ✅ Commission calculation on final amount
- ✅ Payment linking to order

### Order Status Updates
- ✅ Payment marked as completed when order is delivered
- ✅ Payment marked as eligible for payout on delivery
- ✅ Payment cancelled when order is rejected

### Payout Flow
- ✅ Payout generation with eligible payments
- ✅ Payout totals calculation
- ✅ Duplicate payment prevention
- ✅ Payment status updates on payout completion

### Data Consistency
- ✅ Order-Payment relationships
- ✅ Payment-Payout relationships
- ✅ Commission and payout amount calculations
- ✅ Status consistency checks

## Test Scenarios

### Scenario 1: Complete Flow
1. Customer places order
2. Payment is auto-created
3. Store accepts and delivers order
4. Payment is marked as completed and eligible
5. Admin generates payout
6. Admin approves payout
7. Admin completes payout
8. Payments are marked as completed

### Scenario 2: Order Rejection
1. Customer places order
2. Payment is auto-created
3. Store rejects order
4. Payment is cancelled

### Scenario 3: Commission Calculation
1. Order with discount
2. Commission calculated on final amount (after discount)
3. Store payout = final amount - commission

## Notes

- Tests use a test database (configure in test setup)
- All test data is cleaned up after tests
- Tests validate both happy path and error scenarios
- Data consistency validator can be run independently to check production data

