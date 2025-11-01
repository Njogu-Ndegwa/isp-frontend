# API Connection Issue - CORS Problem

## 🔴 Current Issue

The frontend cannot fetch data from your API because of **CORS (Cross-Origin Resource Sharing)** restrictions.

### Why it works in Postman but not in browser?

- ✅ **Postman**: No CORS restrictions
- ❌ **Browser**: Enforces CORS security (blocks cross-origin requests)

## ✅ Solution

Your **backend team** needs to add CORS headers to the API server.

📄 **Full instructions:** See `CORS-SETUP-GUIDE.md`

### Quick Backend Fix (Laravel example):

```bash
composer require fruitcake/laravel-cors
php artisan vendor:publish --tag="cors"
```

Edit `config/cors.php`:
```php
'paths' => ['api/*'],
'allowed_origins' => ['*'],  // Or your specific domain
'allowed_methods' => ['*'],
'allowed_headers' => ['*'],
```

## 🧪 Temporary Testing Workaround

**ONLY for local testing while waiting for backend fix:**

In `script.js`, change:
```javascript
const USE_CORS_PROXY = true; // Change from false to true
```

⚠️ **WARNING:** This is NOT for production! Must be `false` in production.

## 📋 Action Items

1. [ ] Send `CORS-SETUP-GUIDE.md` to backend team
2. [ ] Backend adds CORS headers to these endpoints:
   - `GET /api/plans?user_id=1`
   - `POST /api/hotspot/register-and-pay`
3. [ ] Test in browser (should work immediately)
4. [ ] Deploy backend changes to production
5. [ ] Ensure `USE_CORS_PROXY = false` in production

## 🔍 How to Verify CORS is Fixed

1. Open browser DevTools (F12) → Network tab
2. Reload the page
3. Click on the API request (`plans?user_id=1`)
4. Check Response Headers - should see:
   ```
   Access-Control-Allow-Origin: *
   Access-Control-Allow-Methods: GET, POST, OPTIONS
   ```

If you see these headers, CORS is configured correctly! ✅

## 📞 Need Help?

Contact your backend developer and share the `CORS-SETUP-GUIDE.md` file with them.

