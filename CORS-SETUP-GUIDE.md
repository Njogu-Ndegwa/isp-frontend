# CORS Setup Guide for Backend API

## The Problem

The frontend can't fetch data from `https://isp.bitwavetechnologies.com/api/` because the backend doesn't have CORS (Cross-Origin Resource Sharing) headers configured.

**Error in Browser:**
```
GET https://isp.bitwavetechnologies.com/api/plans?user_id=1 
net::ERR_QUIC_PROTOCOL_ERROR.QUIC_NETWORK_IDLE_TIMEOUT
```

**Why Postman Works:**
Postman doesn't enforce browser CORS policies, so the API works there. But browsers block cross-origin requests for security.

---

## Solution: Add CORS Headers to Backend

Your backend needs to send these HTTP headers in **all API responses**:

### Required CORS Headers:

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Accept, Authorization
Access-Control-Max-Age: 86400
```

### For Production (More Secure):

Instead of `*`, specify your frontend domain:

```http
Access-Control-Allow-Origin: https://isp-frontend-two.vercel.app
Access-Control-Allow-Credentials: true
```

---

## Implementation Examples

### Laravel (PHP)

**Option 1: Using Laravel CORS Package (Recommended)**

1. Install the package:
```bash
composer require fruitcake/laravel-cors
```

2. Publish config:
```bash
php artisan vendor:publish --tag="cors"
```

3. Edit `config/cors.php`:
```php
return [
    'paths' => ['api/*'],
    'allowed_methods' => ['*'],
    'allowed_origins' => ['*'], // Or specific: ['https://isp-frontend-two.vercel.app']
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => false,
];
```

4. Add middleware to `app/Http/Kernel.php`:
```php
protected $middleware = [
    // ...
    \Fruitcake\Cors\HandleCors::class,
];
```

**Option 2: Manual Middleware**

Create `app/Http/Middleware/Cors.php`:
```php
<?php

namespace App\Http\Middleware;

use Closure;

class Cors
{
    public function handle($request, Closure $next)
    {
        return $next($request)
            ->header('Access-Control-Allow-Origin', '*')
            ->header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
            ->header('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, X-Requested-With');
    }
}
```

Register in `app/Http/Kernel.php`:
```php
protected $routeMiddleware = [
    // ...
    'cors' => \App\Http\Middleware\Cors::class,
];
```

Apply to routes in `routes/api.php`:
```php
Route::middleware(['cors'])->group(function () {
    Route::get('/plans', [PlanController::class, 'index']);
    Route::post('/hotspot/register-and-pay', [HotspotController::class, 'registerAndPay']);
});
```

---

### Node.js/Express

Install CORS package:
```bash
npm install cors
```

Add to your server:
```javascript
const express = require('express');
const cors = require('cors');
const app = express();

// Enable CORS for all routes
app.use(cors());

// Or configure specific options
app.use(cors({
    origin: '*', // Or: 'https://isp-frontend-two.vercel.app'
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization']
}));

// Your API routes
app.get('/api/plans', (req, res) => { /* ... */ });
app.post('/api/hotspot/register-and-pay', (req, res) => { /* ... */ });
```

---

### Python/Flask

Install Flask-CORS:
```bash
pip install flask-cors
```

Add to your app:
```python
from flask import Flask
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Or configure specific options
CORS(app, resources={
    r"/api/*": {
        "origins": "*",  # Or: "https://isp-frontend-two.vercel.app"
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Accept", "Authorization"]
    }
})

@app.route('/api/plans')
def get_plans():
    # Your code
    pass
```

---

### Python/Django

Install django-cors-headers:
```bash
pip install django-cors-headers
```

Add to `settings.py`:
```python
INSTALLED_APPS = [
    # ...
    'corsheaders',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    # ...
]

# Allow all origins (development)
CORS_ALLOW_ALL_ORIGINS = True

# Or specify origins (production)
CORS_ALLOWED_ORIGINS = [
    "https://isp-frontend-two.vercel.app",
]

CORS_ALLOW_METHODS = [
    'DELETE',
    'GET',
    'OPTIONS',
    'PATCH',
    'POST',
    'PUT',
]

CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]
```

---

## Testing CORS Configuration

### 1. Check Headers in Browser DevTools

After backend changes, open browser DevTools (F12) → Network tab → Reload page → Click on API request → Check Response Headers:

Should see:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Accept
```

### 2. Test with cURL

```bash
curl -H "Origin: https://isp-frontend-two.vercel.app" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     --verbose \
     https://isp.bitwavetechnologies.com/api/plans?user_id=1
```

Should return CORS headers in response.

---

## Important: Handle OPTIONS Preflight Requests

Browsers send an OPTIONS request before the actual request. Your backend must respond to OPTIONS with:

```http
HTTP/1.1 200 OK
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Accept
```

Most CORS packages handle this automatically.

---

## Quick Checklist for Backend Developer

- [ ] Install CORS package for your framework
- [ ] Configure CORS to allow your frontend domain (or `*` for testing)
- [ ] Enable for these endpoints:
  - `GET /api/plans?user_id=1`
  - `POST /api/hotspot/register-and-pay`
- [ ] Ensure OPTIONS requests return 200 OK with CORS headers
- [ ] Test in browser (not just Postman)
- [ ] Deploy changes to production

---

## After Backend Fix

Once CORS is configured on the backend, the frontend will work immediately without any code changes. Just reload the page!

---

## Questions?

Contact the frontend developer or check browser console for specific CORS error messages.

