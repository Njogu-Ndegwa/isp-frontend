# Auto-Login Flow Documentation

## Overview

After payment is confirmed, the system automatically logs the user into the MikroTik hotspot using their MAC address as credentials. This document explains the complete flow.

---

## Complete Payment & Login Flow

### Step 1: User Initiates Payment

1. User selects a plan
2. Enters phone number (e.g., `0795635364`)
3. Clicks "Continue to Payment"

**Frontend:**
- Formats phone to `254795635364`
- Sends POST request to `/api/hotspot/register-and-pay`

**Payload:**
```json
{
  "phone": "254795635364",
  "plan_id": 1,
  "mac_address": "E8:84:A5:05:06:DB",
  "router_id": 2,
  "payment_method": "mobile_money"
}
```

**Backend Response:**
```json
{
  "success": true,
  "message": "Payment request sent",
  "customer_id": 123,
  "transaction_id": "TXN123456"
}
```

---

### Step 2: M-Pesa Prompt Sent

**User sees:**
```
📱 M-Pesa Prompt Sent!

📋 Payment Details:
• Plan: 1 Hour
• Amount: KSH 50/-
• Phone: 254795635364

⚡ Next Steps:
1. Check your phone for M-Pesa prompt
2. Enter your M-Pesa PIN
3. Wait for confirmation (this may take up to 30 seconds)

🔄 Checking payment status...
Don't close this page
```

**What happens:**
- User receives M-Pesa STK push on their phone
- User enters PIN
- M-Pesa processes payment

---

### Step 3: Frontend Polls Payment Status

**Polling Configuration:**
- Interval: Every 2 seconds
- Max attempts: 30 (60 seconds total)
- Endpoint: `GET /api/hotspot/payment-status/{customer_id}`

**Console Output:**
```
🔄 Starting payment status polling...
📋 Customer ID: 123
🔍 Polling attempt 1/30...
📊 Payment status: { payment_complete: false }
⏳ Payment not yet complete. Retrying in 2s...
🔍 Polling attempt 2/30...
📊 Payment status: { payment_complete: false }
⏳ Payment not yet complete. Retrying in 2s...
...
🔍 Polling attempt 5/30...
📊 Payment status: { 
  payment_complete: true, 
  hotspot_login: {
    username: "E8:84:A5:05:06:DB",
    password: "E8:84:A5:05:06:DB"
  }
}
✅ Payment confirmed!
🔐 Login credentials: {...}
👤 Username: E8:84:A5:05:06:DB
🔑 Password: E8:84:A5:05:06:DB
```

---

### Step 4: Payment Confirmed

**Backend Response:**
```json
{
  "payment_complete": true,
  "transaction_id": "MPX123456789",
  "hotspot_login": {
    "username": "E8:84:A5:05:06:DB",
    "password": "E8:84:A5:05:06:DB"
  }
}
```

**User sees:**
```
✅ Payment Successful!

Your 1 Hour plan is now active!
Confirmation sent to 254795635364

🔐 Logging you in...
[Spinner animation]
Please wait, you'll be connected automatically...
```

---

### Step 5: Auto-Login to Hotspot

**Frontend Action:**
1. Creates hidden form with:
   - `username`: MAC address (e.g., `E8:84:A5:05:06:DB`)
   - `password`: MAC address (same as username)
   - `dst`: Original destination URL
2. Submits form to `/login` (MikroTik endpoint)

**Form Data:**
```html
<form method="POST" action="/login" style="display: none;">
  <input type="hidden" name="username" value="E8:84:A5:05:06:DB">
  <input type="hidden" name="password" value="E8:84:A5:05:06:DB">
  <input type="hidden" name="dst" value="http://www.msftconnecttest.com/redirect">
</form>
```

**Console Output:**
```
🔐 Auto-logging in to hotspot...
👤 Username: E8:84:A5:05:06:DB
🔑 Password: E8:84:A5:05:06:DB
📤 Submitting login form...
```

---

### Step 6: User Connected

**What happens:**
1. MikroTik receives login credentials
2. Authenticates user (MAC matches)
3. User is granted internet access
4. Page redirects to original destination
5. User can browse internet for purchased duration

**MikroTik User Entry:**
- Username: `E8:84:A5:05:06:DB`
- Password: `E8:84:A5:05:06:DB`
- Time Limit: Based on plan (e.g., 1 hour)
- Authentication: Regular (not IP bypass)

---

## Error Handling

### Scenario 1: User Cancels M-Pesa

**Backend Response:**
```json
{
  "payment_complete": false,
  "status": "cancelled"
}
```

**Frontend:**
- Continues polling for max attempts
- After 60 seconds, shows timeout error
- User can try again

### Scenario 2: Insufficient Balance

**Backend Response:**
```json
{
  "payment_complete": false,
  "status": "failed",
  "error": "Insufficient balance"
}
```

**Frontend:**
- Shows error message
- Suggests common issues
- Allows retry

### Scenario 3: Network Timeout

**Frontend:**
- Catches timeout error
- Shows user-friendly message
- Provides support contact

**User sees:**
```
✕ Oops! Something Went Wrong

Payment verification timeout. Please check M-Pesa 
and refresh the page.

Common Issues:
• Insufficient M-Pesa balance
• Wrong PIN entered
• Transaction cancelled
• Network timeout

💡 Need help? Call support: 1-800-HOTSPOT
```

---

## Backend Requirements

### Payment Status Endpoint

**Endpoint:** `GET /api/hotspot/payment-status/{customer_id}`

**Required Response Format:**
```json
{
  "payment_complete": true,
  "transaction_id": "MPX123456789",
  "hotspot_login": {
    "username": "E8:84:A5:05:06:DB",
    "password": "E8:84:A5:05:06:DB"
  }
}
```

**Important:**
- `payment_complete`: Boolean (true/false)
- `hotspot_login`: Object with username and password
- Username and password should be the MAC address
- Response must be returned quickly (< 500ms)

### CORS Configuration

Add payment status endpoint to CORS:
```php
// Laravel example
'paths' => [
    'api/plans',
    'api/hotspot/register-and-pay',
    'api/hotspot/payment-status/*'  // Add this
],
```

### MikroTik Configuration

**Authentication Type:** Regular (not IP bypass)

**Why?**
- IP bypass: User automatically gets internet (no login)
- Regular auth: User must login with credentials (what we use)

**How Backend Creates User:**
```
Username: MAC address (e.g., E8:84:A5:05:06:DB)
Password: Same as MAC address
Time Limit: Based on plan
```

---

## Testing Checklist

### Before Testing

- [ ] Backend CORS configured for all endpoints
- [ ] MikroTik walled garden includes backend domain
- [ ] `ROUTER_ID` configured in `script.js`
- [ ] MikroTik authentication set to "regular"
- [ ] Remove old test users from MikroTik

### Testing Steps

1. **Connect to WiFi** (don't login)
2. **Browser redirects** to captive portal
3. **Select a plan**
4. **Enter phone number** (test number)
5. **Click "Continue to Payment"**
6. **Check console logs:**
   ```
   💳 Processing payment...
   📞 Phone (formatted): 254...
   ✅ Payment initiated
   🔄 Starting payment status polling...
   ```
7. **See pending message** on screen
8. **Backend confirms payment**
9. **See success message**
10. **Auto-login happens**
11. **User connected** to internet ✅

### Verify Connection

After auto-login:
- [ ] User can browse internet
- [ ] User appears in MikroTik Active Users
- [ ] Username shows MAC address
- [ ] Time limit is counting down
- [ ] After time expires, user disconnected

---

## Troubleshooting

### Issue: Polling Never Finds Payment

**Check:**
1. Customer ID returned from payment endpoint
2. Backend updates payment status
3. Payment status endpoint returns correct format
4. CORS allows GET requests

**Debug:**
```javascript
console.log('Customer ID:', customerId);
// Should see a number, not undefined
```

### Issue: Auto-Login Doesn't Work

**Check:**
1. `hotspot_login` object exists in response
2. Username/password match MAC address
3. MikroTik user was created in backend
4. MikroTik authentication is "regular"
5. Form submits to correct `/login` endpoint

**Debug:**
```javascript
console.log('Login credentials:', data.hotspot_login);
// Should see: { username: "...", password: "..." }
```

### Issue: User Not Created in MikroTik

**Backend must:**
1. Create hotspot user after payment confirmed
2. Use MAC address as username/password
3. Set time limit based on plan
4. Use regular authentication (not IP bypass)

---

## Console Log Reference

**Full successful flow:**
```
💳 Processing payment...
📞 Phone (original): 0795635364
📞 Phone (formatted): 254795635364
📦 Plan: {...}
🔧 MAC: E8:84:A5:05:06:DB
🆔 Router ID: 2
📤 Sending payment request: {...}
✅ Payment initiated: { customer_id: 123 }
🔄 Starting payment status polling...
📋 Customer ID: 123
🔍 Polling attempt 1/30...
📊 Payment status: { payment_complete: false }
⏳ Payment not yet complete. Retrying in 2s...
🔍 Polling attempt 3/30...
📊 Payment status: { payment_complete: true, hotspot_login: {...} }
✅ Payment confirmed!
🔐 Login credentials: { username: "E8:84:A5:05:06:DB", password: "E8:84:A5:05:06:DB" }
👤 Username: E8:84:A5:05:06:DB
🔑 Password: E8:84:A5:05:06:DB
🔐 Auto-logging in to hotspot...
📤 Submitting login form...
[Page redirects to internet]
```

---

## Key Differences from IP Bypass

| Feature | IP Bypass (Old) | Regular Auth (New) |
|---------|-----------------|-------------------|
| User creation | Backend bypasses IP | Backend creates hotspot user |
| Authentication | Automatic | Requires login form |
| Credentials | Not needed | MAC as username/password |
| Auto-login | Not needed | Frontend submits login form |
| Time limits | May not work properly | Works correctly |
| User management | Harder to track | Easy to see in MikroTik |

---

**Last Updated:** After implementing auto-login with regular authentication

