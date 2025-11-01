# MikroTik Walled Garden Setup for Captive Portal

## 🎯 Problem

Users redirected by MikroTik hotspot cannot load plans because the backend API is blocked by the walled garden.

**Error when accessing through hotspot:**
```
net::ERR_QUIC_PROTOCOL_ERROR.QUIC_NETWORK_IDLE_TIMEOUT
```

**Works fine when accessed with regular internet** (bypassing hotspot).

---

## ✅ Solution: Configure Walled Garden

Your captive portal needs access to BOTH:
1. ✅ Frontend (Vercel) - Already configured
2. ❌ Backend API - **NEEDS TO BE ADDED**

---

## 🔧 MikroTik Configuration

### Option 1: Web Interface (WinBox)

1. Open WinBox and connect to your MikroTik router
2. Go to: **IP → Hotspot → Walled Garden**
3. Click **[+]** to add new entry

Add these entries:

**For Backend API:**
```
Dst. Host: isp.bitwavetechnologies.com
Action: allow
```

**For Frontend (if not already added):**
```
Dst. Host: isp-frontend-two.vercel.app
Action: allow
```

```
Dst. Host: *.vercel.app
Action: allow
```

**For Vercel Edge Network (Important!):**
```
Dst. Host: *.vercel-dns.com
Action: allow
```

### Option 2: Terminal/SSH Commands

Connect via SSH and run:

```bash
# Add backend API to walled garden
/ip hotspot walled-garden
add dst-host=isp.bitwavetechnologies.com action=allow comment="ISP Backend API"

# Add frontend domains (if not already added)
add dst-host=isp-frontend-two.vercel.app action=allow comment="ISP Frontend"
add dst-host=*.vercel.app action=allow comment="Vercel CDN"
add dst-host=*.vercel-dns.com action=allow comment="Vercel DNS"

# Verify entries
print
```

---

## 🌐 Additional Domains to Add (Important!)

Since you're using Vercel, you also need to allow their CDN and infrastructure:

```bash
# Vercel infrastructure
/ip hotspot walled-garden
add dst-host=*.vercel.app action=allow
add dst-host=*.vercel.com action=allow
add dst-host=*.vercel-dns.com action=allow

# Your specific domains
add dst-host=isp-frontend-two.vercel.app action=allow
add dst-host=isp.bitwavetechnologies.com action=allow
add dst-host=*.bitwavetechnologies.com action=allow
```

---

## 🔍 Advanced: Use IP Address Method

If domain-based walled garden doesn't work reliably, use IP addresses instead.

### Step 1: Find Backend API IP

On your computer, run:
```bash
# Windows
nslookup isp.bitwavetechnologies.com

# Or
ping isp.bitwavetechnologies.com
```

Example output:
```
Address: 104.21.45.123
```

### Step 2: Add IP to Walled Garden

```bash
/ip hotspot walled-garden ip
add dst-address=104.21.45.123/32 action=accept comment="ISP Backend API"
```

⚠️ **Note:** Vercel uses dynamic IPs, so IP-based walled garden won't work for Vercel. Use domain-based for Vercel, IP-based only for your backend if it has a static IP.

---

## 🧪 Testing the Configuration

### Test 1: Check Walled Garden Entries

```bash
/ip hotspot walled-garden print
```

Should show:
```
0  dst-host=isp-frontend-two.vercel.app action=allow
1  dst-host=*.vercel.app action=allow
2  dst-host=isp.bitwavetechnologies.com action=allow
```

### Test 2: Test from Hotspot User

1. Connect to WiFi as a new user (not authenticated)
2. Open browser - should redirect to your portal
3. Open Browser DevTools (F12) → Network tab
4. Watch the API calls - should see successful requests to `isp.bitwavetechnologies.com`

### Test 3: Verify DNS Resolution

Connect a device to hotspot (before login) and run:
```bash
nslookup isp.bitwavetechnologies.com
```

Should return an IP address. If it fails, you need to allow DNS queries in walled garden.

---

## 🔐 Allow DNS (Very Important!)

For walled garden to work with domain names, DNS must be allowed:

```bash
/ip hotspot walled-garden ip
add action=accept dst-port=53 protocol=udp comment="Allow DNS UDP"
add action=accept dst-port=53 protocol=tcp comment="Allow DNS TCP"
```

Or if you have a specific DNS server:
```bash
add action=accept dst-address=8.8.8.8 dst-port=53 protocol=udp comment="Google DNS"
add action=accept dst-address=8.8.4.4 dst-port=53 protocol=udp comment="Google DNS"
```

---

## 📋 Complete Configuration Checklist

Run all these commands in your MikroTik terminal:

```bash
# DNS Access (Must be first!)
/ip hotspot walled-garden ip
add action=accept dst-port=53 protocol=udp comment="Allow DNS UDP"
add action=accept dst-port=53 protocol=tcp comment="Allow DNS TCP"

# Frontend Domains
/ip hotspot walled-garden
add dst-host=isp-frontend-two.vercel.app action=allow comment="Frontend"
add dst-host=*.vercel.app action=allow comment="Vercel CDN"
add dst-host=*.vercel.com action=allow comment="Vercel Infrastructure"
add dst-host=*.vercel-dns.com action=allow comment="Vercel DNS"

# Backend API Domain
add dst-host=isp.bitwavetechnologies.com action=allow comment="Backend API"
add dst-host=*.bitwavetechnologies.com action=allow comment="Backend Wildcard"

# Verify configuration
print detail
```

---

## 🚨 Common Issues & Fixes

### Issue 1: Still Getting Timeout

**Solution:** Clear DNS cache on MikroTik
```bash
/ip dns cache flush
```

### Issue 2: Vercel Domain Not Resolving

**Solution:** Add Vercel's CDN ranges (they use many IPs)
```bash
/ip hotspot walled-garden
add dst-host=*.vercel-dns.com action=allow
add dst-host=vercel.app action=allow
add dst-host=*.vercel.app action=allow
```

### Issue 3: HTTPS/SSL Issues

Make sure you're allowing port 443:
```bash
/ip hotspot walled-garden ip
add action=accept dst-port=443 protocol=tcp comment="Allow HTTPS"
```

### Issue 4: Cloudflare Protected Sites

If your backend uses Cloudflare:
```bash
/ip hotspot walled-garden
add dst-host=*.cloudflare.com action=allow comment="Cloudflare"
```

---

## 🎯 Recommended Full Configuration

Here's the complete, production-ready setup:

```bash
# ===== COMPLETE WALLED GARDEN SETUP =====

# 1. Allow DNS (Critical!)
/ip hotspot walled-garden ip
add action=accept dst-port=53 protocol=udp comment="DNS UDP"
add action=accept dst-port=53 protocol=tcp comment="DNS TCP"

# 2. Allow HTTPS
add action=accept dst-port=443 protocol=tcp comment="HTTPS"

# 3. Frontend Access (Vercel)
/ip hotspot walled-garden
add dst-host=*.vercel.app action=allow comment="Vercel CDN"
add dst-host=*.vercel.com action=allow comment="Vercel"
add dst-host=*.vercel-dns.com action=allow comment="Vercel DNS"
add dst-host=isp-frontend-two.vercel.app action=allow comment="Your Frontend"

# 4. Backend API Access
add dst-host=isp.bitwavetechnologies.com action=allow comment="Backend API"
add dst-host=*.bitwavetechnologies.com action=allow comment="Backend Wildcard"

# 5. Verify
print detail
```

---

## 🔄 After Making Changes

1. **No restart needed** - changes take effect immediately
2. **Test immediately** with a new hotspot connection
3. **Clear browser cache** on test device
4. **Check logs:**
   ```bash
   /log print where topics~"hotspot"
   ```

---

## 📊 Monitoring & Debugging

### Watch Live Traffic

```bash
# See what's being blocked
/ip hotspot walled-garden ip
print stats

# Watch firewall logs
/log print follow where topics~"firewall"
```

### Check Active Hotspot Users

```bash
/ip hotspot active print
```

### Test DNS Resolution

From MikroTik:
```bash
/tool fetch url=http://isp.bitwavetechnologies.com/api/plans?user_id=1 mode=http
```

---

## ✅ Verification Steps

After configuration:

1. ✅ Connect device to hotspot (don't login yet)
2. ✅ Get redirected to captive portal
3. ✅ Portal loads (HTML/CSS/JS)
4. ✅ Plans load from API
5. ✅ Can select plan and proceed to payment

If step 4 fails, walled garden is still not configured correctly.

---

## 🆘 Still Not Working?

### Debug Checklist:

1. [ ] DNS allowed in walled garden (port 53)
2. [ ] HTTPS allowed (port 443)
3. [ ] Both frontend and backend domains in walled garden
4. [ ] Wildcard entries for CDN providers
5. [ ] DNS cache flushed on MikroTik
6. [ ] Browser cache cleared on test device
7. [ ] Tested with fresh hotspot connection

### Get Help:

If still having issues, provide:
- Output of `/ip hotspot walled-garden print`
- Output of `/ip dns cache print where name~"bitwave"`
- Screenshot of browser console errors

---

## 📝 Production Checklist

Before going live:

- [ ] All API endpoints accessible from walled garden
- [ ] DNS resolution working
- [ ] SSL/HTTPS working
- [ ] Tested with multiple devices
- [ ] Tested payment flow end-to-end
- [ ] Monitoring/logging enabled
- [ ] Backup MikroTik configuration

---

**Need help?** Share your current walled garden config:
```bash
/ip hotspot walled-garden export
```

