# Backend Requirements for Auto-Login

## ⚠️ CRITICAL FIX REQUIRED

Your backend **MUST** include the `login_url` field in the payment status response.

---

## Payment Status Endpoint

**Endpoint:** `GET /api/hotspot/payment-status/{customer_id}`

### Required Response Format

```json
{
  "payment_complete": true,
  "transaction_id": "MPX123456789",
  "hotspot_login": {
    "username": "E8:84:A5:05:06:DB",
    "password": "E8:84:A5:05:06:DB",
    "login_url": "http://192.168.88.1/login"
  }
}
```

### Field Requirements

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `payment_complete` | Boolean | ✅ Yes | Whether payment is confirmed | `true` |
| `transaction_id` | String | ✅ Yes | M-Pesa transaction ID | `"MPX123456789"` |
| `hotspot_login.username` | String | ✅ Yes | MAC address (without colons) | `"E8:84:A5:05:06:DB"` |
| `hotspot_login.password` | String | ✅ Yes | Same as username | `"E8:84:A5:05:06:DB"` |
| `hotspot_login.login_url` | String | ✅ **CRITICAL** | Full URL to router login | `"http://192.168.88.1/login"` |

---

## How to Generate `login_url`

The `login_url` is the MikroTik router's login endpoint URL.

### Example Backend Logic (Laravel/PHP)

```php
// When payment is confirmed
$customer = Customer::find($customer_id);
$router = Router::find($customer->router_id);

// Create hotspot user in MikroTik
$hotspot_username = str_replace(':', '', $customer->mac_address); // E8:84:A5:05:06:DB → E8:84:A5:05:06:DB
$hotspot_password = $hotspot_username; // Same as username

// Construct login URL from router configuration
$login_url = "http://{$router->ip_address}/login";
// Example: http://192.168.88.1/login

return response()->json([
    'payment_complete' => true,
    'transaction_id' => $customer->transaction_id,
    'hotspot_login' => [
        'username' => $hotspot_username,
        'password' => $hotspot_password,
        'login_url' => $login_url  // ✅ CRITICAL FIELD
    ]
]);
```

### Example Backend Logic (Node.js)

```javascript
// When payment is confirmed
const customer = await Customer.findById(customerId);
const router = await Router.findById(customer.router_id);

// Create hotspot user credentials
const hotspotUsername = customer.mac_address.replace(/:/g, ''); // Remove colons
const hotspotPassword = hotspotUsername;

// Construct login URL
const loginUrl = `http://${router.ip_address}/login`;
// Example: http://192.168.88.1/login

return {
  payment_complete: true,
  transaction_id: customer.transaction_id,
  hotspot_login: {
    username: hotspotUsername,
    password: hotspotPassword,
    login_url: loginUrl  // ✅ CRITICAL FIELD
  }
};
```

---

## Database Schema Requirements

Your `routers` table should have:

```sql
CREATE TABLE routers (
  id INT PRIMARY KEY,
  name VARCHAR(255),
  ip_address VARCHAR(15),  -- e.g., '192.168.88.1'
  api_port INT DEFAULT 8728,
  api_user VARCHAR(255),
  api_password VARCHAR(255),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

Example data:
```
id: 2
name: "Main MikroTik"
ip_address: "192.168.88.1"
```

Then construct: `login_url = "http://192.168.88.1/login"`

---

## Why This Is Critical

### ❌ What Happens Without `login_url`

1. Frontend receives payment confirmation
2. Tries to auto-login
3. Error: "Login configuration missing"
4. User must manually login (bad UX)

**Console Error:**
```
❌ No login URL provided by backend
Error: Login configuration missing. Please contact support.
```

### ✅ What Happens With `login_url`

1. Frontend receives payment confirmation
2. Auto-submits login form to `http://192.168.88.1/login`
3. User is automatically authenticated
4. Browser redirects to internet
5. User connected! (seamless UX)

**Console Success:**
```
🔐 Auto-logging in to hotspot...
🌐 Login URL: http://192.168.88.1/login
📤 Submitting login form to MikroTik router...
✅ User connected!
```

---

## How the Auto-Login Works

### Technical Flow

1. **Frontend polls** payment status endpoint
2. **Backend returns** login credentials + URL
3. **Frontend creates** hidden HTML form:
   ```html
   <form method="POST" action="http://192.168.88.1/login">
     <input name="username" value="E8:84:A5:05:06:DB">
     <input name="password" value="E8:84:A5:05:06:DB">
     <input name="dst" value="http://google.com">
   </form>
   ```
4. **Form submits** to router (192.168.88.1)
5. **Router authenticates** user
6. **Router redirects** to destination (google.com)
7. **User has internet** ✅

### Why `login_url` Must Be Full URL

- ❌ **Wrong:** `"/login"` → Submits to `https://isp-frontend-two.vercel.app/login` (doesn't exist)
- ✅ **Correct:** `"http://192.168.88.1/login"` → Submits to router's local IP

**User's device is on the WiFi network**, so it can reach `192.168.88.1` even though they don't have internet yet!

---

## Testing Checklist

Before user testing:

- [ ] Backend returns `login_url` in payment status response
- [ ] `login_url` is full URL format: `http://192.168.88.1/login`
- [ ] Router IP in `login_url` matches actual router IP
- [ ] Hotspot user is created in MikroTik
- [ ] MikroTik authentication is set to "regular"

Test with console:
```javascript
// After payment, check response:
console.log(response.hotspot_login);
// Must show:
// {
//   username: "E8:84:A5:05:06:DB",
//   password: "E8:84:A5:05:06:DB",
//   login_url: "http://192.168.88.1/login"  ← CHECK THIS!
// }
```

---

## Common Mistakes

### ❌ Mistake 1: Omitting `login_url`

```json
{
  "hotspot_login": {
    "username": "E8:84:A5:05:06:DB",
    "password": "E8:84:A5:05:06:DB"
    // Missing login_url!
  }
}
```

**Result:** Frontend throws error, auto-login fails.

### ❌ Mistake 2: Relative URL

```json
{
  "hotspot_login": {
    "login_url": "/login"  // Wrong!
  }
}
```

**Result:** Form submits to Vercel (frontend domain), not router.

### ❌ Mistake 3: HTTPS Instead of HTTP

```json
{
  "hotspot_login": {
    "login_url": "https://192.168.88.1/login"  // Wrong!
  }
}
```

**Result:** May cause SSL errors (most MikroTik routers use HTTP).

### ✅ Correct Format

```json
{
  "hotspot_login": {
    "username": "E8:84:A5:05:06:DB",
    "password": "E8:84:A5:05:06:DB",
    "login_url": "http://192.168.88.1/login"  // Perfect!
  }
}
```

---

## Multiple Routers Support

If you have multiple routers, the `login_url` is constructed dynamically:

```php
// Router 1 (ID: 2)
Router::find(2)->ip_address;  // 192.168.88.1
login_url = "http://192.168.88.1/login"

// Router 2 (ID: 3)
Router::find(3)->ip_address;  // 192.168.1.1
login_url = "http://192.168.1.1/login"

// Router 3 (ID: 4)
Router::find(4)->ip_address;  // 10.0.0.1
login_url = "http://10.0.0.1/login"
```

Frontend doesn't need to know which router - backend provides the correct URL!

---

## Summary

### What Backend Must Do

1. ✅ Accept payment from M-Pesa
2. ✅ Create hotspot user in MikroTik
3. ✅ Store transaction details
4. ✅ Return payment status with `login_url`

### Response Template (Copy This!)

```json
{
  "payment_complete": true,
  "transaction_id": "MPX123456789",
  "hotspot_login": {
    "username": "E884A5A50506DB",
    "password": "E884A5A50506DB",
    "login_url": "http://192.168.88.1/login"
  }
}
```

### One Line of Code to Add

If you're missing `login_url`, add this to your response:

```php
'login_url' => "http://{$router->ip_address}/login"
```

That's it! 🎉

---

**Questions?** 
- Check console logs during payment flow
- Verify `login_url` is in the response
- Test with browser DevTools Network tab

