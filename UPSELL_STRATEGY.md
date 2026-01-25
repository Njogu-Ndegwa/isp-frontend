# Bitwave WiFi Upsell Strategy

## Overview
Based on analysis of 16 days of transaction data (2,144 transactions), this strategy aims to increase average daily spend per user from **KSH 10.48 to KSH 11.10** (~6% increase).

## Key Findings

### Current Performance
| Metric | Value |
|--------|-------|
| Avg Daily Revenue | KSH 1,149 |
| Avg Spend/User | KSH 10.48 |
| Total Unique Users/Day | ~110 |

### Problem Areas by Time of Day
| Time Zone | Hours | Avg Transaction | Low-Value % | Issue |
|-----------|-------|-----------------|-------------|-------|
| Evening | 6-8pm | KSH 6.19 | 79.2% | **Worst** - Most users buy cheap plans |
| Afternoon | 3-5pm | KSH 7.71 | 64.4% | High cheap plan purchases |
| Early Morning | 5-7am | KSH 7.15 | 65.1% | Workers arriving, quick buys |
| Night | 9pm-4am | KSH 7.36 | 68.5% | Low volume, low value |
| Midday | 12-2pm | KSH 9.48 | 48.6% | Moderate |
| Morning Peak | 8-11am | KSH 10.56 | 44.2% | **Best** - Highest value |

### Current Plan Popularity
| Plan | Price | % of Purchases |
|------|-------|----------------|
| 1 hour | KSH 5 | ~35% |
| 7 minutes | KSH 1 | ~25% |
| 6 hours | KSH 12 | ~18% |
| 12 hours | KSH 15 | ~12% |
| 24 hours | KSH 20 | ~9% |
| 7 days | KSH 99 | ~1% |

## Upsell Strategy: "Bridge" Offers

Create new plans that sit between existing plans to convert users to slightly higher spend.

### NEW PLANS TO CREATE ON BACKEND

| ID | Name | Price | Duration | Target Users | Value Proposition |
|----|------|-------|----------|--------------|-------------------|
| 101 | 15 Minute Boost | KSH 2 | 15 min | 7-min buyers (KSH 1) | "+1 KSH = 2x time!" |
| 102 | 2 Hour Session | KSH 8 | 2 hours | 1-hr buyers (KSH 5) | "+3 KSH = 2x time!" |
| 103 | Half Day Deal | KSH 13 | 12 hours | 6-hr buyers (KSH 12) | "+1 KSH = 2x time!" |
| 104 | Full Day Deal | KSH 18 | 24 hours | 12-hr buyers (KSH 15) | "+3 KSH = all day!" |
| 105 | 3 Day Pass | KSH 50 | 3 days | 24-hr buyers (KSH 20) | "KSH 17/day!" |

### Backend Plan Creation JSON
```json
[
    {
        "id": 101,
        "name": "15 Minute Boost",
        "speed": "5M/5M",
        "price": 2,
        "duration_value": 15,
        "duration_unit": "MINUTES",
        "connection_type": "hotspot",
        "router_profile": "default",
        "user_id": 1
    },
    {
        "id": 102,
        "name": "2 Hour Session",
        "speed": "5M/5M",
        "price": 8,
        "duration_value": 2,
        "duration_unit": "HOURS",
        "connection_type": "hotspot",
        "router_profile": "default",
        "user_id": 1
    },
    {
        "id": 103,
        "name": "Half Day Deal",
        "speed": "5M/5M",
        "price": 13,
        "duration_value": 12,
        "duration_unit": "HOURS",
        "connection_type": "hotspot",
        "router_profile": "default",
        "user_id": 1
    },
    {
        "id": 104,
        "name": "Full Day Deal",
        "speed": "5M/5M",
        "price": 18,
        "duration_value": 24,
        "duration_unit": "HOURS",
        "connection_type": "hotspot",
        "router_profile": "default",
        "user_id": 1
    },
    {
        "id": 105,
        "name": "3 Day Pass",
        "speed": "5M/5M",
        "price": 50,
        "duration_value": 3,
        "duration_unit": "DAYS",
        "connection_type": "hotspot",
        "router_profile": "default",
        "user_id": 1
    }
]
```

## Time-Based Display Strategy

Different upsells are shown prominently at different times:

| Time Zone | Hours | Featured Upsells | Rationale |
|-----------|-------|------------------|-----------|
| Early Morning | 5-7am | 15min, 2hr, Half-day | Workers arriving, push longer plans |
| Morning Peak | 8-11am | 2hr, Full-day, Half-day | High value time, maximize it |
| Midday | 12-2pm | 2hr, Half-day, 15min | Lunch buyers, medium duration |
| Afternoon | 3-5pm | 2hr, 15min, Half-day | Lots of 1-hr buyers to convert |
| Evening | 6-8pm | 2hr, 15min, 3-day | **Critical** - 79% buy cheap plans |
| Night | 9pm-4am | 2hr, 15min, 3-day | Night owl deals |

## Expected Revenue Impact

Assuming **15% of users convert to upsell** (conservative):

| Metric | Current | Projected | Change |
|--------|---------|-----------|--------|
| Daily Revenue | KSH 1,149 | KSH 1,218 | +6.0% |
| Avg Spend/User | KSH 10.48 | KSH 11.10 | +5.9% |
| Monthly Revenue | ~KSH 34,470 | ~KSH 36,540 | +KSH 2,070 |

### Impact by Time Zone
| Time Zone | Current | Projected | Change |
|-----------|---------|-----------|--------|
| Evening | KSH 6.19/trans | KSH 6.97/trans | +12.5% |
| Night | KSH 7.36/trans | KSH 8.36/trans | +13.5% |
| Morning Peak | KSH 10.56/trans | KSH 11.31/trans | +7.1% |

## Implementation Files

1. **`upsell.js`** - Main upsell logic module
2. **`upsell_config.json`** - Generated configuration
3. **`analyze_upsell.py`** - Analysis script (can rerun with new data)
4. **`styles003.css`** - Added upsell card styling

## How It Works

1. When the page loads, `upsell.js` determines the current time zone
2. Featured upsell offers are selected based on time of day
3. Plans are displayed with featured upsells highlighted at the top
4. Value messages like "+1 KSH = 2x time!" encourage conversion
5. Animated badges draw attention to deals

## Future Optimizations

1. **A/B Testing**: Test different price points (e.g., KSH 7 vs KSH 8 for 2hr)
2. **Conversion Tracking**: Log which upsells convert and at what times
3. **Dynamic Pricing**: Adjust upsell prices based on conversion rates
4. **Personalization**: Show different offers to repeat vs new customers
5. **Weekend Strategy**: Different offers for weekends (more leisure time)

## Risk Mitigation

- **No cannibalization**: Upsell prices are carefully positioned BETWEEN existing plans
- **Value perception**: Each upsell offers genuine better value (more time per KSH)
- **Fallback**: Original plans always available if upsells aren't working

## Quick Start Checklist

- [ ] Create the 5 new plans in backend
- [ ] Update plan IDs in `upsell.js` if they differ from 101-105
- [ ] Deploy updated frontend files
- [ ] Monitor conversion rates for 1 week
- [ ] Adjust strategy based on results



