# Check Backend IP Configuration

## Step 1: Find Your Backend IP

Run this on your computer:

```bash
# Windows Command Prompt or PowerShell
nslookup isp.bitwavetechnologies.com
```

**Example output might show:**
```
Server:  dns.google
Address:  8.8.8.8

Non-authoritative answer:
Name:    isp.bitwavetechnologies.com
Addresses:  104.21.45.123
           172.67.180.45
```

## Interpreting Results:

### Scenario A: Single Static IP
```
Name:    isp.bitwavetechnologies.com
Address:  45.76.123.45
```
✅ **Use IP address method** - Your backend has a static IP

### Scenario B: Multiple IPs (CDN/Load Balancer)
```
Name:    isp.bitwavetechnologies.com
Addresses:  104.21.45.123
           172.67.180.45
           104.22.67.89
```
✅ **Use domain method** - Backend uses CDN (likely Cloudflare)

### Scenario C: Cloudflare IPs (104.x.x.x or 172.67.x.x)
✅ **Use domain method** - Backend protected by Cloudflare

---

## Step 2: Run Command Again (Wait 5 seconds and repeat)

```bash
nslookup isp.bitwavetechnologies.com
```

**If IP changes:** Use domain method
**If IP stays same:** Use IP method (more reliable)

