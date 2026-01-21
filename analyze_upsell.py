"""
WiFi Hotspot Upsell Strategy Analyzer
=====================================
Goal: Increase average daily spend per user from ~10 KSH to ~11.5 KSH (15% increase)
by showing strategic upsell offers at optimal times.

Strategy: Time-based promotional offers that encourage users to purchase 
slightly higher-value plans than they normally would.
"""

import json
from collections import defaultdict
from datetime import datetime

# Load the data
with open('bitwave_data.json', 'r') as f:
    data = json.load(f)

# Current plans
PLANS = {
    '7 minutes': {'price': 1, 'duration_minutes': 7},
    '1 hour': {'price': 5, 'duration_minutes': 60},
    '6 hours': {'price': 12, 'duration_minutes': 360},
    '12 hours': {'price': 15, 'duration_minutes': 720},
    '24 hours': {'price': 20, 'duration_minutes': 1440},
    '7 days': {'price': 99, 'duration_minutes': 10080},
}

# Define time zones for analysis
TIME_ZONES = {
    'early_morning': list(range(5, 8)),      # 5am-7am: Workers arriving
    'morning_peak': list(range(8, 12)),       # 8am-11am: Peak business hours
    'midday': list(range(12, 15)),            # 12pm-2pm: Lunch time
    'afternoon': list(range(15, 18)),         # 3pm-5pm: Afternoon business
    'evening': list(range(18, 21)),           # 6pm-8pm: Evening wind-down
    'night': list(range(21, 24)) + list(range(0, 5)),  # 9pm-4am: Low activity
}

def analyze_hourly_patterns():
    """Analyze purchase patterns by hour across all days"""
    hourly_purchases = defaultdict(lambda: defaultdict(int))
    hourly_revenue = defaultdict(lambda: defaultdict(float))
    
    for day_key, day_data in data['days'].items():
        # Skip promo days (Jan 1-4) - they only had 1 KSH plan
        if day_data.get('dateLabel', '').endswith('(PROMO)'):
            continue
            
        hourly_by_plan = day_data.get('hourlyByPlan', {})
        for plan_name, hours in hourly_by_plan.items():
            for hour, count in hours.items():
                hourly_purchases[int(hour)][plan_name] += count
                hourly_revenue[int(hour)][plan_name] += count * PLANS[plan_name]['price']
    
    return hourly_purchases, hourly_revenue

def calculate_hourly_metrics(hourly_purchases, hourly_revenue):
    """Calculate key metrics for each hour"""
    metrics = {}
    
    for hour in range(24):
        purchases = hourly_purchases[hour]
        revenue = hourly_revenue[hour]
        
        total_purchases = sum(purchases.values())
        total_revenue = sum(revenue.values())
        
        if total_purchases > 0:
            avg_transaction = total_revenue / total_purchases
            
            # Calculate plan distribution
            plan_distribution = {
                plan: purchases[plan] / total_purchases * 100 
                for plan in PLANS.keys() if purchases[plan] > 0
            }
            
            # Calculate "low-value" percentage (1 KSH and 5 KSH plans)
            low_value_pct = (purchases['7 minutes'] + purchases['1 hour']) / total_purchases * 100
            
            metrics[hour] = {
                'total_purchases': total_purchases,
                'total_revenue': total_revenue,
                'avg_transaction': avg_transaction,
                'plan_distribution': plan_distribution,
                'low_value_percentage': low_value_pct,
                'purchases_by_plan': dict(purchases),
            }
        else:
            metrics[hour] = {
                'total_purchases': 0,
                'total_revenue': 0,
                'avg_transaction': 0,
                'plan_distribution': {},
                'low_value_percentage': 0,
                'purchases_by_plan': {},
            }
    
    return metrics

def analyze_time_zones(metrics):
    """Aggregate metrics by time zone"""
    zone_metrics = {}
    
    for zone_name, hours in TIME_ZONES.items():
        zone_purchases = defaultdict(int)
        total_trans = 0
        total_rev = 0
        
        for hour in hours:
            if hour in metrics:
                m = metrics[hour]
                total_trans += m['total_purchases']
                total_rev += m['total_revenue']
                for plan, count in m['purchases_by_plan'].items():
                    zone_purchases[plan] += count
        
        if total_trans > 0:
            zone_metrics[zone_name] = {
                'total_purchases': total_trans,
                'total_revenue': total_rev,
                'avg_transaction': total_rev / total_trans,
                'purchases_by_plan': dict(zone_purchases),
                'low_value_pct': (zone_purchases['7 minutes'] + zone_purchases['1 hour']) / total_trans * 100,
                'hours': hours,
            }
    
    return zone_metrics

def generate_upsell_strategy(zone_metrics, metrics):
    """
    Generate upsell recommendations based on analysis.
    
    Key insight: We want to create "bridge" offers that sit between 
    the plan a user would normally buy and the next tier up.
    
    Upsell ladder:
    - 7 min (1 KSH) → Offer: 15 min for 2 KSH (better value, still low commitment)
    - 1 hour (5 KSH) → Offer: 2 hours for 8 KSH (better value per hour)
    - 6 hours (12 KSH) → Offer: 12 hours for 15 KSH (highlight small price diff)
    - 12 hours (15 KSH) → Offer: 24 hours for 18 KSH (just 3 KSH more!)
    - 24 hours (20 KSH) → Offer: 3 days for 50 KSH (better daily rate)
    """
    
    strategy = {}
    
    # Proposed upsell offers (price points between existing plans)
    UPSELL_OFFERS = {
        'micro_boost': {
            'name': '15 Minute Boost',
            'price': 2,
            'duration_minutes': 15,
            'target_from': '7 minutes',
            'value_prop': 'Double your time for just 1 KSH more!'
        },
        'extended_hour': {
            'name': '2 Hour Session', 
            'price': 8,
            'duration_minutes': 120,
            'target_from': '1 hour',
            'value_prop': '2x the time, way better value!'
        },
        'half_day_deal': {
            'name': 'Half Day Special',
            'price': 13,
            'duration_minutes': 720,  # 12 hours
            'target_from': '6 hours',
            'value_prop': 'Just 1 KSH more for double the time!'
        },
        'full_day_deal': {
            'name': 'Full Day Deal',
            'price': 18,
            'duration_minutes': 1440,  # 24 hours
            'target_from': '12 hours',
            'value_prop': 'Only 3 KSH more for all day access!'
        },
        'weekend_pass': {
            'name': '3 Day Pass',
            'price': 50,
            'duration_minutes': 4320,  # 3 days
            'target_from': '24 hours',
            'value_prop': '3 days at KSH 17/day - best daily rate!'
        }
    }
    
    for zone_name, zm in zone_metrics.items():
        purchases = zm['purchases_by_plan']
        total = zm['total_purchases']
        
        # Determine which upsells to prioritize based on what's being bought
        offers_to_show = []
        
        # High 7-min purchases → push 15 min boost
        seven_min_pct = purchases.get('7 minutes', 0) / total * 100 if total > 0 else 0
        if seven_min_pct > 15:
            offers_to_show.append(('micro_boost', seven_min_pct, 'high'))
        elif seven_min_pct > 5:
            offers_to_show.append(('micro_boost', seven_min_pct, 'medium'))
        
        # High 1-hour purchases → push 2 hour session
        one_hour_pct = purchases.get('1 hour', 0) / total * 100 if total > 0 else 0
        if one_hour_pct > 25:
            offers_to_show.append(('extended_hour', one_hour_pct, 'high'))
        elif one_hour_pct > 15:
            offers_to_show.append(('extended_hour', one_hour_pct, 'medium'))
        
        # 6-hour buyers → push half day
        six_hour_pct = purchases.get('6 hours', 0) / total * 100 if total > 0 else 0
        if six_hour_pct > 15:
            offers_to_show.append(('half_day_deal', six_hour_pct, 'high'))
        elif six_hour_pct > 8:
            offers_to_show.append(('half_day_deal', six_hour_pct, 'medium'))
        
        # 12-hour buyers → push full day
        twelve_hour_pct = purchases.get('12 hours', 0) / total * 100 if total > 0 else 0
        if twelve_hour_pct > 10:
            offers_to_show.append(('full_day_deal', twelve_hour_pct, 'high'))
        elif twelve_hour_pct > 5:
            offers_to_show.append(('full_day_deal', twelve_hour_pct, 'medium'))
        
        # 24-hour buyers → push weekend pass (mainly for longer sessions)
        twentyfour_hour_pct = purchases.get('24 hours', 0) / total * 100 if total > 0 else 0
        if twentyfour_hour_pct > 10:
            offers_to_show.append(('weekend_pass', twentyfour_hour_pct, 'medium'))
        
        strategy[zone_name] = {
            'hours': zm['hours'],
            'current_avg_transaction': zm['avg_transaction'],
            'low_value_percentage': zm['low_value_pct'],
            'recommended_offers': [
                {
                    'offer': UPSELL_OFFERS[offer_key],
                    'target_segment_pct': pct,
                    'priority': priority
                }
                for offer_key, pct, priority in sorted(offers_to_show, key=lambda x: -x[1])
            ]
        }
    
    return strategy, UPSELL_OFFERS

def calculate_revenue_impact(zone_metrics, strategy, conversion_rate=0.15):
    """
    Estimate revenue impact assuming a % of target users convert to upsell.
    
    Conservative assumption: 15% of users who would buy the lower plan
    will instead buy the upsell offer.
    """
    
    # Get total days analyzed (excluding promo days)
    non_promo_days = sum(1 for d in data['days'].values() 
                         if not d.get('dateLabel', '').endswith('(PROMO)'))
    
    print(f"\n{'='*60}")
    print("REVENUE IMPACT ANALYSIS")
    print(f"{'='*60}")
    print(f"Days analyzed: {non_promo_days}")
    print(f"Assumed conversion rate to upsell: {conversion_rate*100:.0f}%")
    
    total_current_revenue = 0
    total_projected_revenue = 0
    
    for zone_name, strat in strategy.items():
        zm = zone_metrics[zone_name]
        purchases = zm['purchases_by_plan']
        
        zone_current = zm['total_revenue']
        zone_projected = zone_current
        
        print(f"\n{zone_name.upper()} (Hours: {zm['hours']})")
        print(f"  Current: {zm['total_purchases']} transactions, KSH {zone_current:.0f}")
        print(f"  Avg transaction: KSH {zm['avg_transaction']:.2f}")
        
        for rec in strat['recommended_offers']:
            offer = rec['offer']
            target_plan = offer['target_from']
            target_purchases = purchases.get(target_plan, 0)
            
            if target_purchases > 0:
                # Calculate conversions
                conversions = target_purchases * conversion_rate
                
                # Revenue change
                old_price = PLANS[target_plan]['price']
                new_price = offer['price']
                revenue_gain = conversions * (new_price - old_price)
                
                zone_projected += revenue_gain
                
                print(f"  -> {offer['name']} (KSH {new_price})")
                print(f"    Target: {target_purchases} users buying {target_plan} (KSH {old_price})")
                print(f"    Est. conversions: {conversions:.0f} users")
                print(f"    Revenue gain: +KSH {revenue_gain:.0f}")
        
        print(f"  Projected zone revenue: KSH {zone_projected:.0f} (+{((zone_projected/zone_current)-1)*100:.1f}%)")
        
        total_current_revenue += zone_current
        total_projected_revenue += zone_projected
    
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    print(f"Total current revenue (analyzed period): KSH {total_current_revenue:.0f}")
    print(f"Total projected revenue with upsells: KSH {total_projected_revenue:.0f}")
    print(f"Revenue increase: +KSH {total_projected_revenue - total_current_revenue:.0f} ({((total_projected_revenue/total_current_revenue)-1)*100:.1f}%)")
    
    daily_current = total_current_revenue / non_promo_days
    daily_projected = total_projected_revenue / non_promo_days
    print(f"\nDaily revenue: KSH {daily_current:.0f} -> KSH {daily_projected:.0f}")
    
    # Calculate avg spend per user
    total_users = sum(d['uniqueUsers'] for d in data['days'].values() 
                      if not d.get('dateLabel', '').endswith('(PROMO)'))
    current_avg = total_current_revenue / total_users
    projected_avg = total_projected_revenue / total_users
    print(f"Avg spend per user: KSH {current_avg:.2f} -> KSH {projected_avg:.2f}")
    
    return total_current_revenue, total_projected_revenue

def generate_frontend_config(strategy):
    """Generate the configuration to be used in the frontend"""
    
    config = {
        'upsell_plans': [
            {
                'id': 101,
                'name': '15 Minute Boost',
                'price': 2,
                'duration_value': 15,
                'duration_unit': 'MINUTES',
                'badge': '🔥 DEAL',
                'upsell_from': [11],  # 7 minute plan ID
                'value_message': 'Double your time for just 1 KSH more!'
            },
            {
                'id': 102,
                'name': '2 Hour Session',
                'price': 8,
                'duration_value': 2,
                'duration_unit': 'HOURS',
                'badge': '⭐ POPULAR',
                'upsell_from': [10],  # 1 hour plan ID
                'value_message': '2x the time, better value!'
            },
            {
                'id': 103,
                'name': 'Half Day Special',
                'price': 13,
                'duration_value': 12,
                'duration_unit': 'HOURS',
                'badge': '💎 DEAL',
                'upsell_from': [14],  # 6 hour plan ID
                'value_message': 'Just 1 KSH more for double time!'
            },
            {
                'id': 104,
                'name': 'Full Day Deal',
                'price': 18,
                'duration_value': 24,
                'duration_unit': 'HOURS',
                'badge': '🎯 BEST VALUE',
                'upsell_from': [13],  # 12 hour plan ID
                'value_message': 'Only 3 KSH more for all day!'
            },
            {
                'id': 105,
                'name': '3 Day Pass',
                'price': 50,
                'duration_value': 3,
                'duration_unit': 'DAYS',
                'badge': '🏆 SAVER',
                'upsell_from': [12],  # 24 hour plan ID
                'value_message': 'KSH 17/day - best daily rate!'
            }
        ],
        'time_zones': {}
    }
    
    # Map time zones to offers
    for zone_name, strat in strategy.items():
        hours = strat['hours']
        
        # Get the offer IDs to show in this zone (prioritized)
        offer_ids = []
        for rec in strat['recommended_offers'][:3]:  # Top 3 offers per zone
            offer_name = rec['offer']['name']
            # Map name to ID
            for plan in config['upsell_plans']:
                if plan['name'] == offer_name:
                    offer_ids.append(plan['id'])
                    break
        
        config['time_zones'][zone_name] = {
            'hours': hours,
            'featured_offers': offer_ids,
            'show_upsell_banner': strat['low_value_percentage'] > 40,
        }
    
    return config

def main():
    print("="*60)
    print("BITWAVE WIFI UPSELL STRATEGY ANALYSIS")
    print("="*60)
    
    # Analyze patterns
    hourly_purchases, hourly_revenue = analyze_hourly_patterns()
    metrics = calculate_hourly_metrics(hourly_purchases, hourly_revenue)
    zone_metrics = analyze_time_zones(metrics)
    
    # Print hourly analysis
    print("\nHOURLY PURCHASE PATTERNS")
    print("-"*60)
    for hour in range(24):
        m = metrics[hour]
        if m['total_purchases'] > 0:
            print(f"{hour:02d}:00 - {m['total_purchases']:3d} trans, "
                  f"Avg: KSH {m['avg_transaction']:5.2f}, "
                  f"Low-value: {m['low_value_percentage']:4.1f}%")
    
    # Print zone analysis
    print("\n" + "="*60)
    print("TIME ZONE ANALYSIS")
    print("="*60)
    for zone_name, zm in zone_metrics.items():
        print(f"\n{zone_name.upper()} (Hours: {zm['hours']})")
        print(f"  Total purchases: {zm['total_purchases']}")
        print(f"  Total revenue: KSH {zm['total_revenue']:.0f}")
        print(f"  Avg transaction: KSH {zm['avg_transaction']:.2f}")
        print(f"  Low-value plans: {zm['low_value_pct']:.1f}%")
        print("  Plan breakdown:")
        for plan, count in sorted(zm['purchases_by_plan'].items(), 
                                   key=lambda x: -x[1]):
            pct = count / zm['total_purchases'] * 100
            print(f"    {plan}: {count} ({pct:.1f}%)")
    
    # Generate strategy
    strategy, upsell_offers = generate_upsell_strategy(zone_metrics, metrics)
    
    print("\n" + "="*60)
    print("UPSELL STRATEGY RECOMMENDATIONS")
    print("="*60)
    
    print("\nPROPOSED UPSELL OFFERS (New plans to create):")
    print("-"*60)
    for key, offer in upsell_offers.items():
        print(f"  {offer['name']}: KSH {offer['price']} for {offer['duration_minutes']} min")
        print(f"    Target: Users buying {offer['target_from']}")
        print(f"    Message: \"{offer['value_prop']}\"")
    
    print("\nTIME-BASED STRATEGY:")
    print("-"*60)
    for zone_name, strat in strategy.items():
        print(f"\n{zone_name.upper()} ({strat['hours']})")
        print(f"  Current avg: KSH {strat['current_avg_transaction']:.2f}")
        print(f"  Low-value %: {strat['low_value_percentage']:.1f}%")
        print("  Show offers:")
        for rec in strat['recommended_offers']:
            offer = rec['offer']
            print(f"    -> {offer['name']} (KSH {offer['price']}) - "
                  f"Priority: {rec['priority']}, Target: {rec['target_segment_pct']:.1f}%")
    
    # Calculate impact
    calculate_revenue_impact(zone_metrics, strategy, conversion_rate=0.15)
    
    # Generate frontend config
    config = generate_frontend_config(strategy)
    
    print("\n" + "="*60)
    print("FRONTEND CONFIGURATION")
    print("="*60)
    print(json.dumps(config, indent=2))
    
    # Save config to file
    with open('upsell_config.json', 'w') as f:
        json.dump(config, f, indent=2)
    print("\n[OK] Configuration saved to upsell_config.json")
    
    return config

if __name__ == '__main__':
    main()

